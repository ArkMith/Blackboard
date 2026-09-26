import { readFile } from "@tauri-apps/plugin-fs";
import * as pdfjsLib from "pdfjs-dist";
import type { WorkspaceObject } from "../types/workspace";

/*
 * PDF.js uses a worker for parsing/rendering. Vite can bundle the worker
 * as a separate asset when it is referenced this way.
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export interface RenderedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  previewUrl: string;
}

export interface PdfDocumentResult {
  fileName: string;
  sourceFilePath?: string;
  pageCount: number;
  pages: RenderedPdfPage[];
}

function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, "").trim() || "Untitled PDF";
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const last = normalized.split("/").pop() || "Untitled.pdf";
  return last;
}

/**
 * Read a PDF from a native path on desktop.
 * The path is allowed by the Rust file-association handler before this runs.
 */
export async function readPdfFile(path: string): Promise<Uint8Array> {
  return await readFile(path);
}

/**
 * Render every PDF page into a self-contained image.
 *
 * Blackboard stores each page as its own pdfPage object. This makes the
 * document behave like a collection of board objects: pages can be moved,
 * annotated, selected, and saved with the workspace.
 */
export async function renderPdfPages(
  bytes: Uint8Array,
  options?: {
    sourceFilePath?: string;
    fileName?: string;
    targetWidth?: number;
    maxScale?: number;
  }
): Promise<PdfDocumentResult> {
  const fileName =
    options?.fileName ||
    (options?.sourceFilePath
      ? fileNameFromPath(options.sourceFilePath)
      : "Untitled.pdf");

  const targetWidth = options?.targetWidth ?? 900;
  const maxScale = options?.maxScale ?? 1.5;

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
  });

  const pdf = await loadingTask.promise;
  const pages: RenderedPdfPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);

    const baseViewport = page.getViewport({ scale: 1 });

    const scale = Math.min(
      maxScale,
      targetWidth / baseViewport.width
    );

    const viewport = page.getViewport({
      scale,
    });

    const outputScale =
      typeof window !== "undefined"
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      throw new Error(`Could not create a canvas for PDF page ${pageNumber}.`);
    }

    canvas.width = Math.floor(
      viewport.width * outputScale
    );

    canvas.height = Math.floor(
      viewport.height * outputScale
    );

    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    context.fillStyle = "#ffffff";
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    await page.render({
      canvasContext: context,
      viewport,
      transform:
        outputScale !== 1
          ? [outputScale, 0, 0, outputScale, 0, 0]
          : undefined,
      background: "#ffffff",
    }).promise;

    pages.push({
      pageNumber,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      previewUrl: canvas.toDataURL("image/png"),
    });

    canvas.width = 1;
    canvas.height = 1;
  }

  return {
    fileName,
    sourceFilePath: options?.sourceFilePath,
    pageCount: pdf.numPages,
    pages,
  };
}

/**
 * Convert rendered PDF pages into Blackboard workspace objects.
 * Pages are placed vertically, with enough spacing to feel like a document
 * viewer while still living on the infinite canvas.
 */
export function buildPdfPageObjects(
  result: PdfDocumentResult,
  existingObjects: WorkspaceObject[] = [],
  origin?: { x: number; y: number }
): WorkspaceObject[] {
  const gap = 48;

  let startX = origin?.x ?? 0;
  let startY = origin?.y ?? 0;

  if (!origin && existingObjects.length > 0) {
    const maxBottom = existingObjects.reduce(
      (max, object) =>
        Math.max(
          max,
          object.y + (object.height ?? 180)
        ),
      0
    );

    startY = maxBottom + gap;
  }

  let y = startY;

  return result.pages.map((page) => {
    const object: WorkspaceObject = {
      id: crypto.randomUUID(),
      type: "pdfPage",
      title: `${stripPdfExtension(result.fileName)} — Page ${page.pageNumber}`,
      x: startX,
      y,
      width: page.width,
      height: page.height,
      previewUrl: page.previewUrl,
      sourceFilePath: result.sourceFilePath,
      sourceFileName: result.fileName,
      pageNumber: page.pageNumber,
      pageCount: result.pageCount,
      fileFormat: "PDF",
      fileName: result.fileName,
      filePath: result.sourceFilePath,
    };

    y += page.height + gap;

    return object;
  });
}
