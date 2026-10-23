"""Minimal YouCam API client (upload -> task -> poll). No third-party deps beyond `requests`.

Usage:
    export YOUCAM_API_KEY=...   (never commit the key)
    python youcam_client.py credits
    python youcam_client.py cost cloth-v4
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

import requests

BASE = "https://yce-api-01.makeupar.com"
UPLOAD_PATH = "/s2s/v2.0/file"
CREDIT_PATH = "/s2s/v1.0/client/credit"
FEATURE_COST_PATH = "/s2s/v2.0/credit/feature-cost"
TIMEOUT = 60
CONTENT_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


class YouCamError(RuntimeError):
    pass


def _key() -> str:
    k = os.environ.get("YOUCAM_API_KEY")
    if not k:
        raise YouCamError("Set YOUCAM_API_KEY in the environment")
    return k


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}


def credits() -> dict[str, Any]:
    r = requests.get(BASE + CREDIT_PATH, headers=_headers(), timeout=TIMEOUT)
    r.raise_for_status()
    batches = r.json().get("results", []) or []
    spendable = sum(b.get("amount", 0) for b in batches if str(b.get("type", "")).startswith("Api"))
    return {"api_spendable_units": spendable, "batches": batches}


def feature_costs(feature: str | None = None) -> list[dict[str, Any]]:
    skus, token = [], None
    while True:
        params: dict[str, Any] = {"page_size": 20}
        if token:
            params["starting_token"] = token
        r = requests.get(BASE + FEATURE_COST_PATH, headers=_headers(), params=params, timeout=TIMEOUT)
        r.raise_for_status()
        res = r.json().get("result", {}) or {}
        skus += res.get("skus", []) or []
        token = res.get("next_token")
        if not token:
            break
    out = []
    for s in skus:
        url = s.get("run_task_url", "") or ""
        slug = url.rstrip("/").split("/task/")[-1] if "/task/" in url else "(other)"
        if feature and slug != feature:
            continue
        out.append({"feature": slug, "description": s.get("description"), "amount": s.get("amount"), "unit": s.get("unit")})
    return out


def upload(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    ct = CONTENT_TYPES.get(ext)
    if not ct:
        raise YouCamError(f"unsupported file type {ext} (use jpg/png)")
    meta = requests.post(
        BASE + UPLOAD_PATH,
        headers=_headers(),
        json={"files": [{"content_type": ct, "file_name": os.path.basename(path), "file_size": os.path.getsize(path)}]},
        timeout=TIMEOUT,
    )
    meta.raise_for_status()
    info = meta.json()["data"]["files"][0]
    put_req = info["requests"][0]
    with open(path, "rb") as fh:
        requests.put(put_req["url"], headers=put_req.get("headers", {"Content-Type": ct}), data=fh, timeout=300).raise_for_status()
    return info["file_id"]


def create_task(feature: str, body: dict[str, Any]) -> str:
    r = requests.post(f"{BASE}/s2s/v2.0/task/{feature}", headers=_headers(), json=body, timeout=TIMEOUT)
    if r.status_code >= 400:
        raise YouCamError(f"create {feature} -> HTTP {r.status_code}: {r.text[:400]}")
    return r.json()["data"]["task_id"]


def poll(feature: str, task_id: str, max_wait: int = 240, interval: float = 3.0) -> dict[str, Any]:
    t0 = time.time()
    while True:
        r = requests.get(f"{BASE}/s2s/v2.0/task/{feature}/{task_id}", headers=_headers(), timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json().get("data", {}) or {}
        status = data.get("task_status")
        if status in ("success", "error"):
            data["_elapsed_s"] = round(time.time() - t0, 1)
            return data
        if time.time() - t0 > max_wait:
            data["_elapsed_s"] = round(time.time() - t0, 1)
            data["task_status"] = "timeout"
            return data
        time.sleep(max(interval, float(data.get("polling_interval", 0) or 0) / 1000.0))


def run(feature: str, body: dict[str, Any]) -> dict[str, Any]:
    task_id = create_task(feature, body)
    data = poll(feature, task_id)
    data["_task_id"] = task_id
    return data


def result_url(data: dict[str, Any]) -> str | None:
    res = data.get("results") or data.get("result") or {}
    if isinstance(res, list) and res:
        res = res[0]
    if isinstance(res, dict):
        return res.get("url")
    return None


def download(url: str, dest: str) -> None:
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    with open(dest, "wb") as fh:
        fh.write(r.content)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "credits"
    if cmd == "credits":
        print(json.dumps(credits(), indent=2))
    elif cmd == "cost":
        print(json.dumps(feature_costs(sys.argv[2] if len(sys.argv) > 2 else None), indent=2))
    else:
        print(__doc__)
