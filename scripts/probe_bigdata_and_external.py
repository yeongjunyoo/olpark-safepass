import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup
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


# 1. Inspect bigdata-culture.kr 4 KSPO&CO datasets (96104, 96135, 96399, 96502)
print("=== 1. bigdata-culture.kr KSPO&CO datasets ===")
bc_items = {
    "96104_차량이용현황": "a2d6393d-246e-439b-8bfb-c25204e808fb",
    "96135_스포츠센터수강신청": "493f6d8a-cf13-4de4-880d-8395071dfc15",
    "96399_올림픽공원대관": "42fa1e06-1767-4a96-84d3-dc1dd591bb41",
    "96502_스포츠센터공지사항": "3c58baa2-5822-47b5-8892-89c58f29c38e",
}
for name, uid in bc_items.items():
    u = f"https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id={uid}"
    try:
        st, hdrs, raw = fetch(u, timeout=20)
        html = raw.decode("utf-8", errors="ignore")
        sp = BeautifulSoup(html, "html.parser")
        print(f"\n[{name}] id={uid} len={len(html)}")
        # Look for metadata tables, file lists, columns, API calls
        for tr in sp.select("table tr")[:15]:
            cells = [c.get_text(" ", strip=True)[:80] for c in tr.select("th, td")]
            if cells:
                print("  TR:", cells)
        # Look for download or sample file endpoints in JS
        js_urls = sorted(set(re.findall(r"/bigdata/[a-zA-Z0-9_./-]+\.do", html)))
        print("  JS endpoints:", [x for x in js_urls if any(k in x.lower() for k in ["file", "down", "sample", "data", "detail", "list"])][:12])
        # Check for CSV filenames or dates mentioned in HTML
        csvs = re.findall(r"KC_[A-Z0-9_]+(?:_\d{6,8})?(?:\.csv)?", html)
        if csvs:
            print("  CSV refs:", sorted(set(csvs))[:10])
    except Exception as e:
        print(f"[{name}] ERR: {e}")

# 2. Test odcloud live REST API for 15164156 (using nps-data, NEVER print key!)
print("\n=== 2. Testing data.go.kr odcloud REST API (15164156/v1) ===")
nps_row = creds.get_account("nps-data")
nps_key = (nps_row.get("password") or nps_row.get("login_id")) if nps_row else None
if nps_key:
    try:
        _, _, raw = fetch("https://infuser.odcloud.kr/oas/docs?namespace=15164156/v1", timeout=15)
        oas = json.loads(raw.decode("utf-8", errors="ignore"))
        paths = list((oas.get("paths") or {}).keys())
        print("  15164156 OAS paths:", paths)
        if paths:
            ep = f"https://api.odcloud.kr/api{paths[0]}?page=1&perPage=3&serviceKey={urllib.parse.quote(nps_key)}"
            _, _, r2 = fetch(ep, timeout=15)
            obj = json.loads(r2.decode("utf-8", errors="ignore"))
            print(f"  odcloud LIVE call OK! totalCount={obj.get('totalCount')}, matchCount={obj.get('matchCount')}, sample0={obj.get('data',[{}])[0]}")
    except Exception as e:
        print("  odcloud ERR:", type(e).__name__, str(e)[:120])

# 3. Inspect 15127487 (실감형 콘텐츠) URLs to see what 3D/VR assets actually exist!
print("\n=== 3. Checking 15127487 (실감형 콘텐츠) target URLs ===")
df_xr = pd.read_csv(next(RAW_DIR.glob("15127487_*.csv")), encoding="cp949")
for _, row in df_xr.head(5).iterrows():
    url = str(row.get("홈페이지주소", "")).strip()
    print(f"  [{row['구분']}|{row['장소']}|{row['확장자']}] {row['파일명']} -> {url}")
if df_xr["홈페이지주소"].notna().any():
    test_u = str(df_xr["홈페이지주소"].dropna().iloc[0]).strip()
    if test_u.startswith("http"):
        try:
            st, hdrs, raw = fetch(test_u, timeout=15)
            html = raw.decode("utf-8", errors="ignore")
            sp = BeautifulSoup(html, "html.parser")
            print(f"  XR page probe: status={st}, title={sp.title.get_text(strip=True) if sp.title else ''}")
            # Look for download links for .3ds, .obj, .skp, .dwg, .fbx, .glb, .zip, matterport, vr
            xr_links = [(a.get_text(" ", strip=True)[:50], a.get("href")) for a in sp.find_all("a", href=True)
                        if any(k in (a.get("href", "") + a.get_text()).lower() for k in ["download", "3d", "vr", "obj", "skp", "dwg", "fbx", "glb", "zip", "matterport", "tour"])]
            print("  XR page links:", xr_links[:12])
        except Exception as e:
            print("  XR page ERR:", e)

# 4. Probe ksponco.or.kr Olympic Park live event list (for 2024-07 & 2025~2026 concerts!)
print("\n=== 4. Probing ksponco.or.kr live concert/event calendar ===")
for eu in [
    "https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoList?mid=a20301010100",
    "https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoList?mid=a20301010100&searchStartDate=2024-07-01&searchEndDate=2024-07-31",
]:
    try:
        st, _, raw = fetch(eu, timeout=15)
        html = raw.decode("utf-8", errors="ignore")
        sp = BeautifulSoup(html, "html.parser")
        items = [x.get_text(" ", strip=True)[:100] for x in sp.select(".event_list li, .board_list tr, .list_box li, .culture_list li, .item")][:8]
        print(f"  {eu.split('?')[1][:50]} -> len={len(html)}, sample_items={len(items)}")
        for it in items[:5]:
            print("    ", it)
        # Check form params for searching dates
        inputs = [(i.get("name"), i.get("id"), i.get("value")) for i in sp.select("form input, form select") if i.get("name")]
        if "searchStartDate" not in eu:
            print("  form inputs:", inputs[:15])
    except Exception as e:
        print("  eventInfo ERR:", e)

