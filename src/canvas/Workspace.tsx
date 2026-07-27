import { useState, useEffect, useRef } from "react";
import {
  Pencil,
  MousePointer,
  Eraser,
  Sparkles,
  Square,
  StickyNote,
  LayoutGrid,
  Map,
  Type,
  Undo2,
  Redo2,
  Moon,
  Calendar,
  AppWindow,
  Download,
  Trash2,
  Check,
  Plus,
  Minimize2,
  FolderOpen,
  Eye,
  Grid,
  AlertTriangle,
  X
} from "lucide-react";

import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { NodeChange } from "reactflow";
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge, Connection, BackgroundVariant } from "reactflow";
import type { Node as ReactFlowNode, ReactFlowInstance, NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import { toPng } from "html-to-image";

import { useWorkspaceStore } from "../stores/workspaceStore";
import DrawingCanvas from "../components/DrawingCanvas";
import CustomEdge from "../components/CustomEdge";
import { DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings } from "../utils/localStore";

import CardNode from "../objects/CardNode";
import CompactNode from "../objects/CompactNode";
import FrameNode from "../objects/FrameNode";
import AssetPipelineNode from "../objects/AssetPipelineNode";
import ImageCardNode from "../objects/ImageCardNode";
import TimelineNode from "../objects/TimelineNode";
import TextBlockNode from "../objects/TextBlockNode";

function UnknownNode({ data }: NodeProps) {
  return (
    <div className="p-4 rounded-2xl border border-rose-500/20 bg-[#1a0505]/95 text-white shadow-lg">
      <div className="text-xs font-bold uppercase tracking-wider text-rose-400">Unknown Node Type</div>
      <div className="mt-2 text-[11px] text-slate-200">{data?.label || "No label"}</div>
      {data?.originalType && <div className="mt-1 text-[10px] text-slate-400">Type: {data.originalType}</div>}
    </div>
  );
}

const nodeTypes = {
  card: CardNode,
  compact: CompactNode,
  frame: FrameNode,
  assetPipeline: AssetPipelineNode,
  imageCard: ImageCardNode,
  timeline: TimelineNode,
  textBlock: TextBlockNode,
  unknown: UnknownNode,
};

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
};

