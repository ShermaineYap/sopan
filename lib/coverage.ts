// Listing parsing (English + Malay) and the modest-coverage verdict.
// Pure TypeScript: runs on the server, in the browser and in tests.

export type Sleeve = "long" | "three_quarter" | "short" | "sleeveless" | "unknown";
export type Hem = "ankle" | "midi" | "knee" | "above_knee" | "unknown";
export type Neck = "high" | "round" | "v" | "low" | "unknown";
export type Opacity = "opaque" | "lined" | "sheer" | "unknown";
export type Category = "dress" | "abaya" | "baju_kurung" | "top" | "bottom" | "outerwear" | "unknown";

export interface ListingAttrs {
  category: Category;
  sleeve: Sleeve;
  hem: Hem;
  neckline: Neck;
  opacity: Opacity;
  fabric: string | null;
  evidence: Record<string, string>; // attribute -> phrase that decided it
}

export interface CoverageProfile {
  sleeve: "long" | "three_quarter_ok";
  hem: "ankle" | "midi_ok";
  sheer: "block" | "allow_if_lined";
}

export const DEFAULT_PROFILE: CoverageProfile = { sleeve: "long", hem: "ankle", sheer: "allow_if_lined" };

export interface CoverageVerdict {
  verdict: "pass" | "pass_with_layer" | "fail" | "unknown";
  reasons: string[];
  suggestions: string[];
}

type Rule<T> = { value: T; patterns: RegExp[] };

const CATEGORY: Rule<Category>[] = [
  { value: "abaya", patterns: [/\babaya\b/i, /\bjubah\b/i, /\bkaftan\b/i, /\bjilbab\b/i] },
  { value: "baju_kurung", patterns: [/baju\s*kurung/i, /\bkurung\b/i, /kebaya/i, /\bpeplum\b.*\bkain\b/i] },
  { value: "dress", patterns: [/\bdress\b/i, /\bgown\b/i, /\bmaxi\b/i, /\bfrock\b/i] },
  { value: "outerwear", patterns: [/\bcardigan\b/i, /\bblazer\b/i, /\bjacket\b/i, /\bcoat\b/i, /\boutwear\b/i, /\boutlet?r\b/i] },
  { value: "bottom", patterns: [/\bskirt\b/i, /\bpants\b/i, /\btrousers?\b/i, /\bseluar\b/i, /\bkain\s+(sarung|batik|lipat|duyung|kembang|ela)\b/i, /\bculottes?\b/i] },
  { value: "top", patterns: [/\bblouse\b/i, /\btop\b/i, /\btunic\b/i, /\bkemeja\b/i, /\bshirt\b/i, /\bt-?shirt\b/i, /\bpeplum\b/i] },
];

const SLEEVE: Rule<Sleeve>[] = [
  { value: "sleeveless", patterns: [/sleeveless/i, /tanpa\s+lengan/i, /\btank\b/i, /\bstrap(less|py)?\b/i, /spaghetti/i, /\bhalter\b/i, /\bslip dress\b/i] },
  { value: "three_quarter", patterns: [/3\s*\/\s*4\s*sleeve/i, /three[-\s]quarter/i, /lengan\s*3\s*\/\s*4/i, /lengan\s+suku/i] },
  { value: "short", patterns: [/short[-\s]sleeve/i, /lengan\s+pendek/i, /cap\s+sleeve/i, /puff\s+sleeve/i] },
  { value: "long", patterns: [/long[-\s]sleeve/i, /lengan\s+panjang/i, /full\s+sleeve/i, /bishop\s+sleeve/i, /bell\s+sleeve/i, /wrist[-\s]length/i, /\bcuff(ed)?\b/i, /lengan\s+kembang/i] },
];

const HEM: Rule<Hem>[] = [
  { value: "above_knee", patterns: [/\bmini\b/i, /above\s+(the\s+)?knee/i, /atas\s+lutut/i] },
  { value: "knee", patterns: [/knee[-\s]length/i, /paras\s+lutut/i] },
  { value: "midi", patterns: [/\bmidi\b/i, /mid[-\s]calf/i, /\btea[-\s]length/i, /paras\s+betis/i] },
  { value: "ankle", patterns: [/\bmaxi\b/i, /ankle/i, /floor[-\s]length/i, /full[-\s]length/i, /\blabuh\b/i, /buku\s+lali/i, /paras\s+kaki/i] },
];

const NECK: Rule<Neck>[] = [
  { value: "low", patterns: [/plunge/i, /deep\s+v/i, /low[-\s]cut/i, /sweetheart/i, /off[-\s]shoulder/i, /square\s+neck/i] },
  { value: "v", patterns: [/v[-\s]neck/i, /leher\s+v/i] },
  { value: "high", patterns: [/high\s+neck/i, /turtle\s*neck/i, /mock\s+neck/i, /mandarin/i, /leher\s+tinggi/i, /cekak\s+musang/i] },
  { value: "round", patterns: [/round\s+neck/i, /crew\s+neck/i, /leher\s+bulat/i, /teluk\s+belanga/i] },
];

const OPACITY: Rule<Opacity>[] = [
  { value: "lined", patterns: [/\blined\b/i, /with\s+lining/i, /ber\s*lapik/i, /\blapik\b/i, /fully\s+lined/i, /inner\s+(included|attached)/i] },
  // negated forms first: "tak jarang" / "not see-through" mean opaque
  { value: "opaque", patterns: [/\bopaque\b/i, /not\s+see[-\s]through/i, /(tak|tidak)\s+jarang/i, /\btebal\b/i] },
  { value: "sheer", patterns: [/\bsheer\b/i, /see[-\s]through/i, /transparent/i, /\bjarang\b/i, /\bnipis\b/i, /\bmesh\b/i, /\blace\b(?!.*lined)/i, /\btulle\b/i, /\borganza\b/i] },
];

