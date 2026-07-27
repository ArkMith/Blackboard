import { isTauri } from "@tauri-apps/api/core";
import {
  BaseDirectory,
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
} from "@tauri-apps/plugin-fs";

// Name of the JSON store file in OS AppData directory
const DATA_FILE_NAME = "blackboard-data.json";
const APP_SETTINGS_KEY = "app-settings";

interface StoreSchema {
  [key: string]: unknown;
}

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

  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    recentColors,
  };
}

export async function loadAppSettings(): Promise<AppSettings> {
  const stored = await localGet<Partial<AppSettings>>(APP_SETTINGS_KEY);
  return normalizeAppSettings(stored);
}

export async function saveAppSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const merged = normalizeAppSettings({
    ...(await loadAppSettings()),
    ...next,
  });

  await localSet(APP_SETTINGS_KEY, merged);
  return merged;
}

/**
 * Reads the master JSON file from OS AppData (e.g., AppData/Roaming/<App>/blackboard-data.json)
 */
async function readDiskStore(): Promise<StoreSchema> {
  try {
    const fileExists = await exists(DATA_FILE_NAME, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      return {};
    }

    const raw = await readTextFile(DATA_FILE_NAME, {
      baseDir: BaseDirectory.AppData,
    });
    return JSON.parse(raw) as StoreSchema;
  } catch (err) {
    console.warn("[localStore] Failed to read from AppData disk store:", err);
    return {};
  }
}

/**
 * Writes the master JSON payload to disk in OS AppData
 */
async function writeDiskStore(data: StoreSchema): Promise<void> {
  try {
    // Ensure the AppData folder for this app exists
    await mkdir("", {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });

    await writeTextFile(DATA_FILE_NAME, JSON.stringify(data, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.error("[localStore] Failed to write to AppData disk store:", err);
  }
}

export async function localGet<T>(key: string): Promise<T | null> {
  if (isTauri()) {
    const store = await readDiskStore();
    return (store[key] as T) ?? null;
  }

  // Fallback for web browser dev preview
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function localSet<T>(key: string, value: T): Promise<void> {
  if (isTauri()) {
    const store = await readDiskStore();
    store[key] = value;
    await writeDiskStore(store);
    return;
  }

  // Fallback for web browser dev preview
  localStorage.setItem(key, JSON.stringify(value));
}

export async function localDelete(key: string): Promise<void> {
  if (isTauri()) {
    const store = await readDiskStore();
    delete store[key];
    await writeDiskStore(store);
    return;
  }

  // Fallback for web browser dev preview
  localStorage.removeItem(key);
}