mod file_associations;

use file_associations::OpenedFiles;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  // Single-instance must be the FIRST plugin registered: it only intercepts
  // launches of a *second* process, so if the app is already open and the
  // user double-clicks another PDF (Windows/Linux "Open With"), this runs
  // in the already-running instance instead of spawning a new window.
  // Desktop-only — Android/iOS don't have this multi-process launch model.
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      let paths = file_associations::paths_from_args(argv.into_iter().skip(1));
      file_associations::register_opened_files(app, paths, true);

      if let Some(window) = app.get_webview_window("main") {
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

      // Cold start on Windows/Linux: when the OS launches this app because
      // the user opened a PDF, the file path arrives as a CLI argument to
      // this very process. On macOS/iOS/Android the same information
      // arrives instead via `RunEvent::Opened`, handled below.
      #[cfg(desktop)]
      {
        let initial_paths = file_associations::paths_from_args(std::env::args().skip(1));
        file_associations::register_opened_files(app.handle(), initial_paths, true);
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(|app_handle, event| {
      // Fires on macOS, iOS and Android whenever the OS hands this running
      // app a file to open (including its own cold start on those platforms).
      if let tauri::RunEvent::Opened { urls } = event {
        let paths = file_associations::filter_pdf_paths(
          urls.into_iter().filter_map(|url| url.to_file_path().ok()),
        );
        file_associations::register_opened_files(app_handle, paths, true);
      }
    });
}
