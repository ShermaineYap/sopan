// sRGB <-> CIELAB and CIEDE2000 colour difference. Pure TS.

export type RGB = [number, number, number];
export type Lab = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const gam = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const finv = (t: number) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));

export function rgbToLab([r, g, b]: RGB): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / Xn;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.072175) / Yn;
  const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / Zn;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function labToRgb([L, a, b]: Lab): RGB {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = finv(fx) * Xn, Y = finv(fy) * Yn, Z = finv(fz) * Zn;
  const R = X * 3.2404542 - Y * 1.5371385 - Z * 0.4985314;
  const G = -X * 0.969266 + Y * 1.8760108 + Z * 0.041556;
  const B = X * 0.0556434 - Y * 0.2040259 + Z * 1.0572252;
  return [gam(R), gam(G), gam(B)];
}

export function deltaE2000(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a: number, b: number) => { if (a === 0 && b === 0) return 0; const v = Math.atan2(b, a) * deg; return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360; hbp /= 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}

// Common tudung shades sold in Malaysia (names as shoppers search for them)
export const TUDUNG_PALETTE: { name: string; hex: string }[] = [
  { name: "Black", hex: "#1c1c1e" },
  { name: "Off-white", hex: "#efe9df" },
  { name: "Nude", hex: "#d8b9a0" },
  { name: "Dusty pink", hex: "#c99a9a" },
  { name: "Maroon", hex: "#6b1f2a" },
  { name: "Navy", hex: "#1f2b4a" },
  { name: "Emerald", hex: "#1f6b52" },
  { name: "Sage", hex: "#9caf94" },
  { name: "Mustard", hex: "#c9962c" },
  { name: "Lilac", hex: "#a99bc4" },
  { name: "Grey", hex: "#8c8c8c" },
  { name: "Mocha", hex: "#7a5a46" },
];

export interface ShadeScore { name: string; hex: string; deltaE: number; band: "blends" | "soft" | "medium" | "bold" }

// Measured contrast between the shopper's skin colour and each tudung shade.
// We report contrast bands, not "flattering" claims.
export function rankTudungShades(skinHex: string): ShadeScore[] {
  const skin = rgbToLab(hexToRgb(skinHex));
  return TUDUNG_PALETTE.map((s) => {
    const dE = deltaE2000(skin, rgbToLab(hexToRgb(s.hex)));
    const band = dE < 10 ? "blends" : dE < 25 ? "soft" : dE < 45 ? "medium" : "bold";
    return { ...s, deltaE: Math.round(dE * 10) / 10, band } as ShadeScore;
  }).sort((a, b) => a.deltaE - b.deltaE);
}
