import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import { ReactFlowInstance, useReactFlow, useStore } from "reactflow";
import type { SavedDrawing } from "../stores/workspaceStore";
import { getStroke } from "perfect-freehand";
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
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<StrokePoint[]>([]);

  // High-speed mutable memory reference holds coordinates safely across pointer liftoff frames
  const livePointsRef = useRef<StrokePoint[]>([]);

  const drawings = useWorkspaceStore((state) => state.drawings);
  const setDrawings = useWorkspaceStore((state) => state.setDrawings);

  const createId = () => {
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      try {
        return (crypto as any).randomUUID();
      } catch {
        /* fallthrough */
      }
    }
    return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  };

  const { screenToFlowPosition } = useReactFlow();
  const [transformX, transformY, zoom] = useStore((s) => s.transform);

  const resizeCanvasToParent = () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement("canvas");
      }
      offscreenCanvasRef.current.width = w;
      offscreenCanvasRef.current.height = h;
      renderCanvas();
    }
  };

  useLayoutEffect(() => {
    resizeCanvasToParent();
    window.addEventListener("resize", resizeCanvasToParent);
    return () => window.removeEventListener("resize", resizeCanvasToParent);
  }, []);

  useEffect(() => {
    renderCanvas();
  }, [transformX, transformY, zoom, drawings, points, isDrawing, brushColor, brushSize, eraserSize, eraserType]);

  const getCanvasPoint = (e: React.PointerEvent): StrokePoint => {
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const currentPressure = e.pressure !== undefined && e.pressure !== 0 ? e.pressure : 0.5;
    return [flowPos.x, flowPos.y, currentPressure];
  };

  const handleObjectEraser = (cursorPoint: StrokePoint) => {
    const [eraseX, eraseY] = cursorPoint;
    // Dynamically scale stroke erase radius based on current eraserSize setting & zoom level
    const detectionRadius = (eraserSize || 20) / zoom;

    const filteredDrawings = drawings.filter((drawing) => {
      if (drawing.type === "eraser") return true;
      return !drawing.points.some(([ptX, ptY]) => {
        return Math.sqrt((ptX - eraseX) ** 2 + (ptY - eraseY) ** 2) < detectionRadius;
      });
    });
    setDrawings(filteredDrawings);
  };

  const startDrawing = (e: React.PointerEvent) => {
    // allow touch to start regardless of mouse button semantics
    if ((!isDrawingMode && !isEraserMode) || (e.pointerType !== "touch" && e.button !== 0)) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore if pointer capture not supported on client device
    }
    setIsDrawing(true);

    const startPoint = getCanvasPoint(e);
    if (isEraserMode && eraserType === "stroke") {
      handleObjectEraser(startPoint);
    } else {
      livePointsRef.current = [startPoint];
      setPoints([startPoint]);
    }
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const currentPoint = getCanvasPoint(e);
    if (isEraserMode && eraserType === "stroke") {
      handleObjectEraser(currentPoint);
    } else {
      livePointsRef.current.push(currentPoint);
      setPoints((prev) => [...prev, currentPoint]);
    }
  };

  const endDrawing = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }

    const finalStrokePoints = [...livePointsRef.current];

    if (finalStrokePoints.length > 0) {
      const id = createId();
      const currentSize = isEraserMode ? eraserSize : brushSize;
      const newDrawing: SavedDrawing = isDrawingMode
        ? { id, type: "pen", points: finalStrokePoints, color: brushColor, size: currentSize }
        : { id, type: "eraser", points: finalStrokePoints, color: "rgba(0,0,0,1)", size: currentSize };

      const current = useWorkspaceStore.getState().drawings;
      setDrawings([...current, newDrawing]);
    }

    livePointsRef.current = [];
    setPoints([]);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    livePointsRef.current = [];
    setPoints([]);
  };

  const drawStrokeGeometry = (ctx: CanvasRenderingContext2D, pointsArray: StrokePoint[], size: number) => {
    const strokeOptions = getStroke(pointsArray, {
      size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.55,
      simulatePressure: false,
    });

    if (strokeOptions.length === 0) return;

    ctx.beginPath();
    const firstPoint = strokeOptions[0];
    const startX = Array.isArray(firstPoint) ? firstPoint[0] : (firstPoint as any).x;
    const startY = Array.isArray(firstPoint) ? firstPoint[1] : (firstPoint as any).y;
    ctx.moveTo(startX, startY);

    for (let i = 1; i < strokeOptions.length; i++) {
      const currentPoint = strokeOptions[i];
      const currentX = Array.isArray(currentPoint) ? currentPoint[0] : (currentPoint as any).x;
      const currentY = Array.isArray(currentPoint) ? currentPoint[1] : (currentPoint as any).y;
      ctx.lineTo(currentX, currentY);
    }
    ctx.fill();
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    const screenCtx = canvas?.getContext("2d");
    const offscreen = offscreenCanvasRef.current;
    const bufferCtx = offscreen?.getContext("2d");

    if (!canvas || !screenCtx || !offscreen || !bufferCtx) return;

    screenCtx.clearRect(0, 0, canvas.width, canvas.height);
    bufferCtx.clearRect(0, 0, offscreen.width, offscreen.height);

    bufferCtx.save();
    bufferCtx.translate(transformX, transformY);
    bufferCtx.scale(zoom, zoom);

    // Render global committed shapes
    drawings.forEach((item) => {
      if (item.type === "pen") {
        bufferCtx.globalCompositeOperation = "source-over";
        bufferCtx.fillStyle = item.color;
        drawStrokeGeometry(bufferCtx, item.points, item.size);
      } else if (item.type === "eraser") {
        bufferCtx.globalCompositeOperation = "destination-out";
        bufferCtx.fillStyle = "rgba(0,0,0,1)";
        drawStrokeGeometry(bufferCtx, item.points, item.size);
      }
    });

    // Render active live stroke synchronously
    if (isDrawing && points.length > 0) {
      if (isDrawingMode) {
        bufferCtx.globalCompositeOperation = "source-over";
        bufferCtx.fillStyle = brushColor;
        drawStrokeGeometry(bufferCtx, points, brushSize);
      } else if (isEraserMode && eraserType === "brush") {
        bufferCtx.globalCompositeOperation = "destination-out";
        bufferCtx.fillStyle = "rgba(0,0,0,1)";
        drawStrokeGeometry(bufferCtx, points, eraserSize);
      }
    }

    bufferCtx.restore();
    screenCtx.drawImage(offscreen, 0, 0);
  };

  const isCanvasActive = isDrawingMode || isEraserMode;

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={startDrawing}
      onPointerMove={draw}
      onPointerUp={endDrawing}
      onPointerCancel={handlePointerCancel}
      className={`absolute inset-0 top-0 left-0 w-full h-full ${
        isCanvasActive ? "z-40 touch-none select-none pointer-events-auto" : "pointer-events-none z-10"
      }`}
      style={{
        cursor: isEraserMode ? (eraserType === "brush" ? "cell" : "crosshair") : isDrawingMode ? "crosshair" : "default",
      }}
    />
  );
}