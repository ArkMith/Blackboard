import { useState, useEffect, useRef } from "react";
// 1. Import useUpdateNodeInternals from reactflow
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { GripVertical } from "lucide-react";
import { CornerResizeHandle } from "./ResizeHandles.tsx";

export default function CardNode({ id, data, selected }: any) {
  // 2. Initialize the internal trigger hook proxy
  const updateNodeInternals = useUpdateNodeInternals();

  const objects = useWorkspaceStore((s) => s.objects);
  const currentObject = objects.find((obj) => obj.id === id);
  const updateTitle = useWorkspaceStore((state) => state.updateTitle);
  const updateContent = useWorkspaceStore((state) => state.updateContent);

  const width = currentObject?.width ?? data.width ?? 320;
  const height = currentObject?.height ?? data.height ?? 180;
  const isAndroid = /Android/i.test(navigator.userAgent);

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingContent, setEditingContent] = useState(false);

  const [title, setTitle] = useState(data.label || "");
  const [content, setContent] = useState(data.content || "");

  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-adjust title text bounds AND force ReactFlow to center the handles instantly
  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
    // FIX: Force ReactFlow to remap connector wire anchor points matching the new container height
    updateNodeInternals(id);
  }, [title, editingTitle, content, editingContent, width, height, id, updateNodeInternals]);

  const saveTitle = () => {
    updateTitle(id, title.trim());
    setEditingTitle(false);
  };

  const saveContent = () => {
    updateContent(id, content);
    setEditingContent(false);
  };

  return (
    <div
      className={`group relative rounded-lg border font-mono antialiased text-xs transition-shadow duration-150 flex flex-col ${
        selected ? "shadow-xl shadow-black/10 ring-1" : "shadow-md"
      }`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: "var(--color-surface)",
        borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
        // @ts-ignore -- Tailwind's ring-color CSS var, only applies when `ring-1` is active
        "--tw-ring-color": "var(--color-accent-border)",
      }}
    >
      <div
        className="h-1 w-full rounded-t-lg shrink-0 transition-colors"
        style={{ background: selected ? "var(--color-accent)" : "var(--color-border)" }}
      />

      {/* Connection wires will now dynamically travel to stay centered automatically */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border transition-colors"
        style={{ background: "var(--color-muted)", borderColor: "var(--color-surface)" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border transition-colors"
        style={{ background: "var(--color-muted)", borderColor: "var(--color-surface)" }}
      />

      <div className="p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div
          className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-black mb-3 dragging-handle cursor-grab active:cursor-grabbing select-none shrink-0"
          style={{ color: "var(--color-muted)", opacity: 0.7 }}
        >
          <GripVertical size={11} className="shrink-0" />
          <span>Task Block</span>
        </div>

        <div className="mb-3 w-full shrink-0">
          {editingTitle ? (
            <textarea
              ref={titleRef}
              autoFocus
              rows={1}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveTitle();
                }
              }}
              className="nodrag w-full rounded border px-2.5 py-1 text-xs font-bold outline-none resize-none overflow-hidden leading-tight"
              style={{
                background: "var(--color-bg)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
                minHeight: "18px",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            />
          ) : (
            <h3
              data-text-editable="true"
              onDoubleClick={() => setEditingTitle(true)}
              onPointerUp={(e) => {
                if (isAndroid) {
                  e.stopPropagation();
                  setEditingTitle(true);
                }
              }}
              className="cursor-text text-xs font-bold rounded px-1 py-0.5 transition-colors border border-transparent whitespace-pre-wrap break-words leading-tight"
              style={{ color: "var(--color-text)" }}
            >
              {title || "Untitled Card"}
            </h3>
          )}
        </div>

        <div className="w-full flex-1 min-h-0 overflow-y-auto">
          {editingContent ? (
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={saveContent}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Write log notes details here..."
              className="nodrag min-h-[100px] w-full h-full resize-none rounded border p-2 text-[11px] leading-relaxed outline-none"
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            />
          ) : (
            <div
              data-text-editable="true"
              onDoubleClick={() => setEditingContent(true)}
              onPointerUp={(e) => {
                if (isAndroid) {
                  e.stopPropagation();
                  setEditingContent(true);
                }
              }}
              className="min-h-[80px] cursor-text whitespace-pre-wrap rounded border border-transparent p-2 text-[11px] font-medium leading-relaxed transition-colors"
              style={
                content
                  ? { color: "var(--color-text)", opacity: 0.85 }
                  : {
                      color: "var(--color-muted)",
                      fontStyle: "italic",
                      background: "var(--color-bg)",
                      border: "1px dashed var(--color-border)",
                      padding: "0.75rem 0.5rem",
                    }
              }
            >
              {content || "Double-click to write details..."}
            </div>
          )}
        </div>
      </div>

      <CornerResizeHandle id={id} width={width} height={height} minWidth={220} minHeight={130} visible={selected} />
    </div>
  );
}