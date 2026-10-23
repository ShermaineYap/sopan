import type { Integrity } from "@/lib/vision";

const TEXT: Record<Integrity["verdict"], [string, string]> = {
  verified: ["Tudung", "kept"],
  tudung_changed: ["Tudung", "changed"],
  hair_exposed: ["Hair", "showing"],
  skin_exposed: ["Skin", "showing"],
  no_face: ["Not", "checked"],
};

export function Seal({ verdict }: { verdict: Integrity["verdict"] }) {
  const [a, b] = TEXT[verdict];
  const cls = verdict === "verified" ? "" : verdict === "hair_exposed" ? "bad" : "warn";
  return (
    <div className={`seal stamp ${cls}`} role="img" aria-label={`Integrity check: ${a} ${b}`}>
      <span>{a}<span className="big">{b}</span></span>
    </div>
  );
}

export function verdictText(i: Integrity): string {
  switch (i.verdict) {
    case "verified": return "Your tudung came through unchanged and no hair is showing.";
    case "tudung_changed": return "The try-on changed your tudung's colour or shape. The outfit preview is still usable; the tudung is not yours.";
    case "skin_exposed": return "Your tudung came through, but the outfit shows arms or neck that your photo didn\u2019t. You\u2019d need a layer underneath.";
    case "hair_exposed": return "The try-on removed or shifted your tudung and hair is showing. Sopan hides this image.";
    default: return "No face found, so the tudung check could not run.";
  }
}