export default function Workspace({ onBackToMenu }: { onBackToMenu: () => void }) {
  const store = useWorkspaceStore();

  useEffect(() => {
    if (!store.currentWorkspaceId) return;

    const delayDebounceSave = setTimeout(() => {
      store.saveCanvasToCloud();
    }, 800);

    return () => clearTimeout(delayDebounceSave);
  }, [store.objects, store.edges, store.drawings]);

  // Handle dynamic thumbnail capture and clean exit back to dashboard
  const handleExitWithThumbnail = async () => {
    const wsId = store.currentWorkspaceId;
    const viewportElement = document.querySelector(".react-flow__viewport") as HTMLElement;

    if (wsId && viewportElement && reactFlowInstance) {
      try {
        // 1. Temporarily fit view or reset transform to ensure everything is visible in frame
        reactFlowInstance.fitView({ padding: 0.2, duration: 0 });

        // Small delay to let the DOM settle after fitView
        await new Promise((resolve) => setTimeout(resolve, 50));

        const dataUrl = await toPng(viewportElement, {
          cacheBust: true,
          width: 800,
          height: 500,
          style: {
            // Clear out translation/scale overrides during snapshot conversion
            width: "100%",
            height: "100%",
          },
          filter: (node) => {
            // Exclude minimap and UI controls from the preview image
            return !(
              node?.classList?.contains("react-flow__minimap") ||
              node?.classList?.contains("react-flow__controls")
            );
          },
        });

        await store.updateThumbnail(wsId, dataUrl);
      } catch (err) {
        console.error("Could not generate board dynamic thumbnail:", err);
      }
    }

    onBackToMenu();
  };

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionText?: string;
    onConfirm: () => void;
  } | null>(null);

  // Canvas Mode States
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [eraserType, setEraserType] = useState<"stroke" | "brush">("stroke");
  const [eraserSize, setEraserSize] = useState(20);
  const [brushColor, setBrushColor] = useState("#38bdf8");
  const [brushSize, setBrushSize] = useState(8);
  const DEFAULT_BRUSH_COLORS = ["#d46a43", "#12b886", "#fab005", "#be4bdb", "#ffffff"];
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("blackboard-recent-colors");
      return saved ? JSON.parse(saved) : DEFAULT_BRUSH_COLORS;
    } catch {
      return DEFAULT_BRUSH_COLORS;
    }
  });

  const selectBrushColor = (c: string) => {
    setBrushColor(c);
    setRecentColors((prev) => {
      const updated = [c, ...prev.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 8);
      localStorage.setItem("blackboard-recent-colors", JSON.stringify(updated));
      return updated;
    });
  };

  // Top Bar Dropdown Menus state
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Workspace Settings States
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [bgVariant, setBgVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [showBg, setShowBg] = useState(true);
  const bgOpacity = isDarkMode ? 0.035 : 0.06;
  const [bgGap, setBgGap] = useState(24);
  const [bgColor] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const addObject = useWorkspaceStore((s) => s.addObject);
  const undoDrawing = useWorkspaceStore((state) => state.undoDrawing);
  const redoDrawing = useWorkspaceStore((state) => state.redoDrawing);
  const clearDrawings = useWorkspaceStore((state) => state.clearDrawings);

  const [tempCustomColor, setTempCustomColor] = useState<string>("#38bdf8");
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSavedSettings = async () => {
      const saved = await loadAppSettings();
      if (cancelled) return;

      setBrushColor(saved.brushColor);
      setBrushSize(saved.brushSize);
      setEraserType(saved.eraserType);
      setEraserSize(saved.eraserSize);
      setRecentColors(saved.recentColors.length > 0 ? saved.recentColors : DEFAULT_APP_SETTINGS.recentColors);
      setShowMiniMap(saved.showMiniMap);
      setIsDarkMode(saved.isDarkMode);
      setBgVariant((saved.bgVariant as BackgroundVariant) || BackgroundVariant.Dots);
      setShowBg(saved.showBg);
      setBgGap(saved.bgGap);
      setTempCustomColor(saved.brushColor);
      setSettingsLoaded(true);
    };

    loadSavedSettings().catch((err) => {
      console.warn("[Workspace] Failed to load saved UI settings:", err);
      if (!cancelled) setSettingsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    saveAppSettings({
      brushColor,
      brushSize,
      eraserType,
      eraserSize,
      recentColors,
      showMiniMap,
      isDarkMode,
      bgVariant,
      showBg,
      bgGap,
    }).catch((err) => {
      console.error("[Workspace] Failed to persist UI settings:", err);
    });
  }, [
    settingsLoaded,
    brushColor,
    brushSize,
    eraserType,
    eraserSize,
    recentColors,
    showMiniMap,
    isDarkMode,
    bgVariant,
    showBg,
    bgGap,
  ]);

  const handleConfirmCustomColor = () => {
    selectBrushColor(tempCustomColor);
    setIsPickerOpen(false);
  };

  const handleCancelCustomColor = () => {
    setTempCustomColor(brushColor);
    setIsPickerOpen(false);
  };

  const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!reactFlowInstance) return;

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newImageId = crypto.randomUUID();
        const defaultWidth = 240;
        const defaultHeight = 180;

        const newObject = {
          id: newImageId,
          type: "imageCard" as const,
          title: file.name,
          x: position.x,
          y: position.y,
          width: defaultWidth,
          height: defaultHeight,
          previewUrl: reader.result as string,
        };

        addObject(newObject);

        setNodes((nds) => [
          ...nds,
          {
            id: newImageId,
            type: "imageCard",
            position: position,
            style: { width: defaultWidth, height: defaultHeight },
            data: { label: file.name, previewUrl: reader.result as string, width: defaultWidth, height: defaultHeight },
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const initialNodes: ReactFlowNode[] = useWorkspaceStore
    .getState()
    .objects.map((object) => ({
      id: object.id,
      type: object.type,
      position: { x: object.x, y: object.y },
      style: {
        width: object.width,
        height: object.height,
        zIndex: object.type === "frame" ? -100 : undefined,
      },
      data: { label: object.title, content: object.content, previewUrl: object.previewUrl },
    }));

  const initialEdges = useWorkspaceStore.getState().edges;
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const edgeTypes = {
    default: CustomEdge,
  };

  const selectTool = (tool: "select" | "draw" | "erase") => {
    setIsDrawingMode(tool === "draw");
    setIsEraserMode(tool === "erase");
  };

  const handleNodeDragStop = (_e: React.MouseEvent, node: any) => {
    const moveObject = useWorkspaceStore.getState().moveObject;
    moveObject(node.id, node.position.x, node.position.y);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;

      const key = e.key.toLowerCase();
      if (key === "v") {
        setIsDrawingMode(false);
        setIsEraserMode(false);
      }
      if (key === "b") {
        setIsDrawingMode(true);
        setIsEraserMode(false);
      }
      if (key === "e") {
        setIsDrawingMode(false);
        setIsEraserMode(true);
      }

      if ((e.ctrlKey || e.metaKey) && (key === "y" || (e.shiftKey && key === "z"))) {
        e.preventDefault();
        redoDrawing();
      } else if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        undoDrawing();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undoDrawing, redoDrawing]);

  const onConnect = (connection: Connection) => {
    setEdges((eds) => {
      const updatedEdges = addEdge(
        {
          ...connection,
          id: `edge-${crypto.randomUUID()}`,
          style: { strokeWidth: 2.5 },
        },
        eds
      );

      const setEdgesStore = useWorkspaceStore.getState().setEdges;
      setEdgesStore(updatedEdges);

      return updatedEdges;
    });
  };

  const handleNodesChange = (changes: NodeChange[]) => {
    onNodesChange(changes);
    changes.forEach((change) => {
      if (change.type === "remove") {
        useWorkspaceStore.getState().deleteObject(change.id);
      }
    });
  };

  const handleEdgesChange = (changes: any) => {
    onEdgesChange(changes);
    const nextEdges = useWorkspaceStore.getState().edges;
    const setEdgesStore = useWorkspaceStore.getState().setEdges;
    setEdgesStore(nextEdges);
  };

  const performDeleteSelected = () => {
    const selectedNodes = nodes.filter((n: any) => n.selected);
    if (!selectedNodes || selectedNodes.length === 0) return;

    const idsToRemove = selectedNodes.map((n) => n.id);

    setNodes((nds) => nds.filter((n) => !idsToRemove.includes(n.id)));

    idsToRemove.forEach((id) => useWorkspaceStore.getState().deleteObject(id));

    setEdges((eds) => {
      const remaining = eds.filter((e) => !idsToRemove.includes((e as any).source) && !idsToRemove.includes((e as any).target));
      useWorkspaceStore.getState().setEdges(remaining);
      return remaining;
    });
  };

  const confirmDeleteSelected = () => {
    const selectedNodes = nodes.filter((n: any) => n.selected);
    if (!selectedNodes || selectedNodes.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Delete Selected Elements?",
      message: `Are you sure you want to delete ${selectedNodes.length} selected item${
        selectedNodes.length > 1 ? "s" : ""
      }? This action cannot be undone.`,
      actionText: "Delete",
      onConfirm: () => {
        performDeleteSelected();
        setConfirmModal(null);
      },
    });
  };

  const confirmClearDrawings = () => {
    const currentDrawings = useWorkspaceStore.getState().drawings;
    if (!currentDrawings || currentDrawings.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Clear Ink Drawings?",
      message: "Are you sure you want to delete all ink strokes from this canvas? This action cannot be undone.",
      actionText: "Clear All",
      onConfirm: () => {
        clearDrawings();
        setConfirmModal(null);
      },
    });
  };

  const addCard = () => {
    const id = createId();
    const position = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 200, y: 200 };
    const newObject = {
      id,
      type: "card" as const,
      title: "Untitled Card",
      content: "",
      x: position.x,
      y: position.y,
      width: 320,
      height: 180,
    };
    addObject(newObject);
    setNodes((nds) => [...nds, { id, type: "card", position: { x: newObject.x, y: newObject.y }, style: { width: newObject.width, height: newObject.height }, data: { label: newObject.title, content: newObject.content } }]);
  };

  const addCompact = () => {
    const id = createId();
    const position = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 220, y: 220 };
    const newObject = {
      id,
      type: "compact" as const,
      title: "Quick Note",
      x: position.x,
      y: position.y,
    };
    addObject(newObject);
    setNodes((nds) => [...nds, { id, type: "compact", position: { x: newObject.x, y: newObject.y }, data: { label: newObject.title } }]);
  };

  const addFrame = () => {
    const id = createId();
    const position = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 180, y: 180 };
    const newObject = {
      id,
      type: "frame" as const,
      title: "Container Frame",
      x: position.x,
      y: position.y,
      width: 600,
      height: 400,
    };
    addObject(newObject);
    setNodes((nds) => [...nds, { id, type: "frame", position: { x: newObject.x, y: newObject.y }, style: { width: newObject.width, height: newObject.height, zIndex: -100 }, data: { label: newObject.title }, zIndex: -100 }]);
  };

  const addAssetPipelineNode = () => {
    const id = createId();
    const position = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 200, y: 200 };
    const newObj = {
      id,
      type: "assetPipeline" as const,
      title: "Hero Sprite Resource",
      x: position.x,
      y: position.y,
      status: "concept",
      fileFormat: ".png",
      polycount: "",
      dueDate: "2026-06-15",
      previewUrl: null,
      checklist: [
        { id: "1", text: "Create high-poly sculpt", done: false },
        { id: "2", text: "Bake base normal map textures", done: false },
      ],
    };

    useWorkspaceStore.getState().addObject(newObj);
    setNodes((nds) => [...nds, { id, type: "assetPipeline", position: { x: newObj.x, y: newObj.y }, data: { label: "Hero Sprite Resource" } }]);
  };

  const addTimelineNode = () => {
    const id = createId();
    const position = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 150, y: 150 };
    const newObject = {
      id,
      type: "timeline" as const,
      title: "Production Sprint Milestone",
      x: position.x,
      y: position.y,
      timelineTracks: [
        {
          id: "t1",
          trackName: "Feature Row 1",
          tasks: [{ id: "init-tk", text: "Draft Concept", startDay: 1, duration: 3, color: "from-sky-400 to-indigo-500" }],
        },
      ],
    };
    addObject(newObject);
    setNodes((nds) => [...nds, { id, type: "timeline", position: { x: newObject.x, y: newObject.y }, data: { label: newObject.title } }]);
  };

  const addTextBlockNode = (_type: "textBlock") => {
    const id = createId();
    const position = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 100, y: 100 };
    const newObject = {
      id,
      type: "textBlock" as const,
      title: "Text Block",
      x: position.x,
      y: position.y,
      content: "",
    };
    addObject(newObject);
    setNodes((nds) => [...nds, { id, type: "textBlock", position: { x: newObject.x, y: newObject.y }, data: { label: newObject.title, content: newObject.content } }]);
  };

  const openImagePicker = () => {
    const input = document.createElement("input") as HTMLInputElement;
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    input.onchange = () => {
      handleImageSelection(input.files);
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 100);
    };
    document.body.appendChild(input);
    input.click();
  };

  const handleImageSelection = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!reactFlowInstance) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result as string;

      img.onload = () => {
        const offscreenCanvas = document.createElement("canvas");
        const ctx = offscreenCanvas.getContext("2d");

        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let targetWidth = img.width;
        let targetHeight = img.height;

        if (targetWidth > targetHeight) {
          if (targetWidth > MAX_WIDTH) {
            targetHeight *= MAX_WIDTH / targetWidth;
            targetWidth = MAX_WIDTH;
          }
        } else {
          if (targetHeight > MAX_HEIGHT) {
            targetWidth *= MAX_HEIGHT / targetHeight;
            targetHeight = MAX_HEIGHT;
          }
        }

        offscreenCanvas.width = targetWidth;
        offscreenCanvas.height = targetHeight;

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const compressedDataUrl = offscreenCanvas.toDataURL("image/jpeg", 0.7);

          const id = createId();
          const defaultWidth = 240;
          const defaultHeight = 180;

          const newObject = {
            id,
            type: "imageCard" as const,
            title: file.name,
            x: position.x,
            y: position.y,
            width: defaultWidth,
            height: defaultHeight,
            previewUrl: compressedDataUrl,
          };

          addObject(newObject);

          setNodes((nds) => [
            ...nds,
            {
              id,
              type: "imageCard",
              position,
              style: { width: defaultWidth, height: defaultHeight },
              data: {
                label: file.name,
                previewUrl: compressedDataUrl,
                width: defaultWidth,
                height: defaultHeight,
              },
            },
          ]);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const isCanvasActive = isDrawingMode || isEraserMode;

  useEffect(() => {
    if ((window as any).__TAURI_INTERNALS__) {
      const webview = getCurrentWebviewWindow();

      const unlistenPromise = webview.onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const droppedPaths: string[] = event.payload.paths;
          if (!droppedPaths || droppedPaths.length === 0) return;

          if (!reactFlowInstance) return;
          const centerPosition = reactFlowInstance.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });

          droppedPaths.forEach((filePath: string) => {
            const fileName = filePath.split(/[\\/]/).pop() || "Sticker Resource";
            const newImageId = crypto.randomUUID();
            const defaultWidth = 240;
            const defaultHeight = 180;

            const newObject = {
              id: newImageId,
              type: "imageCard" as const,
              title: fileName,
              x: centerPosition.x,
              y: centerPosition.y,
              width: defaultWidth,
              height: defaultHeight,
              previewUrl: null,
            };

            addObject(newObject);

            setNodes((nds) => [
              ...nds,
              {
                id: newImageId,
                type: "imageCard",
                position: centerPosition,
                style: { width: defaultWidth, height: defaultHeight },
                data: { label: fileName, width: defaultWidth, height: defaultHeight },
              },
            ]);
          });
        }
      });

      return () => {
        unlistenPromise.then((unlisten) => unlisten());
      };
    }
  }, [addObject, setNodes, reactFlowInstance]);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={handleCanvasDrop}
      className={`h-screen w-screen transition-colors duration-200 overflow-hidden relative select-none font-body antialiased ${
        isDarkMode ? "bg-[#0f0d0b] text-[#f4e8dc]" : "bg-[#f1f3f4] text-[#2a2421]"
      }`}
    >
      {/* TOP MENU & QUICK BAR */}
      <div ref={menuRef} className="absolute top-0 left-0 right-0 z-50 flex flex-col font-body select-none">
        {/* Tier 1: Menu Bar */}
        <div className="h-7 bg-[#f0f0f0] text-slate-800 border-b border-slate-300 flex items-center justify-between px-2 text-xs">
          <div className="flex items-center gap-1 relative">
            <button
              onClick={handleExitWithThumbnail}
              className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-slate-200 rounded text-[11px] font-semibold text-slate-700 cursor-pointer"
            >
              <AppWindow size={13} className="text-[var(--color-accent)]" />
              <span>Workspace</span>
            </button>

            <div className="h-3 w-px bg-slate-300 mx-1" />

            {/* File Menu */}
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === "file" ? null : "file")}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  activeMenu === "file" ? "bg-slate-300 font-semibold" : "hover:bg-[#e5e5e5]"
                }`}
              >
                File
              </button>
              {activeMenu === "file" && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-[#f9f9f9] border border-slate-300 rounded shadow-lg py-1 z-50 text-slate-800 text-xs">
                  <button
                    onClick={() => {
                      handleExitWithThumbnail();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <FolderOpen size={12} />
                    <span>Open Dashboard</span>
                  </button>
                  <button
                    onClick={() => {
                      store.exportWorkspace();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Download size={12} />
                    <span>Export Workspace</span>
                  </button>
                </div>
              )}
            </div>

            {/* Edit Menu */}
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === "edit" ? null : "edit")}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  activeMenu === "edit" ? "bg-slate-300 font-semibold" : "hover:bg-[#e5e5e5]"
                }`}
              >
                Edit
              </button>
              {activeMenu === "edit" && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-[#f9f9f9] border border-slate-300 rounded shadow-lg py-1 z-50 text-slate-800 text-xs">
                  <button
                    onClick={() => {
                      undoDrawing();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Undo2 size={12} /> Undo
                    </span>
                    <span className="text-[10px] text-slate-400">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => {
                      redoDrawing();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Redo2 size={12} /> Redo
                    </span>
                    <span className="text-[10px] text-slate-400">Ctrl+Y</span>
                  </button>
                  <div className="my-1 border-t border-slate-200" />
                  <button
                    onClick={() => {
                      confirmDeleteSelected();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-500 hover:text-white text-rose-600 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Delete Selected</span>
                  </button>
                  <button
                    onClick={() => {
                      confirmClearDrawings();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-500 hover:text-white text-rose-600 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Clear Ink Drawings</span>
                  </button>
                </div>
              )}
            </div>

            {/* Insert Menu */}
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === "insert" ? null : "insert")}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  activeMenu === "insert" ? "bg-slate-300 font-semibold" : "hover:bg-[#e5e5e5]"
                }`}
              >
                Insert
              </button>
              {activeMenu === "insert" && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-[#f9f9f9] border border-slate-300 rounded shadow-lg py-1 z-50 text-slate-800 text-xs">
                  <button
                    onClick={() => {
                      addCard();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Square size={12} /> Card Node
                  </button>
                  <button
                    onClick={() => {
                      addCompact();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <StickyNote size={12} /> Sticky Note
                  </button>
                  <button
                    onClick={() => {
                      addFrame();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <LayoutGrid size={12} /> Container Frame
                  </button>
                  <button
                    onClick={() => {
                      addAssetPipelineNode();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles size={12} /> Asset Pipeline
                  </button>
                  <button
                    onClick={() => {
                      openImagePicker();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Map size={12} /> Image Card
                  </button>
                  <button
                    onClick={() => {
                      addTimelineNode();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Calendar size={12} /> Timeline Track
                  </button>
                  <button
                    onClick={() => {
                      addTextBlockNode("textBlock");
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Type size={12} /> Text Block
                  </button>
                </div>
              )}
            </div>

            {/* View Menu */}
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === "view" ? null : "view")}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  activeMenu === "view" ? "bg-slate-300 font-semibold" : "hover:bg-[#e5e5e5]"
                }`}
              >
                View
              </button>
              {activeMenu === "view" && (
                <div className="absolute left-0 top-full mt-1 w-60 bg-[#f9f9f9] border border-slate-300 rounded shadow-lg py-1 z-50 text-slate-800 text-xs">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Eye size={10} /> Display Options
                  </div>
                  <button
                    onClick={() => setShowMiniMap(!showMiniMap)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span>MiniMap Overview</span>
                    {showMiniMap && <Check size={12} />}
                  </button>
                  <button
                    onClick={() => setShowBg(!showBg)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span>Grid Background</span>
                    {showBg && <Check size={12} />}
                  </button>
                  <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Moon size={11} /> Dark Theme
                    </span>
                    {isDarkMode && <Check size={12} />}
                  </button>

                  <div className="my-1 border-t border-slate-200" />
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Grid size={10} /> Grid Pattern
                  </div>
                  <div className="px-3 py-1 flex gap-1">
                    <button
                      onClick={() => setBgVariant(BackgroundVariant.Dots)}
                      className={`flex-1 py-1 text-[10px] rounded border cursor-pointer ${
                        bgVariant === BackgroundVariant.Dots
                          ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      Dots
                    </button>
                    <button
                      onClick={() => setBgVariant(BackgroundVariant.Lines)}
                      className={`flex-1 py-1 text-[10px] rounded border cursor-pointer ${
                        bgVariant === BackgroundVariant.Lines
                          ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      Lines
                    </button>
                    <button
                      onClick={() => setBgVariant(BackgroundVariant.Cross)}
                      className={`flex-1 py-1 text-[10px] rounded border cursor-pointer ${
                        bgVariant === BackgroundVariant.Cross
                          ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      Cross
                    </button>
                  </div>

                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-600">Grid Spacing</span>
                    <input
                      type="range"
                      min={12}
                      max={64}
                      step={4}
                      value={bgGap}
                      onChange={(e) => setBgGap(Number(e.target.value))}
                      className="w-24 accent-[var(--color-accent)] h-1 bg-slate-200 rounded appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="my-1 border-t border-slate-200" />
                  <button
                    onClick={() => {
                      reactFlowInstance?.fitView();
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Minimize2 size={12} /> Fit View to Content
                  </button>
                </div>
              )}
            </div>

            {/* Tools Menu */}
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === "tools" ? null : "tools")}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  activeMenu === "tools" ? "bg-slate-300 font-semibold" : "hover:bg-[#e5e5e5]"
                }`}
              >
                Tools
              </button>
              {activeMenu === "tools" && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-[#f9f9f9] border border-slate-300 rounded shadow-lg py-1 z-50 text-slate-800 text-xs">
                  <button
                    onClick={() => {
                      selectTool("select");
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <MousePointer size={12} /> Select Tool
                    </span>
                    <span className="text-[10px] text-slate-400">V</span>
                  </button>
                  <button
                    onClick={() => {
                      selectTool("draw");
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Pencil size={12} /> Ink Brush
                    </span>
                    <span className="text-[10px] text-slate-400">B</span>
                  </button>
                  <button
                    onClick={() => {
                      selectTool("erase");
                      setActiveMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Eraser size={12} /> Eraser
                    </span>
                    <span className="text-[10px] text-slate-400">E</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 font-mono pr-2 truncate max-w-xs">
            {store.workspacesList.find((w) => w.id === store.currentWorkspaceId)?.name || "Untitled Project.ark"}
          </div>
        </div>

        {/* Tier 2: Dark Icon Quick Bar */}
        <div className="h-9 bg-[#212121] border-b border-[#141414] text-slate-300 flex items-center justify-between px-3">
          <div className="flex items-center gap-1 text-[#a0a0a0]">
            <button
              onClick={() => selectTool("select")}
              className={`p-1.5 rounded hover:bg-white/10 hover:text-white transition-colors cursor-pointer ${
                !isCanvasActive ? "bg-[var(--color-accent)] text-white" : ""
              }`}
              title="Selection Tool (V)"
            >
              <MousePointer size={14} />
            </button>
            <button
              onClick={() => selectTool("draw")}
              className={`p-1.5 rounded hover:bg-white/10 hover:text-white transition-colors cursor-pointer ${
                isDrawingMode ? "bg-[var(--color-accent)] text-white" : ""
              }`}
              title="Ink Brush (B)"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => selectTool("erase")}
              className={`p-1.5 rounded hover:bg-white/10 hover:text-white transition-colors cursor-pointer ${
                isEraserMode ? "bg-[var(--color-accent)] text-white" : ""
              }`}
              title="Eraser (E)"
            >
              <Eraser size={14} />
            </button>

            <div className="h-4 w-px bg-white/10 mx-1.5" />

            <button onClick={addCard} className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer" title="Add Card">
              <Square size={14} />
            </button>
            <button onClick={addCompact} className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer" title="Add Sticky Note">
              <StickyNote size={14} />
            </button>
            <button onClick={addFrame} className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer" title="Add Frame">
              <LayoutGrid size={14} />
            </button>
            <button onClick={addAssetPipelineNode} className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer" title="Add Asset Pipeline">
              <Sparkles size={14} />
            </button>
            <button onClick={openImagePicker} className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer" title="Add Image">
              <Map size={14} />
            </button>
            <button onClick={addTimelineNode} className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer" title="Add Timeline">
              <Calendar size={14} />
            </button>
            <button onClick={() => addTextBlockNode("textBlock")} className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer" title="Add Text">
              <Type size={14} />
            </button>
          </div>

          {/* Right Side: Inline Ink Brush / Eraser Tool Controls */}
          {isCanvasActive && (
            <div className="flex items-center gap-3 bg-black/40 border border-white/10 px-2.5 py-1 rounded-md text-xs">
              {isDrawingMode && (
                <div className="flex items-center gap-2 relative">
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Color</span>
                  
                  <div className="flex items-center gap-1">
                    {recentColors.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          selectBrushColor(c);
                          setTempCustomColor(c);
                        }}
                        className={`w-4 h-4 rounded-full border transition-all cursor-pointer ${
                          brushColor.toLowerCase() === c.toLowerCase()
                            ? "border-white scale-110 shadow-sm"
                            : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}

                    <div className="relative">
                      <button
                        onClick={() => {
                          setTempCustomColor(brushColor);
                          setIsPickerOpen(!isPickerOpen);
                        }}
                        className="w-4 h-4 rounded-full border border-dashed border-slate-500 flex items-center justify-center hover:border-[var(--color-accent)] transition-colors cursor-pointer"
                        title="Custom Color"
                      >
                        <Plus size={8} className="text-slate-300" />
                      </button>
                      

                      {isPickerOpen && (
                        <div className="absolute right-5 top-full mt-2 z-[60] bg-[#181c24] border border-slate-700/80 p-2.5 rounded-xl shadow-2xl flex flex-col gap-2 w-44 animate-in fade-in zoom-in-95 duration-100">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
                            <span>Pick A Color</span>
                            <div
                              className="w-4 h-4 rounded-full border border-white/20"
                              style={{ backgroundColor: tempCustomColor }}
                            />
                          </div>

                          <input
                            type="color"
                            value={tempCustomColor}
                            onChange={(e) => setTempCustomColor(e.target.value)}
                            className="w-full h-8 cursor-pointer rounded bg-transparent border-0"
                          />

                          <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-800">
                            <button
                              onClick={handleCancelCustomColor}
                              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                            <button
                              onClick={handleConfirmCustomColor}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-accent)] hover:opacity-90 text-white text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              <Check size={11} /> Apply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="h-3 w-px bg-white/10" />
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Size ({brushSize}px)</span>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-16 accent-[var(--color-accent)] h-1 bg-slate-800 rounded appearance-none cursor-pointer"
                        />
                      </div>
                  </div>
                </div>
              )}

              {isEraserMode && (
                <>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEraserType("stroke")}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        eraserType === "stroke" ? "bg-[var(--color-accent)] text-white font-bold" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Stroke
                    </button>
                    <button
                      onClick={() => setEraserType("brush")}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        eraserType === "brush" ? "bg-[var(--color-accent)] text-white font-bold" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Brush
                    </button>
                  </div>

                  {eraserType === "brush" && (
                    <>
                      <div className="h-3 w-px bg-white/10" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Size ({eraserSize}px)</span>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={eraserSize}
                          onChange={(e) => setEraserSize(Number(e.target.value))}
                          className="w-16 accent-[var(--color-accent)] h-1 bg-slate-800 rounded appearance-none cursor-pointer"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="h-3 w-px bg-white/10" />

              <div className="flex items-center gap-1">
                <button
                  onClick={undoDrawing}
                  className="p-1 rounded hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
                  title="Undo stroke (Ctrl+Z)"
                >
                  <Undo2 size={13} />
                </button>
                <button
                  onClick={redoDrawing}
                  className="p-1 rounded hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
                  title="Redo stroke (Ctrl+Y)"
                >
                  <Redo2 size={13} />
                </button>
                <button
                  onClick={confirmClearDrawings}
                  className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                  title="Clear All Drawings"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CANVAS CONTAINER */}
      <div className="absolute top-16 left-0 right-0 bottom-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={handleNodeDragStop}
          onInit={setReactFlowInstance}
          panOnDrag={!isCanvasActive}
          selectionOnDrag={!isCanvasActive}
          panOnScroll={true}
          zoomOnScroll={true}
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          {showBg && (
            <Background
              variant={bgVariant}
              gap={bgGap}
              size={bgVariant === BackgroundVariant.Dots ? 1.5 : 1}
              color={bgColor || (isDarkMode ? "#ffffff" : "#000000")}
              style={{ opacity: bgOpacity }}
            />
          )}

          <Controls
            showInteractive={false}
            className={`left-4! bottom-4! border rounded-xl overflow-hidden shadow-xl ${
              isDarkMode
                ? "bg-[#1a1410]/90! border-white/10! text-[#f4e8dc]!"
                : "bg-white! border-black/10! text-[#2a2421]!"
            }`}
          />

          {showMiniMap && (
            <MiniMap
              className={`right-4! bottom-4! border rounded-xl overflow-hidden shadow-2xl ${
                isDarkMode ? "bg-[#1a1410]/90! border-white/10!" : "bg-white! border-black/10!"
              }`}
              nodeColor={() => (isDarkMode ? "#f38b6d" : "#d46a43")}
              maskColor={isDarkMode ? "rgba(15, 13, 11, 0.7)" : "rgba(241, 243, 244, 0.7)"}
            />
          )}
        </ReactFlow>

        {/* Ink Layer Canvas */}
        <DrawingCanvas
          isDrawingMode={isDrawingMode}
          isEraserMode={isEraserMode}
          eraserType={eraserType}
          eraserSize={eraserSize}
          brushColor={brushColor}
          brushSize={brushSize}
          reactFlowInstance={reactFlowInstance}
        />
      </div>

      {/* CONFIRMATION POPUP MODAL */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div
            className={`w-full max-w-sm rounded-xl border p-5 shadow-2xl transition-all ${
              isDarkMode
                ? "bg-[#1a1410] border-white/10 text-[#f4e8dc]"
                : "bg-white border-black/10 text-[#2a2421]"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-rose-500/10 text-rose-500 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold">{confirmModal.title}</h3>
                <p className={`mt-1 text-xs leading-relaxed ${isDarkMode ? "text-white/50" : "text-black/50"}`}>{confirmModal.message}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isDarkMode
                    ? "bg-white/10 hover:bg-white/15 text-[#f4e8dc]"
                    : "bg-black/5 hover:bg-black/10 text-[#2a2421]"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 transition-colors shadow-sm cursor-pointer"
              >
                {confirmModal.actionText || "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}