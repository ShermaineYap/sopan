// The Sopan agent's listing reader. Uses Gemini (structured output) when a key is
// configured, otherwise the deterministic English/Malay rule parser. Either way the
// coverage verdict and engine policy are deterministic and explained step by step.
import "server-only";
import { chooseGarmentCategory, coverageVerdict, parseListing, type ListingAttrs } from "./coverage";

export interface TraceStep { tool: string; detail: string; ms: number; units: number }

const ENUMS = {
  category: ["dress", "abaya", "baju_kurung", "top", "bottom", "outerwear", "unknown"],
  sleeve: ["long", "three_quarter", "short", "sleeveless", "unknown"],
  hem: ["ankle", "midi", "knee", "above_knee", "unknown"],
  neckline: ["high", "round", "v", "low", "unknown"],
  opacity: ["opaque", "lined", "sheer", "unknown"],
};

async function geminiParse(title: string, description: string): Promise<ListingAttrs | null> {
  const k = process.env.GEMINI_API_KEY;
  if (!k) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const schema = {
    type: "OBJECT",
    properties: {
      ...Object.fromEntries(Object.entries(ENUMS).map(([f, e]) => [f, { type: "STRING", enum: e }])),
      fabric: { type: "STRING", nullable: true },
      evidence: { type: "OBJECT", properties: Object.fromEntries(Object.keys(ENUMS).map((f) => [f, { type: "STRING" }])) },
    },
    required: [...Object.keys(ENUMS), "evidence"],
  };
  const prompt = `You read Malaysian fashion listings (English, Malay or mixed) for a modest-fashion try-on tool.
Extract garment attributes. Use "unknown" when the listing does not say. For each attribute, put in "evidence" the exact short phrase from the listing that decided it (or "" if unknown). Never guess sheerness from the fabric name alone.

TITLE: ${title}
DESCRIPTION: ${description}`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": k },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text);
    const evidence = Object.fromEntries(Object.entries(parsed.evidence ?? {}).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>;
    return { ...parsed, fabric: parsed.fabric ?? null, evidence };
  } catch {
    return null;
  }
}

export async function readListing(title: string, description: string) {
  const trace: TraceStep[] = [];
  let t = Date.now();
  const llm = await geminiParse(title, description);
  const attrs = llm ?? parseListing(title, description);
  trace.push({
    tool: llm ? "read_listing (Gemini, structured output)" : "read_listing (EN/BM rule parser)",
    detail: `${attrs.category} · sleeve ${attrs.sleeve} · hem ${attrs.hem} · neck ${attrs.neckline} · ${attrs.opacity}${attrs.fabric ? ` · ${attrs.fabric}` : ""}`,
    ms: Date.now() - t, units: 0,
  });
  t = Date.now();
  const coverage = coverageVerdict(attrs);
  trace.push({ tool: "check_coverage", detail: `${coverage.verdict}: ${coverage.reasons.join("; ")}`, ms: Date.now() - t, units: 0 });
  const plan = chooseGarmentCategory(attrs);
  trace.push({ tool: "plan_render", detail: `garment_category=${plan.category} — ${plan.why}`, ms: 0, units: 0 });
  return { attrs, coverage, plan, trace, reader: llm ? "gemini" : "rules" };
}
