import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, r"C:\Users\basqu\My-Personal-Assistant")
from scripts.lib import creds

OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
RAW_DIR = OUT_DIR / "raw"
HEADERS = {"User-Agent": "Mozilla/5.0"}


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


# 1. KMA APIHUB July 2024 hourly weather in 4 short chunks (help=0, fast!)
print("=== 1. KMA APIHUB July 2024 Hourly Weather (4 chunks) ===")
kma_row = creds.get_account("kma-apihub")
m_k = re.search(r"api_key=([^\s,;]+)", kma_row.get("extra", "")) if kma_row else None
kma_key = m_k.group(1) if m_k else None

chunks = [
    ("202407010000", "202407082300"),
    ("202407090000", "202407162300"),
    ("202407170000", "202407242300"),
    ("202407250000", "202407312300"),
]
w_rows = []
if kma_key:
    for t1, t2 in chunks:
        u = f"https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php?tm1={t1}&tm2={t2}&stn=108&help=0&authKey={urllib.parse.quote(kma_key)}"
        try:
            _, raw = fetch(u, timeout=25)
            txt = raw.decode("euc-kr", errors="ignore")
            for ln in txt.splitlines():
                s = ln.strip()
                if not s or s.startswith("#"):
                    continue
                p = s.split()
                if len(p) >= 20 and p[0].isdigit() and len(p[0]) == 12:
                    # Standard kma_sfctm2/3 cols: 0=TM, 1=STN, 2=WD, 3=WS, 11=TA, 13=HM, 15=RN
                    w_rows.append((p[0], float(p[3]), float(p[11]), float(p[13]), float(p[15])))
        except Exception as e:
            print(f"  chunk {t1}~{t2} ERR: {type(e).__name__}")

print(f"  Total hourly weather rows: {len(w_rows)}")
if w_rows:
    df_hw = pd.DataFrame(w_rows, columns=["tm", "ws", "ta", "hm", "rn"])
    df_hw["dt"] = pd.to_datetime(df_hw["tm"], format="%Y%m%d%H%M")
    df_hw["rn"] = df_hw["rn"].apply(lambda x: 0.0 if x < 0 else x)
    df_hw["ws"] = df_hw["ws"].apply(lambda x: np.nan if x < 0 else x)
    df_hw["ta"] = df_hw["ta"].apply(lambda x: np.nan if x < -50 else x)
    df_hw["hm"] = df_hw["hm"].apply(lambda x: np.nan if x < 0 else x)
    df_hw["date"] = df_hw["dt"].dt.strftime("%Y-%m-%d")
    df_hw["hour"] = df_hw["dt"].dt.hour
    df_hw.to_csv(RAW_DIR / "kma_asos108_202407_hourly.csv", index=False, encoding="utf-8-sig")

    df_in = pd.read_csv(next(RAW_DIR.glob("15138735_*.csv")), encoding="cp949")
    df_in["in_dt"] = pd.to_datetime(df_in["입차일시"])
    df_in["out_dt"] = pd.to_datetime(df_in["출차일시"])
    df_in["stay_min"] = (df_in["out_dt"] - df_in["in_dt"]).dt.total_seconds() / 60.0
    df_in["date"] = df_in["in_dt"].dt.strftime("%Y-%m-%d")
    df_in["hour"] = df_in["in_dt"].dt.hour

    # Hourly merge
    h_veh = df_in.groupby(["date", "hour"]).size().reset_index(name="veh_hr")
    hm = df_hw.merge(h_veh, on=["date", "hour"], how="left").fillna({"veh_hr": 0})
    hm_day = hm[(hm["hour"] >= 6) & (hm["hour"] <= 21)].copy()
    print("  [HOURLY 06~21시 Weather x Vehicles (n=%d)]" % len(hm_day))
    print("    corr:", hm_day[["veh_hr", "ta", "hm", "rn", "ws"]].corr()["veh_hr"].round(3).to_dict())
    print("    no_rain vs rain>0 vs rain>=5mm:")
    hm_day["rain_grp"] = pd.cut(hm_day["rn"], bins=[-0.1, 0.01, 5.0, 200], labels=["무강수", "약한비(0~5mm/h)", "강한비(5mm/h+)"])
    print(hm_day.groupby("rain_grp", observed=False)["veh_hr"].agg(["count", "mean", "median"]).round(1).to_string())

    # Daily merge
    w_daily = df_hw.groupby("date").agg(
        ta_avg=("ta", "mean"), ta_max=("ta", "max"), hm_avg=("hm", "mean"),
        rn_day=("rn", "sum"), rain_hours=("rn", lambda s: int((s > 0).sum())),
    ).reset_index()
    v_daily = df_in.groupby("입차일").agg(
        vehicles=("입차일시", "count"),
        stay_gt_10m=("stay_min", lambda s: int((s > 10).sum())),
        night_exit_20_22=("out_dt", lambda s: int(((s.dt.hour >= 20) & (s.dt.hour <= 22)).sum())),
        median_stay_min=("stay_min", "median"),
    ).reset_index().rename(columns={"입차일": "date"})
    v_daily["dow"] = pd.to_datetime(v_daily["date"]).dt.dayofweek
    v_daily["is_weekend"] = (v_daily["dow"] >= 5).astype(int)
    dm = v_daily.merge(w_daily, on="date", how="left")
    dm.to_csv(RAW_DIR / "july2024_merged_eda.csv", index=False, encoding="utf-8-sig")

    print("\n  [DAILY July 2024 Weather x Vehicles (n=31)]")
    print("    corr with vehicles:", dm[["vehicles", "stay_gt_10m", "night_exit_20_22", "ta_avg", "ta_max", "hm_avg", "rn_day", "rain_hours"]].corr()["vehicles"].round(3).to_dict())
    dm["rain_cat"] = pd.cut(dm["rn_day"], bins=[-0.1, 0.1, 10, 30, 500], labels=["무강수(0mm)", "약한비(0~10)", "보통비(10~30)", "폭우(30mm+)"])
    print(dm.groupby("rain_cat", observed=False)["vehicles"].agg(["count", "mean", "median", "min", "max"]).round(1).to_string())
    print("\n  [TOP 8 & BOTTOM 5 DAYS WITH WEATHER]")
    print(dm.sort_values("vehicles", ascending=False)[["date", "dow", "vehicles", "night_exit_20_22", "rn_day", "rain_hours", "ta_max"]].head(8).round(1).to_string(index=False))
    print("---")
    print(dm.sort_values("vehicles", ascending=True)[["date", "dow", "vehicles", "night_exit_20_22", "rn_day", "rain_hours", "ta_max"]].head(5).round(1).to_string(index=False))

