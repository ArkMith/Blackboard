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
  MoreVertical,
  Check,
  Plus,
  Minimize2,
  FolderOpen,
  Eye,
  Grid,
  AlertTriangle,
  X,
  FileText
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
import { DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings, flushLocalStore } from "../utils/localStore";

import CardNode from "../objects/CardNode";
import CompactNode from "../objects/CompactNode";
import FrameNode from "../objects/FrameNode";
import AssetPipelineNode from "../objects/AssetPipelineNode";
import ImageCardNode from "../objects/ImageCardNode";
import TimelineNode from "../objects/TimelineNode";
import TextBlockNode from "../objects/TextBlockNode";
import PdfPageNode from "../objects/PdfPageNode";
import { renderPdfPages, buildPdfPageObjects, type PdfDocumentResult } from "../utils/pdf";
import { pickPdfSource, readPdfSource } from "../utils/pdfOpen";

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
  pdfPage: PdfPageNode,
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

    // Keep normal editing responsive. The final state is also explicitly
    // flushed before leaving the workspace, so a short debounce cannot lose
    // the last edit on Android.
    const delayDebounceSave = setTimeout(() => {
      void store.saveCanvasToCloud();
    }, 350);

    return () => clearTimeout(delayDebounceSave);
  }, [store.currentWorkspaceId, store.objects, store.edges, store.drawings]);

  useEffect(() => {
    const saveBeforeSuspension = () => {
      if (document.visibilityState === "hidden") {
        void store.saveCanvasToCloud();
      }
    };

    document.addEventListener("visibilitychange", saveBeforeSuspension);
    window.addEventListener("pagehide", saveBeforeSuspension);

    return () => {
      document.removeEventListener("visibilitychange", saveBeforeSuspension);
      window.removeEventListener("pagehide", saveBeforeSuspension);
    };
  }, [store.saveCanvasToCloud]);

  // Handle dynamic thumbnail capture and clean exit back to dashboard
  const handleExitWithThumbnail = async () => {
    const wsId = store.currentWorkspaceId;

    // Never leave the workspace until its latest canvas state has reached
    // persistent storage. This is especially important on Android where the
    // OS can suspend the WebView immediately after navigation.
    try {
      await store.saveCanvasToCloud();
      await flushLocalStore();
    } catch (err) {
      console.error("[Workspace] Failed to flush canvas before exit:", err);
    }

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
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      const insideDesktopMenu = !!menuRef.current?.contains(target);
      const insideMobileMenu = !!mobileMenuRef.current?.contains(target);

      if (!insideDesktopMenu && !insideMobileMenu) {
        setActiveMenu(null);
        setIsPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
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
  const [isImportingPdf, setIsImportingPdf] = useState(false);
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

    const isPdfFile = (file: File) =>
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const pdfFiles = files.filter(isPdfFile);

    const position = reactFlowInstance.screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });

    pdfFiles.forEach((file) => {
      file
        .arrayBuffer()
        .then((buffer) => importPdfBytes(new Uint8Array(buffer), { fileName: file.name }, position));
    });

    if (!imageFiles.length) return;

    imageFiles.forEach((file) => {
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

  /**
   * Turn a rendered PDF into a sequence of pdfPage nodes on the canvas.
   * Each page becomes its own board object/node, stacked vertically like a
   * document viewer (or anchored at `origin` when the PDF was dropped/opened
   * at a specific spot).
   */
  const addPdfObjectsToCanvas = (
    result: PdfDocumentResult,
    origin?: { x: number; y: number }
  ) => {
    const pageObjects = buildPdfPageObjects(result, useWorkspaceStore.getState().objects, origin);

    pageObjects.forEach((object) => {
      addObject(object);

      setNodes((nds) => [
        ...nds,
        {
          id: object.id,
          type: "pdfPage",
          position: { x: object.x, y: object.y },
          style: { width: object.width, height: object.height },
          data: {
            label: object.title,
            previewUrl: object.previewUrl,
            width: object.width,
            height: object.height,
            pageNumber: object.pageNumber,
            pageCount: object.pageCount,
            sourceFileName: object.sourceFileName,
          },
        },
      ]);
    });
  };

  /** Read a PDF's raw bytes regardless of whether it came from a File or a native path. */
  const importPdfBytes = async (
    bytes: Uint8Array,
    options: { fileName: string; sourceFilePath?: string },
    origin?: { x: number; y: number }
  ) => {
    setIsImportingPdf(true);
    try {
      const result = await renderPdfPages(bytes, {
        fileName: options.fileName,
        sourceFilePath: options.sourceFilePath,
      });
      addPdfObjectsToCanvas(result, origin);
    } catch (err) {
      console.error("[Workspace] Failed to render dropped/opened PDF:", err);
      alert("Couldn't open that PDF — see console for details.");
    } finally {
      setIsImportingPdf(false);
    }
  };

  /** Toolbox entry point: opens the OS file picker (or Tauri dialog) for a PDF. */
  const openPdfPicker = async () => {
    if (isImportingPdf) return;

    try {
      const source = await pickPdfSource();
      if (!source) return;

      const bytes = await readPdfSource(source);
      const centerPosition = reactFlowInstance
        ? reactFlowInstance.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })
        : undefined;

      await importPdfBytes(
        bytes,
        { fileName: source.fileName, sourceFilePath: source.path },
        centerPosition
      );
    } catch (err) {
      console.error("[Workspace] Failed to open PDF from picker:", err);
      alert("Couldn't open that PDF — see console for details.");
    }
  };

  const isCanvasActive = isDrawingMode || isEraserMode;
  const isAndroid = /Android/i.test(navigator.userAgent);

  // ------------------------------------------------------------------
  // Android touch gesture system
  // ------------------------------------------------------------------
  // ReactFlow's own panOnDrag / zoomOnPinch / panOnScroll / zoomOnScroll are
  // switched off on Android whenever the select tool is active (see the
  // <ReactFlow> props below), and everything touch-related is handled by
  // this single state machine instead. Having exactly one thing ever move
  // the viewport is what fixes the old bug where the canvas and the
  // dragged object drifted together: previously ReactFlow's own pan
  // gesture and this custom drag logic were both alive at once, each
  // reacting to the same finger, so moving the node was computed against
  // a viewport that was itself silently shifting underneath it.
  //
  //   1 finger, empty canvas   -> pan immediately
  //   1 finger, on an object   -> wait ~450ms without moving, then switch
  //                                to dragging that object; if the finger
  //                                moves first, it's treated as a pan
  //   2 fingers (any time)     -> pinch-zoom + two-finger pan; this always
  //                                wins, dropping/committing any pending
  //                                or in-progress object drag first
  //   a finger lifts mid-pinch -> re-baselines so the remaining finger
  //                                keeps panning smoothly, no jump
  //
  // Text fields, buttons, handles and resize controls are left completely
  // alone so taps and typing keep working as normal.
  const ANDROID_INTERACTIVE_SELECTOR =
    'button, input, textarea, select, [contenteditable="true"], .nodrag, .react-flow__handle, .react-flow__resize-control';
  const ANDROID_LONG_PRESS_MS = 450;
  const ANDROID_MOVE_THRESHOLD = 10;

  type AndroidPoint = { x: number; y: number };
  type AndroidGesture =
    | { mode: "pending"; pointerId: number; nodeId: string; startScreen: AndroidPoint }
    | {
        mode: "pan";
        startViewport: { x: number; y: number; zoom: number };
        startMid: AndroidPoint;
        startDistance: number | null;
      }
    | {
        mode: "drag";
        pointerId: number;
        nodeId: string;
        startFlow: AndroidPoint;
        startPosition: AndroidPoint;
        currentPosition: AndroidPoint;
      };

  // NOTE: `new globalThis.Map()` (not `new Map()`) because this file also
  // imports the unrelated "Map" icon from lucide-react, which shadows the
  // built-in Map constructor for the rest of this module.
  const androidPointersRef = useRef<globalThis.Map<number, AndroidPoint>>(new globalThis.Map());
  const androidLongPressTimerRef = useRef<number | null>(null);
  const androidGestureRef = useRef<AndroidGesture | null>(null);

  const cancelAndroidLongPress = () => {
    if (androidLongPressTimerRef.current !== null) {
      window.clearTimeout(androidLongPressTimerRef.current);
      androidLongPressTimerRef.current = null;
    }
  };

  // Recomputes the pan/pinch baseline from whatever fingers are currently
  // down. Called on every transition into panning, and whenever the finger
  // count changes mid-gesture, so the transform never jumps.
  const rebaseAndroidPan = () => {
    if (!reactFlowInstance || androidPointersRef.current.size === 0) {
      androidGestureRef.current = null;
      return;
    }

    const pointers = Array.from(androidPointersRef.current.values());
    const startViewport = reactFlowInstance.getViewport();
    const startMid =
      pointers.length >= 2
        ? { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 }
        : pointers[0];
    const startDistance =
      pointers.length >= 2 ? Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y) : null;

    androidGestureRef.current = { mode: "pan", startViewport, startMid, startDistance };
  };

  const commitAndroidDrag = () => {
    const gesture = androidGestureRef.current;
    if (gesture?.mode === "drag") {
      useWorkspaceStore.getState().moveObject(gesture.nodeId, gesture.currentPosition.x, gesture.currentPosition.y);
    }
  };

  useEffect(() => {
    if (!isAndroid) return;

    const onPointerMove = (event: PointerEvent) => {
      if (!androidPointersRef.current.has(event.pointerId)) return;
      androidPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const gesture = androidGestureRef.current;
      if (!gesture || !reactFlowInstance) return;

      if (gesture.mode === "pending") {
        if (gesture.pointerId !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - gesture.startScreen.x, event.clientY - gesture.startScreen.y);
        if (distance > ANDROID_MOVE_THRESHOLD) {
          // Moved before the hold fired: this is a pan, not an object drag.
          cancelAndroidLongPress();
          rebaseAndroidPan();
        }
        return;
      }

      if (gesture.mode === "drag") {
        if (gesture.pointerId !== event.pointerId) return;
        event.preventDefault();

        const currentFlow = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const nextPosition = {
          x: gesture.startPosition.x + (currentFlow.x - gesture.startFlow.x),
          y: gesture.startPosition.y + (currentFlow.y - gesture.startFlow.y),
        };
        gesture.currentPosition = nextPosition;

        setNodes((current) =>
          current.map((candidate) => (candidate.id === gesture.nodeId ? { ...candidate, position: nextPosition } : candidate))
        );
        return;
      }

      // mode === "pan": one finger pans, two fingers pinch-zoom and pan at
      // once. Both cases are the same formula: keep the flow-space point
      // that was under the gesture's start midpoint anchored under the
      // (possibly moving, possibly spreading) current midpoint.
      event.preventDefault();
      const pointers = Array.from(androidPointersRef.current.values());
      if (pointers.length === 0) return;

      const mid =
        pointers.length >= 2
          ? { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 }
          : pointers[0];

      let nextZoom = gesture.startViewport.zoom;
      if (pointers.length >= 2 && gesture.startDistance) {
        const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        nextZoom = Math.min(2.5, Math.max(0.05, gesture.startViewport.zoom * (distance / gesture.startDistance)));
      }

      const flowAnchorX = (gesture.startMid.x - gesture.startViewport.x) / gesture.startViewport.zoom;
      const flowAnchorY = (gesture.startMid.y - gesture.startViewport.y) / gesture.startViewport.zoom;

      reactFlowInstance.setViewport(
        { x: mid.x - flowAnchorX * nextZoom, y: mid.y - flowAnchorY * nextZoom, zoom: nextZoom },
        { duration: 0 }
      );
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!androidPointersRef.current.has(event.pointerId)) return;

      const gesture = androidGestureRef.current;
      if (gesture?.mode === "pending" && gesture.pointerId === event.pointerId) {
        cancelAndroidLongPress();
        androidGestureRef.current = null;
      } else if (gesture?.mode === "drag" && gesture.pointerId === event.pointerId) {
        commitAndroidDrag();
        androidGestureRef.current = null;
      }

      androidPointersRef.current.delete(event.pointerId);

      if (androidPointersRef.current.size === 0) {
        cancelAndroidLongPress();
        androidGestureRef.current = null;
      } else if (androidGestureRef.current?.mode === "pan") {
        // A finger lifted mid-pinch/pan: rebase so the rest keep going
        // smoothly instead of jumping to a stale baseline.
        rebaseAndroidPan();
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
    };
  }, [isAndroid, reactFlowInstance, setNodes]);

  const handleAndroidPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isAndroid || isCanvasActive || !reactFlowInstance) return;

    const target = event.target as HTMLElement;
    // Text fields, buttons, handles, resize controls, etc. keep their
    // normal behavior. In particular, do not turn a text-field tap into a
    // pan or a drag.
    if (target.closest(ANDROID_INTERACTIVE_SELECTOR)) return;

    androidPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (androidPointersRef.current.size >= 2) {
      // A second finger always means navigation. Commit any in-progress
      // object drag first so no movement is lost, then hand off to pinch/pan.
      cancelAndroidLongPress();
      commitAndroidDrag();
      rebaseAndroidPan();
      return;
    }

    const nodeElement = target.closest(".react-flow__node") as HTMLElement | null;
    const nodeId = nodeElement?.getAttribute("data-id") ?? null;

    if (!nodeId) {
      // Empty canvas: pan right away, no need to wait on a long-press.
      rebaseAndroidPan();
      return;
    }

    // Select immediately, whether this turns into a tap, a pan, or a drag.
    setNodes((current) => current.map((candidate) => ({ ...candidate, selected: candidate.id === nodeId })));

    cancelAndroidLongPress();
    androidGestureRef.current = {
      mode: "pending",
      pointerId: event.pointerId,
      nodeId,
      startScreen: { x: event.clientX, y: event.clientY },
    };

    androidLongPressTimerRef.current = window.setTimeout(() => {
      androidLongPressTimerRef.current = null;

      const gesture = androidGestureRef.current;
      if (!gesture || gesture.mode !== "pending" || gesture.pointerId !== event.pointerId) return;
      if (androidPointersRef.current.size !== 1) return;

      const latest = androidPointersRef.current.get(event.pointerId);
      const liveNode = reactFlowInstance.getNode(nodeId);
      if (!latest || !liveNode) return;

      // The finger must still be close to its original position. If it
      // moved, the "pending" -> "pan" handoff already happened above.
      const distance = Math.hypot(latest.x - gesture.startScreen.x, latest.y - gesture.startScreen.y);
      if (distance > ANDROID_MOVE_THRESHOLD) return;

      const startFlow = reactFlowInstance.screenToFlowPosition(latest);

      androidGestureRef.current = {
        mode: "drag",
        pointerId: event.pointerId,
        nodeId,
        startFlow,
        startPosition: { x: liveNode.position.x, y: liveNode.position.y },
        currentPosition: { x: liveNode.position.x, y: liveNode.position.y },
      };
    }, ANDROID_LONG_PRESS_MS);
  };

  useEffect(() => {
    return () => {
      cancelAndroidLongPress();
      androidGestureRef.current = null;
      androidPointersRef.current.clear();
    };
  }, []);

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

            if (fileName.toLowerCase().endsWith(".pdf")) {
              (async () => {
                try {
                  // Raw webview drag-and-drop paths aren't pre-authorized in
                  // the fs scope the way file-association or dialog-picked
                  // paths are — ask Rust to allow this specific file first.
                  const { invoke } = await import("@tauri-apps/api/core");
                  await invoke("allow_file_path", { path: filePath });

                  const { readPdfFile } = await import("../utils/pdf");
                  const bytes = await readPdfFile(filePath);
                  await importPdfBytes(bytes, { fileName, sourceFilePath: filePath }, centerPosition);
                } catch (err) {
                  console.error("[Workspace] Failed to read dropped PDF from disk:", err);
                  alert("Couldn't open that PDF — see console for details.");
                }
              })();
              return;
            }

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
      className={`h-screen w-screen transition-colors duration-200 overflow-hidden relative select-none font-body antialiased ${isAndroid ? "blackboard-android" : ""} ${
        isDarkMode ? "bg-[#0f0d0b] text-[#f4e8dc]" : "bg-[#f1f3f4] text-[#2a2421]"
      }`}
    >
      {/* TOP MENU & QUICK BAR */}
      <div ref={menuRef} className={`${isAndroid ? "hidden" : ""} absolute top-0 left-0 right-0 z-50 flex flex-col font-body select-none`}>
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
                  <button
                    onClick={() => {
                      openPdfPicker();
                      setActiveMenu(null);
                    }}
                    disabled={isImportingPdf}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <FileText size={12} /> {isImportingPdf ? "Importing PDF…" : "PDF Document"}
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
            <button
              onClick={openPdfPicker}
              disabled={isImportingPdf}
              className="p-1.5 rounded hover:bg-white/10 hover:text-white cursor-pointer disabled:opacity-50"
              title={isImportingPdf ? "Importing PDF…" : "Add PDF"}
            >
              <FileText size={14} className={isImportingPdf ? "animate-pulse" : ""} />
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

      {/* ANDROID MAIN TOOL + MENU BAR */}
      {isAndroid && (
        <div ref={mobileMenuRef}>
          {/* Slim header: back, workspace name, more */}
          <div
            className="absolute top-0 left-0 right-0 z-50 h-14 flex items-center gap-2 px-3 border-b shadow-lg backdrop-blur-xl"
            style={{
              background: isDarkMode ? "rgba(20,16,13,0.96)" : "rgba(255,255,255,0.96)",
              borderColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
              paddingTop: "env(safe-area-inset-top)",
              height: "calc(3.5rem + env(safe-area-inset-top))",
            }}
          >
            <button
              onClick={handleExitWithThumbnail}
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ color: "var(--color-text)", background: "var(--color-surface-hover)" }}
              aria-label="Back to dashboard"
            >
              <AppWindow size={18} />
            </button>

            <div className="min-w-0 flex-1 px-1">
              <div className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: "var(--color-muted)" }}>
                Blackboard
              </div>
              <div className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text)" }}>
                {store.workspacesList.find((w) => w.id === store.currentWorkspaceId)?.name || "Untitled"}
              </div>
            </div>

            <button
              onClick={() => setActiveMenu(activeMenu === "mobile" ? null : "mobile")}
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{
                color: activeMenu === "mobile" ? "#fff" : "var(--color-text)",
                background: activeMenu === "mobile" ? "var(--color-accent)" : "var(--color-surface-hover)",
              }}
              aria-label="More tools and menu"
            >
              <MoreVertical size={19} />
            </button>
          </div>

          {/* Draw/erase context controls float just above the bottom dock */}
          {isCanvasActive && (
            <div
              className="absolute left-2 right-2 z-[60] rounded-2xl border px-3 py-2 flex items-center gap-3 overflow-x-auto shadow-xl"
              style={{
                bottom: "calc(5.75rem + env(safe-area-inset-bottom))",
                background: isDarkMode ? "rgba(20,16,13,0.97)" : "rgba(255,255,255,0.97)",
                borderColor: "var(--color-border)",
              }}
            >
              {isDrawingMode && (
                <>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {recentColors.slice(0, 6).map((c) => (
                      <button key={c} onClick={() => { selectBrushColor(c); setTempCustomColor(c); }} className="w-7 h-7 rounded-full border-2" style={{ backgroundColor: c, borderColor: brushColor.toLowerCase() === c.toLowerCase() ? "#fff" : "transparent" }} aria-label={`Brush color ${c}`} />
                    ))}
                    <label className="relative shrink-0" title="Choose custom brush color">
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => {
                          setTempCustomColor(e.target.value);
                          selectBrushColor(e.target.value);
                        }}
                        className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer"
                        aria-label="Custom brush color"
                      />
                      <span
                        className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                      >
                        <Plus size={15} />
                      </span>
                    </label>
                  </div>
                  <div className="w-px h-6 shrink-0" style={{ background: "var(--color-border)" }} />
                  <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--color-muted)" }}>{brushSize}px</span>
                  <input type="range" min={5} max={100} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-28 shrink-0 accent-[var(--color-accent)]" />
                  <button onClick={undoDrawing} className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ color: "var(--color-muted)" }}><Undo2 size={17} /></button>
                  <button onClick={redoDrawing} className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ color: "var(--color-muted)" }}><Redo2 size={17} /></button>
                  <button onClick={confirmClearDrawings} className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-rose-400"><Trash2 size={17} /></button>
                </>
              )}
              {isEraserMode && (
                <>
                  <button onClick={() => setEraserType("stroke")} className={`px-3 h-9 rounded-xl text-xs shrink-0 ${eraserType === "stroke" ? "text-white" : ""}`} style={{ background: eraserType === "stroke" ? "var(--color-accent)" : "var(--color-surface-hover)" }}>Stroke</button>
                  <button onClick={() => setEraserType("brush")} className={`px-3 h-9 rounded-xl text-xs shrink-0 ${eraserType === "brush" ? "text-white" : ""}`} style={{ background: eraserType === "brush" ? "var(--color-accent)" : "var(--color-surface-hover)" }}>Brush</button>
                  {eraserType === "brush" && <><span className="text-[10px] font-mono shrink-0" style={{ color: "var(--color-muted)" }}>{eraserSize}px</span><input type="range" min={5} max={100} value={eraserSize} onChange={(e) => setEraserSize(Number(e.target.value))} className="w-28 shrink-0 accent-[var(--color-accent)]" /></>}
                </>
              )}
            </div>
          )}

          {/* Quick-add popover, floats just above the dock */}
          {activeMenu === "quickadd" && (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-[65] grid grid-cols-4 gap-2 rounded-2xl border p-2.5 shadow-2xl"
              style={{
                bottom: "calc(5.75rem + env(safe-area-inset-bottom))",
                background: isDarkMode ? "rgba(25,20,16,0.98)" : "rgba(255,255,255,0.98)",
                borderColor: "var(--color-border)",
              }}
            >
              {[
                { icon: <Square size={18} />, label: "Card", action: addCard },
                { icon: <StickyNote size={18} />, label: "Note", action: addCompact },
                { icon: <LayoutGrid size={18} />, label: "Frame", action: addFrame },
                { icon: <Sparkles size={18} />, label: "Asset", action: addAssetPipelineNode },
                { icon: <Map size={18} />, label: "Image", action: openImagePicker },
                { icon: <FileText size={18} />, label: "PDF", action: openPdfPicker, disabled: isImportingPdf },
                { icon: <Calendar size={18} />, label: "Timeline", action: addTimelineNode },
                { icon: <Type size={18} />, label: "Text", action: () => addTextBlockNode("textBlock") },
              ].map((item) => (
                <button
                  key={item.label}
                  disabled={item.disabled}
                  onClick={() => { item.action(); setActiveMenu(null); }}
                  className="w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 disabled:opacity-40 active:scale-95 transition-transform"
                  style={{ background: "var(--color-surface-hover)", color: "var(--color-text)" }}
                >
                  {item.icon}
                  <span className="text-[9px] font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Floating bottom dock: primary tools within thumb's reach */}
          <div
            className="absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-2xl backdrop-blur-xl"
            style={{
              bottom: "calc(1rem + env(safe-area-inset-bottom))",
              background: isDarkMode ? "rgba(20,16,13,0.96)" : "rgba(255,255,255,0.96)",
              borderColor: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            }}
          >
            <button
              onClick={() => selectTool("select")}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: !isCanvasActive ? "var(--color-accent)" : "transparent", color: !isCanvasActive ? "#fff" : "var(--color-muted)" }}
              aria-label="Select tool"
            >
              <MousePointer size={19} />
            </button>
            <button
              onClick={() => selectTool("draw")}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: isDrawingMode ? "var(--color-accent)" : "transparent", color: isDrawingMode ? "#fff" : "var(--color-muted)" }}
              aria-label="Ink brush"
            >
              <Pencil size={19} />
            </button>
            <button
              onClick={() => selectTool("erase")}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: isEraserMode ? "var(--color-accent)" : "transparent", color: isEraserMode ? "#fff" : "var(--color-muted)" }}
              aria-label="Eraser"
            >
              <Eraser size={19} />
            </button>

            <div className="w-px h-6 shrink-0 mx-0.5" style={{ background: "var(--color-border)" }} />

            <button
              onClick={() => setActiveMenu(activeMenu === "quickadd" ? null : "quickadd")}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: activeMenu === "quickadd" ? "var(--color-accent)" : "transparent", color: activeMenu === "quickadd" ? "#fff" : "var(--color-muted)" }}
              aria-label="Add object"
            >
              <Plus size={21} />
            </button>

            <div className="w-px h-6 shrink-0 mx-0.5" style={{ background: "var(--color-border)" }} />

            <button onClick={undoDrawing} className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform" style={{ color: "var(--color-muted)" }} aria-label="Undo">
              <Undo2 size={19} />
            </button>
            <button onClick={redoDrawing} className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform" style={{ color: "var(--color-muted)" }} aria-label="Redo">
              <Redo2 size={19} />
            </button>
          </div>

          {/* "More" bottom sheet */}
          {activeMenu === "mobile" && (
            <>
              <div className="fixed inset-0 z-[69] bg-black/40" onClick={() => setActiveMenu(null)} />
              <div
                className="absolute left-0 right-0 bottom-0 z-[70] max-h-[75vh] overflow-y-auto rounded-t-3xl border-t shadow-2xl p-3"
                style={{
                  background: isDarkMode ? "rgba(25,20,16,0.98)" : "rgba(255,255,255,0.98)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                  paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
                }}
              >
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: "var(--color-border)" }} />

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { handleExitWithThumbnail(); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2" style={{ background: "var(--color-surface-hover)" }}>
                    <FolderOpen size={17} /> <span className="text-xs font-semibold">Dashboard</span>
                  </button>
                  <button onClick={() => { store.exportWorkspace(); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2" style={{ background: "var(--color-surface-hover)" }}>
                    <Download size={17} /> <span className="text-xs font-semibold">Export</span>
                  </button>
                </div>

                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1" style={{ color: "var(--color-muted)" }}>Insert</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { addFrame(); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2" style={{ background: "var(--color-surface-hover)" }}><LayoutGrid size={16} /> <span className="text-xs">Frame</span></button>
                  <button onClick={() => { addAssetPipelineNode(); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2" style={{ background: "var(--color-surface-hover)" }}><Sparkles size={16} /> <span className="text-xs">Asset</span></button>
                  <button onClick={() => { addTimelineNode(); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2" style={{ background: "var(--color-surface-hover)" }}><Calendar size={16} /> <span className="text-xs">Timeline</span></button>
                  <button onClick={() => { addTextBlockNode("textBlock"); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2" style={{ background: "var(--color-surface-hover)" }}><Type size={16} /> <span className="text-xs">Text</span></button>
                </div>

                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1" style={{ color: "var(--color-muted)" }}>View</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setShowMiniMap((value) => !value); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center justify-between" style={{ background: "var(--color-surface-hover)" }}><span className="text-xs">MiniMap</span>{showMiniMap && <Check size={16} />}</button>
                  <button onClick={() => { setShowBg((value) => !value); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center justify-between" style={{ background: "var(--color-surface-hover)" }}><span className="text-xs">Grid</span>{showBg && <Check size={16} />}</button>
                  <button onClick={() => { setIsDarkMode((value) => !value); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center justify-between" style={{ background: "var(--color-surface-hover)" }}><span className="text-xs">Dark Theme</span>{isDarkMode && <Check size={16} />}</button>
                  <button onClick={() => { reactFlowInstance?.fitView({ padding: 0.2 }); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2" style={{ background: "var(--color-surface-hover)" }}><Minimize2 size={16} /> <span className="text-xs">Fit View</span></button>
                </div>

                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1" style={{ color: "var(--color-muted)" }}>Canvas</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { confirmDeleteSelected(); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2 text-rose-400" style={{ background: "var(--color-surface-hover)" }}><Trash2 size={16} /> <span className="text-xs">Delete Selected</span></button>
                  <button onClick={() => { confirmClearDrawings(); setActiveMenu(null); }} className="p-3 rounded-xl text-left flex items-center gap-2 text-rose-400" style={{ background: "var(--color-surface-hover)" }}><Trash2 size={16} /> <span className="text-xs">Clear Ink</span></button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CANVAS CONTAINER */}
      <div
        className={`absolute ${isAndroid ? "top-[calc(3.5rem+env(safe-area-inset-top))]" : "top-16"} left-0 right-0 bottom-0`}
        style={isAndroid ? { touchAction: "none" } : undefined}
        onPointerDownCapture={handleAndroidPointerDownCapture}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={handleNodeDragStop}
          nodesDraggable={!isAndroid}
          noPanClassName="nopan"
          onInit={setReactFlowInstance}
          // On Android with the select tool active, panning/pinch-zoom is
          // handled entirely by handleAndroidPointerDownCapture above so it
          // can never run at the same time as the long-press object drag.
          // While drawing/erasing, our handler steps aside entirely, so
          // pinch-zoom is handed back to ReactFlow (single-finger strokes
          // still go to the ink layer, which sits above the pane).
          panOnDrag={isAndroid ? false : !isCanvasActive}
          selectionOnDrag={isAndroid ? false : !isCanvasActive}
          zoomOnPinch={isAndroid ? isCanvasActive : true}
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