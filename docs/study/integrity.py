"""Sopan Hijab Integrity Check.

Compares a shopper's source photo with a try-on result and reports:
  hair_exposed       - visible hair appeared in the head region (hijab removed / slipped)
  tudung_changed     - head covering colour or shape changed (engine swapped the tudung)
  skin_exposure      - extra body skin (arms/neck/chest) vs source (coverage loss)
  verdict            - "verified" | "tudung_changed" | "hair_exposed"

Uses MediaPipe selfie_multiclass_256x256 (0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others).
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
from skimage.color import deltaE_ciede2000, rgb2lab

MODEL = "/home/claude/models/selfie_multiclass_256x256.tflite"
HAIR, BODY, FACE, CLOTH, OTHER = 1, 2, 3, 4, 5

_seg = None


def segmenter():
    global _seg
    if _seg is None:
        _seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
            base_options=mpt.BaseOptions(model_asset_path=MODEL), output_category_mask=True))
    return _seg


def segment(rgb: np.ndarray) -> np.ndarray:
    res = segmenter().segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    m = res.category_mask.numpy_view().copy()
    return m[..., 0] if m.ndim == 3 else m


def load(path: str, size: tuple[int, int] | None = None) -> np.ndarray:
    bgr = cv2.imread(path)
    if size is not None:
        bgr = cv2.resize(bgr, size, interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def head_box(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask == FACE)
    if len(ys) < 50:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    fh, fw = y1 - y0, x1 - x0
    h, w = mask.shape
    # crown + sides of the face, down to just below the chin (excludes chest/garment)
    return (max(0, int(x0 - 0.6 * fw)), max(0, int(y0 - 0.8 * fh)),
            min(w, int(x1 + 0.6 * fw)), min(h, int(y1 + 0.15 * fh)))


@dataclass
class Report:
    hair_frac_src: float
    hair_frac_out: float
    hair_exposed: bool
    cover_iou: float
    cover_delta_e: float
    tudung_changed: bool
    skin_frac_src: float
    skin_frac_out: float
    skin_exposure_increase: float
    verdict: str


def check(src_path: str, out_path: str, hair_thr: float = 0.06, iou_thr: float = 0.70, de_thr: float = 10.0,
          cover_lost_thr: float = 0.45) -> Report:
    src = load(src_path)
    h, w = src.shape[:2]
    out = load(out_path, (w, h))  # align to source frame
    ms, mo = segment(src), segment(out)

    box = head_box(ms) or head_box(mo)
    if box is None:
        raise ValueError("no face found")
    x0, y0, x1, y1 = box
    hs, ho = ms[y0:y1, x0:x1], mo[y0:y1, x0:x1]
    area = hs.size

    # hair visible in head region, normalised by head-box area
    hair_s = float((hs == HAIR).sum()) / area
    hair_o = float((ho == HAIR).sum()) / area
    hair_exposed = hair_o > hair_thr and hair_o > hair_s + 0.03

    # head covering = clothes/others inside the head box
    cov_s = np.isin(hs, (CLOTH, OTHER))
    cov_o = np.isin(ho, (CLOTH, OTHER))
    inter, union = (cov_s & cov_o).sum(), (cov_s | cov_o).sum()
    iou = float(inter) / union if union else 1.0
    if cov_s.sum() > 50 and cov_o.sum() > 50:
        lab_s = rgb2lab(src[y0:y1, x0:x1][cov_s].reshape(-1, 1, 3) / 255.0).reshape(-1, 3).mean(0)
        lab_o = rgb2lab(out[y0:y1, x0:x1][cov_o].reshape(-1, 1, 3) / 255.0).reshape(-1, 3).mean(0)
        de = float(deltaE_ciede2000(lab_s, lab_o))
    else:
        de = 99.0
    tudung_changed = (iou < iou_thr) or (de > de_thr)

    # body skin (arms/neck/chest) below the face, whole image
    below = slice(y1, h)
    skin_s = float((ms[below] == BODY).mean())
    skin_o = float((mo[below] == BODY).mean())

    covering_lost = iou < cover_lost_thr  # the head covering largely disappeared
    hair_exposed = hair_exposed or covering_lost
    verdict = "hair_exposed" if hair_exposed else ("tudung_changed" if tudung_changed else "verified")
    return Report(round(hair_s, 4), round(hair_o, 4), hair_exposed, round(iou, 3), round(de, 2), tudung_changed,
                  round(skin_s, 4), round(skin_o, 4), round(skin_o - skin_s, 4), verdict)


def overlay(src_path: str, out_path: str, dest: str) -> None:
    """Side-by-side visual: result with hair (red) and head covering (green) tinted."""
    src = load(src_path)
    h, w = src.shape[:2]
    out = load(out_path, (w, h))
    mo = segment(out)
    vis = out.copy().astype(np.float32)
    vis[mo == HAIR] = vis[mo == HAIR] * 0.4 + np.array([255, 0, 0]) * 0.6
    vis[np.isin(mo, (CLOTH, OTHER))] = vis[np.isin(mo, (CLOTH, OTHER))] * 0.75 + np.array([0, 200, 80]) * 0.25
    cv2.imwrite(dest, cv2.cvtColor(np.hstack([src, vis.astype(np.uint8)]), cv2.COLOR_RGB2BGR))


if __name__ == "__main__":
    print(json.dumps(asdict(check(sys.argv[1], sys.argv[2])), indent=2))
