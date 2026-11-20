"""KSPO&CO 2026 SafePass — Live Data Refresh & 72h Forecast Snapshot Generator.

Designed for zero-cost automated daily/hourly execution via GitHub Actions through 2028!
Reads credentials from environment variables first (GitHub Actions Secrets), falling back
to local vault `scripts.lib.creds` (NEVER prints any secret to stdout or files).

Live Upstream Sources:
  1. KSPO&CO `parkingorsApi.do?apiKey=PARKING21803504` (real-time parking count)
  2. Seoul OpenData `citydata/올림픽공원` (live population, 12h forecast, 4 subway stations,
     buses, road traffic, 12 S-Bike racks, weather/PM2.5, + explicit `CUR_PRK_YN=N` gap check!)
  3. Seoul OpenData `GetParkingInfo/송파구` (live overflow municipal parking availability)
  4. KMA `VilageFcstInfoService_2.0` (`nx=62, ny=126`, 72h hourly weather forecast)
  5. KSPO&CO official event API (`eventInfoListTextAjax.es`) + `15149169` English ticketing links

Fail-Safe Policy:
  If any upstream API times out or returns 5xx/maintenance, preserves the last valid section
  from existing `web/public/data/live_snapshot.json` with `stale: true` so the site never breaks.

Outputs:
  - web/public/data/live_snapshot.json
  - web/public/data/concerts.json          (merged KR+EN live & upcoming 2026-11..2027-02)
  - web/public/data/monthly_parking.json   (2023~2025 monthly series from 15131671)
  - web/public/data/parking_zones.json     (P1A~P11 audited stats from 15164156)
  - web/public/data/quality_audit.json     (compact alias of opendata_audit.json for B2 loader)
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROC_DIR = ROOT / "data" / "processed"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
KST = timezone(timedelta(hours=9))
HEADERS = {"User-Agent": "Mozilla/5.0 (OlparkSafePass/1.0)"}


def get_secret(env_name: str, cred_key: str, from_extra_regex: str | None = None) -> str | None:
    val = os.environ.get(env_name)
    if val:
        return val.strip()
    vault_root = Path(r"C:\Users\basqu\My-Personal-Assistant")
    if vault_root.exists():
        if str(vault_root) not in sys.path:
            sys.path.insert(0, str(vault_root))
        try:
            from scripts.lib import creds  # type: ignore
            row = creds.get_account(cred_key)
            if not row:
                return None
            if from_extra_regex:
                m = re.search(from_extra_regex, row.get("extra", ""))
                return m.group(1) if m else None
            return (row.get("password") or row.get("login_id") or "").strip() or None
        except Exception:
            return None
    return None


def http_get_json(url: str, timeout: int = 20, post_json: dict | None = None) -> Any:
    hdrs = dict(HEADERS)
    data = None
    if post_json is not None:
        data = json.dumps(post_json).encode("utf-8")
        hdrs["Content-Type"] = "application/json;charset=UTF-8"
        hdrs["X-Requested-With"] = "XMLHttpRequest"
    req = urllib.request.Request(url, data=data, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def fetch_kspo_parking() -> dict:
    api_key = os.environ.get("KSPONCO_PARKING_KEY") or "PARKING21803504"
    url = f"https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey={urllib.parse.quote(api_key)}"
    obj = http_get_json(url, timeout=15)
    p_sum = int(obj[0]["parking_sum"]) if isinstance(obj, list) and obj else 0
    total_cap = 2716
    main_cap = 2120
    return {
        "parking_sum": p_sum,
        "total_capacity": total_cap,
        "main_lot_capacity": main_cap,
        "occupancy_pct": round(p_sum / total_cap * 100.0, 1),
        "main_lot_occupancy_pct": round(min(100.0, p_sum / main_cap * 100.0), 1),
        "status": "만차임박" if p_sum >= 2300 else ("혼잡" if p_sum >= 1900 else ("보통" if p_sum >= 1300 else "여유")),
        "api_status": "ok",
        "measured_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
        "source": "KSPO&CO 15168686 (parkingorsApi.do)",
        "stale": False,
    }


def fetch_seoul_citydata(seoul_key: str) -> dict:
    u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/citydata/1/5/{urllib.parse.quote('올림픽공원')}"
    obj = http_get_json(u, timeout=20)
    city = obj.get("CITYDATA") or obj
    if not city.get("LIVE_PPLTN_STTS"):
        raise ValueError("Empty CITYDATA response")

    pop0 = city["LIVE_PPLTN_STTS"][0]
    fcst_12h = [
        {
            "time": x.get("FCST_TIME", ""),
            "min": int(float(x.get("FCST_PPLTN_MIN") or 0)),
            "max": int(float(x.get("FCST_PPLTN_MAX") or 0)),
            "level": x.get("FCST_CONGEST_LVL", "여유"),
        }
        for x in (pop0.get("FCST_PPLTN") or [])[:12]
    ]

    # Explicit Seoul PRK_STTS gap verification (CUR_PRK_YN == 'N'!)
    prk_lots = []
    for p in city.get("PRK_STTS") or []:
        prk_lots.append({
            "name": p.get("PRK_NM", ""),
            "code": p.get("PRK_CD", ""),
            "capacity": int(float(p.get("CPCTY") or 0)),
            "seoul_cur_prk_yn": p.get("CUR_PRK_YN", "N"),
            "seoul_cur_prk_cnt": int(float(p["CUR_PRK_CNT"])) if str(p.get("CUR_PRK_CNT", "")).strip().isdigit() else None,
            "lat": float(p.get("LAT") or 0),
            "lng": float(p.get("LNG") or 0),
            "rate_per_10m": int(float(p.get("RATES") or 600)),
            "address": p.get("ADDRESS", ""),
        })
    unavailable_cnt = sum(1 for p in prk_lots if p["seoul_cur_prk_yn"] == "N")

    wx0 = (city.get("WEATHER_STTS") or [{}])[0]
    def fnum(v, default=0.0):
        try:
            return float(str(v).strip())
        except Exception:
            return default

    subways = []
    for s in city.get("SUB_STTS") or []:
        subways.append({
            "station": s.get("SUB_STN_NM", ""),
            "line": s.get("SUB_STN_LINE", ""),
            "lat": fnum(s.get("SUB_STN_Y")),
            "lng": fnum(s.get("SUB_STN_X")),
            "facilities_count": len(s.get("SUB_FACIINFO") or []),
        })

    sbikes = [
        {
            "id": b.get("SBIKE_SPOT_ID", ""),
            "name": b.get("SBIKE_SPOT_NM", ""),
            "bikes_available": int(fnum(b.get("SBIKE_PARKING_CNT"))),
            "racks_total": int(fnum(b.get("SBIKE_RACK_CNT"))),
            "lat": fnum(b.get("SBIKE_Y")),
            "lng": fnum(b.get("SBIKE_X")),
        }
        for b in (city.get("SBIKE_STTS") or [])
    ]

    road_avg = (city.get("ROAD_TRAFFIC_STTS") or {}).get("AVG_ROAD_DATA") or {}
    events_city = [
        {
            "name": e.get("EVENT_NM", ""),
            "period": e.get("EVENT_PERIOD", ""),
            "place": e.get("EVENT_PLACE", ""),
            "pay_yn": e.get("PAY_YN", ""),
            "url": e.get("URL", ""),
        }
        for e in (city.get("EVENT_STTS") or [])
    ]

    return {
        "seoul_population": {
            "area_name": city.get("AREA_NM", "올림픽공원"),
            "congest_lvl": pop0.get("AREA_CONGEST_LVL", "여유"),
            "congest_msg": pop0.get("AREA_CONGEST_MSG", ""),
            "min": int(fnum(pop0.get("AREA_PPLTN_MIN"))),
            "max": int(fnum(pop0.get("AREA_PPLTN_MAX"))),
            "non_resident_pct": fnum(pop0.get("NON_RESNT_PPLTN_RATE")),
            "observed_at": pop0.get("PPLTN_TIME", ""),
            "forecast_12h": fcst_12h,
        },
        "seoul_parking_gap_verification": {
            "total_lots_in_citydata": len(prk_lots),
            "unavailable_cur_prk_yn_n_count": unavailable_cnt,
            "all_lots_missing_realtime": unavailable_cnt == len(prk_lots) and len(prk_lots) > 0,
            "total_capacity_sum": sum(p["capacity"] for p in prk_lots),
            "filled_by_kspo_api": True,
            "lots": prk_lots,
        },
        "weather_live": {
            "observed_at": wx0.get("WEATHER_TIME", ""),
            "temp_c": fnum(wx0.get("TEMP")),
            "max_temp_c": fnum(wx0.get("MAX_TEMP")),
            "min_temp_c": fnum(wx0.get("MIN_TEMP")),
            "humidity_pct": fnum(wx0.get("HUMIDITY")),
            "wind_spd": fnum(wx0.get("WIND_SPD")),
            "wind_dir": wx0.get("WIND_DIRCT", ""),
            "precipitation_mm": fnum(wx0.get("PRECIPITATION"), 0.0),
            "precpt_type": wx0.get("PRECPT_TYPE", "없음"),
            "pcp_msg": wx0.get("PCP_MSG", ""),
            "pm25": int(fnum(wx0.get("PM25"))),
            "pm25_grade": wx0.get("PM25_INDEX", ""),
            "pm10": int(fnum(wx0.get("PM10"))),
            "pm10_grade": wx0.get("PM10_INDEX", ""),
            "uv_index": int(fnum(wx0.get("UV_INDEX"))),
            "uv_level": wx0.get("UV_INDEX_LVL", ""),
            "air_idx": wx0.get("AIR_IDX", ""),
            "sunrise": wx0.get("SUNRISE", ""),
            "sunset": wx0.get("SUNSET", ""),
            "grid_nx": 62,
            "grid_ny": 126,
        },
        "road_traffic": {
            "index": road_avg.get("ROAD_TRAFFIC_IDX", ""),
            "speed_kmh": fnum(road_avg.get("ROAD_TRAFFIC_SPD")),
            "msg": road_avg.get("ROAD_MSG", ""),
            "time": road_avg.get("ROAD_TRAFFIC_TIME", ""),
        },
        "subways_live": subways,
        "sbike_live": {
            "stations_count": len(sbikes),
            "total_bikes_available": sum(x["bikes_available"] for x in sbikes),
            "stations": sbikes,
        },
        "bus_stops_count": len(city.get("BUS_STN_STTS") or []),
        "citydata_events": events_city,
        "stale": False,
    }


def fetch_songpa_overflow_live(seoul_key: str) -> list[dict]:
    u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/GetParkingInfo/1/100/{urllib.parse.quote('송파구')}"
    obj = http_get_json(u, timeout=15)
    rows = (obj.get("GetParkingInfo") or {}).get("row") or []
    out = []
    for r in rows:
        cap = int(float(r.get("TPKCT") or 0))
        cur = int(float(r.get("NOW_PRK_VHCL_CNT") or 0))
        out.append({
            "pklt_cd": str(r.get("PKLT_CD", "")),
            "name": r.get("PKLT_NM", ""),
            "address": r.get("ADDR", ""),
            "capacity": cap,
            "occupied": cur,
            "available": max(0, cap - cur),
            "occupancy_pct": round(cur / max(cap, 1) * 100.0, 1),
            "updated_at": r.get("NOW_PRK_VHCL_UPDT_TM", ""),
            "rate_per_5m_won": int(float(r.get("BSC_PRK_CRG") or 0)),
        })
    return out


def fetch_kma_vilage_72h(data_go_key: str | None, kma_hub_key: str | None) -> dict:
    now = datetime.now(KST)
    cand = now - timedelta(minutes=25)
    base_hours = [2, 5, 8, 11, 14, 17, 20, 23]
    bh = max([h for h in base_hours if h <= cand.hour], default=23)
    bd = cand.strftime("%Y%m%d") if bh <= cand.hour else (cand - timedelta(days=1)).strftime("%Y%m%d")
    bt = f"{bh:02d}00"

    items = []
    source = ""
    if data_go_key:
        try:
            q = urllib.parse.urlencode({
                "serviceKey": data_go_key, "pageNo": 1, "numOfRows": 1000, "dataType": "JSON",
                "base_date": bd, "base_time": bt, "nx": 62, "ny": 126,
            })
            obj = http_get_json(f"https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?{q}", timeout=20)
            items = (((obj.get("response") or {}).get("body") or {}).get("items") or {}).get("item") or []
            source = "KMA VilageFcstInfoService_2.0 (data.go.kr, nx=62, ny=126)"
        except Exception:
            items = []

    if not items and kma_hub_key:
        q = urllib.parse.urlencode({
            "authKey": kma_hub_key, "pageNo": 1, "numOfRows": 1000, "dataType": "JSON",
            "base_date": bd, "base_time": bt, "nx": 62, "ny": 126,
        })
        obj = http_get_json(f"https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?{q}", timeout=20)
        items = (((obj.get("response") or {}).get("body") or {}).get("items") or {}).get("item") or []
        source = "KMA VilageFcstInfoService_2.0 (apihub.kma.go.kr, nx=62, ny=126)"

    if not items:
        raise ValueError("No KMA VilageFcst items returned")

    by_slot: dict[str, dict] = {}
    for it in items:
        key = f"{it['fcstDate']}_{it['fcstTime']}"
        slot = by_slot.setdefault(key, {
            "date": f"{it['fcstDate'][:4]}-{it['fcstDate'][4:6]}-{it['fcstDate'][6:8]}",
            "hour": int(it["fcstTime"][:2]),
            "fcst_dt": f"{it['fcstDate'][:4]}-{it['fcstDate'][4:6]}-{it['fcstDate'][6:8]} {it['fcstTime'][:2]}:00",
        })
        cat = it["category"]
        val = str(it["fcstValue"]).strip()
        if cat == "TMP":
            slot["temp_c"] = float(val)
        elif cat == "REH":
            slot["humidity_pct"] = float(val)
        elif cat == "WSD":
            slot["wind_ms"] = float(val)
        elif cat == "POP":
            slot["rain_prob_pct"] = int(float(val))
        elif cat == "PTY":
            slot["pty_code"] = int(float(val))
        elif cat == "SKY":
            slot["sky_code"] = int(float(val))
        elif cat == "PCP":
            if val in ("강수없음", "0", "-", ""):
                slot["rain_mm"] = 0.0
            elif "미만" in val:
                slot["rain_mm"] = 0.5
            else:
                m = re.search(r"(\d+(?:\.\d+)?)", val)
                slot["rain_mm"] = float(m.group(1)) if m else 0.0

    hourly_72h = sorted(by_slot.values(), key=lambda x: x["fcst_dt"])[:72]
    for s in hourly_72h:
        s.setdefault("rain_mm", 0.0)
        s.setdefault("rain_prob_pct", 0)
        s.setdefault("temp_c", 10.0)
        s.setdefault("humidity_pct", 50.0)
        s.setdefault("wind_ms", 2.0)

    max_rain = max((s["rain_mm"] for s in hourly_72h), default=0.0)
    max_temp = max((s["temp_c"] for s in hourly_72h), default=0.0)
    min_temp = min((s["temp_c"] for s in hourly_72h), default=0.0)
    max_wind = max((s["wind_ms"] for s in hourly_72h), default=0.0)

    alerts = []
    if max_rain >= 5.0:
        alerts.append({"level": "warning", "type": "rain_concert_surge", "msg_ko": f"향후 72시간 강수 예보(최대 {max_rain}mm/h) — 공연 겹침 시 자차 쏠림·출차 병목 주의"})
    if max_temp >= 33.0:
        alerts.append({"level": "warning", "type": "heatwave", "msg_ko": f"폭염 주의(최고 {max_temp}°C) — 88잔디마당·테니스장 야외 활동 및 그늘 휴식 권장"})
    if min_temp <= -5.0:
        alerts.append({"level": "info", "type": "cold", "msg_ko": f"기온 영하({min_temp}°C) — 야간 공연 종료 후 외곽 보행로 결빙·체온 유지 주의"})
    if max_wind >= 10.0:
        alerts.append({"level": "warning", "type": "wind", "msg_ko": f"강풍 주의(최대 {max_wind}m/s) — 야외 무대·현수막 안전 유의"})

    return {
        "base_date": bd,
        "base_time": bt,
        "nx": 62,
        "ny": 126,
        "source": source,
        "summary": {"max_rain_mm": max_rain, "max_temp_c": max_temp, "min_temp_c": min_temp, "max_wind_ms": max_wind},
        "safety_alerts": alerts,
        "hourly_72h": hourly_72h,
        "stale": False,
    }


def fetch_upcoming_concerts() -> list[dict]:
    now = datetime.now(KST)
    today_str = now.strftime("%Y-%m-%d")
    months = []
    y, m = now.year, now.month
    for _ in range(4):
        months.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1

    url = "https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoListTextAjax.es"
    seen: dict[int, dict] = {}
    for ym in months:
        try:
            res = http_get_json(url, timeout=15, post_json={"nowYM": ym, "plcCd": ""})
            rows = res[0] if isinstance(res, list) and res and isinstance(res[0], list) else []
            for ev in rows:
                seq = ev.get("evtSeq")
                if seq is not None:
                    seen[int(seq)] = ev
        except Exception:
            pass

    # Fallback to cached official JSON if live call got 0 rows
    if not seen and (RAW_DIR / "ksponco_events_official.json").exists():
        cached = json.loads((RAW_DIR / "ksponco_events_official.json").read_text(encoding="utf-8"))
        for ym in months:
            for ev in cached.get(ym, []):
                if ev.get("evtSeq") is not None:
                    seen[int(ev["evtSeq"])] = ev

    # Load 15149169 English concerts for global ticketing URLs
    en_links: list[dict] = []
    en_csv = next(RAW_DIR.glob("15149169_*.csv"), None)
    if en_csv:
        df_en = pd.read_csv(en_csv, encoding="cp949")
        for _, r in df_en.tail(16).iterrows():
            en_links.append({
                "id": str(r["일련번호"]),
                "title_en": str(r["공연제목"]).strip(),
                "date": str(r["공연일자"]).strip(),
                "ticket_url": str(r["상세주소"]).strip(),
                "image_url": str(r["공연이미지"]).strip(),
            })

    venue_map = {
        "02": ("KSPO DOME", "KSPO DOME", 15000),
        "03": ("티켓링크 라이브 아레나(핸드볼경기장)", "Ticketlink Live Arena (Handball)", 5003),
        "01": ("올림픽홀", "Olympic Hall", 3000),
        "04": ("우리금융아트홀", "Woori Art Hall", 1184),
        "05": ("K-아트홀", "K-Art Hall", 420),
        "07": ("뮤즈라이브", "Muse Live", 240),
    }

    concerts = []
    for seq, ev in sorted(seen.items(), key=lambda kv: (kv[1].get("beginDt") or "9999")):
        b = (ev.get("beginDt") or "").strip()[:10]
        e = (ev.get("endDt") or b).strip()[:10]
        if not b or e < today_str:
            continue
        cd = (ev.get("plcCd") or "").strip()
        raw_plc = (ev.get("plc") or "").strip()
        if cd in venue_map:
            v_ko, v_en, cap = venue_map[cd]
        elif "KSPO" in raw_plc.upper() or "체조" in raw_plc:
            v_ko, v_en, cap = venue_map["02"]
        elif "올림픽홀" in raw_plc:
            v_ko, v_en, cap = venue_map["01"]
        elif "핸드볼" in raw_plc or "티켓링크" in raw_plc:
            v_ko, v_en, cap = venue_map["03"]
        elif "우리금융" in raw_plc:
            v_ko, v_en, cap = venue_map["04"]
        else:
            v_ko, v_en, cap = raw_plc or "올림픽공원", raw_plc or "Olympic Park", 2000

        status = "live" if b <= today_str <= e else "upcoming"
        title_ko = (ev.get("title") or "").strip()
        rsv = (ev.get("rsvLink") or "").strip()
        concerts.append({
            "id": f"kspo-{seq}",
            "title_ko": title_ko,
            "title_en": title_ko,
            "venue_ko": v_ko,
            "venue_en": v_en,
            "start_date": b,
            "end_date": e,
            "show_times": (ev.get("tm") or "").strip(),
            "status": status,
            "expected_capacity": cap,
            "ticket_url": rsv if rsv.startswith("http") else f"https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoView.es?mid=a20301010100&evtSeq={seq}",
            "source": "KSPO&CO 공식 공연일정 API (a20301010100)",
        })

    # Detect simultaneous multi-venue concert peak dates!
    date_buckets: dict[str, list[dict]] = {}
    for c in concerts:
        d0 = datetime.strptime(c["start_date"], "%Y-%m-%d")
        d1 = min(datetime.strptime(c["end_date"], "%Y-%m-%d"), d0 + timedelta(days=45))
        cur = d0
        while cur <= d1:
            ds = cur.strftime("%Y-%m-%d")
            date_buckets.setdefault(ds, []).append(c)
            cur += timedelta(days=1)

    for c in concerts:
        d0 = datetime.strptime(c["start_date"], "%Y-%m-%d")
        d1 = min(datetime.strptime(c["end_date"], "%Y-%m-%d"), d0 + timedelta(days=45))
        max_sim = 1
        cur = d0
        while cur <= d1:
            ds = cur.strftime("%Y-%m-%d")
            max_sim = max(max_sim, len({x["venue_ko"] for x in date_buckets.get(ds, [])}))
            cur += timedelta(days=1)
        c["max_simultaneous_venues"] = max_sim

    # Append recent 2026 global English archive records (15149169) at end for international fans
    for e_item in reversed(en_links[-8:]):
        concerts.append({
            "id": e_item["id"],
            "title_ko": e_item["title_en"],
            "title_en": e_item["title_en"],
            "venue_ko": "올림픽공원 (영문 예매)",
            "venue_en": "Olympic Park (Global Ticketing)",
            "start_date": e_item["date"],
            "end_date": e_item["date"],
            "status": "archive",
            "expected_capacity": 8000,
            "ticket_url": e_item["ticket_url"],
            "source": "data.go.kr 15149169 영문 공연정보",
        })

    return concerts


def run_72h_ml_forecast(kma_72h: dict, concerts: list[dict]) -> list[dict]:
    """Run our trained SafePass Ridge model over the live 72-hour KMA weather + KSPO&CO concert schedule!"""
    mb_path = WEB_DATA_DIR / "model_bundle.json"
    if not mb_path.exists():
        return []
    mb = json.loads(mb_path.read_text(encoding="utf-8"))
    m_in = mb["ridge_browser_inference"]["entries_h"]
    m_out = mb["ridge_browser_inference"]["exits_h"]

    def pred(md: dict, dow: int, hour: int, row: dict[str, float]) -> int:
        base_arr = md["diurnal_base_weekend"] if dow >= 5 else md["diurnal_base_weekday"]
        base = float(base_arr[hour])
        if hour < 6:
            return max(0, int(round(base)))
        val = float(md["intercept"])
        for i, f in enumerate(md["features"]):
            sc = md["scale"][i] if md["scale"][i] != 0 else 1.0
            val += float(md["coef"][i]) * ((row.get(f, 0.0) - float(md["mean"][i])) / sc)
        return max(0, int(round(base + val)))

    # Group active concerts by date
    active_c = [c for c in concerts if c["status"] in ("live", "upcoming")]
    slots = kma_72h.get("hourly_72h") or []
    daily_rn = {}
    for s in slots:
        daily_rn[s["date"]] = daily_rn.get(s["date"], 0.0) + float(s.get("rain_mm", 0.0))

    preds_72h = []
    for idx, s in enumerate(slots):
        ds = s["date"]
        h = int(s["hour"])
        dow = datetime.strptime(ds, "%Y-%m-%d").weekday()
        day_evs = [c for c in active_c if c["start_date"] <= ds <= c["end_date"]]
        cap_k = sum(c["expected_capacity"] for c in day_evs) / 1000.0
        n_maj = sum(1 for c in day_evs if c["expected_capacity"] >= 3000)
        has_dome = 1.0 if any("KSPO DOME" in c["venue_ko"] for c in day_evs) else 0.0
        sh = 18 if dow == 5 else (17 if dow == 6 else 19)
        offs = {k: 0.0 for k in ["cap_m3", "cap_m2", "cap_m1", "cap_0", "cap_p1", "cap_p2", "cap_p3", "cap_p4"]}
        off_map = {-3: "cap_m3", -2: "cap_m2", -1: "cap_m1", 0: "cap_0", 1: "cap_p1", 2: "cap_p2", 3: "cap_p3", 4: "cap_p4"}
        if cap_k > 0 and (h - sh) in off_map:
            offs[off_map[h - sh]] = cap_k

        rn = float(s.get("rain_mm", 0.0))
        rn3 = sum(float(slots[j].get("rain_mm", 0.0)) for j in range(max(0, idx - 2), idx + 1))
        rnd = daily_rn.get(ds, 0.0)
        lrn, lrn3, lrnd = math.log1p(rn), math.log1p(rn3), math.log1p(rnd)
        is_dt = 1.0 if 6 <= h <= 21 else 0.0
        is_m = 1.0 if 7 <= h <= 11 else 0.0
        is_ev = 1.0 if 16 <= h <= 22 else 0.0
        is_ni = 1.0 if 20 <= h <= 22 else 0.0
        is_wknd = 1.0 if dow >= 5 else 0.0
        is_fri = 1.0 if dow == 4 else 0.0
        is_sat = 1.0 if dow == 5 else 0.0
        is_sun = 1.0 if dow == 6 else 0.0
        no_dome = 1.0 - has_dome
        multi_v = 1.0 if n_maj >= 2 else 0.0

        row = {
            **offs,
            "concert_cap_x_evening": cap_k * is_ev,
            "concert_cap_x_night": cap_k * is_ni,
            "no_dome_wknd_x_evening": is_wknd * no_dome * is_ev,
            "multi_venue_x_pre": multi_v * (offs["cap_m2"] + offs["cap_m1"]) / 10.0,
            "multi_venue_x_exit": multi_v * (offs["cap_p3"] + 0.5 * offs["cap_p2"]) / 10.0,
            "fri_x_dome_evening": is_fri * has_dome * is_ev,
            "fri_x_evening": is_fri * is_ev,
            "sun_x_morning": is_sun * is_m,
            "sat_x_evening": is_sat * is_ev,
            "rain_hr_x_no_dome_day": lrn * no_dome * is_dt,
            "rain_day_x_no_dome_day": lrnd * no_dome * is_dt,
            "rain_x_cap_arrival": lrnd * (offs["cap_m2"] + offs["cap_m1"]) / 10.0,
            "rain_x_cap_exit": (0.5 * lrn3 + 0.5 * lrnd) * (offs["cap_p3"] + 0.4 * offs["cap_p4"]) / 10.0,
            "rain_day_x_multi_venue_exit": lrnd * multi_v * is_ni,
            "ta_dev_x_daytime": 0.0,
        }
        p_in = pred(m_in, dow, h, row)
        p_out = pred(m_out, dow, h, row)
        preds_72h.append({
            "fcst_dt": s["fcst_dt"],
            "date": ds,
            "hour": h,
            "pred_entries": p_in,
            "pred_exits": p_out,
            "rain_mm": rn,
            "temp_c": s.get("temp_c"),
            "active_concerts": len(day_evs),
            "concert_cap": int(cap_k * 1000),
            "risk_level": "만차임박" if (p_out >= 560 or p_in >= 560) else ("혼잡" if (p_out >= 420 or p_in >= 430) else ("보통" if (p_in >= 250 or p_out >= 250) else "여유")),
        })
    return preds_72h


def main():
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    snap_path = WEB_DATA_DIR / "live_snapshot.json"
    prev = json.loads(snap_path.read_text(encoding="utf-8")) if snap_path.exists() else {}

    seoul_key = get_secret("SEOUL_OPENDATA_KEY", "seoul-opendata")
    data_go_key = get_secret("DATA_GO_KR_KEY", "nps-data")
    kma_hub_key = get_secret("KMA_APIHUB_KEY", "kma-apihub", r"api_key=([^\s,;]+)")

    statuses: dict[str, str] = {}

    # 1. KSPO&CO live parking
    try:
        kspo_parking = fetch_kspo_parking()
        statuses["kspo_parking"] = f"OK (parking_sum={kspo_parking['parking_sum']})"
    except Exception as e:
        kspo_parking = dict(prev.get("kspo_parking") or {}, stale=True, api_status="fallback")
        statuses["kspo_parking"] = f"FALLBACK ({type(e).__name__})"

    # 2. Seoul Citydata
    try:
        if not seoul_key:
            raise RuntimeError("Missing Seoul OpenData key")
        city = fetch_seoul_citydata(seoul_key)
        statuses["seoul_citydata"] = (
            f"OK (pop={city['seoul_population']['min']}~{city['seoul_population']['max']}, "
            f"prk_gap={city['seoul_parking_gap_verification']['unavailable_cur_prk_yn_n_count']}/{city['seoul_parking_gap_verification']['total_lots_in_citydata']} CUR_PRK_YN=N)"
        )
    except Exception as e:
        city = {
            "seoul_population": prev.get("seoul_population") or {},
            "seoul_parking_gap_verification": prev.get("seoul_parking_gap_verification") or {},
            "weather_live": prev.get("weather") or {},
            "road_traffic": prev.get("road_traffic") or {},
            "subways_live": prev.get("subways_live") or [],
            "sbike_live": prev.get("sbike_live") or {},
            "bus_stops_count": prev.get("bus_stops_count", 0),
            "citydata_events": prev.get("citydata_events") or [],
            "stale": True,
        }
        statuses["seoul_citydata"] = f"FALLBACK ({type(e).__name__})"

    # 3. Songpa overflow live parking
    try:
        if not seoul_key:
            raise RuntimeError("Missing Seoul OpenData key")
        songpa_overflow = fetch_songpa_overflow_live(seoul_key)
        statuses["songpa_overflow"] = f"OK ({len(songpa_overflow)} live municipal lots)"
    except Exception as e:
        songpa_overflow = prev.get("songpa_overflow_live") or []
        statuses["songpa_overflow"] = f"FALLBACK ({type(e).__name__})"

    # 4. KMA 72h VilageFcst
    try:
        kma_72h = fetch_kma_vilage_72h(data_go_key, kma_hub_key)
        statuses["kma_vilage_72h"] = f"OK ({len(kma_72h['hourly_72h'])}h, base={kma_72h['base_date']} {kma_72h['base_time']})"
    except Exception as e:
        kma_72h = dict(prev.get("kma_forecast_72h") or {}, stale=True)
        statuses["kma_vilage_72h"] = f"FALLBACK ({type(e).__name__})"

    # 5. KSPO&CO live upcoming concerts + 15149169 EN links
    try:
        concerts = fetch_upcoming_concerts()
        statuses["concerts"] = f"OK ({len([c for c in concerts if c['status']!='archive'])} live/upcoming + {len([c for c in concerts if c['status']=='archive'])} EN archive)"
    except Exception as e:
        concerts = prev.get("concerts") or []
        statuses["concerts"] = f"FALLBACK ({type(e).__name__})"

    # 6. 72h SafePass ML predictions
    ml_72h = run_72h_ml_forecast(kma_72h, concerts)

    now_iso = datetime.now(KST).isoformat(timespec="seconds")
    snapshot = {
        "updated_at": now_iso,
        "updatedAt": now_iso,
        "source_mode": "static-snapshot",
        "upstream_status": statuses,
        "kspo_parking": kspo_parking,
        "seoul_population": city["seoul_population"],
        "seoul_parking_gap_verification": city["seoul_parking_gap_verification"],
        "weather": city["weather_live"],
        "kma_forecast_72h": kma_72h,
        "ml_forecast_72h": ml_72h,
        "road_traffic": city["road_traffic"],
        "subways_live": city["subways_live"],
        "sbike_live": city["sbike_live"],
        "bus_stops_count": city["bus_stops_count"],
        "songpa_overflow_live": songpa_overflow,
        "citydata_events": city["citydata_events"],
        "concerts": concerts,
    }

    snap_path.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Also write modular companion JSONs expected by B2's dataLoader.ts!
    (WEB_DATA_DIR / "concerts.json").write_text(json.dumps({"updated_at": now_iso, "items": concerts}, ensure_ascii=False, indent=2), encoding="utf-8")

    audit_path = PROC_DIR / "audit_summary.json"
    if audit_path.exists():
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        (WEB_DATA_DIR / "monthly_parking.json").write_text(
            json.dumps(audit["monthly_parking_15131671"]["olympicpark_monthly"], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (WEB_DATA_DIR / "parking_zones.json").write_text(
            json.dumps(audit["zone_congestion_15164156"]["zones"], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (WEB_DATA_DIR / "quality_audit.json").write_text(
            json.dumps({"generated_at_kst": now_iso, "six_defects": audit["six_defects"], "reconciliation": audit["reconciliation"]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print("=== Live Refresh Completed ===")
    for k, v in statuses.items():
        print(f"  [{k:18s}] {v}")
    print(f"  Wrote {snap_path} ({snap_path.stat().st_size:,} bytes) + ml_72h={len(ml_72h)} slots + concerts.json")


if __name__ == "__main__":
    main()
