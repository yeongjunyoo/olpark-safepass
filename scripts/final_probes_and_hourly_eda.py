import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup
import numpy as np
import pandas as pd

sys.path.insert(0, r"C:\Users\basqu\My-Personal-Assistant")
from scripts.lib import creds

OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
RAW_DIR = OUT_DIR / "raw"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"}


def fetch(url, timeout=20, data=None, headers=None):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers, r.read()


# 1. XR 3D asset sizes via GET Range: bytes=0-0 (1 byte only!)
print("=== 1. XR 3D Asset Sizes (15127487) ===")
df_xr = pd.read_csv(next(RAW_DIR.glob("15127487_*.csv")), encoding="cp949")
for _, row in df_xr.iterrows():
    fname = str(row["파일명"]).strip()
    dl_u = f"https://www.ksponco.or.kr/attachFiles/download/kspo/{fname}"
    try:
        st, hdrs, _ = fetch(dl_u, timeout=15, headers={"Range": "bytes=0-0"})
        cr = hdrs.get("Content-Range", "")
        cl = hdrs.get("Content-Length", "")
        tot = int(cr.split("/")[-1]) if "/" in cr else int(cl or 0)
        print(f"  OK [{st}] {row['장소']:10s} | {row['확장자']:3s} | {fname:22s} | {tot/1024/1024:7.2f} MB")
    except Exception as e:
        print(f"  ERR {fname}: {e}")

# 2. Check bigdata-culture.kr JS for columninfo.do exact params + visible metadata on 96104 & 96399
print("\n=== 2. bigdata-culture.kr columninfo JS & metadata ===")
for label, uid in [
    ("96104_차량이용현황", "a2d6393d-246e-439b-8bfb-c25204e808fb"),
    ("96399_올림픽공원대관", "42fa1e06-1767-4a96-84d3-dc1dd591bb41"),
]:
    _, _, raw = fetch(f"https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id={uid}", timeout=15)
    html = raw.decode("utf-8", errors="ignore")
    if "96104" in label:
        m = re.search(r"columninfo\.do[\s\S]{0,600}", html)
        if m:
            print("  columninfo JS:", m.group(0)[:500])
    # Extract dataset metadata text (period, file count, format, size)
    sp = BeautifulSoup(html, "html.parser")
    for dl in sp.select("dl, .info_box, .detail_info, .meta_list, ul.list_info"):
        t = dl.get_text(" | ", strip=True)
        if any(k in t for k in ["갱신", "제공기관", "기준", "파일", "컬럼", "데이터"]):
            print(f"  [{label}] META:", t[:250])
            break
    # Try fetching file list or hidden inputs
    hiddens = [(i.get("name") or i.get("id"), i.get("value")) for i in sp.select("input[type=hidden]") if i.get("value")]
    print(f"  [{label}] hiddens:", hiddens[:12])

# 3. KMA APIHUB HOURLY weather for July 2024 (kma_sfctm3.php = range query!)
print("\n=== 3. KMA APIHUB July 2024 Hourly Weather & Correlation ===")
kma_row = creds.get_account("kma-apihub")
kma_key = None
if kma_row:
    m_k = re.search(r"api_key=([^\s,;]+)", kma_row.get("extra", ""))
    kma_key = m_k.group(1) if m_k else None