# 2. Seoul Subway CardSubwayTime for 202407 & 202610 (Olympic Park 4 stations!)
print("\n=== 2. Seoul Subway CardSubwayTime (2024-07 & 2026-10) ===")
seoul_row = creds.get_account("seoul-opendata")
seoul_key = (seoul_row.get("password") or seoul_row.get("login_id")) if seoul_row else None
if seoul_key:
    for ym in ["202407", "202610"]:
        u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/CardSubwayTime/1/700/{ym}"
        try:
            _, raw = fetch(u, timeout=20)
            obj = json.loads(raw.decode("utf-8", errors="ignore"))
            rows = (obj.get("CardSubwayTime") or {}).get("row") or []
            hits = [r for r in rows if any(k in str(r.get("STTN", "")) for k in ["올림픽공원", "몽촌토성", "한성백제"])]
            print(f"  [{ym}] matched stations: {len(hits)}")
            if hits:
                df_st = pd.DataFrame(hits)
                df_st.to_csv(RAW_DIR / f"seoul_subway_time_olympicpark_{ym}.csv", index=False, encoding="utf-8-sig")
                # Summarize monthly total on/off per station & hourly curve
                hr_on = {}
                hr_off = {}
                for h in range(24):
                    col_on = f"HR_{h}_GET_ON_NOPE"
                    col_off = f"HR_{h}_GET_OFF_NOPE"
                    if col_on in df_st.columns:
                        hr_on[h] = int(pd.to_numeric(df_st[col_on], errors="coerce").sum())
                        hr_off[h] = int(pd.to_numeric(df_st[col_off], errors="coerce").sum())
                for _, r in df_st.iterrows():
                    tot_on = sum(int(float(r.get(f"HR_{h}_GET_ON_NOPE", 0) or 0)) for h in range(24))
                    tot_off = sum(int(float(r.get(f"HR_{h}_GET_OFF_NOPE", 0) or 0)) for h in range(24))
                    print(f"    {r.get('SBWY_ROUT_LN_NM'):6s} | {r.get('STTN'):16s} | 승차={tot_on:9,d} | 하차={tot_off:9,d}")
                print(f"    4역 합계 월 승차={sum(hr_on.values()):,d}, 월 하차={sum(hr_off.values()):,d}")
                if ym == "202407":
                    # Compare hourly vehicle entry/exit vs subway alight/ride!
                    h_in = df_in["in_dt"].dt.hour.value_counts().reindex(range(24), fill_value=0)
                    h_out = df_in["out_dt"].dt.hour.value_counts().reindex(range(24), fill_value=0)
                    comp = pd.DataFrame({
                        "hour": range(24),
                        "veh_in": [int(h_in[h]) for h in range(24)],
                        "veh_out": [int(h_out[h]) for h in range(24)],
                        "sub_alight": [hr_off.get(h, 0) for h in range(24)],
                        "sub_ride": [hr_on.get(h, 0) for h in range(24)],
                    })
                    print("    Hourly correlation (24h): corr(veh_in, sub_alight)=%.3f, corr(veh_out, sub_ride)=%.3f" % (
                        comp["veh_in"].corr(comp["sub_alight"]), comp["veh_out"].corr(comp["sub_ride"])))
                    print("    Peak hours (17~22시):\n", comp[(comp["hour"] >= 17) & (comp["hour"] <= 22)].to_string(index=False))
        except Exception as e:
            print(f"  [{ym}] ERR: {type(e).__name__}")

