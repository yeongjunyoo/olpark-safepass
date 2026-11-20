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


def fetch(url, timeout=20, data=None, headers=None, method=None):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers, r.read()


# =========================================================
# 1. Verify 15164156 Oracle HH:MM:DD bug & 15131671 vs 15138735 gap
# =========================================================
print("=== 1. Schema Anomaly Verification ===")
df_cg = pd.read_csv(next(RAW_DIR.glob("15164156_*.csv")), encoding="cp949")
# Check if 등록시간 MM:SS equals 등록일 MM-DD!
mmdd_from_date = df_cg["등록일"].astype(str).str.slice(5, 10).str.replace("-", ":", regex=False)
mmss_from_time = df_cg["등록시간"].astype(str).str.slice(3, 8)
bug_match = (mmdd_from_date == mmss_from_time)
print(f"[15164156] Oracle HH24:MM:DD format bug match: {bug_match.sum()}/{len(df_cg)} ({bug_match.mean()*100:.2f}%)")
print("[15164156] ID vs Zone mapping:")
print(df_cg.groupby(["주차구역", "주차장아이디"]).agg(cnt=("일련번호","count"), min_dt=("등록일","min"), max_dt=("등록일","max")).to_string())

df_mp = pd.read_csv(next(RAW_DIR.glob("15131671_*.csv")), encoding="cp949")
row_2407 = df_mp[(df_mp["연도"] == 2024) & (df_mp["월"] == "07월")]
print("\n[15131671] 2024-07 monthly parking rows:\n", row_2407.to_string(index=False))
print("[15131671] 2025 monthly Olympic Park:\n", df_mp[(df_mp["연도"] == 2025) & (df_mp["주차장소"] == "올림픽공원")].to_string(index=False))

df_in = pd.read_csv(next(RAW_DIR.glob("15138735_*.csv")), encoding="cp949")
df_in["in_dt"] = pd.to_datetime(df_in["입차일시"])
df_in["out_dt"] = pd.to_datetime(df_in["출차일시"])
df_in["stay_min"] = (df_in["out_dt"] - df_in["in_dt"]).dt.total_seconds() / 60.0
print(f"\n[15138735] 2024-07 total={len(df_in):,}, <=5m: {(df_in['stay_min']<=5).sum():,} ({(df_in['stay_min']<=5).mean()*100:.1f}%), <=10m: {(df_in['stay_min']<=10).sum():,} ({(df_in['stay_min']<=10).mean()*100:.1f}%), <=30m: {(df_in['stay_min']<=30).sum():,} ({(df_in['stay_min']<=30).mean()*100:.1f}%), 30m~4h: {((df_in['stay_min']>30)&(df_in['stay_min']<=240)).sum():,}, >4h: {(df_in['stay_min']>240).sum():,}")
# Compare 15138735 (>10m free회차 제외) vs 15131671 (2024-07)
ol_2407 = int(row_2407[row_2407["주차장소"] == "올림픽공원"]["주차대수"].iloc[0])
print(f"Comparison: 15138735 total={len(df_in):,} vs 15131671(2024-07)={ol_2407:,} (ratio={len(df_in)/ol_2407:.2f}x); >10m={(df_in['stay_min']>10).sum():,} (ratio={(df_in['stay_min']>10).sum()/ol_2407:.2f}x)")

# Check 4 sports center CSV date ranges & 종료일자 bugs
print("\n[Sports Center CSV anomalies]")
for pid, col_s, col_e in [
    ("15101610", "시작일자", "종료일자"),
    ("15110953", "수강시작일", "수강종료일"),
    ("15114776", "시작일", "종료일"),
    ("15118652", "기간시작일", "기간종료일"),
]:
    d = pd.read_csv(next(RAW_DIR.glob(f"{pid}_*.csv")), encoding="cp949", low_memory=False)
    has_tilde = d[col_s].astype(str).str.contains("~").mean() * 100
    print(f"  {pid}: rows={len(d):,}, {col_s} contains '~'={has_tilde:.1f}%, sample {col_s}={d[col_s].iloc[0]}, {col_e}={d[col_e].iloc[0]}")

