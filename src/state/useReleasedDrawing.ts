"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FigureDetail } from "@/types/catalog";

export async function fetchReleasedDrawing(path: string): Promise<Blob> {
  if (!/^\/api\/v1\/catalog\/figures\/[0-9a-f-]+\/drawing\?releaseId=[0-9a-f-]+$/i.test(path)) throw new Error("Drawing identity unavailable");
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "follow" });
  if (response.status === 409) throw new Error("RELEASE_CHANGED");
  if (!response.ok || !/^image\/(png|jpeg)(;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("Drawing unavailable");
  return response.blob();
}

/** Blob URLs keep metadata and all normal/fullscreen/crop views on the exact fetched bytes. */
export function useReleasedDrawing(detail: FigureDetail) {
  const router = useRouter();
  const path = detail.drawing?.storagePath;
  const api = Boolean(detail.release);
  const [resolved, setResolved] = useState<{ path: string; src?: string; error?: string } | null>(null);
  const retries = useRef(0);
  useEffect(() => {
    if (!api || !path) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    void fetchReleasedDrawing(path).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ path, src: objectUrl });
    }).catch(error => {
      if (cancelled) return;
      if (error instanceof Error && error.message === "RELEASE_CHANGED" && retries.current++ < 1) { router.refresh(); }
      setResolved({ path, error: "Drawing unavailable or release changed. Refresh the catalogue to retry." });
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, path, router]);
  return api ? { src: resolved && resolved.path === path ? resolved.src : undefined, error: resolved && resolved.path === path ? resolved.error : undefined } : { src: path };
}
