export interface ArkbishopProjectFile {
  metadata: {
    formatVersion: "1.0.0";
    application: "Blackboard";
    createdWithVersion: string;
    lastSavedWithVersion: string;
    createdAt: string; // ISO 8601 string
    updatedAt: string;
  };
  // Project-specific settings saved with the document
  projectSettings: {
    theme: "dark" | "light" | "system";
    grid: {
      showGrid: boolean;
      snapToGrid: boolean;
      gridSize: number;
    };
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
    minimap: {
      visible: boolean;
    };
  };
  // Graph & canvas payload
  workspace: {
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      width?: number;
      height?: number;
      data: Record<string, unknown>; // Custom node data (e.g. text content, asset relative paths)
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
      data?: Record<string, unknown>;
    }>;
  };
  // Asset manifest map relative paths to metadata
  assets: Record<
    string,
    {
      id: string;
      originalName: string;
      relativePath: string; // e.g. "Assets/asset_a1b2c3d4.png"
      mimeType: string;
      size: number;
      hash: string;
    }
  >;
}