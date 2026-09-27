import React, {
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type { ReactFlowInstance } from "reactflow";
import { useOnViewportChange } from "reactflow";
import { getStroke } from "perfect-freehand";

import type { SavedDrawing } from "../stores/workspaceStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

interface DrawingCanvasProps {
  isDrawingMode: boolean;
  isEraserMode: boolean;
  eraserType: "stroke" | "brush";
  eraserSize: number;
  brushColor: string;
  brushSize: number;
  reactFlowInstance?: ReactFlowInstance | null;
}

type StrokePoint = [number, number, number];

const MAX_RENDER_POINTS = 700;

export default function DrawingCanvas({
  isDrawingMode,
  isEraserMode,
  eraserType,
  eraserSize,
  brushColor,
  brushSize,
  reactFlowInstance,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const livePointsRef = useRef<StrokePoint[]>([]);
  const isDrawingRef = useRef(false);
  const renderFrameRef = useRef<number | null>(null);
  const renderCanvasRef = useRef<() => void>(() => {});

  const drawings = useWorkspaceStore((state) => state.drawings);
  const setDrawings = useWorkspaceStore((state) => state.setDrawings);

  const getViewport = () =>
    reactFlowInstance?.getViewport() ?? { x: 0, y: 0, zoom: 1 };

  /*
   * Drawing used to put the complete live stroke into React state on every
   * pointer event. That forced React + perfect-freehand to recalculate the
   * entire stroke as fast as the browser could deliver pointer events.
   *
   * On Android this can easily outrun the WebView. Live points now stay in a
   * ref and rendering is coalesced to one requestAnimationFrame at a time.
   */
  const scheduleRender = () => {
    if (renderFrameRef.current !== null) return;

    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      renderCanvasRef.current();
    });
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const rect = parent.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    // Phones do not benefit from pushing an enormous backing canvas through
    // the WebView GPU. Desktop keeps the normal device resolution; Android is
    // capped at 1.75x while still looking sharp on high-density screens.
    const isAndroid = /Android/i.test(navigator.userAgent);
    const devicePixelRatio = Math.min(
      window.devicePixelRatio || 1,
      isAndroid ? 1.75 : 2
    );

    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    scheduleRender();
  };

  useLayoutEffect(() => {
    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    if (canvasRef.current?.parentElement) {
      observer.observe(canvasRef.current.parentElement);
    }

    window.addEventListener("resize", resizeCanvas);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeCanvas);

      if (renderFrameRef.current !== null) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    };
  }, []);

  useOnViewportChange({
    onChange: () => {
      scheduleRender();
    },
  });

  const collectPointerPoints = (
    event: React.PointerEvent<HTMLCanvasElement>
  ): StrokePoint[] => {
    const nativeEvent = event.nativeEvent as PointerEvent;
    const coalesced =
      typeof nativeEvent.getCoalescedEvents === "function"
        ? nativeEvent.getCoalescedEvents()
        : [];

    const events = coalesced.length > 0 ? coalesced : [nativeEvent];
    const result: StrokePoint[] = [];

    for (const pointerEvent of events) {
      if (!reactFlowInstance) {
        result.push([
          pointerEvent.clientX,
          pointerEvent.clientY,
          pointerEvent.pressure > 0 ? pointerEvent.pressure : 0.5,
        ]);
        continue;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      });

      result.push([
        position.x,
        position.y,
        pointerEvent.pressure > 0 ? pointerEvent.pressure : 0.5,
      ]);
    }

    return result;
  };

  const distanceBetween = (a: StrokePoint, b: StrokePoint) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

  const interpolatePoints = (
    from: StrokePoint,
    to: StrokePoint,
    maxStep: number
  ): StrokePoint[] => {
    const distance = distanceBetween(from, to);
    if (distance <= maxStep) return [to];

    const steps = Math.ceil(distance / maxStep);
    const result: StrokePoint[] = [];

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      result.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ]);
    }

    return result;
  };

  const getActiveSize = () => (isEraserMode ? eraserSize : brushSize);

  const appendPointerPoints = (incoming: StrokePoint[]) => {
    if (incoming.length === 0) return;

    const current = livePointsRef.current;

    // The old size / 3 rule could create thousands of interpolated points
    // on a fast finger stroke. A bounded step is enough for perfect-freehand
    // to remain smooth without overwhelming the Android WebView.
    const activeSize = getActiveSize();
    const maxStep = Math.max(2, Math.min(12, activeSize / 2));

    for (const point of incoming) {
      const previous = current[current.length - 1];

      if (previous) {
        const distance = distanceBetween(previous, point);
        if (distance < 0.5) continue;

        if (distance > maxStep) {
          current.push(...interpolatePoints(previous, point, maxStep));
          continue;
        }
      }

      current.push(point);
    }

    scheduleRender();
  };

  const getRenderablePoints = (points: StrokePoint[]) => {
    if (points.length <= MAX_RENDER_POINTS) return points;

    const stride = Math.ceil(points.length / MAX_RENDER_POINTS);
    const result: StrokePoint[] = [];

    for (let i = 0; i < points.length; i += stride) {
      result.push(points[i]);
    }

    const last = points[points.length - 1];
    if (result[result.length - 1] !== last) {
      result.push(last);
    }

    return result;
  };

  const drawStroke = (
    ctx: CanvasRenderingContext2D,
    points: StrokePoint[],
    size: number,
    color: string
  ) => {
    if (points.length === 0) return;

    const safeSize = Math.max(1, size);
    const renderPoints = getRenderablePoints(points);

    let strokePoints = renderPoints;

    if (renderPoints.length === 1) {
      const [x, y, pressure] = renderPoints[0];
      strokePoints = [
        [x, y, pressure],
        [x + 0.01, y + 0.01, pressure],
      ];
    }

    const outline = getStroke(strokePoints, {
      size: safeSize,
      thinning: 0.15,
      smoothing: Math.min(0.85, 0.55 + safeSize / 250),
      streamline: Math.min(0.6, 0.3 + safeSize / 300),
      easing: (t: number) => t,
      simulatePressure: false,
      start: {
        cap: true,
        taper: 0,
        easing: (t: number) => t,
      },
      end: {
        cap: true,
        taper: 0,
        easing: (t: number) => t,
      },
      last: true,
    });

    if (!outline || outline.length < 2) return;

    ctx.beginPath();

    const firstPoint = outline[0];
    const lastPoint = outline[outline.length - 1];

    ctx.moveTo(
      (firstPoint[0] + lastPoint[0]) / 2,
      (firstPoint[1] + lastPoint[1]) / 2
    );

    for (let i = 0; i < outline.length; i += 1) {
      const point = outline[i];
      const nextPoint = outline[(i + 1) % outline.length];
      const midX = (point[0] + nextPoint[0]) / 2;
      const midY = (point[1] + nextPoint[1]) / 2;

      ctx.quadraticCurveTo(point[0], point[1], midX, midY);
    }

    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Live strokes use the native canvas path renderer. This is deliberately
  // cheaper than running perfect-freehand over the entire growing stroke on
  // every animation frame. The committed stroke is still rendered with
  // perfect-freehand, so the saved/final appearance stays the same.
  const drawLiveStroke = (
    ctx: CanvasRenderingContext2D,
    points: StrokePoint[],
    size: number,
    color: string
  ) => {
    if (points.length === 0) return;

    const renderPoints = getRenderablePoints(points);
    const [firstX, firstY] = renderPoints[0];

    ctx.beginPath();
    ctx.moveTo(firstX, firstY);

    for (let i = 1; i < renderPoints.length; i += 1) {
      ctx.lineTo(renderPoints[i][0], renderPoints[i][1]);
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, size);
    ctx.strokeStyle = color;
    ctx.stroke();

    // A single point should still feel like a brush tap.
    if (renderPoints.length === 1) {
      ctx.beginPath();
      ctx.arc(firstX, firstY, Math.max(0.5, size / 2), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isAndroid = /Android/i.test(navigator.userAgent);
    const devicePixelRatio = Math.min(
      window.devicePixelRatio || 1,
      isAndroid ? 1.75 : 2
    );
    const viewport = getViewport();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);
    ctx.globalCompositeOperation = "source-over";

    for (const drawing of drawings) {
      if (drawing.type === "pen") {
        drawStroke(ctx, drawing.points, drawing.size, drawing.color);
      }
    }

    for (const drawing of drawings) {
      if (drawing.type === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        drawStroke(ctx, drawing.points, drawing.size, "rgba(0,0,0,1)");
        ctx.globalCompositeOperation = "source-over";
      }
    }

    const livePoints = livePointsRef.current;

    if (isDrawingRef.current && livePoints.length > 0) {
      if (isDrawingMode) {
        ctx.globalCompositeOperation = "source-over";
        drawLiveStroke(ctx, livePoints, brushSize, brushColor);
      } else if (isEraserMode && eraserType === "brush") {
        ctx.globalCompositeOperation = "destination-out";
        drawLiveStroke(ctx, livePoints, eraserSize, "rgba(0,0,0,1)");
        ctx.globalCompositeOperation = "source-over";
      }
    }

    ctx.globalCompositeOperation = "source-over";
  };

  renderCanvasRef.current = renderCanvas;

  useEffect(() => {
    scheduleRender();
  }, [
    drawings,
    isDrawingMode,
    isEraserMode,
    brushColor,
    brushSize,
    eraserSize,
    eraserType,
    reactFlowInstance,
  ]);

  const eraseAtPoints = (points: StrokePoint[]) => {
    if (points.length === 0) return;

    const viewport = getViewport();
    const radius = eraserSize / Math.max(viewport.zoom, 0.001);

    const currentDrawings = useWorkspaceStore.getState().drawings;

    const filtered = currentDrawings.filter((drawing) => {
      if (drawing.type === "eraser") return true;

      return !drawing.points.some(([pointX, pointY]) =>
        points.some(([x, y]) => Math.hypot(pointX - x, pointY - y) < radius)
      );
    });

    if (filtered.length !== currentDrawings.length) {
      setDrawings(filtered);
    }
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingMode && !isEraserMode) return;

    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore unsupported pointer capture.
    }

    isDrawingRef.current = true;
    livePointsRef.current = [];

    const points = collectPointerPoints(event);

    if (isEraserMode && eraserType === "stroke") {
      eraseAtPoints(points);
      return;
    }

    appendPointerPoints(points);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current) return;

    event.preventDefault();

    const points = collectPointerPoints(event);

    if (isEraserMode && eraserType === "stroke") {
      eraseAtPoints(points);
      return;
    }

    appendPointerPoints(points);
  };

  const finishDrawing = (
    event?: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current) return;

    if (event) {
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
    }

    isDrawingRef.current = false;

    const finalPoints = [...livePointsRef.current];

    if (finalPoints.length > 0 && (isDrawingMode || isEraserMode)) {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `drawing-${Date.now()}-${Math.random()}`;

      const drawing: SavedDrawing = isDrawingMode
        ? {
            id,
            type: "pen",
            points: finalPoints,
            color: brushColor,
            size: brushSize,
          }
        : {
            id,
            type: "eraser",
            points: finalPoints,
            color: "rgba(0,0,0,1)",
            size: eraserSize,
          };

      const current = useWorkspaceStore.getState().drawings;
      setDrawings([...current, drawing]);
    }

    livePointsRef.current = [];
    scheduleRender();
  };

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore.
    }

    isDrawingRef.current = false;
    livePointsRef.current = [];
    scheduleRender();
  };

  const isCanvasActive = isDrawingMode || isEraserMode;

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrawing}
      onPointerCancel={handlePointerCancel}
      className={`absolute inset-0 w-full h-full ${
        isCanvasActive
          ? "z-40 pointer-events-auto select-none"
          : "z-10 pointer-events-none"
      }`}
      style={{
        touchAction: isCanvasActive ? "none" : "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: isEraserMode
          ? eraserType === "brush"
            ? "cell"
            : "crosshair"
          : isDrawingMode
          ? "crosshair"
          : "default",
      }}
    />
  );
}
