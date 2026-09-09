export const MAX_DRAWING_BYTES = 20 * 1024 * 1024;
export interface DrawingObject { bytes: number; versionId: string; contentType?: string }
export interface DrawingStorage {
  createUpload(key: string, expiresInSeconds: number): Promise<{ url: string; headers: { "Content-Type": "image/png" } }>;
  inspect(key: string, versionId?: string): Promise<DrawingObject>;
  read(key: string, versionId?: string): AsyncIterable<Uint8Array>;
  createDownload(key: string, versionId: string, expiresInSeconds: number): Promise<string>;
  /** Only called for an expired, intent-owned, unreferenced quarantine key. */
  deleteQuarantine(key: string): Promise<void>;
}
export interface DrawingScanner { scan(bytes: Buffer): Promise<"clean" | "infected" | "unavailable"> }
export function isPinnedVersion(value: string | undefined): value is string { return !!value?.trim() && value !== "null"; }
