// YouCam AI Facial Color Tones Analyzer (20 units): measured skin / eye / lip colour.
import { NextResponse } from "next/server";
import { allowLive, createTask, credits, liveConfigured, RESERVE_UNITS, upload } from "@/lib/youcam";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!liveConfigured()) return NextResponse.json({ error: "demo", code: "demo" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowLive(ip)) return NextResponse.json({ error: "limit", code: "limit" }, { status: 429 });
  try {
    if ((await credits()) <= RESERVE_UNITS + 20) return NextResponse.json({ error: "reserve", code: "reserve" }, { status: 402 });
    const form = await req.formData();
    const person = form.get("person") as File | null;
    if (!person) return NextResponse.json({ error: "Missing photo" }, { status: 400 });
    const srcId = await upload(await person.arrayBuffer(), "image/jpeg", "face.jpg");
    const taskId = await createTask("skin-tone-analysis", { src_file_id: srcId, face_angle_strictness_level: "flexible" });
    return NextResponse.json({ taskId, units: 20 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