# 5. Test Seoul OpenData Subway (CardSubwayStatsNew) for July 2024 + KMA ASOS Seoul 108 for July 2024!
print("\n=== 5. External data live probes: Seoul Subway + KMA ASOS (July 2024) ===")
seoul_row = creds.get_account("seoul-opendata")
seoul_key = (seoul_row.get("password") or seoul_row.get("login_id")) if seoul_row else None
if seoul_key:
    # Fetch July 2024 daily subway ridership for Olympic Park stations (sample 20240712 - busiest day!)
    sub_rows = []
    for dt_str in ["20240707", "20240712", "20240720", "20240721"]:
        u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/CardSubwayStatsNew/1/700/{dt_str}"
        try:
            _, _, raw = fetch(u, timeout=15)
            obj = json.loads(raw.decode("utf-8", errors="ignore"))
            rows = (obj.get("CardSubwayStatsNew") or {}).get("row") or []
            for r in rows:
                stn = r.get("SBWY_STNS_NM", "")
                if any(k in stn for k in ["올림픽공원", "몽촌토성", "한성백제"]):
                    sub_rows.append({
                        "date": dt_str, "line": r.get("SBWY_ROUT_LN_NM"), "stn": stn,
                        "ride": int(r.get("GTON_TNOPE", 0)), "alight": int(r.get("GTOFF_TNOPE", 0)),
                    })
        except Exception as e:
            print(f"  Subway {dt_str} ERR:", type(e).__name__)
    if sub_rows:
        df_sub = pd.DataFrame(sub_rows)
        print("  [SEOUL SUBWAY LIVE OK!] Sample Olympic Park stations (quietest 07/07 vs busiest 07/12, 07/20, 07/21):")
        print(df_sub.groupby("date")[["ride", "alight"]].sum().to_string())
        print(df_sub[df_sub["date"] == "20240712"].to_string(index=False))

# Test KMA ASOS daily weather for July 2024 (Seoul station 108) via apis.data.go.kr (nps-data)
if nps_key:
    try:
        q = urllib.parse.urlencode({
            "serviceKey": nps_key, "pageNo": 1, "numOfRows": 35, "dataType": "JSON",
            "dataCd": "ASOS", "dateCd": "DAY", "startDt": "20240701", "endDt": "20240731", "stnIds": "108",
        })
        _, _, raw = fetch(f"https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList?{q}", timeout=20)
        obj = json.loads(raw.decode("utf-8", errors="ignore"))
        items = (((obj.get("response") or {}).get("body") or {}).get("items") or {}).get("item") or []
        print(f"  [KMA ASOS 2024-07 LIVE OK!] rows={len(items)}")
        if items:
            df_w = pd.DataFrame(items)[["tm", "avgTa", "maxTa", "sumRn", "avgRhm", "avgWs"]]
            df_w.to_csv(RAW_DIR / "kma_asos_seoul108_202407.csv", index=False, encoding="utf-8-sig")
            # Correlate with 15138735 daily vehicle entries!
            df_in = pd.read_csv(next(RAW_DIR.glob("15138735_*.csv")), encoding="cp949")
            daily_cnt = df_in.groupby("입차일").size().reset_index(name="vehicles")
            df_m = daily_cnt.merge(df_w, left_on="입차일", right_on="tm", how="inner")
            for c in ["avgTa", "maxTa", "sumRn", "avgRhm", "avgWs"]:
                df_m[c] = pd.to_numeric(df_m[c], errors="coerce").fillna(0.0)
            df_m["rain_day"] = df_m["sumRn"] >= 5.0
            df_m["heavy_rain"] = df_m["sumRn"] >= 30.0
            df_m["dow"] = pd.to_datetime(df_m["입차일"]).dt.dayofweek
            df_m["is_weekend"] = df_m["dow"] >= 5
            print("  Correlation with daily vehicles (July 2024, n=31):")
            print(df_m[["vehicles", "avgTa", "maxTa", "sumRn", "avgRhm", "avgWs"]].corr()["vehicles"].round(3).to_dict())
            print("  Mean vehicles by rain>=5mm:", df_m.groupby("rain_day")["vehicles"].agg(["count", "mean", "median"]).round(1).to_dict())
            print("  Mean vehicles by heavy_rain>=30mm:", df_m.groupby("heavy_rain")["vehicles"].agg(["count", "mean", "median"]).round(1).to_dict())
            print("  Rainy vs Dry extremes:\n", df_m.sort_values("sumRn", ascending=False)[["입차일", "vehicles", "sumRn", "avgTa", "is_weekend"]].head(8).to_string(index=False))
    except Exception as e:
        print("  KMA ASOS ERR:", type(e).__name__, str(e)[:120])

# Test KMA API Hub (kma-apihub) safely without printing key!
kma_row = creds.get_account("kma-apihub")
if kma_row:
    extra = kma_row.get("extra", "")
    m_k = re.search(r"api_key=([^\s,;]+)", extra)
    kma_key = m_k.group(1) if m_k else None
    if kma_key:
        try:
            u = f"https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=202407121200&stn=108&help=0&authKey={urllib.parse.quote(kma_key)}"
            st, _, raw = fetch(u, timeout=12)
            txt = raw.decode("euc-kr", errors="ignore")
            lines = [ln for ln in txt.splitlines() if ln.strip() and not ln.startswith("#")]
            print(f"  [KMA APIHUB LIVE OK!] status={st}, data_lines={len(lines)}, sample={lines[0][:90] if lines else ''}")
        except Exception as e:
            print("  KMA APIHUB ERR:", type(e).__name__)
