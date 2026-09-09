export class CatalogApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message = "The authenticated catalogue is unavailable. Please sign in or retry.") {
    super(message);
    this.name = "CatalogApiError";
  }
}
