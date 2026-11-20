import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, r"C:\Users\basqu\My-Personal-Assistant")
from scripts.lib import creds

OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
RAW_DIR = OUT_DIR / "raw"

def read_csv_auto(path):
    for enc in ["utf-8-sig", "cp949", "euc-kr", "utf-8"]:
        try:
            return pd.read_csv(path, encoding=enc, low_memory=False)
        except Exception:
            pass
    raise ValueError(f"cannot decode {path}")

# =========================================================
# 1. Deep EDA on 15138735 올림픽공원 입출차 정보 (215,528 rows!)
# =========================================================
print("=== EDA 1: 15138735 올림픽공원 입출차 정보 ===")
f_in = next(RAW_DIR.glob("15138735_*.csv"))
df_in = read_csv_auto(f_in)
print("Shape:", df_in.shape, "Cols:", list(df_in.columns))
print("Null counts:\n", df_in.isna().sum().to_dict())
print("Head:\n", df_in.head(5).to_string())
print("Tail:\n", df_in.tail(5).to_string())

df_in["in_dt"] = pd.to_datetime(df_in["입차일시"], errors="coerce")
df_in["out_dt"] = pd.to_datetime(df_in["출차일시"], errors="coerce")
df_in["stay_min"] = (df_in["out_dt"] - df_in["in_dt"]).dt.total_seconds() / 60.0

print(f"in_dt valid: {df_in['in_dt'].notna().sum():,}, range: {df_in['in_dt'].min()} ~ {df_in['in_dt'].max()}")
print(f"out_dt valid: {df_in['out_dt'].notna().sum():,} (null/invalid: {df_in['out_dt'].isna().sum():,} = {df_in['out_dt'].isna().mean()*100:.2f}%)")
print(f"stay_min negative (<0): {(df_in['stay_min'] < 0).sum():,}, zero (==0): {(df_in['stay_min'] == 0).sum():,}, >24h (>1440m): {(df_in['stay_min'] > 1440).sum():,}, >7d: {(df_in['stay_min'] > 10080).sum():,}")
valid_stay = df_in["stay_min"].dropna()
valid_stay_pos = valid_stay[(valid_stay >= 0) & (valid_stay <= 1440)]
print("stay_min quantiles (0~24h):", valid_stay_pos.quantile([0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]).round(1).to_dict())
print(f"stay_min mean={valid_stay_pos.mean():.1f}m, median={valid_stay_pos.median():.1f}m")

df_in["date"] = df_in["in_dt"].dt.date
df_in["dow"] = df_in["in_dt"].dt.dayofweek  # 0=Mon..6=Sun
df_in["hour"] = df_in["in_dt"].dt.hour
df_in["ym"] = df_in["in_dt"].dt.to_period("M").astype(str)
print("Monthly counts:", df_in["ym"].value_counts().sort_index().to_dict())
daily = df_in.groupby("date").size()
print(f"Unique days: {len(daily)}, daily mean={daily.mean():.1f}, median={daily.median():.1f}, std={daily.std():.1f}, min={daily.min()} ({daily.idxmin()}), max={daily.max()} ({daily.idxmax()})")
print("Top 15 busiest days:\n", daily.sort_values(ascending=False).head(15).to_string())
print("Bottom 5 quietest days:\n", daily.sort_values().head(5).to_string())
dow_map = {0:"월",1:"화",2:"수",3:"목",4:"금",5:"토",6:"일"}
daily_df = daily.reset_index(name="cnt")
daily_df["dow"] = pd.to_datetime(daily_df["date"]).dt.dayofweek.map(dow_map)
print("Avg daily entries by DOW:\n", daily_df.groupby("dow")["cnt"].agg(["count","mean","median","max"]).reindex(["월","화","수","목","금","토","일"]).round(1).to_string())
print("Hourly entry distribution (%):\n", (df_in["hour"].value_counts().sort_index() / len(df_in) * 100).round(2).to_dict())
print("Hourly exit distribution (%):\n", (df_in["out_dt"].dt.hour.value_counts().sort_index() / df_in["out_dt"].notna().sum() * 100).round(2).to_dict())

# Reconstruct simultaneous occupancy on busiest day vs median weekday!
busiest_day = daily.idxmax()
sub = df_in[(df_in["in_dt"] >= pd.Timestamp(busiest_day)) & (df_in["in_dt"] < pd.Timestamp(busiest_day) + pd.Timedelta(days=1))].copy()
# Actually include vehicles that entered earlier and exited on busiest_day
sub_all = df_in[(df_in["in_dt"] < pd.Timestamp(busiest_day) + pd.Timedelta(days=1)) & ((df_in["out_dt"] >= pd.Timestamp(busiest_day)) | (df_in["out_dt"].isna() & (df_in["in_dt"] >= pd.Timestamp(busiest_day))))]
times = pd.date_range(pd.Timestamp(busiest_day), periods=24, freq="h")
occ = []
for t in times:
    c = ((sub_all["in_dt"] <= t) & ((sub_all["out_dt"] > t) | sub_all["out_dt"].isna())).sum()
    occ.append((t.strftime("%H:%M"), int(c)))
