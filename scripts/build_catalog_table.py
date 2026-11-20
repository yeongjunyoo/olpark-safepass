import json
import re
from pathlib import Path
import pandas as pd

out = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
raw = out / "raw"
k45 = json.loads((out / "ksponco_pubdata_clean.json").read_text(encoding="utf-8"))
d_all = json.loads((out / "datagokr_kspo_verified.json").read_text(encoding="utf-8"))
prof = {p["file"].split("_")[0]: p for p in json.loads((out / "csv_schema_profile.json").read_text(encoding="utf-8"))}

pid_map = {}
for k in k45:
    m = re.search(r"data\.go\.kr/data/(\d+)/", k["fields"].get("URL", ""))
    if m:
        pid_map[m.group(1)] = str(k["pid"])
pid_map.setdefault("15099006", "53*")
pid_map.setdefault("15164822", "62*")
pid_map.setdefault("15168686", "64*")

d58 = sorted(
    [x for x in d_all if x["type"] in ("fileData", "openapi")],
    key=lambda x: (0 if x["type"] == "fileData" else 1, int(x["id"])),
)

lines = []
for idx, x in enumerate(d58, 1):
    did = x["id"]
    fmt = x.get("encodingFormat", "")
    dt = f"파일({fmt or 'CSV'})" if x["type"] == "fileData" else "OpenAPI(LINK)"
    p = prof.get(did)
    if p:
        status = f"확보 ({p['rows']:,}행)"
    elif did == "15160326":
        status = "메타확인 (JPG 244건)"
    elif did == "15168686":
        status = "실측OK (자체 JSON API)"
    else:
        status = "점검대기 (11/22 18시 후)"
    rl = x.get("resolved_link_url", "")
    m_cid = re.search(r"id=(\d+)", rl)
    via = f"culture.go.kr id={m_cid.group(1)}" if m_cid else ("ksponco/pubData/64" if "pubData/64" in rl else "data.go.kr 직접")
    name = (x.get("name") or "").replace("한국체육산업개발주식회사_", "")
    url = x["url"]
    cyc = x.get("updateCycle") or "-"
    mod = x.get("dateModified") or "-"
    cre = x.get("dateCreated") or "-"
    lines.append(f"| {idx} | `{did}` | {pid_map.get(did, '-')} | [{name}]({url}) | {dt} | {cyc} | {cre} / {mod} | {status} | {via} |")

(out / "catalog_table_58.md").write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {len(lines)} rows to catalog_table_58.md")

# Print quick extra EDA on 15149169 (영문 공연정보), 15099006 (공연 포스터), 15143220 (잔디), 15144222 (정원)
for did, date_col in [("15149169", "공연일자"), ("15099006", "등록일"), ("15137824", "배포일자"), ("15137825", "보도일자")]:
    f = next(raw.glob(f"{did}_*.csv"))
    df = pd.read_csv(f, encoding="cp949")
    print(f"[{did}] rows={len(df)}, {date_col}: {df[date_col].min()} ~ {df[date_col].max()}, nulls={df.isna().sum().to_dict()}")
    if did == "15149169":
        df["yr"] = df["공연일자"].astype(str).str.slice(0, 4)
        print("  15149169 by year:", df["yr"].value_counts().sort_index().to_dict())
    if did == "15099006":
        print("  15099006 venues top 8:", df["공연장소"].value_counts(dropna=False).head(8).to_dict())

# Also print 2025 Olympic Park monthly parking seasonality from 15131671
df_mp = pd.read_csv(next(raw.glob("15131671_*.csv")), encoding="cp949")
ol25 = df_mp[(df_mp["연도"] == 2025) & (df_mp["주차장소"] == "올림픽공원")]
print("\n[15131671] 2025 Olympic Park min/max month:",
      ol25.loc[ol25["주차대수"].idxmin()].to_dict(),
      ol25.loc[ol25["주차대수"].idxmax()].to_dict())

# Inventory of raw files
raw_files = sorted(raw.iterdir(), key=lambda f: f.name)
tot_bytes = sum(f.stat().st_size for f in raw_files if f.is_file())
print(f"\n=== RAW INVENTORY: {len(raw_files)} files, {tot_bytes/1024/1024:.2f} MB ===")
for f in raw_files:
    print(f"  {f.name} ({f.stat().st_size:,} B)")
