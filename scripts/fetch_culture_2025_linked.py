"""KSPO&CO 2026 SafePass — Post-Maintenance Auto-Harvester for 2025 Linked Open Data.

Target release window: 2026-11-22 18:00 KST (end of culture.go.kr / api.kcisa.kr maintenance).
Automatically harvests:
  1. 15164822 / 276130 (culture.go.kr id=675): 2025 올림픽공원 차량입출차·공연·날씨 연계 (7,803건)
  2. 15159093 / 1486   (culture.go.kr id=659): 2025 올림픽공원 전체구역 입출차정보 (~240만건)

Then normalizes the full 365-day 2025 linked dataset into `data/processed/hourly_panel_2025_linked.csv`
and automatically invokes `scripts/train_congestion_model.py --dataset 2025_linked` to upgrade the
ML benchmark & browser model bundle from 31-day (2024-07) to 365-day (2025 full year) GroupKFold CV!

Usage:
  py -X utf8 scripts/fetch_culture_2025_linked.py --check-status
  py -X utf8 scripts/fetch_culture_2025_linked.py --run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from bs4 import BeautifulSoup

ROOT = Path(r"C:\Users\basqu\Projects\ksponco-data-2026")
RAW_DIR = ROOT / "data" / "raw"
PROC_DIR = ROOT / "data" / "processed"
KST = timezone(timedelta(hours=9))
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0"}

CULTURE_TARGETS = {
    "15164822_linked_2025": {
        "culture_id": 675,
        "datagokr_ids": ["15164822", "276130"],
        "detail_url": "https://www.culture.go.kr/data/openapi/openapiView.do?id=675",
        "description": "2025 올림픽공원 차량입출차·공연·날씨 연계 데이터 (7,803건)",
    },
    "15159093_allzones_2025": {
        "culture_id": 659,
        "datagokr_ids": ["15159093", "1486"],
        "detail_url": "https://www.culture.go.kr/data/openapi/openapiView.do?id=659",
        "description": "2025 올림픽공원 입출차정보(전체구역, 약 240만건)",
    },
}


def get_kcisa_key() -> str | None:
    if os.environ.get("KCISA_API_KEY"):
        return os.environ["KCISA_API_KEY"].strip()
    vault_root = Path(r"C:\Users\basqu\My-Personal-Assistant")
    if vault_root.exists():
        if str(vault_root) not in sys.path:
            sys.path.insert(0, str(vault_root))
        try:
            from scripts.lib import creds  # type: ignore
            for k in ("kcisa-culture", "culture-openapi", "kcisa", "nps-data"):
                row = creds.get_account(k)
                if row and (row.get("password") or row.get("login_id")):
                    return (row.get("password") or row.get("login_id")).strip()
        except Exception:
            pass
    return None


def check_culture_maintenance() -> dict:
    """Probe culture.go.kr and api.kcisa.kr without printing credentials."""
    status = {"checked_at_kst": datetime.now(KST).isoformat(timespec="seconds"), "culture_portal": "unknown", "kcisa_api": "unknown", "ready": False}
    try:
        req = urllib.request.Request(CULTURE_TARGETS["15164822_linked_2025"]["detail_url"], headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read().decode("utf-8", errors="ignore")
            if "시스템 점검" in body or "점검 안내" in body or "11월 22일" in body:
                status["culture_portal"] = "MAINTENANCE (11/19 18:15 ~ 11/22 18:00)"
            else:
                status["culture_portal"] = f"ONLINE (HTTP {r.status}, {len(body)} bytes)"
    except Exception as e:
        status["culture_portal"] = f"UNREACHABLE ({type(e).__name__}: {e})"

    try:
        req2 = urllib.request.Request("https://api.kcisa.kr/openapi/service/rest/meta2020/getKSPO", headers=HEADERS)
        with urllib.request.urlopen(req2, timeout=10) as r2:
            status["kcisa_api"] = f"ONLINE (HTTP {r2.status})"
    except urllib.error.HTTPError as he:
        status["kcisa_api"] = f"HTTP {he.code}" + (" (MAINTENANCE 502)" if he.code in (502, 503) else " (UPSTREAM RESPONDING)")
    except Exception as e:
        status["kcisa_api"] = f"UNREACHABLE ({type(e).__name__})"

    status["ready"] = status["culture_portal"].startswith("ONLINE") and "502" not in status["kcisa_api"] and "503" not in status["kcisa_api"]
    return status


def discover_and_download_target(name: str, cfg: dict, api_key: str | None) -> Path | None:
    """Inspect culture.go.kr detail page for direct CSV/ZIP file download or KCISA REST endpoint."""
    print(f"\n[HARVEST] {name} (id={cfg['culture_id']}): {cfg['description']}")
    req = urllib.request.Request(cfg["detail_url"], headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        html = r.read().decode("utf-8", errors="ignore")
    if "시스템 점검" in html or "점검 안내" in html:
        print("  -> Still in maintenance mode.")
        return None

    sp = BeautifulSoup(html, "html.parser")
    # 1) Look for direct file download URL or API endpoint URL in page text/links
    dl_links = [
        urllib.parse.urljoin(cfg["detail_url"], a["href"])
        for a in sp.find_all("a", href=True)
        if any(k in (a["href"] + a.get_text()).lower() for k in ["download", "filedown", ".csv", ".zip", ".xlsx"])
    ]
    api_eps = sorted(set(re.findall(r"https?://api\.kcisa\.kr/openapi/[A-Za-z0-9_./-]+", html)))
    print(f"  Found {len(dl_links)} download links, {len(api_eps)} api.kcisa.kr endpoints")

    out_csv = RAW_DIR / f"{name}.csv"
    # Try direct file download first (zero quota, full rows)
    for dl in dl_links[:3]:
        try:
            r_dl = urllib.request.urlopen(urllib.request.Request(dl, headers=HEADERS), timeout=60)
            blob = r_dl.read()
            if len(blob) > 1000 and not blob[:200].lstrip().startswith(b"<"):
                ext = ".zip" if blob[:2] == b"PK" else ".csv"
                target_file = RAW_DIR / f"{name}{ext}"
                target_file.write_bytes(blob)
                print(f"  -> Downloaded {target_file.name} ({len(blob):,} bytes)")
                return target_file
        except Exception as e:
            print(f"  -> Download probe skip ({type(e).__name__})")

    # 2) Fallback: paginate KCISA REST API (JSON/XML) if endpoint & key available
    if api_eps and api_key:
        ep = api_eps[0]
        all_rows = []
        for page in range(1, 200):
            q = urllib.parse.urlencode({"serviceKey": api_key, "numOfRows": 1000, "pageNo": page, "type": "json"})
            try:
                req_a = urllib.request.Request(f"{ep}?{q}", headers={**HEADERS, "Accept": "application/json"})
                with urllib.request.urlopen(req_a, timeout=25) as ra:
                    obj = json.loads(ra.read().decode("utf-8", errors="ignore"))
                body = (obj.get("response") or {}).get("body") or {}
                items = (body.get("items") or {}).get("item") or []
                if isinstance(items, dict):
                    items = [items]
                if not items:
                    break
                all_rows.extend(items)
                tot = int(body.get("totalCount") or 0)
                if len(all_rows) >= tot or len(items) < 1000:
                    break
            except Exception as e:
                print(f"  -> API page {page} stop ({type(e).__name__})")
                break
        if all_rows:
            pd.DataFrame(all_rows).to_csv(out_csv, index=False, encoding="utf-8-sig")
            print(f"  -> Saved {out_csv.name} ({len(all_rows):,} rows via KCISA API)")
            return out_csv

    print("  -> Could not auto-download; inspect saved HTML metadata.")
    (ROOT / "data" / f"culture_{cfg['culture_id']}_post_maint.html").write_text(html, encoding="utf-8")
    return None


def normalize_2025_linked_to_panel(raw_csv: Path) -> Path:
    """Map 15164822/276130 (2025 linked 7,803 hourly rows) to train_congestion_model.py schema."""
    try:
        df = pd.read_csv(raw_csv, encoding="utf-8-sig")
    except UnicodeDecodeError:
        df = pd.read_csv(raw_csv, encoding="cp949")

    cols = list(df.columns)
    print(f"  Normalizing {raw_csv.name}: {len(df):,} rows, cols={cols}")

    def pick(*candidates: str) -> str | None:
        for cand in candidates:
            for c in cols:
                if cand.lower() in c.lower():
                    return c
        return None

    c_date = pick("일자", "날짜", "date", "ymd", "기준일")
    c_hour = pick("시간", "hour", "tm")
    c_in = pick("입차", "entry", "in_cnt", "차량수")
    c_out = pick("출차", "exit", "out_cnt")
    c_rn = pick("강수", "rain", "rn")
    c_ta = pick("기온", "온도", "temp", "ta")
    c_hm = pick("습도", "hm", "hum")
    c_ws = pick("풍속", "ws", "wind")
    c_ev = pick("공연", "행사", "event", "concert")
    c_cap = pick("관객", "수용", "좌석", "인원", "cap")

    if not c_date or not c_in:
        raise ValueError(f"Unrecognized schema in {raw_csv.name}; columns={cols}")

    panel = pd.DataFrame()
    panel["date"] = pd.to_datetime(df[c_date].astype(str)).dt.strftime("%Y-%m-%d")
    panel["hour"] = pd.to_numeric(df[c_hour].astype(str).str.extract(r"(\d{1,2})")[0], errors="coerce").fillna(12).astype(int) if c_hour else 12
    panel["dt"] = pd.to_datetime(panel["date"]) + pd.to_timedelta(panel["hour"], unit="h")
    panel["dow"] = panel["dt"].dt.dayofweek
    panel["is_weekend"] = (panel["dow"] >= 5).astype(int)
    panel["is_friday"] = (panel["dow"] == 4).astype(int)
    panel["entries_h"] = pd.to_numeric(df[c_in], errors="coerce").fillna(0).astype(int)
    panel["exits_h"] = pd.to_numeric(df[c_out], errors="coerce").fillna(panel["entries_h"]).astype(int) if c_out else panel["entries_h"]
    panel["active_parked_h"] = (panel["entries_h"] + panel["exits_h"]).rolling(3, min_periods=1).mean().round().astype(int)
    panel["active_parked_peak_h"] = panel["active_parked_h"]
    panel["rn"] = pd.to_numeric(df[c_rn], errors="coerce").fillna(0.0).clip(lower=0.0) if c_rn else 0.0
    panel["rn_3h_sum"] = panel["rn"].rolling(3, min_periods=1).sum()
    panel["rn_day_sum"] = panel.groupby("date")["rn"].transform("sum")
    panel["ta"] = pd.to_numeric(df[c_ta], errors="coerce").fillna(15.0) if c_ta else 15.0
    panel["hm"] = pd.to_numeric(df[c_hm], errors="coerce").fillna(60.0) if c_hm else 60.0
    panel["ws"] = pd.to_numeric(df[c_ws], errors="coerce").fillna(2.0) if c_ws else 2.0

    has_ev = (df[c_ev].notna() & (df[c_ev].astype(str).str.strip() != "") & (df[c_ev].astype(str).str.strip() != "0")).astype(int) if c_ev else 0
    cap_day = pd.to_numeric(df[c_cap], errors="coerce").fillna(0.0) if c_cap else has_ev * 10000.0
    panel["concert_cap_day"] = cap_day
    panel["concert_cap_k"] = cap_day / 1000.0
    panel["n_major_venues_day"] = (panel["concert_cap_k"] >= 3.0).astype(int) + (panel["concert_cap_k"] >= 16.0).astype(int)
    panel["has_kspo_dome"] = (panel["concert_cap_k"] >= 12.0).astype(int)
    panel["entry_window_cap_k"] = np.where((panel["hour"] >= 16) & (panel["hour"] <= 19), panel["concert_cap_k"], 0.0)
    panel["exit_window_cap_k"] = np.where((panel["hour"] >= 20) & (panel["hour"] <= 22), panel["concert_cap_k"], 0.0)
    panel["active_show_cap_k"] = np.where((panel["hour"] >= 17) & (panel["hour"] <= 21), panel["concert_cap_k"], 0.0)

    occ_p99 = max(float(np.percentile(panel["active_parked_peak_h"], 99)), 1.0)
    flow_p99 = max(float(np.percentile(panel["entries_h"] + panel["exits_h"], 99)), 1.0)
    panel["congestion_score"] = np.clip(
        0.55 * (panel["active_parked_peak_h"] / occ_p99) * 100.0 + 0.45 * ((panel["entries_h"] + panel["exits_h"]) / flow_p99) * 100.0,
        0.0, 100.0,
    ).round(1)
    panel["congestion_level"] = pd.cut(panel["congestion_score"], bins=[-0.1, 40, 62, 78, 101], labels=["여유", "보통", "혼잡", "만차임박"]).astype(str)

    out_panel = PROC_DIR / "hourly_panel_2025_linked.csv"
    panel.to_csv(out_panel, index=False, encoding="utf-8-sig")
    print(f"  -> Wrote 365-day panel {out_panel} ({len(panel):,} rows, {panel['date'].nunique()} days)")
    return out_panel


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-status", action="store_true", help="Only check culture.go.kr maintenance status")
    parser.add_argument("--run", action="store_true", help="Harvest 2025 linked datasets & retrain ML model")
    parser.add_argument("--skip-retrain", action="store_true", help="Do not invoke train_congestion_model.py after download")
    args = parser.parse_args()

    st = check_culture_maintenance()
    print("=== culture.go.kr / api.kcisa.kr Maintenance Status ===")
    print(json.dumps(st, ensure_ascii=False, indent=2))

    if args.check_status or not args.run:
        if not st["ready"]:
            print("\n[INFO] Maintenance active until 2026-11-22 18:00 KST. Re-run with `--run` after 18:00 KST.")
        return

    if not st["ready"]:
        print("\n[WAIT] culture.go.kr is still under maintenance. Exiting cleanly (rc=0) without overwriting existing data.")
        return

    api_key = get_kcisa_key()
    linked_path = discover_and_download_target("15164822_linked_2025", CULTURE_TARGETS["15164822_linked_2025"], api_key)
    discover_and_download_target("15159093_allzones_2025", CULTURE_TARGETS["15159093_allzones_2025"], api_key)

    if linked_path and linked_path.suffix == ".csv":
        normalize_2025_linked_to_panel(linked_path)
        if not args.skip_retrain:
            print("\n=== Re-training SafePass ML model on 365-day 2025 Linked Dataset ===")
            subprocess.run(
                [sys.executable, "-X", "utf8", str(ROOT / "scripts" / "train_congestion_model.py"), "--dataset", "2025_linked"],
                check=True,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )


if __name__ == "__main__":
    main()
