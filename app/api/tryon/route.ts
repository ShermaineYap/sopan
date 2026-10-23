// Create a YouCam Clothes VTO (cloth-v4) task. The browser sends the shopper photo and
// either the head-masked garment reference image or a previously uploaded ref_file_id.
import { NextResponse } from "next/server";
import { allowLive, createTask, credits, liveConfigured, RESERVE_UNITS, upload, YouCamError } from "@/lib/youcam";

export const maxDuration = 30;

const CATS = new Set(["full_body", "auto", "upper_body", "lower_body"]);

export async function POST(req: Request) {
  if (!liveConfigured()) return NextResponse.json({ error: "Live mode off — showing demo results", code: "demo" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowLive(ip)) return NextResponse.json({ error: "Daily live try-on limit reached for this device — demo results still work", code: "limit" }, { status: 429 });
  try {
    if ((await credits()) <= RESERVE_UNITS)
      return NextResponse.json({ error: "API unit reserve reached — switching to demo results", code: "reserve" }, { status: 402 });
    const form = await req.formData();
    const person = form.get("person") as File | null;
    const garment = form.get("garment") as File | null;
    let refId = (form.get("ref_file_id") as string | null) || null;
    const category = String(form.get("category") ?? "full_body");
    if (!person) return NextResponse.json({ error: "Missing shopper photo" }, { status: 400 });
    if (!CATS.has(category)) return NextResponse.json({ error: "Bad category" }, { status: 400 });
    const srcId = await upload(await person.arrayBuffer(), "image/jpeg", "shopper.jpg");
    if (!refId) {
      if (!garment) return NextResponse.json({ error: "Missing garment reference" }, { status: 400 });
      refId = await upload(await garment.arrayBuffer(), "image/jpeg", "garment.jpg");
    }
    const taskId = await createTask("cloth-v4", { src_file_id: srcId, ref_file_id: refId, garment_category: category, filter_multi_person: "off" });
    return NextResponse.json({ taskId, refFileId: refId, units: 2 });
  } catch (e: any) {
    const status = e instanceof YouCamError ? e.status : 500;
    return NextResponse.json({ error: e.message ?? "Try-on failed" }, { status });
  }
}
