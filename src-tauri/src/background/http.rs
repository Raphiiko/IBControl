use actix_cors::Cors;
use actix_files as fs;
use actix_web::{
    dev::ServerHandle, get, http::StatusCode, put, web, App, HttpRequest, HttpResponseBuilder,
    HttpServer, Responder,
};
use crossbeam_channel::{unbounded, Receiver, Sender};
use futures::StreamExt;
use log::{error, info};
use serde_json::json;
use std::{path::PathBuf, sync::Mutex};
use tauri::async_runtime::block_on;
use uuid::Uuid;

use crate::{SWAGGER_INDEX_PATH, TAURI_WINDOW};

lazy_static! {
    static ref SERVER_HANDLE: Mutex<Option<ServerHandle>> = Default::default();
    static ref RESPONSE_BUS: Mutex<
        Option<(
            Sender<(String, u16, String)>,
            Receiver<(String, u16, String)>
        )>,
    > = Default::default();
}

pub fn handle_response(request_id: String, status: u16, body: String) {
    let guard = RESPONSE_BUS.lock().unwrap();
    if let Some((sender, _)) = guard.as_ref() {
        sender.send((request_id, status, body)).unwrap();
    }
}

fn ensure_response_bus() {
    let mut guard = RESPONSE_BUS.lock().unwrap();
    if guard.is_none() {
        let (sender, receiver) = unbounded();
        *guard = Some((sender, receiver));
    }
}

#[get("/brightness")]
async fn get_brightness(req: HttpRequest) -> impl Responder {
    process_request(req, None).await
}

#[put("/brightness")]
async fn put_brightness(req: HttpRequest, body: web::Payload) -> impl Responder {
    process_request(req, Some(body)).await
}

async fn process_request(req: HttpRequest, body: Option<web::Payload>) -> impl Responder {
    // Parse the body if needed
    let mut body_str: Option<String> = None;
    if let Some(mut payload) = body {
        let mut bytes = web::BytesMut::new();
        while let Some(item) = payload.next().await {
            bytes.extend_from_slice(&item.unwrap());
        }
        body_str = Some(String::from_utf8(bytes.to_vec()).unwrap());
    }
    // Register request
    let request_id = Uuid::new_v4();
    // Send out request event
    {
        let guard = TAURI_WINDOW.lock().unwrap();
        guard
            .as_ref()
            .unwrap()
            .emit(
                "http_call",
                Some(json!({
                    "request_id": request_id.to_string(),
                    "path": req.path(),
                    "method": req.method().to_string(),
                    "headers": req.headers().iter().map(|(k, v)| (k.to_string(), v.to_str().unwrap().to_string())).collect::<Vec<(String, String)>>(),
                    "query": req.query_string().to_string(),
                    "body": body_str
                })),
            )
            .unwrap();
    }

    // Wait for response with request_id on REQUEST_BUS with a 5 second timeout
    let receiver = { RESPONSE_BUS.lock().unwrap().as_ref().unwrap().1.clone() };
    let start_time = std::time::Instant::now();
    let respdata = loop {
        // TODO: Improve timeout accuracy by incorporating start time in timeout
        match receiver.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok((rid, status, body)) => {
                if rid == request_id.to_string() {
                    // Found the right response
                    break (status, body);
                } else if start_time.elapsed().as_secs() > 5 {
                    // Didn't find the right response, but we've timed out
                    break (
                        500,
                        json!({
                            "error": "Request timed out"
                        })
                        .to_string(),
                    );
                } else {
                    // Keep looking for the right response
                    continue;
                }
            }
            Err(_) => {
                break (
                    500,
                    json!({
                        "error": "Request timed out"
                    })
                    .to_string(),
                );
            }
        };
    };

    // Return http response
    HttpResponseBuilder::new(StatusCode::from_u16(respdata.0).unwrap())
        .content_type("application/json")
        .body(respdata.1)
}

fn update_swagger_server(host: String, port: u16) {
    let mut swagger_path = SWAGGER_INDEX_PATH.lock().unwrap().as_ref().unwrap().clone();
    swagger_path.push("swagger.yaml");
    let contents = std::fs::read_to_string(swagger_path.clone()).unwrap();
    // Update the server reference
    let contents = contents
        .lines()
        .enumerate()
        .map(|(_, line)| {
            if line.contains("- url: http://") {
                return format!("  - url: http://{}:{}", host, port);
            } else {
                return line.to_string();
            }
        })
        .collect::<Vec<String>>()
        .join("\r\n");

    std::fs::write(swagger_path, contents).unwrap();
}

#[actix_web::main]
async fn start_actix(
    sender: Sender<Result<ServerHandle, String>>,
    host: &str,
    port: u16,
) -> std::io::Result<()> {
    // Create server
    let swagger_index_path: PathBuf;
    {
        let guard = SWAGGER_INDEX_PATH.lock().unwrap();
        swagger_index_path = guard.as_ref().unwrap().clone();
    }
    let server = HttpServer::new(move || {
        App::new()
            .wrap(Cors::permissive())
            .service(get_brightness)
            .service(put_brightness)
            .service(fs::Files::new("/", swagger_index_path.clone()).index_file("index.html"))
    });
    // Attempt binding server to host and port
    // For windows, we need to check ourselves if it's already bound
    // https://github.com/actix/actix-web/issues/1335
    if cfg!(target_os = "windows") {
        match std::net::TcpListener::bind(format!("{}:{}", host, port)) {
            Ok(_) => {
                info!("Binding to {}:{} succeeded", host, port);
            }
            Err(e) => {
                error!(
                    "[HTTP] Could not bind server to host {} and port {} ({})",
                    host, port, e
                );
                sender.send(Err("BIND_FAILED".into())).unwrap();
                return Err(e);
            }
        };
    }
    let server = match server.bind((host, port)) {
        Ok(server) => server,
        Err(e) => {
            error!(
                "[HTTP] Could not bind server to host {} and port {} ({})",
                host, port, e
            );
            sender.send(Err("BIND_FAILED".into())).unwrap();
            return Err(e);
        }
    };
    // Run the server
    let server = server.run();
    sender.send(Ok(server.handle())).unwrap();
    info!("[HTTP] Server started on {}:{}", host, port);
    update_swagger_server(host.to_string(), port);
    ensure_response_bus();
    let _ = server.await;
    info!("[HTTP] Server stopped on {}:{}", host, port);
    Ok(())
}

pub fn stop_server() -> Result<(), String> {
    let mut server_handle = SERVER_HANDLE.lock().unwrap();
    if server_handle.is_some() {
        let handle = server_handle.as_ref().unwrap();
        let f = handle.stop(true);
        *server_handle = None;
        block_on(f);
        return Ok(());
    } else {
        return Err("NO_SERVER_RUNNING".to_string());
    }
}

pub fn start_server(host: String, port: u16) -> Result<(), String> {
    // Stop existing web server
    let _ = stop_server();
    // Start web server
    let (sender, receiver) = unbounded::<Result<ServerHandle, String>>();
    std::thread::spawn(move || {
        let _ = start_actix(sender, host.as_str(), port);
    });
    // Wait for server to signal start
    match receiver.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(result) => {
            match result {
                Ok(handle) => {
                    *SERVER_HANDLE.lock().unwrap() = Some(handle);
                    return Ok(());
                }
                Err(e) => {
                    error!("[HTTP] Could not start server ({})", e);
                    return Err(e);
                }
            };
        }
        Err(e) => {
            error!("[HTTP] Could not start server (START_TIMEOUT): {}", e);
            return Err("START_TIMEOUT".to_string());
        }
    }
}
