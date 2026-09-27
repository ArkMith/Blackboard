import { lazy, Suspense, useEffect, useState } from "react";
import DashboardMainMenu from "./components/DashboardMainMenu";
const Workspace = lazy(() => import("./canvas/Workspace"));
import PdfOpenDialog from "./components/PdfOpenDialog";
import { ReactFlowProvider } from "reactflow";
import { Window } from "@tauri-apps/api/window";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { readPdfSource } from "./utils/pdfOpen";

interface PendingPdfOpen {
  paths: string[];
}

const fileNameFromPath = (path: string): string => path.split(/[\\/]/).pop() || "Untitled.pdf";

export default function App() {
  const [inWorkspace, setInWorkspace] = useState(false);

  const workspacesList = useWorkspaceStore((s) => s.workspacesList);
  const loadWorkspacesMenu = useWorkspaceStore((s) => s.loadWorkspacesMenu);

  // "Open With Blackboard" support. The Rust side (src-tauri/src/file_associations.rs)
  // tracks any .pdf path the OS hands the app — via file association double-click,
  // a second launch attempt caught by the single-instance plugin, or drag-onto-dock —
  // and surfaces it to the frontend two ways:
  //   - "blackboard-file-opened" event, fired while this window is already running.
  //   - the "get_opened_files" command, drained once on startup in case a path
  //     arrived before this listener was attached (a cold start via file open).
  const [pendingPdfOpen, setPendingPdfOpen] = useState<PendingPdfOpen | null>(null);
  const [isProcessingPdfOpen, setIsProcessingPdfOpen] = useState(false);

  useEffect(() => {
    loadWorkspacesMenu();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const addPending = (paths: string[]) => {
      if (!paths.length || cancelled) return;
      setPendingPdfOpen((prev) => ({ paths: [...(prev?.paths ?? []), ...paths] }));
    };

    (async () => {
      try {
        const { isTauri, invoke } = await import("@tauri-apps/api/core");
        if (!isTauri()) return;

        const { listen } = await import("@tauri-apps/api/event");

        // Attach the listener BEFORE draining startup files. This avoids a
        // startup race where Rust receives the PDF and emits the event while
        // the React app is still mounting.
        unlisten = await listen<string[]>("blackboard-file-opened", (event) => {
          addPending(event.payload ?? []);
        });

        // Drain files that arrived before the frontend was ready.
        try {
          const opened = await invoke<string[]>("get_opened_files");
          addPending(opened ?? []);
        } catch (err) {
          console.error("[App] get_opened_files failed:", err);
        }
      } catch (err) {
        console.error("[App] Failed to attach PDF open-with listener:", err);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const importPendingPdfsInto = async (getTargetWorkspaceId: () => Promise<string>) => {
    if (!pendingPdfOpen || pendingPdfOpen.paths.length === 0) return;

    setIsProcessingPdfOpen(true);
    try {
      const workspaceId = await getTargetWorkspaceId();
      await useWorkspaceStore.getState().switchWorkspace(workspaceId);

      // Sequential on purpose: each PDF's pages stack below whatever is
      // already on the canvas, including pages from the previous PDF in
      // this same batch.
      for (const path of pendingPdfOpen.paths) {
        const fileName = fileNameFromPath(path);
        const bytes = await readPdfSource({ fileName, path });
        const { renderPdfPages, buildPdfPageObjects } = await import("./utils/pdf");
        const result = await renderPdfPages(bytes, { fileName, sourceFilePath: path });
        const pageObjects = buildPdfPageObjects(result, useWorkspaceStore.getState().objects);
        pageObjects.forEach((object) => useWorkspaceStore.getState().addObject(object));
      }

      setPendingPdfOpen(null);
      setInWorkspace(true);
    } catch (err) {
      console.error("[App] Failed to open PDF(s) into a workspace:", err);
      alert("Couldn't open that PDF — see console for details.");
    } finally {
      setIsProcessingPdfOpen(false);
    }
  };

  const handleSelectWorkspaceForPdf = (workspaceId: string) =>
    importPendingPdfsInto(async () => workspaceId);

  const handleCreateWorkspaceForPdf = (name: string) =>
    importPendingPdfsInto(async () => {
      await useWorkspaceStore.getState().createWorkspace(name);
      const created = useWorkspaceStore.getState().currentWorkspaceId;
      if (!created) throw new Error("Workspace creation did not return an id.");
      return created;
    });

  useEffect(() => {
    const showMainWindow = async () => {
      try {
        const splashWindow = await Window.getByLabel("splashscreen");
        const mainWindow = await Window.getByLabel("main");

        if (splashWindow && mainWindow) {
          // Show the main window and close splash
          await mainWindow.show();
          await splashWindow.close();
        }
      } catch (err) {
        console.error("Failed to transition from splashscreen:", err);
      }
    };

    // Small delay ensures UI is painted before switching windows
    const timer = setTimeout(() => {
      showMainWindow();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {inWorkspace ? (
        <ReactFlowProvider>
          <Suspense
            fallback={
              <div className="h-full w-full flex items-center justify-center bg-app-bg text-app-muted text-sm">
                Loading workspace…
              </div>
            }
          >
            <Workspace onBackToMenu={() => setInWorkspace(false)} />
          </Suspense>
        </ReactFlowProvider>
      ) : (
        <DashboardMainMenu onEnterWorkspace={() => setInWorkspace(true)} />
      )}

      {pendingPdfOpen && (
        <PdfOpenDialog
          fileName={
            pendingPdfOpen.paths.length === 1
              ? fileNameFromPath(pendingPdfOpen.paths[0])
              : `${pendingPdfOpen.paths.length} PDF files`
          }
          workspaces={workspacesList}
          isLoading={isProcessingPdfOpen}
          onSelectWorkspace={handleSelectWorkspaceForPdf}
          onCreateWorkspace={handleCreateWorkspaceForPdf}
          onCancel={() => setPendingPdfOpen(null)}
        />
      )}
    </>
  );
}