print(f"Estimated hourly occupancy on busiest day ({busiest_day}, {daily.max()} entries):", occ)

# =========================================================
# 2. Deep EDA on 15164156 주차장 혼잡도 정보 (699 rows!)
# =========================================================
print("\n=== EDA 2: 15164156 주차장 혼잡도 정보 ===")
f_cg = next(RAW_DIR.glob("15164156_*.csv"))
df_cg = read_csv_auto(f_cg)
print("Shape:", df_cg.shape, "Cols:", list(df_cg.columns))
print("Nulls:", df_cg.isna().sum().to_dict())
print("Head:\n", df_cg.head(10).to_string())
print("Tail:\n", df_cg.tail(5).to_string())
print("주차장아이디 value_counts:", df_cg["주차장아이디"].value_counts(dropna=False).to_dict())
print("주차구역 value_counts:", df_cg["주차구역"].value_counts(dropna=False).to_dict())
print("혼잡도 value_counts:", df_cg["혼잡도"].value_counts(dropna=False).to_dict())
print("등록일 range:", df_cg["등록일"].min(), "~", df_cg["등록일"].max(), "unique dates:", df_cg["등록일"].nunique())
print("등록시간 sample:", df_cg["등록시간"].value_counts().head(10).to_dict())
print("Cross-tab 주차구역 x 혼잡도:\n", pd.crosstab(df_cg["주차구역"], df_cg["혼잡도"]).to_string())

# =========================================================
# 3. Deep EDA on 15131671 월별주차현황 (72 rows)
# =========================================================
print("\n=== EDA 3: 15131671 월별주차현황 ===")
df_mp = read_csv_auto(next(RAW_DIR.glob("15131671_*.csv")))
print("Shape:", df_mp.shape, "Head:\n", df_mp.head(8).to_string())
print("Tail:\n", df_mp.tail(8).to_string())
print("연도:", sorted(df_mp["연도"].unique().tolist()), "주차장소:", df_mp["주차장소"].unique().tolist())
print("연도별 합계:\n", df_mp.groupby(["연도", "주차장소"])["주차대수"].sum().unstack().to_string())

# =========================================================
# 4. Deep EDA on 15127487 올림픽공원 공연장 실감형 콘텐츠 (14 rows!)
# =========================================================
print("\n=== EDA 4: 15127487 올림픽공원 공연장 실감형 콘텐츠 (FULL TABLE) ===")
df_xr = read_csv_auto(next(RAW_DIR.glob("15127487_*.csv")))
print(df_xr.to_string())

# =========================================================
# 5. Deep EDA on 15133891 테니스장 이용 정보 (120 rows)
# =========================================================
print("\n=== EDA 5: 15133891 테니스장 이용 정보 ===")
df_tn = read_csv_auto(next(RAW_DIR.glob("15133891_*.csv")))
print("Shape:", df_tn.shape, "구분:", df_tn["구분"].value_counts().to_dict())
print("시작일 range:", df_tn["시작일"].min(), "~", df_tn["종료일"].max())
print("Head:\n", df_tn.head(6).to_string())
print("Tail:\n", df_tn.tail(6).to_string())

# =========================================================
# 6. Deep EDA on 15099006 공연 포스터 + 15149169 영문 공연정보
# =========================================================
print("\n=== EDA 6: 15099006 공연 포스터 & 15149169 영문 공연정보 ===")
df_pf1 = read_csv_auto(next(RAW_DIR.glob("15099006_*.csv")))
print("[15099006] shape:", df_pf1.shape, "cols:", list(df_pf1.columns))
print("Head:\n", df_pf1.head(5).to_string())
print("Tail:\n", df_pf1.tail(5).to_string())

df_pf2 = read_csv_auto(next(RAW_DIR.glob("15149169_*.csv")))
print("\n[15149169] shape:", df_pf2.shape, "cols:", list(df_pf2.columns))
print("Head:\n", df_pf2.head(5).to_string())
print("Tail:\n", df_pf2.tail(5).to_string())

# =========================================================
# 7. Deep EDA on Sports Centers (5 files) + 잔디 + 정원 + 공모참여 + 개방목록 + 근무복 중복
# =========================================================
print("\n=== EDA 7: Sports Centers & Other Notable CSVs ===")
for prefix in ["15101610", "15110953", "15114776", "15118652", "15147992", "15144839", "15143220", "15161406", "15147873", "15168248", "15168288"]:
    f = next(RAW_DIR.glob(f"{prefix}_*.csv"))
    d = read_csv_auto(f)
    print(f"\n[{prefix}] {f.name} | shape={d.shape}")
    print("  cols:", list(d.columns))
    print("  null%:", {c: round(d[c].isna().mean()*100, 1) for c in d.columns if d[c].isna().any()})
    print("  head(3):\n", d.head(3).to_string())
    if prefix in ["15143220", "15161406"]:
        print("  FULL:\n", d.to_string())
