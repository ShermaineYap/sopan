"use client";
import { useStatus } from "@/lib/client";

export function ModeBadge() {
  const s = useStatus();
  if (!s) return <span className="mode">Checking…</span>;
  return s.live
    ? <span className="mode live" title={`${s.units} YouCam units left (reserve ${s.reserve})`}>Live · YouCam API</span>
    : <span className="mode" title="Showing real YouCam renders made earlier, so no API units are spent">Demo results</span>;
}
