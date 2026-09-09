import { handleBackendApiRequest } from "@/lib/backend-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleBackendApiRequest;
export const POST = handleBackendApiRequest;
export const PUT = handleBackendApiRequest;
