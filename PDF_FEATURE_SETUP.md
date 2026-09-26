# Blackboard PDF Import Feature

This snapshot adds the frontend PDF import flow and the Tauri file-association helper.

## Frontend dependency

```bash
npm install pdfjs-dist
```

## Frontend files added/changed

- `src/App.tsx`
- `src/components/PdfOpenDialog.tsx`
- `src/utils/pdf.ts`
- `src/utils/pdfOpen.ts`
- `src/objects/PdfPageNode.tsx`
- `src/types/workspace.ts`
- `src/stores/workspaceStore.ts`
- `src/components/DashboardMainMenu.tsx`
- `src/canvas/Workspace.tsx`

## Tauri helper

- `src-tauri/src/file_associations.rs`

The helper expects the Tauri `fs` plugin to already be installed (the existing Blackboard source already uses `@tauri-apps/plugin-fs`).

Install the single-instance plugin and URL parser in the Tauri project:

```bash
cargo add tauri-plugin-single-instance --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
cargo add url
```

Register the single-instance plugin first, manage `OpenedFiles`, register the three commands from `file_associations.rs`, initialize `tauri_plugin_fs`, and process startup args with `paths_from_args(std::env::args().skip(1))`.

For subsequent launches while Blackboard is already running, pass the single-instance callback args directly to `paths_from_args(args)` and call `register_opened_files(app, files, false)`.

## Tauri configuration

Add this inside `bundle`:

```json
"fileAssociations": [
  {
    "ext": ["pdf"],
    "mimeType": "application/pdf",
    "name": "PDF Document",
    "description": "PDF document",
    "role": "Viewer",
    "rank": "Alternate"
  }
]
```

This registers Blackboard as an available PDF handler. It does not silently take over the user's existing PDF default.

## Behavior

Opening a PDF from Explorer/File Manager starts or focuses Blackboard and shows the workspace chooser. The user can:

- add the PDF to an existing local workspace, or
- create a new workspace named after the PDF.

Each PDF page becomes its own `pdfPage` object and is placed vertically with a gap between pages. The page image and PDF metadata are saved with the workspace.

For very large PDFs, a later optimization should move rendered page images out of the master workspace JSON and into Blackboard's asset storage.
