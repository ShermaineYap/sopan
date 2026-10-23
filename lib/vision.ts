"use client";
// On-device vision for Sopan (MediaPipe selfie_multiclass segmenter, runs in the browser).
//  - maskReferenceHead: paint out the reference model's head so the try-on engine
//    cannot copy her tudung onto the shopper (Day-1 study: 6/16 -> 16/16 tudung kept)
//  - integrityCheck: compare shopper photo vs try-on result (hair exposed / tudung changed / skin exposure)
//  - recolorTudung: preview the shopper's own tudung in other shades
//  - estimateSkinHex: local fallback for skin colour
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { deltaE2000, hexToRgb, labToRgb, rgbToHex, rgbToLab, type Lab } from "./color";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
export const HAIR = 1, BODY = 2, FACE = 3, CLOTH = 4, OTHER = 5;

let segPromise: Promise<ImageSegmenter> | null = null;
export function loadSegmenter(): Promise<ImageSegmenter> {
  if (!segPromise) {
    segPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        runningMode: "IMAGE", outputCategoryMask: true, outputConfidenceMasks: false,
      });
    })();
    segPromise.catch(() => { segPromise = null; });
  }
  return segPromise;
}

// ---------- image helpers ----------
export async function fileToCanvas(src: Blob | string, maxSide = 1280): Promise<HTMLCanvasElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  if (typeof src !== "string") URL.revokeObjectURL(url);
  return c;
}

export function resizeTo(c: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const o = document.createElement("canvas");
  o.width = w; o.height = h;
  o.getContext("2d")!.drawImage(c, 0, 0, w, h);
  return o;
}

export const canvasToBlob = (c: HTMLCanvasElement, q = 0.9) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", q));

export interface Seg { mask: Uint8Array; w: number; h: number }

export async function segment(c: HTMLCanvasElement): Promise<Seg> {
  const seg = await loadSegmenter();
  const r = seg.segment(c);
  const m = r.categoryMask!;
  const out = { mask: new Uint8Array(m.getAsUint8Array()), w: m.width, h: m.height };
  r.close();
  return out;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

function faceBox(s: Seg): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.mask[y * s.w + x] === FACE) {
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n < 50 ? null : { x0, y0, x1, y1 };
}

// crown + sides of the face down to just below the chin (same geometry as the Python study)
function headBox(s: Seg): Box | null {
  const f = faceBox(s);
  if (!f) return null;
  const fw = f.x1 - f.x0, fh = f.y1 - f.y0;
  return {
    x0: Math.max(0, Math.round(f.x0 - 0.6 * fw)), y0: Math.max(0, Math.round(f.y0 - 0.8 * fh)),
    x1: Math.min(s.w, Math.round(f.x1 + 0.6 * fw)), y1: Math.min(s.h, Math.round(f.y1 + 0.15 * fh)),
  };
}

