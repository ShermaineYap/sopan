import { NextResponse } from "next/server";
import { getTask, type Feature } from "@/lib/youcam";

export const dynamic = "force-dynamic";
const OK = new Set<Feature>(["cloth-v4", "skin-tone-analysis", "shoes-transfer"]);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  const feature = (u.searchParams.get("feature") ?? "cloth-v4") as Feature;
  if (!id || !OK.has(feature)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    return NextResponse.json(await getTask(feature, id));
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message }, { status: 500 });
  }
}
