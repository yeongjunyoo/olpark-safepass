import concurrent.futures
import http.cookiejar
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
import pandas as pd

sys.path.insert(0, r"C:\Users\basqu\My-Personal-Assistant")
from scripts.lib import creds

OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
RAW_DIR = OUT_DIR / "raw"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


def req_open(url, data=None, headers=None, timeout=25):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    return opener.open(req, timeout=timeout)


data = json.loads((OUT_DIR / "datagokr_kspo_verified.json").read_text(encoding="utf-8"))
by_key = {(d["id"], d["type"]): d for d in data}

# 1. Get selectApiLinkUrl for ALL 28 OpenAPIs
print("=== 1. Resolving linkUrl for ALL 28 OpenAPIs ===")
openapis = [d for d in data if d["type"] == "openapi"]
api_links = {}
for item in openapis:
    did = item["id"]
    try:
        post = urllib.parse.urlencode({"publicDataPk": did}).encode()
        with req_open("https://www.data.go.kr/tcs/dss/selectApiLinkUrl.do", data=post, headers={"X-Requested-With": "XMLHttpRequest", "Referer": item["url"]}) as r:
            obj = json.loads(r.read().decode("utf-8", errors="ignore"))
        api_links[did] = obj.get("linkUrl", "")
        item["resolved_link_url"] = api_links[did]
        print(f"  {did:8s} | {item.get('name','')[:42]:42s} -> {api_links[did]}")
    except Exception as e:
        print(f"  {did:8s} ERR: {e}")
