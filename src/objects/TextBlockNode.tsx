import { useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { EdgeResizeHandle } from "./ResizeHandles";

export default function TextBlockNode({ id, data, selected }: NodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const objects = useWorkspaceStore((s) => s.objects);
  const updateObjectFields = useWorkspaceStore((s) => s.updateObjectFields);
  const currentObject = objects.find((obj) => obj.id === id);

  // Fallback to data attributes safely during node initialization frames
  const textContent = currentObject?.content ?? data.content ?? "";

  // Width is user-adjustable; height stays content-driven (auto) so wrapped text
  // never gets clipped -- see EdgeResizeHandle usage below.
  const width = currentObject?.width ?? data.width ?? 220;
  const isAndroid = /Android/i.test(navigator.userAgent);

  const [editing, setEditing] = useState(false);
  const [localText, setLocalText] = useState(textContent);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync internal height boundaries and force ReactFlow handles to center accurately
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
    updateNodeInternals(id);
  }, [localText, editing, width, id, updateNodeInternals]);

  const handleSave = () => {
    updateObjectFields(id, { content: localText.trim() });
    setEditing(false);
  };

  return (
    <div
      className="group p-2 font-mono antialiased text-xs select-text rounded border transition-all duration-150 relative h-auto"
      style={{
        width: `${width}px`,
        minWidth: "140px",
        background: selected ? "var(--color-surface)" : "transparent",
        borderColor: selected ? "var(--color-border)" : "transparent",
        boxShadow: selected ? "0 8px 20px rgba(0,0,0,0.12)" : undefined,
      }}
    >
      {/* MINIMAL STRUCTURAL EDGE TARGET SOCKETS */}
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

      {/* CORE WRITING SURFACE BLOCK CONTAINER */}
      <div className="w-full dragging-handle cursor-grab active:cursor-grabbing">
        {editing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            rows={1}
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              e.stopPropagation(); // Stops Backspace or Delete keys from erasing the node card layout block
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="Type document string..."
            className="nodrag w-full bg-transparent outline-none resize-none overflow-hidden leading-relaxed border-b pb-0.5"
            style={{ color: "var(--color-text)", borderColor: "var(--color-border)", minHeight: "16px" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
          />
        ) : (
          <div
            data-text-editable="true"
            onDoubleClick={() => { setLocalText(textContent); setEditing(true); }}
            onPointerUp={(e) => {
              if (isAndroid) {
                e.stopPropagation();
                setLocalText(textContent);
                setEditing(true);
              }
            }}
            className="cursor-text whitespace-pre-wrap break-words leading-relaxed p-0.5 min-h-[16px]"
            style={
              textContent
                ? { color: "var(--color-text)" }
                : {
                    color: "var(--color-muted)",
                    fontStyle: "italic",
                    background: "var(--color-bg)",
                    border: "1px dashed var(--color-border)",
                    borderRadius: "4px",
                    padding: "0.25rem 0.375rem",
                  }
            }
          >
            {textContent || "Double-click to insert raw text description..."}
          </div>
        )}
      </div>

      <EdgeResizeHandle id={id} axis="horizontal" width={width} height={0} minWidth={140} visible={selected} />
    </div>
  );
}