// ---------- 1. reference head masking ----------
export async function maskReferenceHead(ref: HTMLCanvasElement): Promise<{ canvas: HTMLCanvasElement; masked: boolean }> {
  const s = await segment(ref);
  const f = faceBox(s);
  if (!f) return { canvas: ref, masked: false };
  const fw = f.x1 - f.x0, fh = f.y1 - f.y0;
  const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2 - 0.1 * fh;
  const out = document.createElement("canvas");
  out.width = ref.width; out.height = ref.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(ref, 0, 0);
  // background colour = median of the top strip
  const strip = ctx.getImageData(0, 0, out.width, Math.max(4, Math.round(out.height / 40))).data;
  const ch = [0, 1, 2].map((k) => { const v: number[] = []; for (let i = k; i < strip.length; i += 4 * 7) v.push(strip[i]); v.sort((a, b) => a - b); return v[v.length >> 1]; });
  ctx.fillStyle = `rgb(${ch[0]},${ch[1]},${ch[2]})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 1.3 * fw, 1.25 * fh, 0, 0, Math.PI * 2);
  ctx.fill();
  return { canvas: out, masked: true };
}

// ---------- 2. integrity check ----------
export interface Integrity {
  verdict: "verified" | "tudung_changed" | "skin_exposed" | "hair_exposed" | "no_face";
  hairFrac: number; coverIoU: number; coverDeltaE: number; skinIncrease: number;
  overlayUrl?: string;
}

function meanLab(c: HTMLCanvasElement, s: Seg, b: Box, cls: number[]): Lab | null {
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let r = 0, g = 0, bl = 0, n = 0;
  for (let y = b.y0; y < b.y1; y += 2) for (let x = b.x0; x < b.x1; x += 2) {
    const i = y * s.w + x;
    if (cls.includes(s.mask[i])) { r += d[i * 4]; g += d[i * 4 + 1]; bl += d[i * 4 + 2]; n++; }
  }
  return n < 30 ? null : rgbToLab([r / n, g / n, bl / n]);
}

export async function integrityCheck(src: HTMLCanvasElement, result: HTMLCanvasElement): Promise<Integrity> {
  const out = resizeTo(result, src.width, src.height);
  const [ss, so] = await Promise.all([segment(src), segment(out)]);
  const b = headBox(ss) ?? headBox(so);
  if (!b) return { verdict: "no_face", hairFrac: 0, coverIoU: 0, coverDeltaE: 0, skinIncrease: 0 };
  let area = 0, hairS = 0, hairO = 0, inter = 0, uni = 0;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const i = y * ss.w + x; area++;
    const a = ss.mask[i], o = so.mask[i];
    if (a === HAIR) hairS++;
    if (o === HAIR) hairO++;
    const ca = a === CLOTH || a === OTHER, co = o === CLOTH || o === OTHER;
    if (ca && co) inter++;
    if (ca || co) uni++;
  }
  const hs = hairS / area, ho = hairO / area, iou = uni ? inter / uni : 1;
  const ls = meanLab(src, ss, b, [CLOTH, OTHER]), lo = meanLab(out, so, b, [CLOTH, OTHER]);
  const de = ls && lo ? deltaE2000(ls, lo) : 99;
  let skinS = 0, skinO = 0, below = 0;
  for (let y = b.y1; y < ss.h; y += 2) for (let x = 0; x < ss.w; x += 2) {
    const i = y * ss.w + x; below++;
    if (ss.mask[i] === BODY) skinS++;
    if (so.mask[i] === BODY) skinO++;
  }
  const hairExposed = (ho > 0.06 && ho > hs + 0.03) || iou < 0.45;
  const changed = iou < 0.7 || de > 10;
  const skinUp = below ? (skinO - skinS) / below : 0;
  // study: sleeveless renders added 23-43% body skin below the chin, modest ones <=5%
  const verdict = hairExposed ? "hair_exposed" : skinUp > 0.12 ? "skin_exposed" : changed ? "tudung_changed" : "verified";
  return {
    verdict, hairFrac: round(ho), coverIoU: round(iou), coverDeltaE: Math.round(de * 10) / 10,
    skinIncrease: round(skinUp),
    overlayUrl: overlay(out, so, b),
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function overlay(c: HTMLCanvasElement, s: Seg, b: Box): string {
  const o = document.createElement("canvas");
  o.width = c.width; o.height = c.height;
  const ctx = o.getContext("2d")!;
  ctx.drawImage(c, 0, 0);
  const im = ctx.getImageData(0, 0, o.width, o.height);
  for (let i = 0; i < s.mask.length; i++) {
    const m = s.mask[i];
    if (m === HAIR) { im.data[i * 4] = 0.4 * im.data[i * 4] + 153; im.data[i * 4 + 1] *= 0.4; im.data[i * 4 + 2] *= 0.4; }
    else if (m === CLOTH || m === OTHER) { im.data[i * 4 + 1] = 0.75 * im.data[i * 4 + 1] + 50; }
  }
  ctx.putImageData(im, 0, 0);
  ctx.strokeStyle = "#f4c542"; ctx.lineWidth = Math.max(2, o.width / 300);
  ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  return o.toDataURL("image/jpeg", 0.85);
}

// ---------- 3. tudung recolour preview ----------
export async function tudungMask(c: HTMLCanvasElement): Promise<{ seg: Seg; region: Uint8Array } | null> {
  const s = await segment(c);
  const f = faceBox(s);
  if (!f) return null;
  const fw = f.x1 - f.x0, fh = f.y1 - f.y0;
  const x0 = Math.max(0, f.x0 - 1.2 * fw), x1 = Math.min(s.w, f.x1 + 1.2 * fw);
  const y0 = Math.max(0, f.y0 - 0.9 * fh), y1 = Math.min(s.h, f.y1 + 1.6 * fh);
  const region = new Uint8Array(s.mask.length);
  // seed: covering pixels in the crown box; then keep covering pixels connected to it within the drape box
  const stack: number[] = [];
  for (let y = Math.round(y0); y < f.y0 + 0.2 * fh; y++) for (let x = Math.round(x0); x < x1; x++) {
    const i = y * s.w + x; if (s.mask[i] === CLOTH || s.mask[i] === OTHER) { region[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop()!; const x = i % s.w, y = (i / s.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
      const j = ny * s.w + nx;
      if (!region[j] && (s.mask[j] === CLOTH || s.mask[j] === OTHER)) { region[j] = 1; stack.push(j); }
    }
  }
  return { seg: s, region };
}

export function recolor(c: HTMLCanvasElement, region: Uint8Array, targetHex: string): string {
  const o = document.createElement("canvas");
  o.width = c.width; o.height = c.height;
  const ctx = o.getContext("2d")!;
  ctx.drawImage(c, 0, 0);
  const im = ctx.getImageData(0, 0, o.width, o.height);
  // mean L of the current tudung, so we can keep folds/shading while moving to the target shade
  let sumL = 0, n = 0;
  const labs: (Lab | null)[] = new Array(region.length).fill(null);
  for (let i = 0; i < region.length; i++) if (region[i]) {
    const lab = rgbToLab([im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]]); labs[i] = lab; sumL += lab[0]; n++;
  }
  if (!n) return o.toDataURL("image/jpeg", 0.9);
  const meanL = sumL / n;
  const [tL, ta, tb] = rgbToLab(hexToRgb(targetHex));
  for (let i = 0; i < region.length; i++) {
    const lab = labs[i]; if (!lab) continue;
    const L = Math.max(0, Math.min(100, tL + (lab[0] - meanL) * 0.85));
    const [r, g, b] = labToRgb([L, ta, tb]);
    im.data[i * 4] = r; im.data[i * 4 + 1] = g; im.data[i * 4 + 2] = b;
  }
  ctx.putImageData(im, 0, 0);
  return o.toDataURL("image/jpeg", 0.9);
}

// ---------- 4. local skin colour estimate ----------
export async function estimateSkinHex(c: HTMLCanvasElement): Promise<string | null> {
  const s = await segment(c);
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  const px: [number, number, number][] = [];
  for (let i = 0; i < s.mask.length; i += 3) if (s.mask[i] === FACE) px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  if (px.length < 50) return null;
  // median by luminance, ignoring highlights/shadows
  px.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  const mid = px.slice(Math.floor(px.length * 0.3), Math.floor(px.length * 0.7));
  const m = mid.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]).map((v) => v / mid.length) as [number, number, number];
  return rgbToHex(m);
}
