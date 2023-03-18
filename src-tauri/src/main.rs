#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::path::PathBuf;
use std::{fs, net::UdpSocket, sync::Mutex};

use background::openvr::OpenVRManager;
use log::LevelFilter;
use tauri::Manager;
use tauri_plugin_log::{LogTarget, RotationStrategy};

#[macro_use(lazy_static)]
extern crate lazy_static;

lazy_static! {
    static ref OPENVR_MANAGER: Mutex<Option<OpenVRManager>> = Default::default();
    static ref TAURI_WINDOW: Mutex<Option<tauri::Window>> = Default::default();
    static ref OSC_SEND_SOCKET: Mutex<Option<UdpSocket>> = Default::default();
    static ref OSC_RECEIVE_SOCKET: Mutex<Option<UdpSocket>> = Default::default();
    static ref SWAGGER_INDEX_PATH: Mutex<Option<PathBuf>> = Default::default();
}

mod background {
    pub mod http;
    pub mod openvr;
    pub mod osc;
}
mod models {
    pub mod events;
    pub mod ovrdevice;
}
mod commands {
    pub mod http;
    pub mod openvr;
    pub mod osc;
}

fn copy_dir(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir(&dst)?;
    }
    for entry in fs::read_dir(&src)? {
        let entry = entry?;
        let path = entry.path();
        let new_path = dst.join(path.file_name().unwrap());
        if entry.file_type()?.is_dir() {
            copy_dir(&path, &new_path)?;
        } else {
            fs::copy(&path, &new_path)?;
        }
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .format(move |out, message, record| {
                    let format = time::format_description::parse(
                        "[[[year]-[month]-[day]][[[hour]:[minute]:[second]]",
                    )
                    .unwrap();
                    out.finish(format_args!(
                        "{}[{}] {}",
                        time::OffsetDateTime::now_utc().format(&format).unwrap(),
                        record.level(),
                        message
                    ))
                })
                .level(LevelFilter::Info)
                .targets([LogTarget::LogDir, LogTarget::Stdout, LogTarget::Webview])
                .rotation_strategy(RotationStrategy::KeepAll)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Focus main window when user attempts to launch a second instance.
            let window = app.get_window("main").unwrap();
            if let Some(is_visible) = window.is_visible().ok() {
                if is_visible {
                    window.set_focus().unwrap();
                }
            }
        }))
        .setup(|app| {
            // Set up window reference
            let window = app.get_window("main").unwrap();
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                window.open_devtools();
            }
            *TAURI_WINDOW.lock().unwrap() = Some(window);
            // Copy over swagger ui
            let swagger_ui_src = app
                .path_resolver()
                .resolve_resource("_up_/swagger/")
                .unwrap();
            let swagger_ui_dest = app.path_resolver().app_data_dir().unwrap().join("swagger/");
            copy_dir(&swagger_ui_src, &swagger_ui_dest).unwrap();
            // Get swagger ui path
            *SWAGGER_INDEX_PATH.lock().unwrap() = Some(swagger_ui_dest);
            // Initialize OpenVR Manager
            let openvr_manager = OpenVRManager::new();
            openvr_manager.set_active(true);
            *OPENVR_MANAGER.lock().unwrap() = Some(openvr_manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::openvr::openvr_get_devices,
            commands::openvr::openvr_status,
            commands::openvr::openvr_set_analog_gain,
            commands::openvr::openvr_get_analog_gain,
            commands::osc::osc_send_bool,
            commands::osc::osc_send_float,
            commands::osc::osc_send_int,
            commands::osc::osc_init,
            commands::osc::osc_valid_addr,
            commands::http::stop_http_server,
            commands::http::start_http_server,
            commands::http::respond_to_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
