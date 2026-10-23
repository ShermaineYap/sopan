"""Evaluate the integrity check against manual grades of the Day-1 renders."""
import csv
import glob
import json
import os
import re
import sys

from integrity import check

HERE = os.path.dirname(os.path.abspath(__file__))
SHOP = os.path.join(HERE, "inputs", "shoppers")

# manual grades from contact sheets: H = hair exposed, C = tudung changed/replaced, K = kept
MANUAL = {
    "20261023-160712": {1: "H", 2: "H", 3: "C", 4: "C", 5: "C", 6: "C", 7: "K", 8: "K", 9: "C", 10: "K", 11: "K", 12: "K",
                        13: "H", 14: "C", 15: "C", 16: "K", 17: "C", 18: "C", 19: "K", 20: "K", 21: "K", 22: "K", 23: "C", 24: "C"},
    "20261023-161631": {1: "H", 2: "C", 3: "C", 4: "K", 5: "C", 6: "C", 7: "H", 8: "C", 9: "C", 10: "K", 11: "K", 12: "C"},
}
MAP = {"hair_exposed": "H", "tudung_changed": "C", "verified": "K"}

rows = []
for run, grades in MANUAL.items():
    for f in sorted(glob.glob(os.path.join(HERE, "outputs", run, "*.jpg"))):
        name = os.path.basename(f)
        m = re.match(r"(\d+)_(.+?)__", name)
        if not m or "scarf" in name:
            continue
        idx, shopper = int(m.group(1)), m.group(2)
        if idx not in grades:
            continue
        r = check(os.path.join(SHOP, shopper + ".jpg"), f)
        rows.append({"run": run, "file": name, "manual": grades[idx], "auto": MAP[r.verdict], **r.__dict__})

def score(pos):
    tp = sum(1 for r in rows if r["manual"] in pos and r["auto"] in pos)
    fp = sum(1 for r in rows if r["manual"] not in pos and r["auto"] in pos)
    fn = sum(1 for r in rows if r["manual"] in pos and r["auto"] not in pos)
    return tp, fp, fn

agree = sum(r["manual"] == r["auto"] for r in rows)
print(f"n={len(rows)} exact agreement {agree}/{len(rows)}")
print("hair-exposed  tp/fp/fn", score({"H"}))
print("any-problem   tp/fp/fn", score({"H", "C"}))
for r in rows:
    flag = "" if r["manual"] == r["auto"] else "  <-- mismatch"
    print(f"{r['file'][:58]:58s} man={r['manual']} auto={r['auto']} hair={r['hair_frac_out']:.3f} iou={r['cover_iou']:.2f} dE={r['cover_delta_e']:.1f} skin+={r['skin_exposure_increase']:.3f}{flag}")
with open(os.path.join(HERE, "integrity_eval.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)
