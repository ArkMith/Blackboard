import { useState, useEffect, useRef } from "react";
import { Handle, Position } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";

export default function CompactNode({ id, data, selected }: any) {
  const updateTitle = useWorkspaceStore((state) => state.updateTitle);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(data.label || "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-adjust height based on multiline contents scroll bounds
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [title, editing]);

  const save = () => {
    updateTitle(id, title.trim());
    setEditing(false);
  };

  return (
    <div
      className={`relative min-w-[140px] max-w-[240px] h-auto rounded-md border px-3 py-2 font-mono antialiased text-[11px] shadow-md transition-all duration-150 bg-[#0c1017] ${
        selected
          ? "border-slate-600 shadow-lg ring-1 ring-slate-600"
          : "border-slate-800/80"
      }`}
    >
      {/* Left Vertical Accent indicator handle dot */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md transition-colors ${selected ? "bg-[var(--color-accent)]" : "bg-slate-700/60"}`} />

      {/* REACTFLOW CONNECTOR PORTS */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border !border-slate-900 !bg-slate-500 hover:!bg-[var(--color-accent)] transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border !border-slate-900 !bg-slate-500 hover:!bg-[var(--color-accent)] transition-colors"
      />

      <div className="w-full dragging-handle cursor-grab active:cursor-grabbing pl-1">
        {editing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              e.stopPropagation(); // Stops backspace/delete keys from removing the node
              
              // Enter saves text, Shift+Enter breaks to a new line natively
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
            placeholder="Type label note..."
            className="nodrag w-full bg-transparent font-bold text-white outline-none resize-none overflow-hidden border-b border-slate-700 focus:border-[var(--color-accent)] leading-tight"
            style={{ minHeight: "16px" }}
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            className="cursor-text font-bold text-slate-200 hover:text-white whitespace-pre-wrap break-words leading-tight"
            title="Double-click to write label quick note"
          >
            {title || "Quick Note"}
          </div>
        )}
      </div>
    </div>
  );
}
