import { useState, useEffect, useRef } from "react";
// 1. Import useUpdateNodeInternals from reactflow
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { GripVertical } from "lucide-react";

export default function CardNode({ id, data, selected }: any) {
  // 2. Initialize the internal trigger hook proxy
  const updateNodeInternals = useUpdateNodeInternals();

  const updateTitle = useWorkspaceStore((state) => state.updateTitle);
  const updateContent = useWorkspaceStore((state) => state.updateContent);

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
  }, [title, editingTitle, content, editingContent, id, updateNodeInternals]);

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
      className={`relative min-w-[280px] max-w-[320px] rounded-lg border font-mono antialiased text-xs transition-shadow duration-150 bg-[#0c1017] ${
        selected
          ? "border-slate-600 shadow-xl shadow-black/40 ring-1 ring-slate-600"
          : "border-slate-800/80 shadow-md"
      }`}
    >
      <div className={`h-1 w-full rounded-t-lg transition-colors ${selected ? "bg-[var(--color-accent)]" : "bg-slate-800"}`} />

      {/* Connection wires will now dynamically travel to stay centered automatically */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border !border-slate-900 !bg-slate-500 hover:!bg-[var(--color-accent)] transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border !border-slate-900 !bg-slate-500 hover:!bg-[var(--color-accent)] transition-colors"
      />

      <div className="p-4 flex flex-col">
        <div className="flex items-center gap-1.5 opacity-30 text-[9px] uppercase tracking-wider font-black mb-3 dragging-handle cursor-grab active:cursor-grabbing select-none">
          <GripVertical size={11} className="shrink-0" />
          <span>Task Block</span>
        </div>

        <div className="mb-3 w-full">
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
              className="nodrag w-full rounded border border-slate-700 bg-black/40 px-2.5 py-1 text-xs font-bold text-white outline-none resize-none overflow-hidden focus:border-[var(--color-accent)] leading-tight"
              style={{ minHeight: "18px" }}
            />
          ) : (
            <h3
              onDoubleClick={() => setEditingTitle(true)}
              className="cursor-text text-xs font-bold text-slate-100 hover:bg-white/[0.02] rounded px-1 py-0.5 transition-colors border border-transparent whitespace-pre-wrap break-words leading-tight"
            >
              {title || "Untitled Card"}
            </h3>
          )}
        </div>

        <div className="w-full">
          {editingContent ? (
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={saveContent}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Write log notes details here..."
              className="nodrag min-h-[100px] w-full resize-none rounded border border-slate-700 bg-black/30 p-2 text-[11px] text-slate-300 leading-relaxed outline-none focus:border-[var(--color-accent)]"
            />
          ) : (
            <div
              onDoubleClick={() => setEditingContent(true)}
              className={`min-h-[80px] cursor-text whitespace-pre-wrap rounded border border-transparent p-2 text-[11px] font-medium leading-relaxed transition-colors ${
                content ? "text-slate-300 hover:bg-white/[0.02] hover:border-slate-800" : "text-slate-600 italic bg-black/10 px-2 py-3 rounded border border-dashed border-slate-800/40"
              }`}
            >
              {content || "Double-click to write details..."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
