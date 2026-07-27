import { useState, useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import {
  Plus,
  MoreHorizontal,
  Upload,
  FolderOpen,
  Trash2,
  X,
  HardDrive,
  Moon,
  Sun,
  Settings,
  ChevronDown,
  HelpCircle,
  Map,
  Grid,
  User
} from "lucide-react";
import { ARK_EXTENSION } from "../utils/arkPackage";
import { loadAppSettings, saveAppSettings } from "../utils/localStore";
import blackboardLogo from "../assets/brand/blackboard-logo.png";
import redpandaLogo from "../assets/brand/redpanda-logo.png";

const APP_VERSION = "1.0.0";

export default function DashboardMainMenu({
  onEnterWorkspace,
}: {
  onEnterWorkspace: () => void;
}) {
  const store = useWorkspaceStore();

  const [activeCardMenuId, setActiveCardMenuId] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [importing, setImporting] = useState(false);

  // Default follows the system preference until saved settings load in.
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const [isDarkMode, setIsDarkMode] = useState(prefersDark ?? true);

  // Additional settings mirrors for unified UX
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [showBg, setShowBg] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    store.loadWorkspacesMenu();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSavedSettings = async () => {
      const saved = await loadAppSettings();
      if (cancelled) return;

      setIsDarkMode(saved.isDarkMode);
      setShowMiniMap(saved.showMiniMap);
      setShowBg(saved.showBg);
      setSettingsLoaded(true);
    };

    loadSavedSettings().catch((err) => {
      console.warn("[Dashboard] Failed to load saved UI settings:", err);
      if (!cancelled) setSettingsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    saveAppSettings({
      isDarkMode,
      showMiniMap,
      showBg,
    }).catch((err) => {
      console.error("[Dashboard] Failed to persist UI settings:", err);
    });
  }, [settingsLoaded, isDarkMode, showMiniMap, showBg]);

  // Drive the global theme (CSS variable matrix in index.css) from this toggle,
  // so the whole app -- not just this screen -- responds to light/dark.
  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;

    await store.createWorkspace(newBoardName.trim());
    setNewBoardName("");
    setIsCreateModalOpen(false);
    onEnterWorkspace();
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const success = await store.importWorkspace();
      if (success) {
        onEnterWorkspace();
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSelectWorkspace = async (id: string) => {
    await store.switchWorkspace(id);
    onEnterWorkspace();
  };

  return (
    <div
      onClick={() => {
        setIsProfileMenuOpen(false);
        setActiveCardMenuId(null);
      }}
      className={`min-h-screen w-full font-body flex flex-col antialiased select-none transition-colors duration-200 ${
        isDarkMode ? "bg-[#0f0d0b] text-[#f4e8dc]" : "bg-[#fcfaf7] text-[#2a2421]"
      }`}
    >
      {/* Top Header Bar */}
      <header
        className={`h-16 px-6 flex items-center justify-between border-b transition-colors ${
          isDarkMode ? "border-white/10 bg-[#1a1410]/60" : "border-black/10 bg-white/60"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <img src={blackboardLogo} alt="Blackboard" className="w-8 h-8 rounded-lg" />
          <div className="font-display text-base font-bold tracking-tight flex items-baseline gap-1.5">
            <span>Blackboard</span>
            <span className={`text-[10px] font-mono font-medium ${isDarkMode ? "text-white/40" : "text-black/40"}`}>
              v{APP_VERSION}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Import Package Button */}
          <button
            onClick={handleImport}
            disabled={importing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
              isDarkMode
                ? "bg-[#1a1410] border-white/10 text-[#f4e8dc] hover:bg-[#231a13]"
                : "bg-white border-black/10 text-[#2a2421] hover:bg-[#f7f3ed]"
            }`}
            title={`Import .${ARK_EXTENSION} package`}
          >
            <Upload size={14} />
            <span>{importing ? "Importing..." : `Import .${ARK_EXTENSION}`}</span>
          </button>

          {/* Unified Profile & Settings Trigger */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileMenuOpen(!isProfileMenuOpen);
              }}
              className={`flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full border transition-all cursor-pointer ${
                isDarkMode
                  ? "bg-[#1a1410] border-white/10 hover:border-white/25 text-[#f4e8dc]"
                  : "bg-white border-black/10 hover:border-black/25 text-[#2a2421]"
              }`}
            >
              <div className="w-7 h-7 rounded-full p-0.5 shadow-xs flex items-center justify-center overflow-hidden">
                {isDarkMode ? (<Moon size={16} className="text-[#f38b6d]" />) : (<Sun size={16} className="text-[#d46a43]" />)}
              </div>
              <span className="text-xs font-semibold">Theme</span>
              <ChevronDown size={13} className="opacity-60" />
            </button>

            {/* Profile & Settings Combined Dropdown */}
            {isProfileMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-full mt-2 w-64 rounded-2xl border shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 ${
                  isDarkMode
                    ? "bg-[#1a1410] border-white/10 text-[#f4e8dc]"
                    : "bg-white border-black/10 text-[#2a2421]"
                }`}
              >
                {/* User Info Header */}
                <div className={`px-3.5 py-2 border-b flex items-center gap-2.5 ${isDarkMode ? "border-white/10" : "border-black/10"}`}>
                  <div className="w-8 h-8 rounded-full overflow-hidden shadow-inner shrink-0">
                    <User size={20} className="text-[#d46a43]" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-semibold truncate">Hello There</div>
                    <div className={`text-[10px] ${isDarkMode ? "text-white/40" : "text-black/40"}`}>
                      This section is for future local profiles & app features settings.
                    </div>
                  </div>
                </div>

                {/* Preferences Section */}
                <div className="py-1">
                  <div className={`px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mt-1 ${isDarkMode ? "text-white/40" : "text-black/40"}`}>
                    <Settings size={10} /> Essential Preferences
                  </div>

                  {/* Theme Switcher Toggle */}
                  <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={`w-full text-left px-3.5 py-2 flex items-center justify-between transition-colors cursor-pointer ${isDarkMode ? "hover:bg-white/5" : "hover:bg-black/5"}`}
                  >
                    <span className="flex items-center gap-2">
                      {isDarkMode ? <Moon size={13} className="text-[#f38b6d]" /> : <Sun size={13} className="text-[#d46a43]" />}
                      Dark Theme Mode
                    </span>
                    <div className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${isDarkMode ? "bg-[#d46a43] justify-end" : "bg-black/15 justify-start"}`}>
                      <div className="bg-white w-3 h-3 rounded-full shadow-md" />
                    </div>
                  </button>

                  <button
                    onClick={() => setShowMiniMap(!showMiniMap)}
                    className={`w-full text-left px-3.5 py-2 flex items-center justify-between transition-colors cursor-pointer ${isDarkMode ? "hover:bg-white/5" : "hover:bg-black/5"}`}
                  >
                    <span className="flex items-center gap-2">
                      <Map size={13} className="text-emerald-500" /> Canvas MiniMap
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${showMiniMap ? "bg-emerald-500/20 text-emerald-500" : isDarkMode ? "bg-white/10 text-white/40" : "bg-black/5 text-black/40"}`}>
                      {showMiniMap ? "ON" : "OFF"}
                    </span>
                  </button>

                  <button
                    onClick={() => setShowBg(!showBg)}
                    className={`w-full text-left px-3.5 py-2 flex items-center justify-between transition-colors cursor-pointer ${isDarkMode ? "hover:bg-white/5" : "hover:bg-black/5"}`}
                  >
                    <span className="flex items-center gap-2">
                      <Grid size={13} className="text-sky-500" /> Grid Background
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${showBg ? "bg-sky-500/20 text-sky-500" : isDarkMode ? "bg-white/10 text-white/40" : "bg-black/5 text-black/40"}`}>
                      {showBg ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>

                <div className={`my-1 border-t ${isDarkMode ? "border-white/10" : "border-black/10"}`} />

                {/* Management Section */}
                <div className="py-1">
                  <div className={`px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDarkMode ? "text-white/40" : "text-black/40"}`}>
                    <HardDrive size={10} /> Storage & System
                  </div>

                  <div className={`px-3.5 py-1.5 text-[11px] flex items-center gap-2 ${isDarkMode ? "text-white/50" : "text-black/50"}`}>
                    <HardDrive size={13} className="text-[#d46a43] shrink-0" />
                    <span>Saved locally to app disk / storage.</span>
                  </div>
                </div>

                <div className={`my-1 border-t ${isDarkMode ? "border-white/10" : "border-black/10"}`} />

                {/* Footer Utilities */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      alert(`Blackboard Workspace Engine v${APP_VERSION}, by Ark Mith. All changes are saved locally. Currently all workspaces are saved locally. You can share them using export/import from the menu. Also if you are wondering where the saves actually are, they are stored in your app's local storage. %APPDATA%/Roaming/com.arkmithlabs.blackboard`);
                      setIsProfileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-1.5 flex items-center gap-2 transition-colors cursor-pointer ${isDarkMode ? "hover:bg-white/5 text-white/50" : "hover:bg-black/5 text-black/50"}`}
                  >
                    <HelpCircle size={13} />
                    <span>About Workspace</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Board Grid */}
      <main className="flex-1 p-8 max-w-[1700px] w-full mx-auto relative">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-5 relative z-10">

          {/* New Blackboard Button Tile */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="group relative aspect-[16/10] bg-[#d46a43] hover:bg-[#c15c37] text-white rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col items-center justify-center gap-3 p-4 cursor-pointer overflow-hidden active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-full bg-white/20 group-hover:bg-white/30 flex items-center justify-center transition-colors">
              <Plus size={28} strokeWidth={2.5} className="text-white" />
            </div>
            <span className="font-display text-xs font-bold tracking-tight">New Blackboard</span>
          </button>

          {/* Local Boards List */}
          {store.workspacesList.map((ws) => {
            const isSelected = ws.id === store.currentWorkspaceId;

            return (
              <div
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws.id)}
                className={`group relative aspect-[16/10] rounded-2xl shadow-xs hover:shadow-md transition-all border flex flex-col overflow-hidden cursor-pointer ${
                  isDarkMode
                    ? "bg-[#1a1410] border-white/10 hover:border-white/20"
                    : "bg-white border-black/10 hover:border-black/20"
                } ${isSelected ? "ring-2 ring-[#d46a43] border-transparent" : ""}`}
              >
                {/* Thumbnail Preview Area */}
                <div className={`flex-1 relative overflow-hidden flex items-center justify-center ${isDarkMode ? "bg-[#0f0d0b]" : "bg-[#f7f3ed]"}`}>
                  {ws.thumbnail ? (
                    <img src={ws.thumbnail} alt={ws.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center gap-1 ${isDarkMode ? "text-white/30" : "text-black/30"}`}>
                      <HardDrive size={18} className="opacity-40" />
                      <span className="text-[9px] uppercase tracking-wider font-mono opacity-50">Local Board</span>
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div
                  className={`h-14 px-3.5 flex items-center justify-between border-t ${
                    isDarkMode ? "bg-[#1a1410] border-white/10" : "bg-white border-black/5"
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-xs font-bold truncate leading-snug">
                      {ws.name || "Untitled"}
                    </span>
                    <span className={`text-[10px] font-medium truncate mt-0.5 ${isDarkMode ? "text-white/40" : "text-black/40"}`}>
                      Edited: {ws.updatedAt ? new Date(ws.updatedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "Recently"}
                    </span>
                  </div>

                  {/* Actions Dropdown */}
                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCardMenuId(activeCardMenuId === ws.id ? null : ws.id);
                      }}
                      className={`p-1 rounded-md transition-colors ${
                        isDarkMode
                          ? "text-white/40 hover:text-white/80 hover:bg-white/10"
                          : "text-black/40 hover:text-black/80 hover:bg-black/5"
                      }`}
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {activeCardMenuId === ws.id && (
                      <div
                        className={`absolute right-0 bottom-full mb-2 w-36 rounded-xl shadow-xl py-1 z-20 text-xs font-medium border animate-in fade-in zoom-in-95 duration-100 ${
                          isDarkMode
                            ? "bg-[#1a1410] border-white/10 text-[#f4e8dc]"
                            : "bg-white border-black/10 text-[#2a2421]"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setActiveCardMenuId(null);
                            handleSelectWorkspace(ws.id);
                          }}
                          className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                            isDarkMode ? "hover:bg-white/5" : "hover:bg-black/5"
                          }`}
                        >
                          <FolderOpen size={13} />
                          <span>Open Board</span>
                        </button>
                        <button
                          onClick={async () => {
                            setActiveCardMenuId(null);
                            await store.deleteWorkspace(ws.id);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-rose-500/10 text-rose-500 flex items-center gap-2 transition-colors"
                        >
                          <Trash2 size={13} />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

        </div>
      </main>

      {/* New Board Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div
            className={`w-full max-w-sm rounded-2xl p-5 shadow-2xl border ${
              isDarkMode ? "bg-[#1a1410] border-white/10 text-[#f4e8dc]" : "bg-white border-black/10 text-[#2a2421]"
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDarkMode ? "border-white/10" : "border-black/10"}`}>
              <h3 className="font-display text-sm font-bold">Create New Blackboard</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className={`p-1 rounded-md transition-colors ${isDarkMode ? "text-white/40 hover:text-white/80" : "text-black/40 hover:text-black/80"}`}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateWorkspace} className="mt-4 flex flex-col gap-4">
              <div>
                <label className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${isDarkMode ? "text-white/40" : "text-black/40"}`}>
                  Board Title
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. System Architecture"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-xs outline-none transition-colors ${
                    isDarkMode
                      ? "bg-[#0f0d0b] border-white/10 text-white focus:border-[#d46a43]"
                      : "bg-white border-black/15 text-[#2a2421] focus:border-[#d46a43]"
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newBoardName.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#d46a43] hover:bg-[#c15c37] text-white disabled:opacity-50 transition-colors shadow-xs"
                >
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
