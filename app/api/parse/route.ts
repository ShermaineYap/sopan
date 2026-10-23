import { NextResponse } from "next/server";
import { readListing } from "@/lib/agent";

export async function POST(req: Request) {
  const { title = "", description = "" } = await req.json().catch(() => ({}));
  if (!title && !description) return NextResponse.json({ error: "Paste a listing title or description" }, { status: 400 });
  return NextResponse.json(await readListing(String(title).slice(0, 300), String(description).slice(0, 4000)));
}
