import { isTauri } from "@tauri-apps/api/core";
import { load as loadTauriStore, type Store } from "@tauri-apps/plugin-store";

// Persistent key/value storage shared by the whole frontend.
// The previous implementation read and rewrote the entire JSON file for every
// save. On Android that was unnecessarily expensive and overlapping saves could
// overwrite each other. Tauri's Store plugin is supported on Android and keeps
// the same key/value model we already use.
const DATA_FILE_NAME = "blackboard-data.json";
const APP_SETTINGS_KEY = "app-settings";

export interface AppSettings {
  brushColor: string;
  brushSize: number;
  eraserType: "stroke" | "brush";
  eraserSize: number;
  recentColors: string[];
  showMiniMap: boolean;
  isDarkMode: boolean;
  bgVariant: string;
  showBg: boolean;
  bgGap: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  brushColor: "#38bdf8",
  brushSize: 8,
  eraserType: "stroke",
  eraserSize: 20,
  recentColors: ["#1a73e8", "#12b886", "#fab005", "#be4bdb", "#ffffff"],
  showMiniMap: false,
  isDarkMode: true,
  bgVariant: "Dots",
  showBg: true,
  bgGap: 24,
};

function normalizeAppSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  const recentColors = Array.isArray(settings?.recentColors) && settings.recentColors.length > 0
    ? settings.recentColors.filter((color): color is string => typeof color === "string" && color.trim().length > 0)
    : DEFAULT_APP_SETTINGS.recentColors;

  return { ...DEFAULT_APP_SETTINGS, ...settings, recentColors };
}

let storePromise: Promise<Store> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function getStore(): Promise<Store> {
  if (!isTauri()) {
    throw new Error("Tauri store requested outside Tauri runtime");
  }

  if (!storePromise) {
    storePromise = loadTauriStore(DATA_FILE_NAME, { autoSave: false });
  }

  return storePromise;
}

// All writes share one queue so rapid canvas changes cannot race one another.
function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function loadAppSettings(): Promise<AppSettings> {
  const stored = await localGet<Partial<AppSettings>>(APP_SETTINGS_KEY);
  return normalizeAppSettings(stored);
}

export async function saveAppSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const merged = normalizeAppSettings({ ...(await loadAppSettings()), ...next });
  await localSet(APP_SETTINGS_KEY, merged);
  return merged;
}

export async function localGet<T>(key: string): Promise<T | null> {
  if (isTauri()) {
    const store = await getStore();
    return (await store.get<T>(key)) ?? null;
  }

  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function localSet<T>(key: string, value: T): Promise<void> {
  if (isTauri()) {
    await enqueueWrite(async () => {
      const store = await getStore();
      await store.set(key, value);
      await store.save();
    });
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

export async function localDelete(key: string): Promise<void> {
  if (isTauri()) {
    await enqueueWrite(async () => {
      const store = await getStore();
      await store.delete(key);
      await store.save();
    });
    return;
  }

  localStorage.removeItem(key);
}

/** Wait for queued Tauri store writes to reach disk. */
export async function flushLocalStore(): Promise<void> {
  await writeQueue;
}
