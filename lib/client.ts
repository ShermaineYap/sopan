"use client";
import { useEffect, useState } from "react";
import { canvasToBlob } from "./vision";

export interface Status { live: boolean; units?: number; reserve?: number; reader?: string; reason?: string }

let cached: Promise<Status> | null = null;
export function useStatus(): Status | null {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/status").then((r) => r.json()).catch(() => ({ live: false }));
    cached.then(setS);
  }, []);
  return s;
}

export interface TryOnResult { url: string; refFileId?: string; seconds: number; units: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pollTask(feature: string, taskId: string, maxS = 120): Promise<any> {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxS) {
    await sleep(2500);
    const r = await fetch(`/api/task?feature=${feature}&id=${encodeURIComponent(taskId)}`).then((x) => x.json());
    if (r.status === "success") return r;
    if (r.status === "error") throw new Error(r.error ? `YouCam: ${r.error}` : "YouCam task failed");
  }
  throw new Error("Timed out waiting for YouCam");
}

export async function runTryOn(person: HTMLCanvasElement, opts: { garment?: HTMLCanvasElement; refFileId?: string; category: string }): Promise<TryOnResult> {
  const t0 = Date.now();
  const fd = new FormData();
  fd.append("person", await canvasToBlob(person), "person.jpg");
  if (opts.refFileId) fd.append("ref_file_id", opts.refFileId);
  else if (opts.garment) fd.append("garment", await canvasToBlob(opts.garment), "garment.jpg");
  fd.append("category", opts.category);
  const res = await fetch("/api/tryon", { method: "POST", body: fd });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error ?? "Try-on failed"), { code: body.code });
  const done = await pollTask("cloth-v4", body.taskId);
  return { url: proxied(done.url), refFileId: body.refFileId, seconds: Math.round((Date.now() - t0) / 100) / 10, units: body.units };
}

export async function measureSkin(person: HTMLCanvasElement): Promise<{ skin: string; units: number } | null> {
  const fd = new FormData();
  fd.append("person", await canvasToBlob(person), "face.jpg");
  const res = await fetch("/api/skintone", { method: "POST", body: fd });
  if (!res.ok) return null;
  const { taskId, units } = await res.json();
  const done = await pollTask("skin-tone-analysis", taskId, 60);
  const color = done.results?.color ?? done.results?.[0]?.color;
  return color?.skin_color ? { skin: color.skin_color, units } : null;
}

// YouCam result URLs are served through our proxy so the browser can analyse the pixels (CORS)
export const proxied = (url: string) => `/api/image?u=${encodeURIComponent(url)}`;

// share links carry the listing in the URL (no database needed)
export interface SharedListing { t: string; d: string; p?: string; r?: string; g?: string }
export const encodeListing = (l: SharedListing) => btoa(unescape(encodeURIComponent(JSON.stringify(l)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const decodeListing = (s: string): SharedListing | null => {
  try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return null; }
};
