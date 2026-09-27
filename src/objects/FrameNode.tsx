import React, { useState, useEffect } from "react";
import { NodeProps, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { MoveDownRight, LayoutGrid } from "lucide-react";

export default function FrameNode({ id, data, selected }: NodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const objects = useWorkspaceStore((s) => s.objects);
  const updateObjectFields = useWorkspaceStore((s) => s.updateObjectFields);
  
  const currentObject = objects.find((obj) => obj.id === id);

  // Initialize bounds parameters safely from global Zustand localStorage layers
  const title = currentObject?.title ?? data.label ?? "Container Group";
  const width = currentObject?.width ?? data.width ?? 600;
  const height = currentObject?.height ?? data.height ?? 400;
  const isAndroid = /Android/i.test(navigator.userAgent);

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
      className="font-mono antialiased text-xs select-none transition-shadow duration-150 border rounded-md relative flex flex-col h-full w-full"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderColor: selected ? "var(--color-accent-border)" : "var(--color-border)",
        background: selected ? "var(--color-surface-hover)" : "var(--color-surface)",
        opacity: selected ? 0.92 : 0.7,
        boxShadow: selected ? "0 4px 30px rgba(0,0,0,0.12)" : undefined,
      }}
    >
      
      {/* 1. TOP MINIMAL HEADER ATTACHMENT TAB */}
      <div
        className="flex items-center justify-between border-b px-3 py-2 text-[10px] font-bold uppercase tracking-wider dragging-handle cursor-grab active:cursor-grabbing h-9 shrink-0"
        style={{
          color: "var(--color-muted)",
          borderColor: "var(--color-border)",
          background: selected ? "var(--color-surface)" : "transparent",
        }}
      >
        <div className="flex items-center gap-2 max-w-[80%]">
          <LayoutGrid size={11} style={{ color: selected ? "var(--color-accent)" : "var(--color-muted)" }} />
          
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
              className="nodrag border px-2 py-0.5 rounded text-[10px] font-bold outline-none uppercase w-full"
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
          ) : (
            <span
              data-text-editable="true"
              onDoubleClick={() => setEditingTitle(true)}
              onPointerUp={(e) => {
                if (isAndroid) {
                  e.stopPropagation();
                  setEditingTitle(true);
                }
              }}
              className="hover:opacity-100 transition-opacity cursor-text truncate block px-0.5"
              style={{ opacity: 0.85 }}
              title="Double-click to rename group container"
            >
              {title}
            </span>
          )}
        </div>

        <div className="text-[9px] opacity-50 font-mono tracking-tight shrink-0 select-none">
          {width}x{height}
        </div>
      </div>

      {/* 2. FLAT BACKGROUND BOUNDARY ZONE GRID CANVAS */}
      <div className="flex-1 relative overflow-hidden pointer-events-none p-3 border-dashed border border-transparent">
        {/* Background blueprint guide marks inside frames */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--color-text) 1px, transparent 1px), linear-gradient(to bottom, var(--color-text) 1px, transparent 1px)",
            backgroundSize: "15px 15px",
          }}
        />
      </div>

      {/* 3. PURE CORNER DRAG PULL GRIP INTERACTIVE HANDLE */}
      {/* nodrag prevents ReactFlow from moving the whole card instead of resizing */}
      <div
        onPointerDown={startResize}
        className={`nodrag absolute bottom-1.5 right-1.5 p-1 rounded border shadow-md transition-all cursor-nwse-resize hover:scale-105 active:scale-95 z-50 ${
          selected ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
        }`}
        style={{ color: "var(--color-muted)", borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        title="Drag to resize frame bounding layer"
      >
        <MoveDownRight size={11} />
      </div>

    </div>
  );
}