import { NodeProps, useReactFlow } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { MoveDownRight, Trash2 } from "lucide-react";

interface ImageCardData {
  label?: string;
  previewUrl?: string;
  width?: number;
  height?: number;
}

export default function ImageCardNode({ id, data, selected }: NodeProps<ImageCardData>) {
  const { setNodes } = useReactFlow();
  const deleteObject = useWorkspaceStore((s) => s.deleteObject);
  const objects = useWorkspaceStore((s) => s.objects);
  const updateObjectDimensions = useWorkspaceStore((s) => s.updateObjectDimensions);
  
  const currentObject = objects.find((obj) => obj.id === id);

  const previewUrl = currentObject?.previewUrl || data.previewUrl;
  const title = currentObject?.title || data.label || "Sticker Asset";

  // Persistent dynamic size dimensions fallback
  const width = currentObject?.width || data.width || 240;
  const height = currentObject?.height || data.height || 180;

  // PointerEvent listener automatically maps finger touch points at 60 FPS
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only process main touch taps or left clicks
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;

    let finalW = startW;
    let finalH = startH;

    const move = (ev: PointerEvent) => {
      finalW = Math.max(80, startW + (ev.clientX - startX));
      finalH = Math.max(60, startH + (ev.clientY - startY));
      updateObjectDimensions(id, finalW, finalH);
    };

    const up = (ev: PointerEvent) => {
      if (target.hasPointerCapture(ev.pointerId)) {
        target.releasePointerCapture(ev.pointerId);
      }
      
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);

      // Force ReactFlow's boundary box matrix mapping to match the new size values
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          return {
            ...node,
            style: {
              ...node.style,
              width: finalW,
              height: finalH,
            },
          };
        })
      );
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up); // Essential for Android/iOS swipe interruptions
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Step A: Remove from global Zustand store
    deleteObject(id);

    // Step B: Direct injection update inside ReactFlow node tree
    setNodes((nds) => nds.filter((node) => node.id !== id));
  };

  return (
    <div
      className={`relative group transition-shadow rounded-md select-none ${
        selected ? "shadow-[0_0_20px_rgba(212,106,67,0.4)] ring-2 ring-[var(--color-accent)]/80" : "hover:shadow-lg"
      }`}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {/* 1. CORE FLOATING IMAGE SCREEN CONTAINER */}
      <div className="w-full h-full rounded-xl overflow-hidden bg-black/5 select-none dragging-handle cursor-grab active:cursor-grabbing">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={title}
            className="w-full h-full object-cover select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 bg-slate-900/40 font-mono">
            Missing Img
          </div>
        )}
      </div>

      {/* 2. REMOVE ACTION BUTTON */}
      <button
        type="button"
        onClick={handleDelete}
        className="nodrag absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md border border-white/5 cursor-pointer"
        title="Remove Sticker"
      >
        <Trash2 size={12} />
      </button>

      {/* 3. DRAG RESIZE GRIP INLINE HANDLE */}
      <div
        onPointerDown={startResize}
        className={`nodrag absolute bottom-2 right-2 rounded-md bg-black/70 p-1 text-slate-400 border border-white/10 shadow-md backdrop-blur-sm transition-all cursor-nwse-resize hover:text-white hover:scale-105 active:scale-95 z-50 ${
          selected ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <MoveDownRight size={12} />
      </div>
    </div>
  );
}