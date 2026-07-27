import React, { useState, useEffect } from "react";
import { NodeProps, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { MoveDownRight, LayoutGrid, Type } from "lucide-react";

export default function FrameNode({ id, data, selected }: NodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const objects = useWorkspaceStore((s) => s.objects);
  const updateObjectFields = useWorkspaceStore((s) => s.updateObjectFields);
  
  const currentObject = objects.find((obj) => obj.id === id);

  // Initialize bounds parameters safely from global Zustand localStorage layers
  const title = currentObject?.title ?? data.label ?? "Container Group";
  const width = currentObject?.width ?? data.width ?? 600;
  const height = currentObject?.height ?? data.height ?? 400;

  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);

  // Force wire anchors to update internally whenever frame boundaries shift
  useEffect(() => {
    updateNodeInternals(id);
  }, [width, height, id, updateNodeInternals]);

  const saveTitle = () => {
    updateObjectFields(id, { title: localTitle.trim() });
    setEditingTitle(false);
  };

  // MANUAL MOUSE RESIZE ENGINE (Bypasses drag collision blocks via custom mouse tracks)
    // FIX: PointerEvent listener automatically maps finger touch points at 60 FPS
    const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    e.currentTarget.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;

    const pointerMoveHandler = (moveEvent: PointerEvent) => {
      const newWidth = Math.max(200, startWidth + (moveEvent.clientX - startX));
      const newHeight = Math.max(150, startHeight + (moveEvent.clientY - startY));
      updateObjectFields(id, { width: newWidth, height: newHeight });
    };

    const pointerUpHandler = () => {
      window.removeEventListener("pointermove", pointerMoveHandler);
      window.removeEventListener("pointerup", pointerUpHandler);
      window.removeEventListener("pointercancel", pointerUpHandler);

      const reactFlowInstance = (window as any).reactFlowInstance;
      if (reactFlowInstance) {
        reactFlowInstance.setNodes((nds: any[]) =>
          nds.map((node) => {
            if (node.id !== id) return node;
            return {
              ...node,
              style: {
                ...node.style,
                width: width,  // Syncs your store variables instantly
                height: height 
              },
            };
          })
        );
      }
    };

    window.addEventListener("pointermove", pointerMoveHandler);
    window.addEventListener("pointerup", pointerUpHandler);
    window.addEventListener("pointercancel", pointerUpHandler);
  };



  return (
    <div
      className={`font-mono antialiased text-xs select-none transition-shadow duration-150 border rounded-md relative flex flex-col h-full w-full ${
        selected 
          ? "border-slate-500 bg-[#0d1118]/80 shadow-[0_4px_30px_rgba(0,0,0,0.4)]" 
          : "border-slate-800/60 bg-[#080b10]/40"
      }`}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      
      {/* 1. TOP MINIMAL HEADER ATTACHMENT TAB */}
      <div className={`flex items-center justify-between border-b px-3 py-2 text-[10px] font-bold uppercase tracking-wider dragging-handle cursor-grab active:cursor-grabbing text-slate-500 h-9 shrink-0 ${
        selected ? "bg-[#111622] border-slate-700/80" : "bg-black/10 border-slate-800/40"
      }`}>
        <div className="flex items-center gap-2 max-w-[80%]">
          <LayoutGrid size={11} className={selected ? "text-[var(--color-accent)]" : "text-slate-600"} />
          
          {editingTitle ? (
            <input
              autoFocus
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                e.stopPropagation(); // Block canvas backspace triggers
                if (e.key === "Enter") saveTitle();
              }}
              className="nodrag bg-black/50 border border-slate-700 px-2 py-0.5 rounded text-[10px] text-white font-bold outline-none uppercase w-full"
            />
          ) : (
            <span 
              onDoubleClick={() => setEditingTitle(true)}
              className="text-slate-400 hover:text-white transition-colors cursor-text truncate block px-0.5"
              title="Double-click to rename group container"
            >
              {title}
            </span>
          )}
        </div>

        <div className="text-[9px] opacity-40 font-mono tracking-tight shrink-0 select-none">
          {width}x{height}
        </div>
      </div>

      {/* 2. FLAT BACKGROUND BOUNDARY ZONE GRID CANVAS */}
      <div className="flex-1 relative overflow-hidden pointer-events-none p-3 border-dashed border border-transparent">
        {/* Background blueprint guide marks inside frames */}
        <div className="absolute inset-0 opacity-[0.015] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:15px_15px] pointer-events-none" />
      </div>

      {/* 3. PURE CORNER DRAG PULL GRIP INTERACTIVE HANDLE */}
      {/* nodrag prevents ReactFlow from moving the whole card instead of resizing */}
      <div
        onPointerDown={startResize}
        className={`nodrag absolute bottom-1.5 right-1.5 p-1 rounded border shadow-md transition-all cursor-nwse-resize text-slate-500 border-slate-800 bg-[#0d121f] hover:text-white hover:scale-105 active:scale-95 z-50 ${
          selected ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
        }`}
        title="Drag to resize frame bounding layer"
      >
        <MoveDownRight size={11} />
      </div>

    </div>
  );
}
