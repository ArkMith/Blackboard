import { 
  exists, 
  mkdir, 
  writeTextFile, 
  readTextFile, 
  copyFile, 
  readDir, 
  remove 
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { WorkspaceObject } from '../types/workspace';
import type { Edge } from 'reactflow';
import type { SavedDrawing } from '../stores/workspaceStore';

export interface ArkbishopProjectFile {
  metadata: {
    formatVersion: '1.0.0';
    application: 'Blackboard';
    createdWithVersion: string;
    lastSavedWithVersion: string;
    createdAt: string;
    updatedAt: string;
  };
  projectSettings: {
    theme: 'dark' | 'light' | 'system';
    grid: { showGrid: boolean; snapToGrid: boolean; gridSize: number };
    viewport: { x: number; y: number; zoom: number };
    minimap: { visible: boolean };
  };
  workspace: {
    objects: WorkspaceObject[];
    edges: Edge[];
    drawings: SavedDrawing[];
  };
  assets: Record<
    string,
    {
      id: string;
      originalName: string;
      relativePath: string;
      mimeType: string;
      size: number;
    }
  >;
}

// Ensures folder scaffolding exists: MyProject/Assets, MyProject/Cache, MyProject/Backups
export async function initializeProjectFolderStructure(projectDirPath: string): Promise<void> {
  const folders = ['Assets', 'Cache', 'Backups'];
  for (const folder of folders) {
    const path = await join(projectDirPath, folder);
    const dirExists = await exists(path);
    if (!dirExists) {
      await mkdir(path, { recursive: true });
    }
  }
}

// Convert relative asset paths (Assets/img.png) into Tauri asset URLs for display
export async function getTauriAssetUrl(projectDirPath: string, relativePath: string): Promise<string> {
  const fullPath = await join(projectDirPath, relativePath);
  return convertFileSrc(fullPath);
}

// Copy imported asset into project Assets/ directory
export async function importAssetToProject(
  sourceFilePath: string,
  projectDirPath: string,
  originalFilename: string
): Promise<{ relativePath: string; assetId: string }> {
  const timestamp = Date.now();
  const ext = originalFilename.split('.').pop() || 'bin';
  const assetId = `asset_${timestamp}`;
  const relativePath = `Assets/${assetId}.${ext}`;
  const destinationPath = await join(projectDirPath, relativePath);

  await copyFile(sourceFilePath, destinationPath);
  return { relativePath, assetId };
}

// Save project manifest .arkboard
export async function saveProjectFile(
  projectFilePath: string,
  content: ArkbishopProjectFile
): Promise<void> {
  await writeTextFile(projectFilePath, JSON.stringify(content, null, 2));
}

// Read project manifest .arkboard
export async function loadProjectFile(
  projectFilePath: string
): Promise<ArkbishopProjectFile> {
  const raw = await readTextFile(projectFilePath);
  return JSON.parse(raw) as ArkbishopProjectFile;
}

// Backup Rotation (Keep last 5 autosaves)
export async function rotateBackups(projectDirPath: string, maxBackups = 5): Promise<void> {
  const backupDir = await join(projectDirPath, 'Backups');
  if (!(await exists(backupDir))) return;

  const entries = await readDir(backupDir);
  const autoSaves = entries
    .filter((e) => e.name?.startsWith('auto_') && e.name?.endsWith('.arkboard'))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (autoSaves.length > maxBackups) {
    const toDelete = autoSaves.slice(0, autoSaves.length - maxBackups);
    for (const file of toDelete) {
      const pathToRemove = await join(backupDir, file.name);
      await remove(pathToRemove);
    }
  }
}