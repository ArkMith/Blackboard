import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
  const lastPointRef = useRef<StrokePoint | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [livePoints, setLivePoints] = useState<StrokePoint[]>([]);

  const drawings = useWorkspaceStore(
    (state) => state.drawings
  );

  const setDrawings = useWorkspaceStore(
    (state) => state.setDrawings
  );

  /*
   * ------------------------------------------------------------
   * Canvas sizing
   * ------------------------------------------------------------
   */

  const resizeCanvas = () => {
    const canvas = canvasRef.current;

    if (!canvas || !canvas.parentElement) {
      return;
    }

    const rect =
      canvas.parentElement.getBoundingClientRect();

    const width = Math.max(
      1,
      Math.round(rect.width)
    );

    const height = Math.max(
      1,
      Math.round(rect.height)
    );

    const devicePixelRatio =
      window.devicePixelRatio || 1;

    /*
     * Render at device resolution.
     *
     * This is particularly important on phones.
     */
    canvas.width =
      Math.round(width * devicePixelRatio);

    canvas.height =
      Math.round(height * devicePixelRatio);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    renderCanvas();
  };

  useLayoutEffect(() => {
    resizeCanvas();

    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });

    if (canvasRef.current?.parentElement) {
      observer.observe(
        canvasRef.current.parentElement
      );
    }

    window.addEventListener(
      "resize",
      resizeCanvas
    );

    return () => {
      observer.disconnect();

      window.removeEventListener(
        "resize",
        resizeCanvas
      );
    };
  }, []);

  /*
   * ------------------------------------------------------------
   * ReactFlow viewport
   * ------------------------------------------------------------
   */

  const getViewport = () => {
    if (!reactFlowInstance) {
      return {
        x: 0,
        y: 0,
        zoom: 1,
      };
    }

    return reactFlowInstance.getViewport();
  };

  /*
   * IMPORTANT FIX ("stuck to the screen"):
   *
   * renderCanvas() applies the ReactFlow viewport transform, so
   * strokes ARE stored in world coordinates. But the previous code
   * only repainted on drawing/style state changes. `reactFlowInstance`
   * is a stable object reference, so panning/zooming the board never
   * triggered a repaint — strokes stayed glued to their last-painted
   * screen position until the next draw action forced a redraw.
   *
   * useOnViewportChange fires on every pan/zoom tick and always sees
   * the latest callback, so we just force a repaint here.
   */
  useOnViewportChange({
    onChange: () => {
      renderCanvas();
    },
  });

  /*
   * ------------------------------------------------------------
   * Pointer -> ReactFlow world coordinates
   * ------------------------------------------------------------
   */

  const eventToFlowPoint = (
    event: React.PointerEvent
  ): StrokePoint => {
    if (!reactFlowInstance) {
      return [
        event.clientX,
        event.clientY,
        event.pressure || 0.5,
      ];
    }

    const position =
      reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

    const pressure =
      event.pressure > 0
        ? event.pressure
        : 0.5;

    return [
      position.x,
      position.y,
      pressure,
    ];
  };

  /*
   * ------------------------------------------------------------
   * Pointer sampling
   *
   * Modern browsers provide getCoalescedEvents().
   *
   * This is very important for drawing.
   *
   * Instead of receiving:
   *
   *     A -------- B -------- C
   *
   * we may receive all the hidden points:
   *
   *     A -- a -- b -- c -- B -- d -- e -- C
   *
   * That prevents large brushes from turning into
   * giant polygon blocks.
   * ------------------------------------------------------------
   */

  const collectPointerPoints = (
    event: React.PointerEvent
  ): StrokePoint[] => {
    const nativeEvent =
      event.nativeEvent as PointerEvent;

    const coalesced =
      typeof nativeEvent.getCoalescedEvents ===
      "function"
        ? nativeEvent.getCoalescedEvents()
        : [];

    const events =
      coalesced.length > 0
        ? coalesced
        : [nativeEvent];

    const result: StrokePoint[] = [];

    for (const pointerEvent of events) {
      if (!reactFlowInstance) {
        result.push([
          pointerEvent.clientX,
          pointerEvent.clientY,
          pointerEvent.pressure || 0.5,
        ]);

        continue;
      }

      const position =
        reactFlowInstance.screenToFlowPosition({
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        });

      result.push([
        position.x,
        position.y,
        pointerEvent.pressure > 0
          ? pointerEvent.pressure
          : 0.5,
      ]);
    }

    return result;
  };

  /*
   * ------------------------------------------------------------
   * Distance helper
   * ------------------------------------------------------------
   */

  const distanceBetween = (
    a: StrokePoint,
    b: StrokePoint
  ) => {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];

    return Math.sqrt(
      dx * dx + dy * dy
    );
  };

  /*
   * ------------------------------------------------------------
   * Point interpolation
   *
   * IMPORTANT FIX (zigzag / jagged outline at large brush sizes):
   *
   * perfect-freehand builds the stroke outline by offsetting each
   * INPUT point perpendicular to the local stroke direction, by
   * roughly `size / 2`. If two consecutive input points are farther
   * apart than the brush radius (very easy with a fast mouse drag
   * + a large brush), the perpendicular offsets on either side of
   * the gap cross each other, and the outline self-intersects —
   * this is exactly the sawtooth/zigzag pattern in the screenshot.
   *
   * No amount of smoothing the OUTPUT curve fixes this, because the
   * bad geometry is already baked into the input polyline. The fix
   * is to guarantee the input points are dense enough relative to
   * the current brush size, by linearly interpolating extra points
   * into any gap that's too wide.
   * ------------------------------------------------------------
   */

  const interpolatePoints = (
    from: StrokePoint,
    to: StrokePoint,
    maxStep: number
  ): StrokePoint[] => {
    const dist = distanceBetween(from, to);

    if (dist <= maxStep) {
      return [to];
    }

    const steps = Math.ceil(dist / maxStep);
    const result: StrokePoint[] = [];

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;

      result.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ]);
    }

    return result;
  };

  const getActiveSize = () =>
    isEraserMode ? eraserSize : brushSize;

  /*
   * ------------------------------------------------------------
   * Add pointer samples
   * ------------------------------------------------------------
   */

  const appendPointerPoints = (
    incoming: StrokePoint[]
  ) => {
    if (incoming.length === 0) {
      return;
    }

    const current =
      livePointsRef.current;

    /*
     * Cap the max gap between input points at a fraction of the
     * current brush size, so perfect-freehand's perpendicular
     * offsets never have room to cross over and self-intersect.
     */
    const activeSize = getActiveSize();
    const maxStep = Math.max(1, activeSize / 3);

    for (const point of incoming) {
      const previous =
        current[current.length - 1];

      if (previous) {
        const dist = distanceBetween(previous, point);

        /*
         * Ignore microscopic duplicate samples.
         *
         * This prevents thousands of identical points when
         * a finger/stylus pauses.
         */
        if (dist < 0.15) {
          continue;
        }

        if (dist > maxStep) {
          const interpolated = interpolatePoints(
            previous,
            point,
            maxStep
          );

          current.push(...interpolated);

          continue;
        }
      }

      current.push(point);
    }

    lastPointRef.current =
      current[current.length - 1] ?? null;

    setLivePoints([...current]);
  };

  /*
   * ------------------------------------------------------------
   * Stroke renderer
   * ------------------------------------------------------------
   */

  const drawStroke = (
    ctx: CanvasRenderingContext2D,
    points: StrokePoint[],
    size: number,
    color: string,
    zoom: number
  ) => {
    if (points.length === 0) {
      return;
    }

    /*
     * perfect-freehand's size is in WORLD SPACE.
     *
     * Therefore the brush naturally scales with the board.
     */
    const safeSize = Math.max(
      1,
      size
    );

    /*
     * Scale smoothing/streamline up gradually for larger brushes.
     * Bigger brushes make any residual waviness far more visible,
     * so they benefit from more aggressive curve fitting.
     */
    const smoothing = Math.min(0.85, 0.55 + safeSize / 250);
    const streamline = Math.min(0.6, 0.3 + safeSize / 300);

    /*
     * For a single point, make a tiny stroke with a
     * duplicated point so the brush produces a proper dot.
     */
    let strokePoints = points;

    if (points.length === 1) {
      const [x, y, pressure] =
        points[0];

      strokePoints = [
        [x, y, pressure],
        [x + 0.01, y + 0.01, pressure],
      ];
    }

    const outline = getStroke(
      strokePoints,
      {
        size: safeSize,

        /*
         * Keep width stable.
         *
         * Pressure can still be supplied by a stylus,
         * but ordinary fingers/mouse use a stable brush.
         */
        thinning: 0.15,

        smoothing,
        streamline,

        easing: (t: number) => t,

        simulatePressure: false,

        /*
         * Explicit round ends.
         */
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

        /*
         * Tell perfect-freehand this is the final/live
         * stroke rather than an endlessly continuing one.
         */
        last: true,
      }
    );

    if (!outline || outline.length < 2) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * The ReactFlow viewport transform is already applied
     * to the canvas context by renderCanvas().
     *
     * Therefore these coordinates remain WORLD coordinates.
     */

    ctx.beginPath();

    /*
     * Draw the outline as a smooth curve through the MIDPOINTS of
     * consecutive outline vertices, rather than straight lineTo()
     * calls to each vertex. getStroke() returns a polygon, and
     * connecting its vertices directly makes every polygon facet
     * visible as a "corner" — invisible at small sizes, obviously
     * jagged at large ones. Routing a quadratic curve through each
     * vertex toward the next midpoint smooths the facets out.
     */
    const firstPoint = outline[0];
    const lastPoint = outline[outline.length - 1];

    ctx.moveTo(
      (firstPoint[0] + lastPoint[0]) / 2,
      (firstPoint[1] + lastPoint[1]) / 2
    );

    for (let i = 0; i < outline.length; i++) {
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

  /*
   * ------------------------------------------------------------
   * Render
   * ------------------------------------------------------------
   */

  const renderCanvas = () => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const devicePixelRatio =
      window.devicePixelRatio || 1;

    const viewport =
      getViewport();

    /*
     * Reset transform completely.
     */
    ctx.setTransform(
      1,
      0,
      0,
      1,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    /*
     * Convert CSS pixels to device pixels.
     */
    ctx.scale(
      devicePixelRatio,
      devicePixelRatio
    );

    /*
     * ReactFlow world -> screen transform.
     */
    ctx.translate(
      viewport.x,
      viewport.y
    );

    ctx.scale(
      viewport.zoom,
      viewport.zoom
    );

    /*
     * Use normal compositing for all regular pen strokes.
     */
    ctx.globalCompositeOperation =
      "source-over";

    /*
     * ----------------------------------------------------------
     * Committed strokes
     * ----------------------------------------------------------
     */

    for (const drawing of drawings) {
      if (drawing.type === "pen") {
        drawStroke(
          ctx,
          drawing.points,
          drawing.size,
          drawing.color,
          viewport.zoom
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * Eraser strokes
     * ----------------------------------------------------------
     */

    for (const drawing of drawings) {
      if (drawing.type === "eraser") {
        ctx.globalCompositeOperation =
          "destination-out";

        drawStroke(
          ctx,
          drawing.points,
          drawing.size,
          "rgba(0,0,0,1)",
          viewport.zoom
        );

        ctx.globalCompositeOperation =
          "source-over";
      }
    }

    /*
     * ----------------------------------------------------------
     * Live stroke
     * ----------------------------------------------------------
     */

    if (
      isDrawing &&
      livePoints.length > 0
    ) {
      if (isDrawingMode) {
        ctx.globalCompositeOperation =
          "source-over";

        drawStroke(
          ctx,
          livePoints,
          brushSize,
          brushColor,
          viewport.zoom
        );
      }

      if (
        isEraserMode &&
        eraserType === "brush"
      ) {
        ctx.globalCompositeOperation =
          "destination-out";

        drawStroke(
          ctx,
          livePoints,
          eraserSize,
          "rgba(0,0,0,1)",
          viewport.zoom
        );

        ctx.globalCompositeOperation =
          "source-over";
      }
    }

    ctx.globalCompositeOperation =
      "source-over";
  };

  /*
   * Re-render whenever drawing/viewport state changes.
   */
  useEffect(() => {
    renderCanvas();
  }, [
    drawings,
    livePoints,
    isDrawing,
    brushColor,
    brushSize,
    eraserSize,
    eraserType,
    reactFlowInstance,
  ]);

  /*
   * ------------------------------------------------------------
   * Stroke eraser
   * ------------------------------------------------------------
   */

  const eraseAtPoint = (
    point: StrokePoint
  ) => {
    const viewport =
      getViewport();

    const radius =
      eraserSize /
      Math.max(
        viewport.zoom,
        0.001
      );

    const [x, y] = point;

    const filtered =
      drawings.filter(
        (drawing) => {
          /*
           * Never remove eraser records here.
           */
          if (
            drawing.type === "eraser"
          ) {
            return true;
          }

          return !drawing.points.some(
            ([pointX, pointY]) => {
              const dx =
                pointX - x;

              const dy =
                pointY - y;

              return (
                Math.sqrt(
                  dx * dx +
                    dy * dy
                ) < radius
              );
            }
          );
        }
      );

    setDrawings(filtered);
  };

  /*
   * ------------------------------------------------------------
   * Pointer Down
   * ------------------------------------------------------------
   */

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (
      !isDrawingMode &&
      !isEraserMode
    ) {
      return;
    }

    /*
     * Mouse:
     * only primary button.
     *
     * Touch/stylus:
     * always accepted.
     */
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore unsupported pointer capture.
    }

    setIsDrawing(true);

    livePointsRef.current = [];
    lastPointRef.current = null;

    const points =
      collectPointerPoints(event);

    if (
      isEraserMode &&
      eraserType === "stroke"
    ) {
      if (points.length > 0) {
        eraseAtPoint(
          points[points.length - 1]
        );
      }

      return;
    }

    appendPointerPoints(points);
  };

  /*
   * ------------------------------------------------------------
   * Pointer Move
   * ------------------------------------------------------------
   */

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) {
      return;
    }

    event.preventDefault();

    const points =
      collectPointerPoints(event);

    if (
      isEraserMode &&
      eraserType === "stroke"
    ) {
      for (const point of points) {
        eraseAtPoint(point);
      }

      return;
    }

    appendPointerPoints(points);
  };

  /*
   * ------------------------------------------------------------
   * Finish stroke
   * ------------------------------------------------------------
   */

  const finishDrawing = (
    event?: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) {
      return;
    }

    if (event) {
      event.preventDefault();

      try {
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
      } catch {
        // Ignore.
      }
    }

    setIsDrawing(false);

    const finalPoints = [
      ...livePointsRef.current,
    ];

    if (finalPoints.length > 0) {
      const id =
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID ===
          "function"
          ? crypto.randomUUID()
          : `drawing-${Date.now()}-${Math.random()}`;

      const size =
        isEraserMode
          ? eraserSize
          : brushSize;

      const drawing: SavedDrawing =
        isDrawingMode
          ? {
              id,
              type: "pen",
              points: finalPoints,
              color: brushColor,
              size,
            }
          : {
              id,
              type: "eraser",
              points: finalPoints,
              color:
                "rgba(0,0,0,1)",
              size,
            };

      const current =
        useWorkspaceStore.getState()
          .drawings;

      setDrawings([
        ...current,
        drawing,
      ]);
    }

    livePointsRef.current = [];
    lastPointRef.current = null;
    setLivePoints([]);
  };

  /*
   * ------------------------------------------------------------
   * Pointer Cancel
   * ------------------------------------------------------------
   */

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore.
    }

    setIsDrawing(false);

    livePointsRef.current = [];
    lastPointRef.current = null;

    setLivePoints([]);
  };

  const isCanvasActive =
    isDrawingMode ||
    isEraserMode;

  /*
   * ------------------------------------------------------------
   * Render
   * ------------------------------------------------------------
   */

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={
        handlePointerDown
      }
      onPointerMove={
        handlePointerMove
      }
      onPointerUp={
        finishDrawing
      }
      onPointerCancel={
        handlePointerCancel
      }
      className={`absolute inset-0 w-full h-full ${
        isCanvasActive
          ? "z-40 pointer-events-auto select-none"
          : "z-10 pointer-events-none"
      }`}
      style={{
        touchAction: isCanvasActive
          ? "none"
          : "auto",

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