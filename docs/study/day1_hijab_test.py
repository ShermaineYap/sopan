"""Day-1 feasibility test for Sopan: does YouCam Clothes / Scarf VTO preserve a headscarf?

Inputs (put JPG/PNG files here):
    inputs/shoppers/   chest-up (or half-body) selfies of hijab-wearing people, min 800px
    inputs/garments/   garment references: worn-outfit photos (model in hijab) AND/OR flat product shots
    inputs/scarves/    (optional) scarf/tudung reference images for the Scarf VTO step

Each run writes outputs/<timestamp>/ with every result image, a results.csv (status, latency, error,
units before/after) and a review.html contact sheet (source | garment | result) for manual grading.

Budget guard: stops when remaining units < RESERVE (default 700, i.e. spends at most ~300 of 1,000).

    export YOUCAM_API_KEY=...
    python day1_hijab_test.py --categories auto,full_body --scarf --max-pairs 6
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import itertools
import os
import sys

import youcam_client as yc

HERE = os.path.dirname(os.path.abspath(__file__))
IN = os.environ.get("SOPAN_INPUTS", os.path.join(HERE, "inputs"))
OUT_ROOT = os.path.join(HERE, "outputs")
IMG_EXT = (".jpg", ".jpeg", ".png")


def list_imgs(sub: str) -> list[str]:
    d = os.path.join(IN, sub)
    if not os.path.isdir(d):
        return []
    return sorted(os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(IMG_EXT))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--categories", default="auto,full_body", help="comma list from auto,full_body,upper_body,lower_body,outer")
    ap.add_argument("--scarf", action="store_true", help="also run Scarf VTO on each successful clothes result")
    ap.add_argument("--scarf-direct", action="store_true", help="run Scarf VTO directly on each shopper photo with each scarf")
    ap.add_argument("--max-pairs", type=int, default=6, help="max shopper x garment pairs")
    ap.add_argument("--reserve", type=int, default=700, help="stop when units fall below this")
    ap.add_argument("--filter-multi-person", default="off", choices=["off", "normal", "strict"])
    args = ap.parse_args()

    shoppers, garments, scarves = list_imgs("shoppers"), list_imgs("garments"), list_imgs("scarves")
    if not shoppers or not garments:
        print("Need at least one image in inputs/shoppers and inputs/garments", file=sys.stderr)
        return 2
    cats = [c.strip() for c in args.categories.split(",") if c.strip()]

    start_units = yc.credits()["api_spendable_units"]
    print(f"Units available: {start_units}")
    costs = {c["feature"]: c["amount"] for c in yc.feature_costs() if c.get("feature") in ("cloth-v4", "scarf")}
    print(f"Documented costs: {costs}")

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(OUT_ROOT, stamp)
    os.makedirs(out, exist_ok=True)

    print("Uploading inputs...")
    fid: dict[str, str] = {}
    for p in shoppers + garments + scarves:
        fid[p] = yc.upload(p)
        print("  uploaded", os.path.basename(p))

    rows: list[dict] = []
    pairs = list(itertools.product(shoppers, garments))[: args.max_pairs]
    n = 0
    for shopper, garment in pairs:
        for cat in cats:
            units_before = yc.credits()["api_spendable_units"]
            if units_before < args.reserve:
                print(f"Reserve reached ({units_before} < {args.reserve}); stopping.")
                break
            n += 1
            tag = f"{n:02d}_{os.path.splitext(os.path.basename(shopper))[0]}__{os.path.splitext(os.path.basename(garment))[0]}__{cat}"
            print(f"[{tag}] cloth-v4 ...", end=" ", flush=True)
            body = {"src_file_id": fid[shopper], "ref_file_id": fid[garment], "garment_category": cat,
                    "filter_multi_person": args.filter_multi_person}
            row = {"id": tag, "step": "cloth-v4", "shopper": os.path.basename(shopper), "garment": os.path.basename(garment),
                   "category": cat, "status": "", "error": "", "elapsed_s": "", "units_before": units_before, "units_after": "",
                   "result_file": "", "hijab_preserved(manual: y/n/partial)": ""}
            try:
                data = yc.run("cloth-v4", body)
                row["status"] = data.get("task_status", "")
                row["elapsed_s"] = data.get("_elapsed_s", "")
                row["error"] = data.get("error", "") or data.get("error_message", "")
                url = yc.result_url(data)
                if data.get("task_status") == "success" and url:
                    dest = os.path.join(out, tag + ".jpg")
                    yc.download(url, dest)
                    row["result_file"] = os.path.basename(dest)
            except Exception as e:  # noqa: BLE001
                row["status"], row["error"] = "exception", str(e)[:300]
            row["units_after"] = yc.credits()["api_spendable_units"]
            print(row["status"], row["error"], f"{row['elapsed_s']}s")
            rows.append(row)

            if args.scarf and row["result_file"] and scarves:
                scarf = scarves[0]
                stag = tag + "__scarf"
                print(f"[{stag}] scarf ...", end=" ", flush=True)
                res_fid = yc.upload(os.path.join(out, row["result_file"]))
                srow = dict(row, id=stag, step="scarf", garment=os.path.basename(scarf), status="", error="", elapsed_s="",
                            units_before=row["units_after"], units_after="", result_file="")
                try:
                    data = yc.run("scarf", {"src_file_id": res_fid, "ref_file_id": fid[scarf], "gender": "female"})
                    srow["status"], srow["elapsed_s"] = data.get("task_status", ""), data.get("_elapsed_s", "")
                    srow["error"] = data.get("error", "") or data.get("error_message", "")
                    url = yc.result_url(data)
                    if data.get("task_status") == "success" and url:
                        dest = os.path.join(out, stag + ".jpg")
                        yc.download(url, dest)
                        srow["result_file"] = os.path.basename(dest)
                except Exception as e:  # noqa: BLE001
                    srow["status"], srow["error"] = "exception", str(e)[:300]
                srow["units_after"] = yc.credits()["api_spendable_units"]
                print(srow["status"], srow["error"], f"{srow['elapsed_s']}s")
                rows.append(srow)
        else:
            continue
        break

    # Direct tudung swap on the shopper's own photo (Sopan's core move): every shopper x every scarf
    if args.scarf_direct and scarves:
        for shopper, scarf in itertools.product(shoppers, scarves):
            units_before = yc.credits()["api_spendable_units"]
            if units_before < args.reserve:
                print(f"Reserve reached ({units_before} < {args.reserve}); stopping.")
                break
            n += 1
            tag = f"{n:02d}_{os.path.splitext(os.path.basename(shopper))[0]}__{os.path.splitext(os.path.basename(scarf))[0]}__scarf-direct"
            print(f"[{tag}] scarf ...", end=" ", flush=True)
            row = {"id": tag, "step": "scarf", "shopper": os.path.basename(shopper), "garment": os.path.basename(scarf),
                   "category": "direct", "status": "", "error": "", "elapsed_s": "", "units_before": units_before,
                   "units_after": "", "result_file": "", "hijab_preserved(manual: y/n/partial)": ""}
            try:
                data = yc.run("scarf", {"src_file_id": fid[shopper], "ref_file_id": fid[scarf], "gender": "female"})
                row["status"], row["elapsed_s"] = data.get("task_status", ""), data.get("_elapsed_s", "")
                row["error"] = data.get("error", "") or data.get("error_message", "")
                url = yc.result_url(data)
                if data.get("task_status") == "success" and url:
                    dest = os.path.join(out, tag + ".jpg")
                    yc.download(url, dest)
                    row["result_file"] = os.path.basename(dest)
            except Exception as e:  # noqa: BLE001
                row["status"], row["error"] = "exception", str(e)[:300]
            row["units_after"] = yc.credits()["api_spendable_units"]
            print(row["status"], row["error"], f"{row['elapsed_s']}s")
            rows.append(row)

    end_units = yc.credits()["api_spendable_units"]
    with open(os.path.join(out, "results.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["id"])
        w.writeheader()
        w.writerows(rows)

    # contact sheet for manual grading
    cells = []
    for r in rows:
        src = os.path.relpath(os.path.join(IN, "shoppers", r["shopper"]), out)
        gsub = "scarves" if r["step"] == "scarf" else "garments"
        ref = os.path.relpath(os.path.join(IN, gsub, r["garment"]), out)
        res = r["result_file"] or ""
        cells.append(
            f"<tr><td>{html.escape(r['id'])}<br><small>{r['step']} / {r['category']}<br>{r['status']} {html.escape(str(r['error']))}<br>"
            f"{r['elapsed_s']}s, units {r['units_before']}→{r['units_after']}</small></td>"
            f"<td><img src='{src}'></td><td><img src='{ref}'></td><td>{'<img src=\"'+res+'\">' if res else '—'}</td></tr>"
        )
    with open(os.path.join(out, "review.html"), "w") as fh:
        fh.write("<html><head><meta charset='utf-8'><style>img{max-height:320px}td{vertical-align:top;padding:6px;border-bottom:1px solid #ddd}</style></head><body>"
                 f"<h2>Sopan Day-1 hijab test — {stamp}</h2><p>Units {start_units} → {end_units} (spent {start_units-end_units})</p>"
                 "<table><tr><th>run</th><th>shopper</th><th>reference</th><th>result</th></tr>" + "".join(cells) + "</table></body></html>")
    ok = sum(1 for r in rows if r["status"] == "success")
    print(f"\nDone. {ok}/{len(rows)} tasks succeeded. Units {start_units} → {end_units}. Open {out}/review.html and grade the 'hijab_preserved' column in results.csv.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
