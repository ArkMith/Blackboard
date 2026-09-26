import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, Plus, X } from "lucide-react";
import type { WorkspaceMetadata } from "../stores/workspaceStore";

interface PdfOpenDialogProps {
  fileName: string;
  workspaces: WorkspaceMetadata[];
  isLoading?: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (name: string) => void;
  onCancel: () => void;
}

export default function PdfOpenDialog({
  fileName,
  workspaces,
  isLoading = false,
  onSelectWorkspace,
  onCreateWorkspace,
  onCancel,
}: PdfOpenDialogProps) {
  const baseName = useMemo(
    () => fileName.replace(/\.pdf$/i, "").trim() || "PDF Workspace",
    [fileName]
  );

  const [newWorkspaceName, setNewWorkspaceName] = useState(baseName);

  useEffect(() => {
    setNewWorkspaceName(baseName);
  }, [baseName]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#1a1410] text-[#f4e8dc] shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/15 text-[var(--color-accent)] flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-sm">Open PDF in Blackboard</h2>
              <p className="text-[11px] text-white/45 truncate mt-0.5" title={fileName}>
                {fileName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-xs font-semibold">Use an existing workspace</div>
            <div className="text-[11px] text-white/40 mt-1">
              The PDF pages will be added as a vertical document stack without removing your existing work.
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {workspaces.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-[11px] text-white/35">
                You don't have any premade workspaces yet.
              </div>
            ) : (
              workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onSelectWorkspace(workspace.id)}
                  className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 px-3.5 py-3 transition-colors disabled:opacity-50"
                >
                  <div className="font-semibold text-xs truncate">{workspace.name || "Untitled Workspace"}</div>
                  <div className="text-[10px] text-white/35 mt-0.5">
                    {workspace.updatedAt
                      ? `Edited ${new Date(workspace.updatedAt).toLocaleDateString()}`
                      : "Local workspace"}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-white/10 pt-5">
            <div className="flex items-center gap-2 mb-2">
              <Plus size={14} className="text-[var(--color-accent)]" />
              <div className="text-xs font-semibold">Make a new workspace</div>
            </div>

            <div className="flex gap-2">
              <input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newWorkspaceName.trim()) {
                    onCreateWorkspace(newWorkspaceName.trim());
                  }
                }}
                disabled={isLoading}
                className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none focus:border-[var(--color-accent)]/60 disabled:opacity-50"
                placeholder="Workspace name"
              />
              <button
                type="button"
                disabled={isLoading || !newWorkspaceName.trim()}
                onClick={() => onCreateWorkspace(newWorkspaceName.trim())}
                className="px-3.5 rounded-xl bg-[var(--color-accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {isLoading ? "Opening…" : "Create"}
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-white/10 flex justify-between items-center text-[10px] text-white/30">
          <span className="flex items-center gap-1.5">
            <FolderOpen size={11} />
            Pages remain part of this local workspace.
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="text-white/45 hover:text-white transition-colors disabled:opacity-30"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
