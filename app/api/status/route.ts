import { NextResponse } from "next/server";
import { credits, liveConfigured, RESERVE_UNITS } from "@/lib/youcam";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!liveConfigured()) return NextResponse.json({ live: false, reason: "not_configured" });
  try {
    const units = await credits();
    return NextResponse.json({ live: units > RESERVE_UNITS, units, reserve: RESERVE_UNITS, reader: process.env.GEMINI_API_KEY ? "gemini" : "rules" });
  } catch (e: any) {
    return NextResponse.json({ live: false, reason: e.message });
  }
}