# 3. Download 88_glb.zip (4.92 MB) as verified real XR sample & inspect zip contents
print("\n=== 3. Downloading verified XR sample: 88_glb.zip (4.92 MB) ===")
xr_out = RAW_DIR / "15127487_88_glb.zip"
try:
    st, blob = fetch("https://www.ksponco.or.kr/attachFiles/download/kspo/88_glb.zip", timeout=30)
    xr_out.write_bytes(blob)
    with zipfile.ZipFile(xr_out) as zf:
        infos = [(zi.filename, zi.file_size) for zi in zf.infolist()]
    print(f"  SAVED {xr_out.name} ({len(blob):,} bytes), zip entries: {infos}")
except Exception as e:
    print("  XR download ERR:", e)

# 4. Reconcile ksponco.or.kr/pubData (45) vs 15147873 CSV (42) vs data.go.kr (58 = 30 FILE + 28 API)
print("\n=== 4. Exact Reconciliation (ksponco 45 vs CSV 42 vs data.go.kr 58) ===")
k45 = json.loads((OUT_DIR / "ksponco_pubdata_clean.json").read_text(encoding="utf-8"))
d_all = json.loads((OUT_DIR / "datagokr_kspo_verified.json").read_text(encoding="utf-8"))
d58 = [x for x in d_all if x["type"] in ("fileData", "openapi")]
k_ids = set()
k_only_non_dgk = []
for x in k45:
    u = x["fields"].get("URL", "")
    m = re.search(r"data\.go\.kr/data/(\d+)/", u)
    if m:
        k_ids.add(m.group(1))
    else:
        k_only_non_dgk.append((x["pid"], x["title"], u))
d58_ids = {x["id"] for x in d58}
in_d58_not_k45 = [x for x in d58 if x["id"] not in k_ids]
print(f"  data.go.kr official (fileData+openapi): {len(d58)} (fileData={sum(x['type']=='fileData' for x in d58)}, openapi={sum(x['type']=='openapi' for x in d58)})")
print(f"  ksponco.or.kr/pubData: {len(k45)} (with data.go.kr link={len(k_ids)}, non-data.go.kr={len(k_only_non_dgk)})")
print("  ksponco non-data.go.kr items:", k_only_non_dgk)
print(f"  In data.go.kr (58) but MISSING from ksponco.or.kr/pubData ({len(in_d58_not_k45)} items):")
for x in in_d58_not_k45:
    print(f"    [{x['type']:8s}] {x['id']} | created={x.get('dateCreated',''):10s} | {x.get('name')}")