df_w_daily = None
if kma_key:
    u = f"https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php?tm1=202407010000&tm2=202407312300&stn=108&help=1&authKey={urllib.parse.quote(kma_key)}"
    try:
        _, _, raw = fetch(u, timeout=25)
        txt = raw.decode("euc-kr", errors="ignore")
        col_line = next((ln for ln in txt.splitlines() if "YYMMDDHHMI" in ln and "STN" in ln), None)
        print("  KMA hourly header:", col_line[:160] if col_line else "NONE")
        rows = []
        for ln in txt.splitlines():
            s = ln.strip()
            if not s or s.startswith("#"):
                continue
            p = s.split()
            if len(p) >= 20 and p[0].isdigit() and len(p[0]) == 12:
                rows.append(p)
        print(f"  KMA hourly rows fetched: {len(rows)}")
        if rows:
            # Parse cols: 0:TM, 1:STN, 3:WS, 11:TA, 13:HM, 15:RN (hourly rainfall, -9.0 = no rain)
            cols = col_line.lstrip("#").split() if col_line else []
            df_h = pd.DataFrame(rows)
            if len(cols) == df_h.shape[1]:
                df_h.columns = cols
                c_tm, c_ta, c_hm, c_rn, c_ws = "YYMMDDHHMI", "TA", "HM", "RN", "WS"
            else:
                c_tm, c_ta, c_hm, c_rn, c_ws = 0, 11, 13, 15, 3
            df_hw = pd.DataFrame({
                "dt": pd.to_datetime(df_h[c_tm], format="%Y%m%d%H%M"),
                "ta": pd.to_numeric(df_h[c_ta], errors="coerce"),
                "hm": pd.to_numeric(df_h[c_hm], errors="coerce"),
                "rn": pd.to_numeric(df_h[c_rn], errors="coerce").clip(lower=0),
                "ws": pd.to_numeric(df_h[c_ws], errors="coerce").clip(lower=0),
            })
            df_hw["date"] = df_hw["dt"].dt.strftime("%Y-%m-%d")
            df_hw["hour"] = df_hw["dt"].dt.hour
            df_hw.to_csv(RAW_DIR / "kma_asos108_202407_hourly.csv", index=False, encoding="utf-8-sig")

            # Merge HOURLY weather with HOURLY vehicle entries (n=744 hours!)
            df_in = pd.read_csv(next(RAW_DIR.glob("15138735_*.csv")), encoding="cp949")
            df_in["in_dt"] = pd.to_datetime(df_in["입차일시"])
            df_in["out_dt"] = pd.to_datetime(df_in["출차일시"])
            df_in["stay_min"] = (df_in["out_dt"] - df_in["in_dt"]).dt.total_seconds() / 60.0
            df_in["date"] = df_in["in_dt"].dt.strftime("%Y-%m-%d")
            df_in["hour"] = df_in["in_dt"].dt.hour

            h_veh = df_in.groupby(["date", "hour"]).size().reset_index(name="veh_hr")
            hm = df_hw.merge(h_veh, on=["date", "hour"], how="left").fillna({"veh_hr": 0})
            # Restrict to daytime active hours 06~21 for weather sensitivity
            hm_day = hm[(hm["hour"] >= 6) & (hm["hour"] <= 21)].copy()
            hm_day["rain_hr"] = hm_day["rn"] > 0
            hm_day["heavy_rain_hr"] = hm_day["rn"] >= 5.0
            print(f"  [HOURLY WEATHER x VEHICLES (06~21시, n={len(hm_day)}h)]")
            print("    Hourly corr with veh_hr:", hm_day[["veh_hr", "ta", "hm", "rn", "ws"]].corr()["veh_hr"].round(3).to_dict())
            print("    Mean veh/hr by rain>0mm:", hm_day.groupby("rain_hr")["veh_hr"].agg(["count", "mean", "median"]).round(1).to_dict())
            print("    Mean veh/hr by rain>=5mm:", hm_day.groupby("heavy_rain_hr")["veh_hr"].agg(["count", "mean", "median"]).round(1).to_dict())

            # Daily aggregation
            df_w_daily = df_hw.groupby("date").agg(
                ta_avg=("ta", "mean"), ta_max=("ta", "max"), hm_avg=("hm", "mean"),
                rn_day=("rn", "sum"), rain_hours=("rn", lambda s: int((s > 0).sum())),
            ).reset_index()
            daily_v = df_in.groupby("입차일").agg(
                vehicles=("입차일시", "count"),
                stay_gt_10m=("stay_min", lambda s: int((s > 10).sum())),
                night_exit_20_22=("out_dt", lambda s: int(((s.dt.hour >= 20) & (s.dt.hour <= 22)).sum())),
                median_stay_min=("stay_min", "median"),
            ).reset_index().rename(columns={"입차일": "date"})
            daily_v["dow"] = pd.to_datetime(daily_v["date"]).dt.dayofweek
            dm = daily_v.merge(df_w_daily, on="date", how="left")
            print("\n  [DAILY WEATHER x VEHICLES (July 2024, n=31d)]")
            print("    Daily corr with vehicles:", dm[["vehicles", "stay_gt_10m", "night_exit_20_22", "ta_avg", "ta_max", "hm_avg", "rn_day", "rain_hours"]].corr()["vehicles"].round(3).to_dict())
            print("    Dry (rn<5mm) vs Rainy (rn>=5mm) vs Heavy (>=30mm):")
            dm["rain_cat"] = pd.cut(dm["rn_day"], bins=[-0.1, 0.1, 10, 30, 500], labels=["무강수(0mm)", "약한비(0~10)", "보통비(10~30)", "폭우(30mm+)"])
            print(dm.groupby("rain_cat", observed=False)["vehicles"].agg(["count", "mean", "median", "min", "max"]).round(1).to_string())
            # Weekend rain vs dry!
            dm_wk = dm[dm["dow"] >= 5]
            print("    Weekend days (n=8) sorted by vehicles:\n", dm_wk[["date", "dow", "vehicles", "night_exit_20_22", "rn_day", "ta_max"]].sort_values("vehicles", ascending=False).to_string(index=False))
            dm.to_csv(RAW_DIR / "july2024_merged_eda.csv", index=False, encoding="utf-8-sig")
    except Exception as e:
        print("  KMA hourly ERR:", type(e).__name__, str(e)[:150])

