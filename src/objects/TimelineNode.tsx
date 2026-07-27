import React, { useState, useEffect, useMemo, useRef } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { 
  Calendar, Plus, Trash2, ChevronLeft, ChevronRight, 
  Palette, GripVertical, ListOrdered
} from "lucide-react";

interface TimelineTask {
  id: string;
  text: string;
  startDateStr: string; 
  durationUnits: number; 
  color: string; 
}

interface TimelineRow {
  id: string;
  trackName: string;
  tasks: TimelineTask[];
}

const PALETTE_COLORS = ["#d46a43", "#12b886", "#fab005", "#be4bdb", "#e64980", "#fa5252"];

export default function TimelineNode({ id, data, selected }: NodeProps) {
  const objects = useWorkspaceStore((s) => s.objects);
  const updateObjectFields = useWorkspaceStore((s) => s.updateObjectFields);
  const currentObject = objects.find((obj) => obj.id === id);

  const title = currentObject?.title ?? data.label ?? "Engineering Sprint";
  
  const [zoomLevel, setZoomLevel] = useState<"Day" | "Week" | "Month">(
    (currentObject?.timelineZoom as any) || "Week"
  );

  const [anchorDateStr, setAnchorDateStr] = useState<string>(
    currentObject?.timelineAnchorDate || new Date().toISOString().split("T")[0]
  );

  // FIX 1: Internal tracks state isolated from active global storage triggers during dragging
  const [tracks, setTracks] = useState<TimelineRow[]>([]);
  const [activePaletteTaskId, setActivePaletteTaskId] = useState<string | null>(null);

  const COLUMN_WIDTH = 68;
  const VISIBLE_COLUMNS = 7;
  const SIDEBAR_WIDTH = 140;
  const NODE_WIDTH = SIDEBAR_WIDTH + (VISIBLE_COLUMNS * COLUMN_WIDTH) + 24;

  useEffect(() => {
    if (currentObject?.timelineTracks && currentObject.timelineTracks.length > 0) {
      setTracks(currentObject.timelineTracks);
    } else if (tracks.length === 0) {
      const todayStr = new Date().toISOString().split("T")[0];
      const initial = [
        {
          id: "t1",
          trackName: "Sprint Alpha Logic",
          tasks: [{ id: "task-1", text: "Architecture Layout Design", startDateStr: todayStr, durationUnits: 2, color: "#d46a43" }],
        }
      ];
      setTracks(initial);
      updateObjectFields(id, { timelineTracks: initial });
    }
  }, [id]);

  // FIX 2: Decoupled state modifier keeps rendering performant locally
  const updateTracksLocally = (updatedTracks: TimelineRow[], forceStoreSave = false) => {
    setTracks(updatedTracks);
    if (forceStoreSave) {
      updateObjectFields(id, { timelineTracks: updatedTracks });
    }
  };

  const saveToGlobalStore = () => {
    updateObjectFields(id, { timelineTracks: tracks });
  };

    // Requirement 1 Overhaul: Generates clean, layout-specific headings for Day, Week, and Month zoom levels
  const visibleColumnsInfo = useMemo(() => {
    const list = [];
    const baseDate = new Date(anchorDateStr);

    for (let i = 0; i < VISIBLE_COLUMNS; i++) {
      const d = new Date(baseDate);
      if (zoomLevel === "Day") {
        d.setDate(baseDate.getDate() + i);
        list.push({
          topLabel: d.toLocaleDateString("en-US", { weekday: "short" }),
          subLabel: String(d.getDate()),
          dateStr: d.toISOString().split("T")
        });
      } else if (zoomLevel === "Week") {
        d.setDate(baseDate.getDate() + (i * 3));
        list.push({
          topLabel: d.toLocaleDateString("en-US", { month: "short" }),
          subLabel: `${d.getDate()}`,
          dateStr: d.toISOString().split("T")
        });
      } else {
        // FIX: Month Zoom maps Weeks straight to topLabel and discards Month values entirely
        d.setMonth(baseDate.getMonth() + i);
        list.push({
          topLabel: d.toLocaleDateString("en-US", { month: "short" }), // e.g. "Jan", "Feb", "Mar"
          subLabel: "", // Kept empty to clean out sub-header space completely
          dateStr: d.toISOString().split("T")
        });
      }
    }
    return list;
  }, [anchorDateStr, zoomLevel]);

  const scrollTimeline = (direction: number) => {
    const current = new Date(anchorDateStr);
    const step = zoomLevel === "Day" ? 1 : zoomLevel === "Week" ? 3 : 30;
    current.setDate(current.getDate() + (direction * step));
    const nextStr = current.toISOString().split("T")[0];
    setAnchorDateStr(nextStr);
    updateObjectFields(id, { timelineAnchorDate: nextStr });
  };

  const handleZoomChange = (level: "Day" | "Week" | "Month") => {
    setZoomLevel(level);
    updateObjectFields(id, { timelineZoom: level });
  };

  const addTrackRow = () => {
    updateTracksLocally([...tracks, { id: crypto.randomUUID(), trackName: "Untitled Track", tasks: [] }], true);
  };

  const addTaskToTrack = (trackId: string) => {
    const updated = tracks.map((t) => t.id === trackId ? {
      ...t, tasks: [...t.tasks, { id: crypto.randomUUID(), text: "New Task Block", startDateStr: anchorDateStr, durationUnits: 2, color: "#d46a43" }]
    } : t);
    updateTracksLocally(updated, true);
  };

  const startDragTask = (e: React.MouseEvent, trackId: string, taskId: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const currentTracksRef = { current: tracks };
    const task = currentTracksRef.current.find((t) => t.id === trackId)?.tasks.find((tk) => tk.id === taskId);
    if (!task) return;
    const originalDate = new Date(task.startDateStr);
    const stepMultiplier = zoomLevel === "Day" ? 1 : zoomLevel === "Week" ? 3 : 30;

    const mouseMoveHandler = (ev: MouseEvent) => {
      const unitsShifted = Math.round((ev.clientX - startX) / COLUMN_WIDTH) * stepMultiplier;
      const nextDate = new Date(originalDate);
      nextDate.setDate(originalDate.getDate() + unitsShifted);
      
      const nextTracks = currentTracksRef.current.map((t) => t.id === trackId ? {
        ...t, tasks: t.tasks.map((tk) => tk.id === taskId ? { ...tk, startDateStr: nextDate.toISOString().split("T")[0] } : tk)
      } : t);
      
      // FIX 3: Mutate view snapshot locally first to bypass transmission latency
      setTracks(nextTracks);
      currentTracksRef.current = nextTracks;
    };

    const mouseUpHandler = () => {
      window.removeEventListener("mousemove", mouseMoveHandler);
      window.removeEventListener("mouseup", mouseUpHandler);
      // FIX 4: Single discrete save directly to global storage and localStore on release
      updateObjectFields(id, { timelineTracks: currentTracksRef.current });
    };
    window.addEventListener("mousemove", mouseMoveHandler);
    window.addEventListener("mouseup", mouseUpHandler);
  };

  const startResizeTask = (e: React.MouseEvent, trackId: string, taskId: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const currentTracksRef = { current: tracks };
    const task = currentTracksRef.current.find((t) => t.id === trackId)?.tasks.find((tk) => tk.id === taskId);
    if (!task) return;
    const initialDuration = task.durationUnits;

    const mouseMoveHandler = (ev: MouseEvent) => {
      const unitsExpanded = Math.round((ev.clientX - startX) / COLUMN_WIDTH);
      const nextTracks = currentTracksRef.current.map((t) => t.id === trackId ? {
        ...t, tasks: t.tasks.map((tk) => tk.id === taskId ? { ...tk, durationUnits: Math.max(1, initialDuration + unitsExpanded) } : tk)
      } : t);
      
      setTracks(nextTracks);
      currentTracksRef.current = nextTracks;
    };

    const mouseUpHandler = () => {
      window.removeEventListener("mousemove", mouseMoveHandler);
      window.removeEventListener("mouseup", mouseUpHandler);
      updateObjectFields(id, { timelineTracks: currentTracksRef.current });
    };
    window.addEventListener("mousemove", mouseMoveHandler);
    window.addEventListener("mouseup", mouseUpHandler);
  };

  const calculateTaskBounds = (startDateStr: string, duration: number) => {
    const taskTime = new Date(startDateStr).getTime();
    const anchorTime = new Date(anchorDateStr).getTime();
    
    // 1. Compute exact absolute day offsets from the view's left anchor point
    const diffDays = (taskTime - anchorTime) / (1000 * 60 * 60 * 24);

    // 2. Define the exact scale divisor matching your column header labels
    // Day view: 1 day per column | Week view: 3 days per column | Month view: 30 days per column
    const stepDivisor = zoomLevel === "Day" ? 1 : zoomLevel === "Week" ? 3 : 30;

    // 3. Map both the starting position and visual width to the screen grid metrics
    const leftOffset = (diffDays / stepDivisor) * COLUMN_WIDTH;
    const widthSize = (duration / stepDivisor) * COLUMN_WIDTH;

    // 4. Determine if the element clips into or lands within the active viewport grid
    const isVisible = (leftOffset + widthSize > 0) && (leftOffset < VISIBLE_COLUMNS * COLUMN_WIDTH);

    return { 
      left: `${leftOffset + 4}px`, 
      width: `${Math.max(12, widthSize - 8)}px`, // Prevents sub-pixel text compression bugs when zooming way out
      isVisible 
    };
  };

  const LANE_TOTAL_WIDTH = VISIBLE_COLUMNS * COLUMN_WIDTH;
  

  return (
    <div className={`rounded-lg border bg-[#0c1017] text-slate-200 p-3.5 flex flex-col gap-2.5 select-none transition-shadow ${
      selected ? "border-slate-600 shadow-xl ring-1 ring-slate-600" : "border-slate-800/80 shadow-md"
    }`} style={{ width: `${NODE_WIDTH}px` }}>
      
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border !border-slate-900 !bg-slate-500" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border !border-slate-900 !bg-slate-500" />

      {/* HEADER SECTION */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5 dragging-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2"><div className="p-1 rounded bg-white/5 text-slate-400 border border-white/5">
            <ListOrdered size={12} />
          </div>
          <input 
            type="text" value={title} 
            onChange={(e) => updateObjectFields(id, { title: e.target.value })}
            className="nodrag bg-transparent text-xs font-bold text-white outline-none w-106 border-b border-transparent focus:border-white/10"
          />
        </div>

                {/* NOTION-STYLE CONTROLS */}
        <div className="flex items-center gap-2">
          <div className="nodrag flex bg-black/40 border border-white/5 p-0.5 rounded-md">
            {["Day","Week","Month"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => handleZoomChange(lvl as any)}
                className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                  zoomLevel === lvl ? "bg-[var(--color-accent)] text-white shadow" : "text-slate-500 hover:text-white"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
          <button onClick={addTrackRow} className="nodrag p-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 text-slate-200"><Plus size={12} /></button>
        </div>
      </div>

      {/* OVERLAY GRID */}
      <div className="flex flex-col border border-white/5 rounded-lg overflow-hidden bg-black/20">
        
        {/* TIME NAVIGATION LANE BAR */}
        <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-2 py-1">
          <button onClick={() => scrollTimeline(-1)} className="nodrag p-0.5 rounded hover:bg-white/5 text-slate-400 hover:text-white"><ChevronLeft size={13} /></button>
          <span className="text-[9px] font-bold text-slate-500 font-mono tracking-wider uppercase">Workflow Timeline</span>
          <button onClick={() => scrollTimeline(1)} className="nodrag p-0.5 rounded hover:bg-white/5 text-slate-400 hover:text-white"><ChevronRight size={13} /></button>
        </div>

        {/* TRACK COLUMNS HEADERS */}
        <div className="flex border-b border-white/5 bg-[#131826]" style={{ width: `${NODE_WIDTH}px` }}>
          <div style={{ width: `${SIDEBAR_WIDTH}px` }} className="text-[10px] font-bold text-slate-500 uppercase tracking-wider p-2 border-r border-white/5 shrink-0 select-none">
            Project Track
          </div>
          
          <div className="flex flex-1 overflow-hidden">
            {visibleColumnsInfo.map((col, i) => (
              <div key={i} style={{ width: `${COLUMN_WIDTH}px` }} className="flex flex-col items-center justify-center shrink-0 border-r border-white/5 last:border-none py-1">
                <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-tighter">{col.topLabel}</span>
                
                {/* Dynamically hides empty spaces to preserve clean vertical centering in Month view */}
                {col.subLabel && (
                  <span className="text-[11px] font-black text-slate-300 mt-0.5">
                    {col.subLabel}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>


                {/* BODY ROWS */}
        <div className="flex flex-col max-h-48 overflow-y-auto">
          {tracks.map((track) => (
            <div key={track.id} className="flex border-b border-white/5 last:border-none items-center group hover:bg-white/[0.01]" style={{ width: `${NODE_WIDTH}px` }}>
              
              <div style={{ width: `${SIDEBAR_WIDTH}px` }} className="p-1.5 flex items-center justify-between border-r border-white/5 shrink-0 z-20 bg-[#0c1017]">
                <input
                  type="text" value={track.trackName}
                  className="nodrag bg-transparent text-xs font-bold text-slate-300 outline-none truncate w-30 border-b border-transparent focus:border-white/10"
                  onChange={(e) => {
                    const next = tracks.map((t) => t.id === track.id ? { ...t, trackName: e.target.value } : t);
                    updateTracksLocally(next, false);
                  }}
                  onBlur={saveToGlobalStore}
                />
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all">
                  <button type="button" onClick={() => addTaskToTrack(track.id)} className="nodrag text-slate-500 hover:text-[var(--color-accent)] p-0.5"><Plus size={11} /></button>
                  <button type="button" onClick={() => updateTracksLocally(tracks.filter((t) => t.id !== track.id), true)} className="nodrag text-slate-500 hover:text-rose-400 p-0.5"><Trash2 size={11} /></button>
                </div>
              </div>

              {/* TIMELINE SPAN LANES */}
              <div className="relative h-9 flex items-center flex-1 overflow-visible" style={{ width: `${VISIBLE_COLUMNS * COLUMN_WIDTH}px` }}>
                {visibleColumnsInfo.map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-r border-white/5" style={{ left: `${(i + 1) * COLUMN_WIDTH}px` }} />
                ))}

                {track.tasks.map((task) => {
                  const layout = calculateTaskBounds(task.startDateStr, task.durationUnits);
                  if (!layout.isVisible) return null;

                  const isPaletteOpen = activePaletteTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      onMouseDown={(e) => startDragTask(e, track.id, task.id)}
                      style={{ left: layout.left, width: layout.width, backgroundColor: task.color }}
                      className="absolute top-1.5 bottom-1.5 rounded px-2.5 shadow-md flex items-center justify-between border border-black/10 group/task z-10 text-white font-bold cursor-grab active:cursor-grabbing transition-transform duration-75"
                    >
                      {/* FIX 1: Standalone nodrag class and explicit click tracker unlocks text typing instantly on touch devices */}
                      <input
                        type="text" 
                        value={task.text}
                        className="nodrag bg-transparent outline-none w-full text-[10px] font-bold text-white tracking-wide truncate border-b border-transparent focus:border-white/20 select-text cursor-text pointer-events-auto"
                        onClick={(e) => {
                          e.stopPropagation(); // Blocks parent node selection triggers
                          (e.target as HTMLInputElement).focus(); // Forces mobile keyboard layout popup panels
                        }}
                        onChange={(e) => {
                          const next = tracks.map((t) => {
                            if (t.id !== track.id) return t;
                            return { ...t, tasks: t.tasks.map((tk) => tk.id === task.id ? { ...tk, text: e.target.value } : tk) };
                          });
                          updateTracksLocally(next, false);
                        }}
                        onBlur={saveToGlobalStore}
                        onKeyDown={(e) => e.stopPropagation()}
                      />

                      {/* TASK ACTION BUTTON FOOTERS */}
                      <div className="nodrag opacity-0 group-hover/task:opacity-100 flex items-center gap-0.5 shrink-0 ml-1 bg-black/40 p-0.5 rounded border border-white/5 relative z-30 pointer-events-auto">
                        <button 
                          onMouseDown={(e) => { 
                            e.stopPropagation(); 
                            e.preventDefault();
                            setActivePaletteTaskId(isPaletteOpen ? null : task.id); 
                          }}
                          className="text-white/70 hover:text-white p-0.5 transition-colors cursor-pointer"
                          title="Change task color"
                        >
                          <Palette size={9} />
                        </button>
                        <button 
                          onMouseDown={(e) => { 
                            e.stopPropagation(); 
                            e.preventDefault();
                            updateTracksLocally(tracks.map((t) => t.id === track.id ? { ...t, tasks: t.tasks.filter((tk) => tk.id !== task.id) } : t), true); 
                          }}
                          className="text-white/60 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                          title="Delete task block"
                        >
                          <X size={9} />
                        </button>
                      </div>

                      {/* INLINE COLOR PALETTE PICKER MATRIX POPUP BOX */}
                      {isPaletteOpen && (
                        <div className="nodrag absolute left-0 top-7 bg-slate-950 p-1 rounded border border-white/10 shadow-2xl flex gap-1 z-50 animate-in fade-in zoom-in-95 duration-100 pointer-events-auto">
                          {PALETTE_COLORS.map((c) => (
                            <button
                              key={c} 
                              className="w-3.5 h-3.5 rounded-full border border-white/10 transition-transform hover:scale-110 active:scale-95 cursor-pointer" 
                              style={{ backgroundColor: c }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();

                                const nextTracks = tracks.map((t) => {
                                  if (t.id !== track.id) return t;
                                  return {
                                    ...t,
                                    tasks: t.tasks.map((tk) => tk.id === task.id ? { ...tk, color: c } : tk)
                                  };
                                });

                                updateTracksLocally(nextTracks, true);
                                setActivePaletteTaskId(null);
                              }}
                            />
                          ))}
                        </div>
                      )}

                      <div onMouseDown={(e) => startResizeTask(e, track.id, task.id)} className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/10 rounded-r z-20" />
                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

function X({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://w3.org" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
