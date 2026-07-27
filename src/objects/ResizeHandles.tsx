import { MoveDownRight } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspaceStore";

/**
 * Shared drag-to-resize handles used by every card type so sizing behaves
 * consistently across the canvas. Two flavors:
 *  - CornerResizeHandle: drag both width & height (used by roomy cards)
 *  - EdgeResizeHandle: drag a single axis (used by content-driven cards
 *    where height should stay auto, or where width is structurally fixed)
 */

function syncReactFlowNodeStyle(id: string, patch: { width?: number; height?: number }) {
  const reactFlowInstance = (window as any).reactFlowInstance;
  if (!reactFlowInstance) return;
  reactFlowInstance.setNodes((nds: any[]) =>
    nds.map((node) => (node.id !== id ? node : { ...node, style: { ...node.style, ...patch } }))
  );
}

export function CornerResizeHandle({
  id,
  width,
  height,
  minWidth = 160,
  minHeight = 100,
  visible = true,
}: {
  id: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  visible?: boolean;
}) {
  const updateObjectDimensions = useWorkspaceStore((s) => s.updateObjectDimensions);

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;

    const move = (ev: PointerEvent) => {
      const finalW = Math.max(minWidth, startW + (ev.clientX - startX));
      const finalH = Math.max(minHeight, startH + (ev.clientY - startY));
      
      // Update both stores in real-time to prevent visual stuttering
      updateObjectDimensions(id, finalW, finalH);
      syncReactFlowNodeStyle(id, { width: finalW, height: finalH });
    };

    const up = (ev: PointerEvent) => {
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      onPointerDown={startResize}
      title="Drag to resize"
      className={`nodrag absolute bottom-1.5 right-1.5 p-1 rounded border shadow-md transition-all cursor-nwse-resize z-50 hover:scale-105 active:scale-95 ${
        visible ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
      }`}
      style={{
        color: "var(--color-muted)",
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <MoveDownRight size={11} />
    </div>
  );
}

export function EdgeResizeHandle({
  id,
  axis,
  width,
  height,
  minWidth = 140,
  minHeight = 60,
  visible = true,
}: {
  id: string;
  axis: "horizontal" | "vertical";
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  visible?: boolean;
}) {
  const updateObjectDimensions = useWorkspaceStore((s) => s.updateObjectDimensions);

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;

    const move = (ev: PointerEvent) => {
      const finalW = axis === "horizontal" ? Math.max(minWidth, startW + (ev.clientX - startX)) : startW;
      const finalH = axis === "vertical" ? Math.max(minHeight, startH + (ev.clientY - startY)) : startH;
      
      updateObjectDimensions(id, finalW, finalH);
      syncReactFlowNodeStyle(id, axis === "horizontal" ? { width: finalW } : { height: finalH });
    };

    const up = (ev: PointerEvent) => {
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const positionClasses =
    axis === "horizontal"
      ? "top-0 bottom-0 right-0 w-2 cursor-ew-resize"
      : "left-0 right-0 bottom-0 h-2 cursor-ns-resize";

  return (
    <div
      onPointerDown={startResize}
      title={axis === "horizontal" ? "Drag to resize width" : "Drag to resize height"}
      className={`nodrag absolute ${positionClasses} z-50 flex items-center justify-center transition-opacity ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        className={axis === "horizontal" ? "w-[3px] h-6 rounded-full" : "h-[3px] w-6 rounded-full"}
        style={{ background: "var(--color-border)" }}
      />
    </div>
  );
}
