use crate::background;

#[tauri::command]
pub fn start_http_server(host: String, port: u16) -> Result<(), String> {
    background::http::start_server(host, port)
}

#[tauri::command]
pub fn stop_http_server() -> Result<(), String> {
    background::http::stop_server()
}

#[tauri::command]
pub fn respond_to_request(request_id: String, status: u16, body: String) {
    background::http::handle_response(request_id, status, body);
}