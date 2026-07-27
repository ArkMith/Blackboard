import { useEffect, useState } from "react";
import DashboardMainMenu from "./components/DashboardMainMenu";
import Workspace from "./canvas/Workspace";
import { ReactFlowProvider } from "reactflow";
import { Window } from "@tauri-apps/api/window";
export default function App() {
  const [inWorkspace, setInWorkspace] = useState(false);

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

  if (inWorkspace) {
    return (
      <ReactFlowProvider>
        <Workspace onBackToMenu={() => setInWorkspace(false)} />
      </ReactFlowProvider>
    );
  }

  return <DashboardMainMenu onEnterWorkspace={() => setInWorkspace(true)} />;
}