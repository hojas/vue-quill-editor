export type EdmUploadKind = 'image' | 'video' | 'file';

export interface EdmUploadResult {
  edmId: string;
  previewUrl?: string;
  downloadUrl?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}

export interface EdmEmbedValue {
  edmId: string;
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

export type EdmUploadHandler = (
  file: File,
  kind: EdmUploadKind,
) => Promise<EdmUploadResult>;

export type EdmUrlResolver = (
  edmId: string,
  kind: EdmUploadKind,
  file?: File | EdmUploadResult,
) => string | Promise<string>;

export interface EdmUploadEventPayload {
  file: File;
  kind: EdmUploadKind;
}

export interface EdmUploadSuccessPayload extends EdmUploadEventPayload {
  result: EdmUploadResult;
}

export interface EdmUploadErrorPayload extends EdmUploadEventPayload {
  error: unknown;
}
