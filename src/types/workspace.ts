export type WorkspaceObjectType =
  | "card"
  | "compact"
  | "frame"
  | "assetPipeline"
  | "imageCard"
  | "timeline"
  | "textBlock";

export interface WorkspaceObject {
  id: string;

  type: WorkspaceObjectType;

  title: string;

  x: number;
  y: number;

  width?: number;
  height?: number;

  zIndex?: number;

  content?: string;

  previewUrl?: string | null;

  status?: string;
  polycount?: string;
  fileFormat?: string;
  fileName?: string;
  filePath?: string;
  dueDate?: string;
  timelineTracks?: any[]; 
  timelineAnchorDate?: string;
  timelineScale?: "day" | "week" | "month" | "year";
  timelineZoom?: "Day" | "Week" | "Month";

  checklist?: Array<{
    id: string;
    text: string;
    done: boolean;
  }>;
}