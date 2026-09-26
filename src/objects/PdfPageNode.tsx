import { NodeProps, useReactFlow } from "reactflow";
import { Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspaceStore";

interface PdfPageData {
  label?: string;
  previewUrl?: string;
  width?: number;
  height?: number;
  pageNumber?: number;
  pageCount?: number;
  sourceFileName?: string;
}

export default function PdfPageNode({
  id,
  data,
  selected,
}: NodeProps<PdfPageData>) {
  const { setNodes } = useReactFlow();
  const deleteObject = useWorkspaceStore(
    (state) => state.deleteObject
  );
  const objects = useWorkspaceStore(
    (state) => state.objects
  );

  const currentObject = objects.find(
    (object) => object.id === id
  );

  const previewUrl =
    currentObject?.previewUrl ||
    data.previewUrl;

  const width =
    currentObject?.width ||
    data.width ||
    900;

  const height =
    currentObject?.height ||
    data.height ||
    1200;

  const pageNumber =
    currentObject?.pageNumber ||
    data.pageNumber ||
    1;

  const pageCount =
    currentObject?.pageCount ||
    data.pageCount;

  const fileName =
    currentObject?.sourceFileName ||
    data.sourceFileName ||
    "PDF";

  const handleDelete = (
    event: React.MouseEvent
  ) => {
    event.preventDefault();
    event.stopPropagation();

    deleteObject(id);

    setNodes((nodes) =>
      nodes.filter((node) => node.id !== id)
    );
  };

  return (
    <div
      className="relative group select-none"
      style={{
        width,
        height,
        background: "#ffffff",
        boxShadow: selected
          ? "0 0 0 2px var(--color-accent), 0 16px 40px rgba(0,0,0,.28)"
          : "0 10px 30px rgba(0,0,0,.20)",
      }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={`${fileName}, page ${pageNumber}`}
          draggable={false}
          className="w-full h-full object-contain pointer-events-none select-none"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-black/40 bg-white">
          PDF page unavailable
        </div>
      )}

      <div className="nodrag absolute top-3 left-3 rounded-md bg-black/70 text-white px-2 py-1 text-[10px] font-mono shadow-md backdrop-blur-sm pointer-events-none">
        Page {pageNumber}
        {pageCount ? ` / ${pageCount}` : ""}
      </div>

      <button
        type="button"
        onClick={handleDelete}
        className={`nodrag absolute top-3 right-3 p-1.5 rounded-lg bg-black/70 text-white/70 hover:text-rose-400 transition-opacity z-50 shadow-md border border-white/10 cursor-pointer ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        title="Remove PDF page"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
