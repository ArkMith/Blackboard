import { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { saveProjectFile, rotateBackups } from '../utils/tauriProjectSystem';

export function useAutosave(intervalMs: number = 45000) {
  const { projectDirPath, projectFilePath, isDirty, nodes, edges, markSaved } = useWorkspaceStore((state: any) => ({
    projectDirPath: state.projectDirPath,
    projectFilePath: state.projectFilePath,
    isDirty: state.isDirty,
    nodes: state.nodes,
    edges: state.edges,
    markSaved: state.markSaved,
  }));

  const stateRef = useRef({ projectDirPath, projectFilePath, isDirty, nodes, edges });
  useEffect(() => {
    stateRef.current = { projectDirPath, projectFilePath, isDirty, nodes, edges };
  }, [projectDirPath, projectFilePath, isDirty, nodes, edges]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const current = stateRef.current;
      if (!current.isDirty || !current.projectDirPath || !current.projectFilePath) return;

      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${current.projectDirPath}\\Backups\\auto_${timestamp}.arkboard`;

        const payload = {
          metadata: {
            formatVersion: '1.0.0',
            application: 'Blackboard',
            createdWithVersion: '1.0.0',
            lastSavedWithVersion: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          projectSettings: {
            theme: 'dark',
            grid: { showGrid: true, snapToGrid: true, gridSize: 20 },
            viewport: { x: 0, y: 0, zoom: 1 },
            minimap: { visible: true },
          },
          workspace: { nodes: current.nodes, edges: current.edges },
          assets: {},
        };

        // Write backup file & main file
        await saveProjectFile(backupPath, payload as any);
        await saveProjectFile(current.projectFilePath, payload as any);
        await rotateBackups(current.projectDirPath);

        markSaved();
        console.log('[Autosave] Project autosaved and backups rotated.');
      } catch (err) {
        console.error('[Autosave] Autosave failed:', err);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs, markSaved]);
}