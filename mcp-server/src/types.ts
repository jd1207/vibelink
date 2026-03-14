export type ComponentType =
  | "decision_table"
  | "form"
  | "code_viewer"
  | "chart"
  | "markdown"
  | "image_gallery"
  | "progress"
  | "tree_view";

export interface UiComponent {
  id: string;
  type: ComponentType;
  [key: string]: unknown;
}

export interface IpcMessage {
  type: string;
  [key: string]: unknown;
}