# 4. Diagnose Seoul Subway CardSubwayStatsNew response (ONLY print RESULT code/msg, NEVER key!)
print("\n=== 4. Seoul Subway CardSubwayStatsNew diagnostic ===")
seoul_row = creds.get_account("seoul-opendata")
seoul_key = (seoul_row.get("password") or seoul_row.get("login_id")) if seoul_row else None
if seoul_key:
    for svc in ["CardSubwayStatsNew", "CardSubwayTime"]:
        param = "20240712" if svc == "CardSubwayStatsNew" else "202407"
        u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/{svc}/1/5/{param}"
        try:
            _, _, raw = fetch(u, timeout=15)
            obj = json.loads(raw.decode("utf-8", errors="ignore"))
            top_k = list(obj.keys())
            if svc in obj:
                rows = obj[svc].get("row", [])
                print(f"  [{svc}] HIT! total={obj[svc].get('list_total_count')}, sample_keys={list(rows[0].keys()) if rows else []}")
            else:
                print(f"  [{svc}] keys={top_k}, RESULT={obj.get('RESULT')}")
        except Exception as e:
            print(f"  [{svc}] ERR: {type(e).__name__}")
    # Also test CardSubwayStatsNew with 20240712 paging through all stations if HIT!
    u_all = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/CardSubwayStatsNew/1/700/20240712"
    try:
        _, _, raw = fetch(u_all, timeout=15)
        obj = json.loads(raw.decode("utf-8", errors="ignore"))
        if "CardSubwayStatsNew" in obj:
            rows = obj["CardSubwayStatsNew"].get("row", [])
            hits = [r for r in rows if any(k in str(r) for k in ["올림픽공원", "몽촌토성", "한성백제"])]
            print(f"  [CardSubwayStatsNew 20240712] matched stations={len(hits)}:", hits)
            # Fetch ALL 31 days of July 2024 now!
            sub_all = []
            for d in range(1, 32):
                ds = f"202407{d:02d}"
                _, _, rr = fetch(f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/CardSubwayStatsNew/1/700/{ds}", timeout=12)
                oo = json.loads(rr.decode("utf-8", errors="ignore"))
                for r in (oo.get("CardSubwayStatsNew") or {}).get("row") or []:
                    if any(k in str(r.get("SBWY_STNS_NM") or r.get("SUB_STA_NM") or "") for k in ["올림픽공원", "몽촌토성", "한성백제"]):
                        sub_all.append({
                            "date": f"2024-07-{d:02d}",
                            "line": r.get("SBWY_ROUT_LN_NM") or r.get("LINE_NUM"),
                            "station": r.get("SBWY_STNS_NM") or r.get("SUB_STA_NM"),
                            "ride": int(float(r.get("GTON_TNOPE") or r.get("RIDE_PASGR_NUM") or 0)),
                            "alight": int(float(r.get("GTOFF_TNOPE") or r.get("ALIGHT_PASGR_NUM") or 0)),
                        })
            df_sub = pd.DataFrame(sub_all)
            df_sub.to_csv(RAW_DIR / "seoul_subway_olympicpark_202407.csv", index=False, encoding="utf-8-sig")
            df_sd = df_sub.groupby("date")[["ride", "alight"]].sum().reset_index()
            df_sd["subway_total"] = df_sd["ride"] + df_sd["alight"]
            # Re-merge with july2024_merged_eda.csv!
            dm = pd.read_csv(RAW_DIR / "july2024_merged_eda.csv")
            dm = dm.merge(df_sd, on="date", how="left")
            dm.to_csv(RAW_DIR / "july2024_merged_eda.csv", index=False, encoding="utf-8-sig")
            print(f"  [SAVED 31-day Subway x Vehicles x Weather!] corr(vehicles, subway_total) = {dm['vehicles'].corr(dm['subway_total']):.3f}, corr(night_exit_20_22, subway_total) = {dm['night_exit_20_22'].corr(dm['subway_total']):.3f}")
            print("  Top 8 days by subway_total:\n", dm.sort_values("subway_total", ascending=False)[["date", "dow", "vehicles", "night_exit_20_22", "subway_total", "rn_day"]].head(8).to_string(index=False))
    except Exception as e:
        print("  Subway full ERR:", type(e).__name__, str(e)[:120])
