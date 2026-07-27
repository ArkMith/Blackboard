import { create } from "zustand";
import type { Edge } from "reactflow";
import type { WorkspaceObject } from "../types/workspace";
import { localGet, localSet } from "../utils/localStore";
import { buildEnvelope, exportWorkspacePackage, importWorkspacePackage } from "../utils/arkPackage";

interface WorkspaceMetadata {
  id: string;
  name: string;
  createdAt: string;
  thumbnail?: string | null;
  updatedAt?: string;
}

export interface SavedDrawing {
  id: string;
  type: "pen" | "eraser";
  points: [number, number, number][];
  color: string;
  size: number;
}

interface WorkspaceCanvasData {
  objects: WorkspaceObject[];
  edges: Edge[];
  drawings: SavedDrawing[];
}

export const STATUS_STAGES = [
  { id: "concept", label: "Concept Art", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { id: "modeling", label: "3D Modeling", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  { id: "texturing", label: "Texturing", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { id: "rigging", label: "Rigging / Anim", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { id: "engine", label: "Engine Ready", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
];

const WORKSPACES_INDEX_KEY = "workspaces-index";
const canvasKey = (id: string) => `canvas:${id}`;

interface WorkspaceStore {
  workspacesList: WorkspaceMetadata[];
  currentWorkspaceId: string | null;
  objects: WorkspaceObject[];
  edges: Edge[];
  drawings: SavedDrawing[];
  history: SavedDrawing[];
  statusStages: typeof STATUS_STAGES;

  loadWorkspacesMenu: () => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  // Kept this name (rather than renaming to saveCanvasLocally) so Workspace.tsx's
  // existing debounced-save effect didn't need to change at all.
  saveCanvasToCloud: () => Promise<void>;
  exportWorkspace: () => Promise<void>;
  importWorkspace: () => Promise<boolean>; // returns true if a board was actually imported

  updateObjectFields: (id: string, fields: Partial<WorkspaceObject>) => void;
  addObject: (object: WorkspaceObject) => void;
  deleteObject: (id: string) => void;
  moveObject: (id: string, x: number, y: number) => void;
  updateObjectDimensions: (id: string, width: number, height: number) => void;
  updateTitle: (id: string, title: string) => void;
  updateContent: (id: string, content: string) => void;
  setEdges: (edges: Edge[]) => void;
  setDrawings: (drawings: SavedDrawing[]) => void;
  undoDrawing: () => void;
  redoDrawing: () => void;
  clearDrawings: () => void;
  clearCanvas: () => void;
  updateThumbnail: (id: string, thumbnailDataUrl: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspacesList: [],
  currentWorkspaceId: null,
  objects: [],
  edges: [],
  drawings: [],
  history: [],
  statusStages: STATUS_STAGES,

  loadWorkspacesMenu: async () => {
    try {
      const list = (await localGet<WorkspaceMetadata[]>(WORKSPACES_INDEX_KEY)) ?? [];
      set({ workspacesList: list });
    } catch (err) {
      console.error("[bishop] failed to read local workspace index:", err);
    }
  },

  createWorkspace: async (name) => {
    const id = crypto.randomUUID();
    const meta: WorkspaceMetadata = { id, name, createdAt: new Date().toISOString(), thumbnail: null , updatedAt: new Date().toISOString() };
    const updatedList = [...get().workspacesList, meta];

    try {
      await localSet(WORKSPACES_INDEX_KEY, updatedList);
      await localSet<WorkspaceCanvasData>(canvasKey(id), { objects: [], edges: [], drawings: [] });
      set({ workspacesList: updatedList });
      await get().switchWorkspace(id);
    } catch (err) {
      console.error("[bishop] failed to create local workspace:", err);
    }
  },
  
  deleteWorkspace: async (id) => {
    const updatedList = get().workspacesList.filter((w) => w.id !== id);
    try {
      await localSet(WORKSPACES_INDEX_KEY, updatedList);
      await localSet<WorkspaceCanvasData>(canvasKey(id), { objects: [], edges: [], drawings: [] });
      set({ workspacesList: updatedList });
      if (get().currentWorkspaceId === id) {
        set({ currentWorkspaceId: null, objects: [], edges: [], drawings: [] });
      }
    } catch (err) {
      console.error("[bishop] failed to delete local workspace:", err);
    }
  },

  switchWorkspace: async (workspaceId) => {
    try {
      const canvas = await localGet<WorkspaceCanvasData>(canvasKey(workspaceId));
      set({
        currentWorkspaceId: workspaceId,
        objects: canvas?.objects ?? [],
        edges: canvas?.edges ?? [],
        drawings: canvas?.drawings ?? [],
        history: [],
      });
    } catch (err) {
      console.error("[bishop] failed to load workspace from disk:", err);
    }
  },

  saveCanvasToCloud: async () => {
    const wsId = get().currentWorkspaceId;
    if (!wsId) return;
    try {
      await localSet<WorkspaceCanvasData>(canvasKey(wsId), {
        objects: get().objects,
        edges: get().edges,
        drawings: get().drawings,
      });
    } catch (err) {
      console.error("[bishop] failed to save canvas to disk:", err);
    }
  },

  exportWorkspace: async () => {
    const { currentWorkspaceId, workspacesList, objects, edges, drawings } = get();
    if (!currentWorkspaceId) return;
    const meta = workspacesList.find((w) => w.id === currentWorkspaceId);
    const envelope = buildEnvelope(meta?.name ?? "Untitled Board", objects, edges, drawings);
    try {
      await exportWorkspacePackage(envelope);
    } catch (err) {
      console.error("[bishop] export failed:", err);
      alert("Couldn't export the board — see console for details.");
    }
  },

  updateThumbnail: async (id: string, thumbnailDataUrl: string) => {
    const updatedList = get().workspacesList.map((ws) =>
      ws.id === id
        ? { ...ws, thumbnail: thumbnailDataUrl, updatedAt: new Date().toISOString() }
        : ws
    );

    set({ workspacesList: updatedList });

    try {
      await localSet(WORKSPACES_INDEX_KEY, updatedList);
    } catch (err) {
      console.error("Failed to persist workspace thumbnail index:", err);
    }
  },

  importWorkspace: async () => {
    const envelope = await importWorkspacePackage();
    if (!envelope) return false; // cancelled or invalid file (already alerted)

    const id = crypto.randomUUID();
    const meta: WorkspaceMetadata = {
      id,
      name: `${envelope.workspace.name} (imported)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: null,
    };
    const updatedList = [...get().workspacesList, meta];

    try {
      await localSet(WORKSPACES_INDEX_KEY, updatedList);
      await localSet<WorkspaceCanvasData>(canvasKey(id), {
        objects: envelope.workspace.objects,
        edges: envelope.workspace.edges,
        drawings: envelope.workspace.drawings,
      });
      set({ workspacesList: updatedList });
      return true;
    } catch (err) {
      console.error("[bishop] failed to save imported board locally:", err);
      alert("Couldn't save the imported board — see console for details.");
      return false;
    }
  },

  updateObjectFields: (id, fields) => {
    set((state) => ({ objects: state.objects.map((o) => (o.id === id ? { ...o, ...fields } : o)) }));
  },

  addObject: (object) => {
    set((state) => ({ objects: [...state.objects, object] }));
  },

  deleteObject: (id) => {
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    }));
  },

  moveObject: (id, x, y) => {
    set((state) => ({ objects: state.objects.map((o) => (o.id === id ? { ...o, x, y } : o)) }));
  },

  updateObjectDimensions: (id, width, height) => {
    set((state) => ({ objects: state.objects.map((o) => (o.id === id ? { ...o, width, height } : o)) }));
  },

  updateTitle: (id, title) => {
    set((state) => ({ objects: state.objects.map((o) => (o.id === id ? { ...o, title } : o)) }));
  },

  updateContent: (id, content) => {
    set((state) => ({ objects: state.objects.map((o) => (o.id === id ? { ...o, content } : o)) }));
  },

  setEdges: (edges) => set({ edges }),

  setDrawings: (drawings) => set({ drawings, history: [] }),

  undoDrawing: () => {
    const { drawings, history } = get();
    if (drawings.length === 0) return;
    const removed = drawings[drawings.length - 1];
    set({ drawings: drawings.slice(0, -1), history: [removed, ...history] });
  },

  redoDrawing: () => {
    const { drawings, history } = get();
    if (history.length === 0) return;
    const [restored, ...rest] = history;
    set({ drawings: [...drawings, restored], history: rest });
  },

  clearDrawings: () => set({ drawings: [], history: [] }),

  clearCanvas: () => set({ objects: [], edges: [], drawings: [], history: [] }),
}));