# Check 15161406 공모참여 목록 (past data contests!)
df_ct = pd.read_csv(next(RAW_DIR.glob("15161406_*.csv")), encoding="cp949")
print("\n[15161406] Past KSPO&CO data contests:")
print(df_ct[df_ct["제목"].str.contains("공공데이터|경진대회|데이터", na=False)][["일련번호", "제목", "시작일", "종료일", "조회수", "상태"]].to_string(index=False))

# Check 15133891 테니스장 이용 정보 yearly totals
df_tn = pd.read_csv(next(RAW_DIR.glob("15133891_*.csv")), encoding="cp949")
df_tn["year"] = df_tn["시작일"].str.slice(0, 4)
print("\n[15133891] Tennis yearly users by type:")
print(df_tn.groupby(["year", "구분"])["이용자수"].sum().unstack().to_string())

# =========================================================
# 2. Check XR 3D asset sizes (HTTP HEAD) & 15160326 eco gallery size
# =========================================================
print("\n=== 2. XR 3D Assets (15127487) Direct Download Verification ===")
df_xr = pd.read_csv(next(RAW_DIR.glob("15127487_*.csv")), encoding="cp949")
xr_sizes = []
for _, row in df_xr.iterrows():
    fname = str(row["파일명"]).strip()
    dl_u = f"https://www.ksponco.or.kr/attachFiles/download/kspo/{fname}"
    try:
        st, hdrs, _ = fetch(dl_u, timeout=10, method="HEAD")
        cl = int(hdrs.get("Content-Length", 0))
        print(f"  OK {row['장소']:10s} | {row['확장자']:3s} | {fname:22s} | {cl/1024/1024:7.2f} MB")
        xr_sizes.append((row["장소"], row["확장자"], fname, cl))
    except Exception as e:
        print(f"  ERR {fname}: {type(e).__name__}")

# =========================================================
# 3. Inspect bigdata-culture.kr columninfo.do for 96104, 96399, 96135
# =========================================================
print("\n=== 3. bigdata-culture.kr Schema & File Inspection ===")
for label, uid in [
    ("96104_차량이용현황", "a2d6393d-246e-439b-8bfb-c25204e808fb"),
    ("96399_올림픽공원대관", "42fa1e06-1767-4a96-84d3-dc1dd591bb41"),
    ("96135_스포츠센터수강신청", "493f6d8a-cf13-4de4-880d-8395071dfc15"),
]:
    try:
        # Check HTML for prodId / file list / metadata text
        _, _, raw = fetch(f"https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id={uid}", timeout=15)
        html = raw.decode("utf-8", errors="ignore")
        sp = BeautifulSoup(html, "html.parser")
        # Extract key-value pairs in detail page
        txt = sp.get_text("\n", strip=True)
        lines = [ln for ln in txt.splitlines() if any(k in ln for k in ["제공기관", "수집주기", "갱신", "파일", "기준일", "2024", "2025", "2026", "컬럼", "가격", "무료", "유료", "건수", "용량"])]
        print(f"\n[{label}] key lines:", lines[:15])
        # Try calling /bigdata/data_market/columninfo.do
        post = urllib.parse.urlencode({"id": uid, "prodId": uid}).encode()
        _, _, r2 = fetch("https://www.bigdata-culture.kr/bigdata/data_market/columninfo.do", data=post, headers={"X-Requested-With": "XMLHttpRequest", "Referer": f"https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id={uid}"}, timeout=15)
        c_txt = r2.decode("utf-8", errors="ignore")
        print(f"  columninfo.do len={len(c_txt)} snippet={c_txt[:350].replace(chr(10),' ')}")
    except Exception as e:
        print(f"[{label}] ERR: {e}")

# =========================================================
# 4. July 2024 FULL 31-day Multi-Source Correlation (Vehicles × KMA Weather × Seoul Subway × Concerts!)
# =========================================================
print("\n=== 4. July 2024 Multi-Source Real EDA (Vehicles x KMA Weather x Seoul Subway x Concerts) ===")
# 4A. KMA APIHUB daily/hourly weather for July 2024 (Seoul 108)
kma_row = creds.get_account("kma-apihub")
kma_key = None
if kma_row:
    m_k = re.search(r"api_key=([^\s,;]+)", kma_row.get("extra", ""))
    kma_key = m_k.group(1) if m_k else None

