use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_fs::FsExt;

pub struct OpenedFiles(pub Mutex<Vec<String>>);

impl Default for OpenedFiles {
    fn default() -> Self {
        Self(Mutex::new(Vec::new()))
    }
}

fn is_pdf(path: &PathBuf) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

pub fn paths_from_args(args: impl IntoIterator<Item = String>) -> Vec<PathBuf> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            if let Ok(url) = url::Url::parse(&arg) {
                url.to_file_path().ok()
            } else {
                Some(PathBuf::from(arg))
            }
        })
        .filter(is_pdf)
        .collect()
}

/// Used for the macOS/iOS/Android `RunEvent::Opened` path, which already
/// hands us `Url`s (converted to `PathBuf`s by the caller) rather than raw
/// CLI argument strings.
pub fn filter_pdf_paths(paths: impl IntoIterator<Item = PathBuf>) -> Vec<PathBuf> {
    paths.into_iter().filter(is_pdf).collect()
}

pub fn register_opened_files(app: &AppHandle, paths: Vec<PathBuf>, remember: bool) {
    if paths.is_empty() {
        return;
    }

    let files: Vec<String> = paths
        .into_iter()
        .map(|path| {
            let _ = app.fs_scope().allow_file(&path);
            path.to_string_lossy().into_owned()
        })
        .collect();

    if remember {
        app.state::<OpenedFiles>()
            .0
            .lock()
            .expect("opened files mutex poisoned")
            .extend(files.clone());
    }

    let _ = app.emit("blackboard-file-opened", files);
}

#[tauri::command]
pub fn get_opened_files(state: State<'_, OpenedFiles>) -> Vec<String> {
    let mut files = state
        .0
        .lock()
        .expect("opened files mutex poisoned");

    let result = files.clone();
    files.clear();
    result
}

#[tauri::command]
pub fn allow_file_path(
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    let path = PathBuf::from(path);

    if !is_pdf(&path) {
        return Err("Only PDF files can be opened by the PDF viewer.".into());
    }

    app.fs_scope().allow_file(&path);
    Ok(())
}
