import React from "react";
import { EdgeProps, getBezierPath } from "reactflow";

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  // 1. Calculate a smooth, mathematically precise bezier curved path vector layout
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Accent color follows the app's brand theme (light/dark aware via CSS var); disconnected wires stay a neutral slate.
  const ACCENT_COLOR = "var(--color-accent)";
  const DISCONNECTED_COLOR = "#334155"; // Subtle low-weight layout slate-700 gray

  return (
    <>
      <g className="react-flow__edge font-mono text-[10px]">
        {/* INVISIBLE OUTER HIT-BOX TRACK (Makes clicking/selecting connection wires easy on touch screen tabs) */}
        <path
          id={`${id}-interaction`}
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={15}
          className="cursor-pointer pointer-events-auto"
        />

        {/* NATIVE HIGH-DENSITY HIGH-CONTRAST CORE CORE WIRE PATH */}
        <path
          id={id}
          d={edgePath}
          fill="none"
          // Dynamic color assignment shifts brightness cleanly when clicked or highlighted
          stroke={selected ? ACCENT_COLOR : DISCONNECTED_COLOR}
          strokeWidth={selected ? 2.5 : 1.8}
          // Connects the wire termination path directly to our custom arrow head marker component below
          markerEnd="url(#blackboard-arrow-marker)"
          className="transition-all duration-100 ease-in-out pointer-events-none"
        />
      </g>

      {/* GLOBAL SVG DEFINITIONS MARKER PORT HOOK ANCHOR */}
      {/* Since edges render within a single global SVG container element viewport loop, 
          we inject our marker definitions frame here so all connection lines can share it */}
      <defs>
        <marker
          id="blackboard-arrow-marker"
          viewBox="0 0 10 10"
          refX="8" // Offsets the arrowhead center forward so it lines up perfectly on the target node ports
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          {/* Strict geometric sharp polygon arrow structure triangle head pointer */}
          <polygon
            points="0,1.5 10,5 0,8.5 2,5"
            fill={selected ? ACCENT_COLOR : DISCONNECTED_COLOR}
            className="transition-colors duration-100 ease-in-out"
          />
        </marker>
      </defs>
    </>
  );
}
