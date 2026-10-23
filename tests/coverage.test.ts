import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageVerdict, parseListing, chooseGarmentCategory } from "../lib/coverage.ts";
import { deltaE2000, rgbToLab, hexToRgb, rankTudungShades } from "../lib/color.ts";

test("Malay abaya listing passes", () => {
  const a = parseListing("Abaya Sulam Mutiara — embroidered abaya, lengan panjang", "Abaya labuh with sulam. Moss crepe, tak jarang.");
  assert.equal(a.category, "abaya");
  assert.equal(a.sleeve, "long");
  assert.equal(a.hem, "ankle");
  assert.equal(a.opacity, "opaque");
  assert.equal(coverageVerdict(a).verdict, "pass");
  assert.equal(chooseGarmentCategory(a).category, "full_body");
});

test("sleeveless lace dress needs layers / fails on knee length", () => {
  const a = parseListing("Lace Sleeveless Party Dress", "Sleeveless lace dress with round neck, knee-length flared skirt. Sheer lace overlay.");
  assert.equal(a.sleeve, "sleeveless");
  assert.equal(a.hem, "knee");
  assert.equal(a.opacity, "sheer");
  const v = coverageVerdict(a);
  assert.equal(v.verdict, "fail");
  assert.ok(v.suggestions.some((s) => /manset|inner/i.test(s)));
});

test("BM short sleeve blouse -> layer, auto category", () => {
  const a = parseListing("Blouse lengan pendek", "Kain cotton, leher bulat");
  assert.equal(a.category, "top");
  assert.equal(a.sleeve, "short");
  assert.equal(a.neckline, "round");
  assert.equal(coverageVerdict(a).verdict, "pass_with_layer");
  assert.equal(chooseGarmentCategory(a).category, "auto");
});

test("lined chiffon is not flagged sheer", () => {
  const a = parseListing("Baju kurung chiffon", "Fully lined, lengan panjang, labuh");
  assert.equal(a.opacity, "lined");
  assert.equal(coverageVerdict(a).verdict, "pass");
});

test("CIEDE2000 reference pair (Sharma et al. 2005, pair 1)", () => {
  const dE = deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]);
  assert.ok(Math.abs(dE - 2.0425) < 1e-3, `got ${dE}`);
});

test("white vs black is a large difference; shades sorted by contrast", () => {
  assert.ok(deltaE2000(rgbToLab(hexToRgb("#ffffff")), rgbToLab(hexToRgb("#000000"))) > 90);
  const r = rankTudungShades("#b9947c");
  for (let i = 1; i < r.length; i++) assert.ok(r[i].deltaE >= r[i - 1].deltaE);
  assert.equal(r[0].name, "Nude"); // closest shade to this skin tone
});