df_weather = None
if kma_key:
    # kma_sfcdd3.php = daily ASOS summary for date range tm1..tm2!
    u = f"https://apihub.kma.go.kr/api/typ01/url/kma_sfcdd3.php?tm1=20240701&tm2=20240731&stn=108&help=1&authKey={urllib.parse.quote(kma_key)}"
    try:
        _, _, raw = fetch(u, timeout=20)
        txt = raw.decode("euc-kr", errors="ignore")
        rows_w = []
        for ln in txt.splitlines():
            s = ln.strip()
            if not s or s.startswith("#"):
                continue
            parts = s.split()
            if len(parts) >= 40 and parts[0].isdigit() and len(parts[0]) == 8:
                # Standard kma_sfcdd3 columns: 0:TM, 1:STN, 2:WS_AVG, 10:TA_AVG, 11:TA_MAX, 13:TA_MIN, 18:HM_AVG, 38:RN_DAY
                rows_w.append(parts)
        # Let's check exact header line from help=1!
        hdr_lines = [ln for ln in txt.splitlines() if ln.startswith("#") and ("TA_AVG" in ln or "RN_DAY" in ln or "YYMMDD" in ln)]
        print("  KMA daily header hints:", hdr_lines[:3])
        if rows_w:
            # Parse header dynamically
            col_line = next((ln for ln in txt.splitlines() if "YYMMDD" in ln and "STN" in ln), None)
            if col_line:
                cols = col_line.lstrip("#").split()
                df_w_raw = pd.DataFrame(rows_w, columns=cols[:len(rows_w[0])]) if len(cols) >= len(rows_w[0]) else pd.DataFrame(rows_w)
            else:
                df_w_raw = pd.DataFrame(rows_w)
            print("  KMA parsed cols:", list(df_w_raw.columns[:42]))
            # Locate TA_AVG, TA_MAX, HM_AVG, RN_DAY
            c_tm = df_w_raw.columns[0]
            c_ta = "TA_AVG" if "TA_AVG" in df_w_raw.columns else df_w_raw.columns[10]
            c_tmax = "TA_MAX" if "TA_MAX" in df_w_raw.columns else df_w_raw.columns[11]
            c_hm = "HM_AVG" if "HM_AVG" in df_w_raw.columns else df_w_raw.columns[18]
            c_rn = "RN_DAY" if "RN_DAY" in df_w_raw.columns else df_w_raw.columns[38]
            df_weather = pd.DataFrame({
                "date": pd.to_datetime(df_w_raw[c_tm], format="%Y%m%d").dt.strftime("%Y-%m-%d"),
                "ta_avg": pd.to_numeric(df_w_raw[c_ta], errors="coerce"),
                "ta_max": pd.to_numeric(df_w_raw[c_tmax], errors="coerce"),
                "hm_avg": pd.to_numeric(df_w_raw[c_hm], errors="coerce"),
                "rn_day": pd.to_numeric(df_w_raw[c_rn], errors="coerce").clip(lower=0),  # -9.0 means no rain!
            })
            df_weather.to_csv(RAW_DIR / "kma_asos108_202407_daily.csv", index=False, encoding="utf-8-sig")
            print(f"  Saved kma_asos108_202407_daily.csv ({len(df_weather)} days, rainy days>0: {(df_weather['rn_day']>0).sum()}, >=20mm: {(df_weather['rn_day']>=20).sum()})")
    except Exception as e:
        print("  KMA daily ERR:", type(e).__name__, str(e)[:120])

