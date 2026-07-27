// --- Ark Mith package format -------------------------------------------
// Every Ark Mith local app is expected to export/import a single JSON
// envelope shape, saved with an app-specific extension: `.ark<app>`
// (this app uses `.arkboard`). Keeping the envelope shape identical
// across apps means a future shared "Ark Vault" importer/launcher can
// recognize and route any `.ark*` file without app-specific code, while
// `arkFormat` still lets each app reject files that aren't its own.
// -------------------------------------------------------------------------

import type { Edge } from "reactflow";
import type { WorkspaceObject } from "../types/workspace";
import type { SavedDrawing } from "../stores/workspaceStore";

export const ARK_FORMAT_ID = "blackboard";
export const ARK_EXTENSION = "arkboard";
export const ARK_FORMAT_VERSION = 1;

export interface ArkPackageEnvelope {
  arkFormat: typeof ARK_FORMAT_ID; // identifies which Ark Mith app produced this file
  arkExtension: typeof ARK_EXTENSION;
  formatVersion: number; // bump on breaking schema changes; importer checks this
  exportedAt: string;
  workspace: {
    name: string;
    objects: WorkspaceObject[];
    edges: Edge[];
    drawings: SavedDrawing[];
  };
}

export function buildEnvelope(
  name: string,
  objects: WorkspaceObject[],
  edges: Edge[],
  drawings: SavedDrawing[]
): ArkPackageEnvelope {
  return {
    arkFormat: ARK_FORMAT_ID,
    arkExtension: ARK_EXTENSION,
    formatVersion: ARK_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: { name, objects, edges, drawings },
  };
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "untitled-board";
}

function parseEnvelope(raw: string): ArkPackageEnvelope | null {
  try {
    const data = JSON.parse(raw);
    if (data?.arkFormat !== ARK_FORMAT_ID) {
      alert(`This file isn't a Blackboard board (.${ARK_EXTENSION}) — can't import it.`);
      return null;
    }
    if (typeof data.formatVersion !== "number" || data.formatVersion > ARK_FORMAT_VERSION) {
      alert("This board was exported by a newer version of Blackboard. Please update the app first.");
      return null;
    }
    return data as ArkPackageEnvelope;
  } catch (err) {
    console.error(`[blackboard] failed to parse .${ARK_EXTENSION} file:`, err);
    alert("This file is corrupted or not a valid board package.");
    return null;
  }
}

/** Prompts a save location (native dialog on desktop, browser download otherwise) and writes the package. */
export async function exportWorkspacePackage(envelope: ArkPackageEnvelope): Promise<void> {
  const json = JSON.stringify(envelope, null, 2);
  const suggestedName = `${sanitizeFileName(envelope.workspace.name)}.${ARK_EXTENSION}`;

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "Blackboard Board", extensions: [ARK_EXTENSION] }],
    });
    if (!path) return; // user cancelled the dialog

    await writeTextFile(path, json);
    return;
  }

  // Browser fallback: trigger a normal file download
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Prompts a file to open (native dialog on desktop, file picker otherwise) and returns the parsed package, or null if cancelled/invalid. */
export async function importWorkspacePackage(): Promise<ArkPackageEnvelope | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const path = await open({
      multiple: false,
      filters: [{ name: "Blackboard Board", extensions: [ARK_EXTENSION] }],
    });
    if (!path || Array.isArray(path)) return null; // cancelled

    const raw = await readTextFile(path);
    return parseEnvelope(raw);
  }

  // Browser fallback: hidden file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${ARK_EXTENSION}`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve(parseEnvelope(await file.text()));
    };
    input.click();
  });
}