const FABRICS = ["chiffon", "crepe", "cotton", "linen", "satin", "silk", "jersey", "lycra", "polyester", "rayon", "viscose",
  "denim", "lace", "tulle", "organza", "songket", "batik", "nida", "ceruti", "moss crepe", "scuba", "velvet", "wool"];

function match<T>(text: string, rules: Rule<T>[], fallback: T): { value: T; phrase?: string } {
  for (const r of rules) {
    for (const p of r.patterns) {
      const m = text.match(p);
      if (m) return { value: r.value, phrase: m[0] };
    }
  }
  return { value: fallback };
}

export function parseListing(title: string, description = ""): ListingAttrs {
  const text = `${title}\n${description}`;
  const evidence: Record<string, string> = {};
  const pick = <T,>(key: string, rules: Rule<T>[], fallback: T): T => {
    const r = match(text, rules, fallback);
    if (r.phrase) evidence[key] = r.phrase;
    return r.value;
  };
  const category = pick("category", CATEGORY, "unknown" as Category);
  let sleeve = pick("sleeve", SLEEVE, "unknown" as Sleeve);
  let hem = pick("hem", HEM, "unknown" as Hem);
  const neckline = pick("neckline", NECK, "unknown" as Neck);
  const opacity = pick("opacity", OPACITY, "unknown" as Opacity);
  const lower = text.toLowerCase();
  const fabric = FABRICS.find((f) => lower.includes(f)) ?? null;
  if (fabric) evidence.fabric = fabric;

  // category defaults, stated as inferences in the evidence
  if ((category === "abaya" || category === "baju_kurung") && sleeve === "unknown") {
    sleeve = "long";
    evidence.sleeve = `${category.replace("_", " ")} (traditionally long-sleeved)`;
  }
  if ((category === "abaya" || category === "baju_kurung") && hem === "unknown") {
    hem = "ankle";
    evidence.hem = `${category.replace("_", " ")} (traditionally ankle-length)`;
  }
  return { category, sleeve, hem, neckline, opacity, fabric, evidence };
}

export function coverageVerdict(a: ListingAttrs, p: CoverageProfile = DEFAULT_PROFILE): CoverageVerdict {
  const reasons: string[] = [];
  const suggestions: string[] = [];
  let fail = false;
  let layer = false;
  let unknown = false;

  if (a.category !== "bottom") {
    if (a.sleeve === "sleeveless" || a.sleeve === "short") {
      layer = true;
      reasons.push(`${a.sleeve === "sleeveless" ? "Sleeveless" : "Short sleeves"} (“${a.evidence.sleeve ?? a.sleeve}”)`);
      suggestions.push("Pair with an inner / manset lengan (arm sleeves) or a long cardigan");
    } else if (a.sleeve === "three_quarter" && p.sleeve === "long") {
      layer = true;
      reasons.push("3/4 sleeves");
      suggestions.push("Add manset lengan (arm sleeves)");
    } else if (a.sleeve === "unknown") {
      unknown = true;
      reasons.push("Sleeve length not stated");
    }
    if (a.neckline === "low") {
      layer = true;
      reasons.push(`Low neckline (“${a.evidence.neckline}”)`);
      suggestions.push("Wear with a high-neck inner or a longer tudung that covers the chest");
    }
  }
  if (a.category !== "top" && a.category !== "outerwear") {
    if (a.hem === "above_knee" || a.hem === "knee") {
      fail = true;
      reasons.push(`Hem ${a.hem.replace("_", " ")}`);
      suggestions.push("Layer over long pants or a long skirt");
    } else if (a.hem === "midi" && p.hem === "ankle") {
      layer = true;
      reasons.push("Midi length");
      suggestions.push("Pair with long pants or palazzo");
    } else if (a.hem === "unknown" && a.category !== "unknown") {
      unknown = true;
      reasons.push("Length not stated");
    }
  }
  if (a.opacity === "sheer") {
    if (p.sheer === "block") fail = true; else layer = true;
    reasons.push(`Sheer fabric (“${a.evidence.opacity}”)`);
    suggestions.push("Needs a full inner or lining");
  }

  const verdict: CoverageVerdict["verdict"] = fail ? "fail" : layer ? "pass_with_layer" : unknown ? "unknown" : "pass";
  if (verdict === "pass") reasons.push("Long sleeves, full length, no sheer fabric mentioned");
  return { verdict, reasons, suggestions };
}

// Engine policy derived from the Day-1 study (see docs/STUDY.md):
// upper_body swapped the shopper's tudung in 7/8 renders; full_body/auto did better,
// and masking the reference model's head raised tudung preservation from 6/16 to 16/16.
export function chooseGarmentCategory(a: ListingAttrs): { category: "full_body" | "auto" | "lower_body"; why: string } {
  if (a.category === "bottom") return { category: "lower_body", why: "Bottoms need the lower_body region" };
  if (a.category === "top" || a.category === "outerwear")
    return { category: "auto", why: "Tops: auto mode (upper_body swapped the tudung in 7/8 Day-1 renders)" };
  return { category: "full_body", why: "Dresses/abaya/kurung: full_body kept the tudung best in the Day-1 study" };
}
