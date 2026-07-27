import { useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";

export default function TextBlockNode({ id, data, selected }: NodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const objects = useWorkspaceStore((s) => s.objects);
  const updateObjectFields = useWorkspaceStore((s) => s.updateObjectFields);
  const currentObject = objects.find((obj) => obj.id === id);

  // Fallback to data attributes safely during node initialization frames
  const textContent = currentObject?.content ?? data.content ?? "";
  
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
  }, [localText, editing, id, updateNodeInternals]);

  const handleSave = () => {
    updateObjectFields(id, { content: localText.trim() });
    setEditing(false);
  };

  return (
    <div
      className={`p-2 font-mono antialiased text-xs select-text rounded border transition-all duration-150 relative min-w-[140px] max-w-[280px] h-auto ${
        selected 
          ? "border-slate-700 bg-[#0c1017]/90 shadow-lg shadow-black/30" 
          : "border-transparent bg-transparent hover:bg-white/[0.01]"
      }`}
    >
      {/* MINIMAL STRUCTURAL EDGE TARGET SOCKETS */}
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
            className="nodrag w-full bg-transparent text-slate-200 outline-none resize-none overflow-hidden leading-relaxed border-b border-slate-800 focus:border-[var(--color-accent)] pb-0.5"
            style={{ minHeight: "16px" }}
          />
        ) : (
          <div
            onDoubleClick={() => { setLocalText(textContent); setEditing(true); }}
            className={`cursor-text whitespace-pre-wrap break-words leading-relaxed p-0.5 min-h-[16px] ${
              textContent ? "text-slate-200" : "text-slate-600 italic bg-black/5 rounded px-1.5 py-1 border border-dashed border-slate-800/40"
            }`}
          >
            {textContent || "Double-click to insert raw text description..."}
          </div>
        )}
      </div>
    </div>
  );
}
