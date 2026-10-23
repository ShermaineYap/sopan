// Server-only YouCam API client. The API key never reaches the browser.
import "server-only";

const BASE = process.env.YOUCAM_BASE_URL ?? "https://yce-api-01.makeupar.com";

export class YouCamError extends Error {
  constructor(message: string, public status = 500, public code?: string) { super(message); }
}

function key(): string {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new YouCamError("Live mode is not configured (no YOUCAM_API_KEY)", 503, "not_configured");
  return k;
}

export const liveConfigured = () => Boolean(process.env.YOUCAM_API_KEY);
export const RESERVE_UNITS = Number(process.env.SOPAN_RESERVE_UNITS ?? 150);

function headers() {
  return { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" };
}

async function json(res: Response) {
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) throw new YouCamError(body?.error ?? body?.message ?? `YouCam HTTP ${res.status}`, res.status, body?.error_code);
  return body;
}

export async function credits(): Promise<number> {
  const body = await json(await fetch(`${BASE}/s2s/v1.0/client/credit`, { headers: headers(), cache: "no-store" }));
  return (body.results ?? []).filter((b: any) => String(b.type ?? "").startsWith("Api"))
    .reduce((s: number, b: any) => s + (b.amount ?? 0), 0);
}

export async function upload(buf: ArrayBuffer, contentType: string, name: string): Promise<string> {
  const meta = await json(await fetch(`${BASE}/s2s/v2.0/file`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ files: [{ content_type: contentType, file_name: name, file_size: buf.byteLength }] }),
  }));
  const info = meta.data.files[0];
  const req = info.requests[0];
  const put = await fetch(req.url, { method: "PUT", headers: req.headers ?? { "Content-Type": contentType }, body: buf });
  if (!put.ok) throw new YouCamError(`Upload failed (${put.status})`, 502);
  return info.file_id as string;
}

export type Feature = "cloth-v4" | "skin-tone-analysis" | "shoes-transfer";

export async function createTask(feature: Feature, body: Record<string, unknown>): Promise<string> {
  const res = await json(await fetch(`${BASE}/s2s/v2.0/task/${feature}`, { method: "POST", headers: headers(), body: JSON.stringify(body) }));
  return res.data.task_id as string;
}

export interface TaskState { status: "running" | "success" | "error"; url?: string; error?: string; results?: any; pollMs?: number }

export async function getTask(feature: Feature, taskId: string): Promise<TaskState> {
  const res = await json(await fetch(`${BASE}/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`, { headers: headers(), cache: "no-store" }));
  const d = res.data ?? {};
  const status = d.task_status === "success" || d.task_status === "error" ? d.task_status : "running";
  const r = Array.isArray(d.results) ? d.results[0] : d.results;
  return { status, url: r?.url, error: d.error ?? d.error_message, results: d.results, pollMs: d.polling_interval };
}

// ---- very small abuse guard for the public test link ----
const hits = new Map<string, { n: number; day: string }>();
export function allowLive(ip: string, limit = Number(process.env.SOPAN_LIVE_LIMIT ?? 12)): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const h = hits.get(ip);
  if (!h || h.day !== day) { hits.set(ip, { n: 1, day }); return true; }
  if (h.n >= limit) return false;
  h.n += 1;
  return true;
}
