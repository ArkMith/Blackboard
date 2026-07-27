import { useState, useEffect, useRef } from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { EdgeResizeHandle } from "./ResizeHandles.tsx";

export default function CompactNode({ id, data, selected }: any) {
  const updateNodeInternals = useUpdateNodeInternals();
  const objects = useWorkspaceStore((s) => s.objects);
  const currentObject = objects.find((obj) => obj.id === id);
  const updateTitle = useWorkspaceStore((state) => state.updateTitle);

  // Width is user-adjustable; height stays content-driven (auto) since this is a
  // short freeform note -- see EdgeResizeHandle usage below.
  const width = currentObject?.width ?? data.width ?? 200;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(data.label || "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-adjust height based on multiline contents scroll bounds
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
    updateNodeInternals(id);
  }, [title, editing, width, id, updateNodeInternals]);

  const save = () => {
    updateTitle(id, title.trim());
    setEditing(false);
  };

  return (
    <div
      className="group relative h-auto rounded-md border px-3 py-2 font-mono antialiased text-[11px] shadow-md transition-all duration-150"
      style={{
        width: `${width}px`,
        minWidth: "140px",
        background: "var(--color-surface)",
        borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
        boxShadow: selected ? "0 4px 14px var(--color-accent-soft)" : undefined,
      }}
    >
      {/* Left Vertical Accent indicator handle dot */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md transition-colors"
        style={{ background: selected ? "var(--color-accent)" : "var(--color-border)" }}
      />

      {/* REACTFLOW CONNECTOR PORTS */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border transition-colors"
        style={{ background: "var(--color-muted)", borderColor: "var(--color-surface)" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border transition-colors"
        style={{ background: "var(--color-muted)", borderColor: "var(--color-surface)" }}
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
            className="nodrag w-full bg-transparent font-bold outline-none resize-none overflow-hidden border-b leading-tight"
            style={{ color: "var(--color-text)", borderColor: "var(--color-border)", minHeight: "16px" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            className="cursor-text font-bold whitespace-pre-wrap break-words leading-tight"
            style={{ color: "var(--color-text)" }}
            title="Double-click to write label quick note"
          >
            {title || "Quick Note"}
          </div>
        )}
      </div>

      <EdgeResizeHandle id={id} axis="horizontal" width={width} height={0} minWidth={140} visible={selected} />
    </div>
  );
}