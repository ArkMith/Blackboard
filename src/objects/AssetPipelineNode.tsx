import React, { useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useUpdateNodeInternals } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { STATUS_STAGES } from "../stores/workspaceStore";
import { 
  Calendar, 
  Image as ImageIcon, 
  ChevronDown, 
  Trash2, 
  X, 
  Layers, 
  GripVertical, 
  CheckSquare, 
  Clock,
  ExternalLink
} from "lucide-react";

export default function AssetPipelineNode({ id, data, selected }: NodeProps) {
  // 1. Hook up internal node re-mapper to keep connector wires dynamic
  const updateNodeInternals = useUpdateNodeInternals();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [todoInput, setTodoInput] = useState("");

  const objects = useWorkspaceStore((s) => s.objects);
  const currentObject = objects.find((obj) => obj.id === id);

  // Bind properties directly to global store caches
  const status = currentObject?.status || data.status || "concept";
  const fileFormat = currentObject?.fileFormat || data.fileFormat || ".PNG";
  const dueDate = currentObject?.dueDate || data.dueDate || "2026-06-15";
  const previewUrl = currentObject?.previewUrl || data.previewUrl || null;
  const checklist = currentObject?.checklist || data.checklist || [];
  const fileName = currentObject?.fileName || "No local source file linked";
  const title = currentObject?.title ?? data.label ?? "Untitled Resource";

  const currentStage = STATUS_STAGES.find((s) => s.id === status) || STATUS_STAGES[0];

  // 2. FORCE wire handle re-calculations whenever layout elements toggle or expand
  useEffect(() => {
    updateNodeInternals(id);
  }, [checklist, previewUrl, id, updateNodeInternals]);

  const updateStore = (fields: Partial<typeof currentObject>) => {
    useWorkspaceStore.getState().updateObjectFields(id, fields);
  };

  const processPersistentFile = (file: File) => {
    const ext = `.${file.name.split(".").pop()?.toUpperCase()}`;
    const reader = new FileReader();

    reader.onload = () => {
      updateStore({
        previewUrl: reader.result as string, // Permanent Base64 layout string string representation
        fileFormat: ext,
        fileName: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      processPersistentFile(file);
    }
  };

  const triggerFileExplorer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processPersistentFile(file);
    }
  };

  const toggleTodo = (todoId: string) => {
    const updated = checklist.map((t: any) => t.id === todoId ? { ...t, done: !t.done } : t);
    updateStore({ checklist: updated });
  };

  const addTodo = () => {
    if (!todoInput.trim()) return;
    const item = { id: crypto.randomUUID(), text: todoInput.trim(), done: false };
    updateStore({ checklist: [...checklist, item] });
    setTodoInput("");
  };

  const deleteTodo = (todoId: string) => {
    updateStore({ checklist: checklist.filter((t: any) => t.id !== todoId) });
  };

  const progressPercent = checklist.length 
    ? Math.round((checklist.filter((t: any) => t.done).length / checklist.length) * 100) 
    : 0;

  // Render return template block elements follow below...
  return (
    <div 
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
      className={`w-[290px] rounded-lg border font-mono antialiased text-xs bg-[#0c1017] transition-all duration-150 ${
        selected 
          ? "border-slate-600 shadow-xl shadow-black/40 ring-1 ring-slate-600" 
          : "border-slate-800/80 shadow-md"
      }`}
    >
      {/* Google Emerald accent border tag strip */}
      <div className={`h-1 w-full rounded-t-lg transition-colors ${selected ? "bg-[#12b886]" : "bg-slate-800"}`} />

      {/* REACTFLOW CONNECTOR PORTS */}
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border !border-slate-900 !bg-slate-500 hover:!bg-[#12b886] transition-colors" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border !border-slate-900 !bg-slate-500 hover:!bg-[#12b886] transition-colors" />

      {/* HEADER CONTROLS BAR */}
      <div className="p-3.5 border-b border-white/5 flex flex-col gap-1.5 dragging-handle cursor-grab active:cursor-grabbing select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 opacity-30 text-[9px] uppercase tracking-wider font-black">
            <GripVertical size={11} className="shrink-0" />
            <span>Asset Resource</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 font-bold border border-white/5 text-slate-400 uppercase">{fileFormat.replace(".", "")}</span>
        </div>
        <input 
          type="text" 
          value={title} 
          onChange={(e) => updateStore({ title: e.target.value })}
          className="nodrag bg-transparent text-xs font-bold text-white outline-none w-full border-b border-transparent focus:border-white/10"
        />
      </div>

      {/* PIPELINE STATUS DROPDOWN MANIFOLD */}
      <div className="px-3.5 pt-3 relative">
        <button 
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className={`nodrag w-full flex items-center justify-between border px-2.5 py-1.5 rounded text-[11px] font-bold transition-all ${currentStage.color}`}
        >
          <div className="flex items-center gap-1.5">
            <Clock size={12} />
            <span>{currentStage.label}</span>
          </div>
          <ChevronDown size={12} />
        </button>

        {showStatusMenu && (
          <div className="nodrag absolute left-3.5 right-3.5 top-11 z-50 flex flex-col gap-0.5 bg-[#0c1017] border border-slate-800 p-1 rounded shadow-xl">
            {STATUS_STAGES.map((stage) => (
              <button
                key={stage.id}
                onClick={() => { updateStore({ status: stage.id }); setShowStatusMenu(false); }}
                className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  status === stage.id ? "bg-[var(--color-accent)] text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {stage.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* INDUSTRIAL PREVIEW CONTAINER */}
      <div className="p-3.5 pt-2.5">
        <input type="file" ref={fileInputRef} className="hidden" onChange={triggerFileExplorer} />
        
        {previewUrl ? (
          <div className="h-28 rounded border border-white/5 bg-black/40 relative overflow-hidden group flex items-center justify-center">
            <img src={previewUrl} alt="Thumbnail Profile View" className="w-full h-full object-cover select-none pointer-events-none" />
            <button 
              onClick={() => {
                updateStore({ previewUrl: null, fileName: "No local source file linked" });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }} 
              className="nodrag absolute top-2 right-2 p-1 rounded bg-black/70 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <div 
            onClick={() => fileInputRef.current?.click()} 
            className="nodrag h-28 rounded border border-dashed border-white/5 bg-black/10 flex flex-col items-center justify-center text-[10px] text-slate-500 font-medium text-center px-4 cursor-pointer hover:border-[#12b886]/40 hover:bg-[#12b886]/[0.01] transition-colors"
          >
            <ImageIcon size={20} className="text-slate-600 mb-1" />
            Click or Drop Media Resource Thumbnail
          </div>
        )}
      </div>

      {/* PROJECT LOCAL SOURCE REFERENCE SLOT */}
      <div className="px-3.5 pb-2.5">
        <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 truncate w-[85%] text-slate-400 font-medium font-mono text-[10px]">
            <Layers size={13} className="text-slate-500 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
          {fileName !== "No local source file linked" && (
            <button 
              className="nodrag p-0.5 rounded hover:bg-white/5 text-slate-500 hover:text-[var(--color-accent)]"
              onClick={() => alert(`Metadata asset trace connection path: ${fileName}`)}
            >
              <ExternalLink size={11} />
            </button>
          )}
        </div>
      </div>

      {/* SPRINT DUE DATE CALENDAR DROPDOWN */}
      <div className="px-3.5 pb-2.5 flex items-center justify-between border-b border-white/5 text-[11px]">
        <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider flex items-center gap-1 select-none">
          <Calendar size={12} className="text-slate-500" /> Target Deadline
        </span>
        <div className="relative">
          <button 
            onClick={() => setShowCalendar(!showCalendar)}
            className="nodrag font-mono font-bold text-slate-300 hover:text-white px-2 py-0.5 rounded border border-transparent hover:border-white/5"
          >
            {dueDate}
          </button>
          {showCalendar && (
            <div className="nodrag absolute right-0 bottom-7 z-50 p-2 rounded border border-slate-800 bg-[#0c1017] shadow-2xl flex flex-col gap-1.5 animate-in fade-in duration-100">
              <input 
                type="date" value={dueDate}
                onChange={(e) => { updateStore({ dueDate: e.target.value }); setShowCalendar(false); }}
                className="bg-black/40 border border-slate-700 rounded p-1 text-xs text-white outline-none accent-[var(--color-accent)]"
              />
            </div>
          )}
        </div>
      </div>

      {/* MILESTONE SUB-TASKS CONFIGURATION LIST MODULE */}
      <div className="px-3.5 pb-3.5 pt-1.5 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
          <div className="flex items-center gap-1">
            <CheckSquare size={12} className="text-slate-500" />
            <span>Milestone Specs</span>
          </div>
          <span className="font-mono">{progressPercent}%</span>
        </div>

        {/* Flat structural indicator track */}
        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-[#12b886] transition-all duration-200" style={{ width: `${progressPercent}%` }} />
        </div>

        {/* Render tasks rows logs */}
        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-0.5">
          {checklist.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between group/todo py-0.5 animate-in fade-in duration-100">
              <label className="nodrag flex items-center gap-2 cursor-pointer text-[11px] text-slate-300 font-medium select-none w-full">
                <input 
                  type="checkbox" checked={item.done}
                  onChange={() => toggleTodo(item.id)}
                  className="rounded border-slate-700 bg-black/40 text-[var(--color-accent)] focus:ring-0 w-3 h-3 cursor-pointer accent-[var(--color-accent)]"
                />
                <span className={item.done ? "line-through text-slate-600 font-normal" : ""}>{item.text}</span>
              </label>
              <button 
                onClick={() => deleteTodo(item.id)} 
                className="nodrag opacity-100 md:opacity-0 group-hover/todo:opacity-100 p-0.5 text-slate-600 hover:text-rose-400 transition-opacity"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        
        <input 
          type="text" placeholder="Add sprint parameter..." value={todoInput} 
          onChange={(e) => setTodoInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTodo();
          }}
          className="nodrag bg-black/40 border border-slate-800 rounded px-2 py-1 text-[11px] text-white outline-none w-full focus:border-slate-700 placeholder-slate-600"
        />
      </div>
    </div>
  );
}
