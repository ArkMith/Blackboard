// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_associations;

use file_associations::OpenedFiles;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin registered on desktop.
    // Windows file associations start a second process with the PDF path as
    // an argument; this callback transfers that path to the existing process.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = file_associations::paths_from_args(argv.into_iter().skip(1));
            file_associations::register_opened_files(app, paths, true);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(OpenedFiles::default())
        .invoke_handler(tauri::generate_handler![
            file_associations::get_opened_files,
            file_associations::allow_file_path
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Windows/Linux cold start: the OS supplies the PDF as a CLI
            // argument. Store it instead of relying on an event that the
            // frontend may not be listening to yet.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                let initial_paths = file_associations::paths_from_args(std::env::args().skip(1));
                file_associations::register_opened_files(app.handle(), initial_paths, true);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Blackboard")
        .run(|app, event| {
            // Android/iOS/macOS deliver associated files through RunEvent::Opened.
            // Keep the paths in managed state for cold-start frontend retrieval,
            // and emit the same event for an already-running frontend.
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .filter(|path| {
                        path.extension()
                            .and_then(|ext| ext.to_str())
                            .map(|ext| ext.eq_ignore_ascii_case("pdf"))
                            .unwrap_or(false)
                    })
                    .collect::<Vec<_>>();

                file_associations::register_opened_files(app, paths, true);
            }
        });
}
