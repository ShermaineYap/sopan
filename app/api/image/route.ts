// Same-origin proxy for YouCam result images (their download URLs expire after ~2h and
// are not CORS-enabled, so the on-device integrity check could not read the pixels).
import { NextResponse } from "next/server";

const ALLOWED = [/\.makeupar\.com$/, /\.perfectcorp\.com$/, /\.amazonaws\.com$/, /\.cloudfront\.net$/, /\.youcam\w*\.com$/];

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u");
  if (!raw) return NextResponse.json({ error: "missing u" }, { status: 400 });
  let u: URL;
  try { u = new URL(raw); } catch { return NextResponse.json({ error: "bad url" }, { status: 400 }); }
  if (u.protocol !== "https:" || !ALLOWED.some((r) => r.test(u.hostname)))
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: `upstream ${r.status}` }, { status: 502 });
  return new NextResponse(r.body, {
    headers: { "Content-Type": r.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