(OUT_DIR / "datagokr_kspo_verified.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

# 2. Download remaining 6 CSV fileData (+ check 15160326 size without downloading if huge)
print("\n=== 2. Downloading remaining 6 CSV fileData ===")
rem_ids = ["15090255", "15090257", "15090260", "15119388", "15137824", "15137825"]
for did in rem_ids:
    item = by_key.get((did, "fileData"))
    if not item or not item.get("file_down_args"):
        continue
    pk, detail_pk, atch_id, sn, hist_sn = item["file_down_args"]
    referer = item["url"]
    try:
        form = urllib.parse.urlencode({
            "publicDataDetailPk": detail_pk, "publicDataPk": pk,
            "atchFileId": atch_id, "fileDetailSn": sn, "publicDataTyCode": "PR0051",
        }).encode()
        with req_open("https://www.data.go.kr/tcs/dss/selectFileDataDownload.do", data=form, headers={"X-Requested-With": "XMLHttpRequest", "Referer": referer}) as r:
            meta_json = json.loads(r.read().decode("utf-8", errors="ignore"))
        real_atch = meta_json.get("atchFileId", "")
        real_sn = str(meta_json.get("fileDetailSn", "1"))
        info = meta_json.get("dataSetFileDetailInfo") or {}
        data_nm = info.get("publicDataSj") if info.get("publicDataTyDetailCode") == "DATY05" else info.get("dataNm")
        data_nm = data_nm or item.get("name", did)

        lim_form = urllib.parse.urlencode({"atchFileId": real_atch, "fileDetailSn": real_sn}).encode()
        with req_open("https://www.data.go.kr/cmm/cmm/check-limit.json", data=lim_form, headers={"X-Requested-With": "XMLHttpRequest", "Referer": referer}) as r:
            lim = json.loads(r.read().decode("utf-8", errors="ignore"))
        if lim.get("needCaptcha"):
            print(f"  [CAPTCHA GATE at {did}] Stopping.")
            break
        dl_url = f"https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId={urllib.parse.quote(real_atch)}&fileDetailSn={urllib.parse.quote(real_sn)}&dataNm={urllib.parse.quote(data_nm)}"
        with req_open(dl_url, headers={"Referer": referer}, timeout=30) as r:
            blob = r.read()
        if b"<html" in blob[:300].lower():
            print(f"  WARN {did}: got HTML")
            continue
        ext = ".zip" if blob[:2] == b"PK" else ".csv"
        safe_name = re.sub(r'[\\/:*?"<>|]+', "_", item.get("name", did))
        out_path = RAW_DIR / f"{did}_{safe_name}{ext}"
        out_path.write_bytes(blob)
        print(f"  SAVED {out_path.name} ({len(blob):,} bytes)")
        time.sleep(0.8)
    except Exception as e:
        print(f"  ERR {did}: {e}")

# Check 15160326 (비정형데이터 생태갤러리) file metadata/size
item61 = by_key.get(("15160326", "fileData"))
if item61 and item61.get("file_down_args"):
    pk, detail_pk, atch_id, sn, hist_sn = item61["file_down_args"]
    try:
        form = urllib.parse.urlencode({
            "publicDataDetailPk": detail_pk, "publicDataPk": pk,
            "atchFileId": atch_id, "fileDetailSn": sn, "publicDataTyCode": "PR0051",
        }).encode()
        with req_open("https://www.data.go.kr/tcs/dss/selectFileDataDownload.do", data=form, headers={"X-Requested-With": "XMLHttpRequest", "Referer": item61["url"]}) as r:
            m61 = json.loads(r.read().decode("utf-8", errors="ignore"))
        print("  15160326 meta:", json.dumps(m61, ensure_ascii=False)[:400])
    except Exception as e:
        print("  15160326 meta ERR:", e)

# 3. Probe api.kcisa.kr & bigdata-culture.kr & kma-apihub & nps-data
print("\n=== 3. Probing api.kcisa.kr, bigdata-culture.kr, kma-apihub, nps-data ===")
# Test api.kcisa.kr reachability (is it also down during culture.go.kr maintenance?)
for u in [
    "http://api.kcisa.kr/openapi/service/rest/meta2020/getKSPO",
    "https://api.kcisa.kr/",
    "https://www.bigdata-culture.kr/bigdata/user/data_market/detail.do?id=a2b93710-2e2e-11eb-a4e1-f7a811675803",
]:
    try:
        with req_open(u, timeout=10) as r:
            body = r.read().decode("utf-8", errors="ignore")
            print(f"  PROBE {u[:60]} -> status={r.status} len={len(body)} snippet={body[:160].replace(chr(10),' ')}")
    except Exception as e:
        print(f"  PROBE {u[:60]} -> {type(e).__name__}: {str(e)[:120]}")

# Check linkedData 96104, 96135, 96399, 96502 on data.go.kr for their exact bigdata-culture.kr link!
for did in ["96104", "96135", "96399", "96502"]:
    try:
        with req_open(f"https://www.data.go.kr/data/{did}/linkedData.do", timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
        burls = sorted(set(re.findall(r"https?://(?:www\.)?bigdata-culture\.kr[^\s\"'<>)]+", html)))
        print(f"  linkedData/{did} bigdata-culture URLs: {burls}")
        if burls:
            try:
                with req_open(burls[0].replace("&amp;", "&"), timeout=15) as r2:
                    h2 = r2.read().decode("utf-8", errors="ignore")
                    print(f"    -> REACHABLE! status={r2.status} len={len(h2)} title={re.findall(r'<title>(.*?)</title>', h2, re.S)[:1]}")
            except Exception as e2:
                print(f"    -> fetch ERR: {e2}")
    except Exception as e:
        print(f"  linkedData/{did} ERR: {e}")

# Test data.go.kr odcloud API with nps-data key (NEVER print key!)
nps_row = creds.get_account("nps-data")
nps_key = (nps_row.get("password") or nps_row.get("login_id")) if nps_row else None
print(f"  nps-data key loaded: {bool(nps_key)}")
if nps_key:
    # Check if 15164156 (주차장 혼잡도 정보) has an odcloud swagger/API!
    try:
        with req_open("https://www.data.go.kr/data/15164156/fileData.do") as r:
            h = r.read().decode("utf-8", errors="ignore")
        m_ns = re.search(r"namespace=([0-9]+/v\d+)", h)
        print(f"  15164156 odcloud namespace: {m_ns.group(1) if m_ns else 'NONE'}")
    except Exception as e:
        print(f"  odcloud check ERR: {e}")
    # Also test KMA VilageFcst (기상청 단기예보) via apis.data.go.kr with nps-data key!
    try:
        q = urllib.parse.urlencode({
            "serviceKey": nps_key,
            "pageNo": 1, "numOfRows": 10, "dataType": "JSON",
            "base_date": "20261120", "base_time": "0500", "nx": 62, "ny": 126,  # 송파구 방이동(올림픽공원) 격자!
        })
        with req_open(f"https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?{q}", timeout=12) as r:
            body = r.read().decode("utf-8", errors="ignore")
            print(f"  KMA VilageFcst via apis.data.go.kr (nps-data): status={r.status} snippet={body[:180]}")
    except Exception as e:
        print(f"  KMA VilageFcst ERR: {type(e).__name__}: {str(e)[:120]}")

# Test kma-apihub auth key presence & live ping (NEVER print key!)
kma_row = creds.get_account("kma-apihub")
print(f"  kma-apihub row notes={kma_row.get('notes','')[:80] if kma_row else ''} extra_keys={list(json.loads(kma_row['extra']).keys()) if (kma_row and kma_row.get('extra','').startswith('{')) else (kma_row.get('extra','')[:40] if kma_row else '')}")

# 4. Run systematic schema profiling across ALL downloaded CSVs in RAW_DIR
print("\n=== 4. Profiling ALL downloaded CSVs ===")
profile = []
for f in sorted(RAW_DIR.glob("*.csv")):
    info = {"file": f.name, "bytes": f.stat().st_size}
    df = None
    used_enc = None
    for enc in ["utf-8-sig", "cp949", "euc-kr", "utf-8"]:
        try:
            df = pd.read_csv(f, encoding=enc, low_memory=False)
            used_enc = enc
            break
        except Exception:
            pass
    if df is None:
        info["err"] = "decode_failed"
    else:
        info["encoding"] = used_enc
        info["rows"] = int(len(df))
        info["cols"] = list(df.columns)
        info["null_pct"] = {c: round(float(df[c].isna().mean() * 100), 2) for c in df.columns}
        info["sample_head"] = df.head(3).fillna("").astype(str).to_dict(orient="records")
        info["sample_tail"] = df.tail(2).fillna("").astype(str).to_dict(orient="records")
    profile.append(info)
    print(f"  {f.name[:52]:52s} | enc={str(used_enc):9s} | rows={info.get('rows', -1):7d} | cols={info.get('cols', [])}")

(OUT_DIR / "csv_schema_profile.json").write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nSaved csv_schema_profile.json ({len(profile)} CSV files profiled)")
