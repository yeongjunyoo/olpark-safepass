"""Fetch official KSPO&CO Olympic Park event calendar via eventInfoListTextAjax.es
for 2024-07 (ML training), 2025-02~2026-08 (15164156 zone congestion cross-match),
and 2026-11~2027-02 (live upcoming forecast).
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path(r"C:\Users\basqu\Projects\ksponco-data-2026")
OUT = ROOT / "data/raw/ksponco_events_official.json"
URL = "https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoListTextAjax.es"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0",
    "Content-Type": "application/json;charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
}


def fetch_month(ym: str) -> list[dict]:
    body = json.dumps({"nowYM": ym, "plcCd": ""}).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="ignore"))
    if isinstance(data, list) and data and isinstance(data[0], list):
        return data[0]
    return []


def main():
    months = ["202407"]
    # 2025-02 to 2026-08 for 15164156 zone congestion event matching
    for y in (2025, 2026):
        for m in range(1, 13):
            ym = f"{y}{m:02d}"
            if "202502" <= ym <= "202608":
                months.append(ym)
    # Current & upcoming 2026-11 to 2027-02
    months.extend(["202611", "202612", "202701", "202702"])

    result = {}
    for ym in months:
        try:
            rows = fetch_month(ym)
            result[ym] = rows
            if ym in ("202407", "202611", "202612", "202701", "202702"):
                print(f"=== {ym}: {len(rows)} events ===")
                for ev in rows:
                    print(
                        f"  [{ev.get('evtSeq')}] {ev.get('beginDt')}~{ev.get('endDt')} | "
                        f"plcCd={ev.get('plcCd')} ({ev.get('plc')}) | {ev.get('title')} | "
                        f"tm={str(ev.get('tm') or '').strip()[:55]}"
                    )
        except Exception as e:
            print(f"ERR {ym}: {e}")
            result[ym] = []

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    tot = sum(len(v) for v in result.values())
    print(f"\nSaved {OUT} ({len(result)} months, {tot} monthly event entries)")


if __name__ == "__main__":
    main()