# 4B. Seoul Subway CardSubwayStatsNew for ALL 31 days of July 2024!
seoul_row = creds.get_account("seoul-opendata")
seoul_key = (seoul_row.get("password") or seoul_row.get("login_id")) if seoul_row else None
df_sub_daily = None
if seoul_key:
    # First inspect exact field names on 20240712
    u0 = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/CardSubwayStatsNew/1/5/20240712"
    try:
        _, _, r0 = fetch(u0, timeout=15)
        o0 = json.loads(r0.decode("utf-8", errors="ignore"))
        sample_row = ((o0.get("CardSubwayStatsNew") or {}).get("row") or [{}])[0]
        print("  Seoul Subway sample keys:", list(sample_row.keys()), "sample:", sample_row)
        stn_k = next((k for k in sample_row if "STN" in k or "STA" in k), None)
        line_k = next((k for k in sample_row if "LINE" in k or "LN" in k), None)
        ride_k = next((k for k in sample_row if "RIDE" in k or "GTON" in k), None)
        alight_k = next((k for k in sample_row if "ALIGHT" in k or "GTOFF" in k), None)
        if stn_k and ride_k and alight_k:
            sub_all = []
            for d in range(1, 32):
                ds = f"202407{d:02d}"
                u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/CardSubwayStatsNew/1/700/{ds}"
                _, _, raw = fetch(u, timeout=12)
                rows = (json.loads(raw.decode("utf-8", errors="ignore")).get("CardSubwayStatsNew") or {}).get("row") or []
                for r in rows:
                    nm = str(r.get(stn_k, ""))
                    if any(t in nm for t in ["올림픽공원", "몽촌토성", "한성백제"]):
                        sub_all.append({
                            "date": f"2024-07-{d:02d}",
                            "line": r.get(line_k, ""),
                            "station": nm,
                            "ride": int(float(r.get(ride_k, 0))),
                            "alight": int(float(r.get(alight_k, 0))),
                        })
            df_sub_raw = pd.DataFrame(sub_all)
            df_sub_raw.to_csv(RAW_DIR / "seoul_subway_olympicpark_202407.csv", index=False, encoding="utf-8-sig")
            df_sub_daily = df_sub_raw.groupby("date")[["ride", "alight"]].sum().reset_index()
            df_sub_daily["subway_total"] = df_sub_daily["ride"] + df_sub_daily["alight"]
            print(f"  Saved seoul_subway_olympicpark_202407.csv ({len(df_sub_raw)} station-days, {len(df_sub_daily)} days)")
            print("  Top 8 subway days (4 stations combined):\n", df_sub_daily.sort_values("subway_total", ascending=False).head(8).to_string(index=False))
    except Exception as e:
        print("  Seoul Subway ERR:", type(e).__name__, str(e)[:120])

# 4C. Merge July 2024 Vehicles + Weather + Subway and compute REAL correlations!
daily_v = df_in.groupby("입차일").agg(
    vehicles=("입차일시", "count"),
    short_stay_5m=("stay_min", lambda s: int((s <= 5).sum())),
    stay_gt_10m=("stay_min", lambda s: int((s > 10).sum())),
    evening_17_20=("in_dt", lambda s: int(((s.dt.hour >= 17) & (s.dt.hour <= 20)).sum())),
    night_exit_20_22=("out_dt", lambda s: int(((s.dt.hour >= 20) & (s.dt.hour <= 22)).sum())),
    median_stay_min=("stay_min", "median"),
).reset_index().rename(columns={"입차일": "date"})
daily_v["dow"] = pd.to_datetime(daily_v["date"]).dt.dayofweek
daily_v["is_weekend"] = (daily_v["dow"] >= 5).astype(int)

merged = daily_v.copy()
if df_weather is not None:
    merged = merged.merge(df_weather, on="date", how="left")
if df_sub_daily is not None:
    merged = merged.merge(df_sub_daily, on="date", how="left")
merged.to_csv(RAW_DIR / "july2024_merged_eda.csv", index=False, encoding="utf-8-sig")
print("\n[MERGED JULY 2024 CORRELATION MATRIX (n=31 days)]")
num_cols = [c for c in ["vehicles", "stay_gt_10m", "evening_17_20", "night_exit_20_22", "median_stay_min", "subway_total", "rn_day", "ta_avg", "ta_max", "hm_avg", "is_weekend"] if c in merged.columns]
print(merged[num_cols].corr().round(3).to_string())

print("\n[MERGED JULY 2024 FULL 31-DAY TABLE (sorted by vehicles desc, top 12 + bottom 5)]")
show_cols = [c for c in ["date", "dow", "vehicles", "night_exit_20_22", "subway_total", "rn_day", "ta_max"] if c in merged.columns]
print(merged.sort_values("vehicles", ascending=False)[show_cols].head(12).to_string(index=False))
print("---")
print(merged.sort_values("vehicles", ascending=True)[show_cols].head(5).to_string(index=False))
