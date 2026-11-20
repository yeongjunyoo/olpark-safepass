import http.cookiejar
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

sys.path.insert(0, r"C:\Users\basqu\My-Personal-Assistant")
from scripts.lib import creds

OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
RAW_DIR = OUT_DIR / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


def req_open(url, data=None, headers=None, timeout=30, method=None):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    return opener.open(req, timeout=timeout)


data = json.loads((OUT_DIR / "datagokr_kspo_verified.json").read_text(encoding="utf-8"))
by_key = {(d["id"], d["type"]): d for d in data}

# 1. Print detailed info on key openapis + linkedData + newly found fileData
print("=== 1. Key OpenAPI & LinkedData details ===")
for did, dt in [
    ("15168686", "openapi"),
    ("15164822", "openapi"),
    ("15159093", "openapi"),
    ("3037877", "openapi"),
    ("3074924", "openapi"),
    ("15015212", "openapi"),
    ("15059122", "openapi"),
    ("276130", "linkedData"),
    ("1486", "linkedData"),
    ("96104", "linkedData"),
    ("96135", "linkedData"),
    ("96399", "linkedData"),
    ("96502", "linkedData"),
]:
    item = by_key.get((did, dt))
    if not item:
        print(f"  MISSING {did}/{dt}")
        continue
    print(f"\n[{dt}] {did}: {item.get('name')}")
    print(f"  org={item.get('org')} created={item.get('dateCreated')} mod={item.get('dateModified')} cycle={item.get('updateCycle')} provide={item.get('provideType')}")
    print(f"  desc={item.get('description','')[:260]}")
    print(f"  api_urls={item.get('api_urls', [])}")
    print(f"  table_meta={item.get('table_meta', {})}")
    # For openapi with LINK or linkedData, check selectApiLinkUrl.do or detail HTML for actual target URL
    if dt == "openapi":
        try:
            post = urllib.parse.urlencode({"publicDataPk": did}).encode()
            with req_open("https://www.data.go.kr/tcs/dss/selectApiLinkUrl.do", data=post, headers={"X-Requested-With": "XMLHttpRequest", "Referer": item["url"]}) as r:
                txt = r.read().decode("utf-8", errors="ignore")
                print(f"  selectApiLinkUrl -> {txt[:300]}")
        except Exception as e:
            print(f"  selectApiLinkUrl ERR: {e}")

# 2. Check linkedData 96104/96135/96399/96502 actual URLs on bigdata-culture.kr
print("\n=== 2. Checking bigdata-culture.kr linkedData pages ===")
for did in ["96104", "96135", "96399", "96502", "1486", "276130"]:
    try:
        with req_open(f"https://www.data.go.kr/data/{did}/linkedData.do") as r:
            html = r.read().decode("utf-8", errors="ignore")
        urls = [u for u in set(re.findall(r"https?://[^\s\"'<>)]+", html)) if any(k in u for k in ["bigdata-culture", "culture.go.kr", "ksponco", "kcisa", "kspo"])]
        print(f"  linkedData/{did}: {urls}")
    except Exception as e:
        print(f"  linkedData/{did} ERR: {e}")

# 3. Check ALL 30 fileData descriptions, columns, update dates, and file_down_args
print("\n=== 3. All 30 fileData summary ===")
file_items = [d for d in data if d["type"] == "fileData"]
for i, d in enumerate(file_items, 1):
    print(f"  {i:2d}. {d['id']} | {d.get('encodingFormat',''):4s} | created={d.get('dateCreated',''):10s} | mod={d.get('dateModified',''):10s} | cycle={d.get('updateCycle',''):6s} | cols={len(d.get('columns',[])):2d} | {d.get('name')} | args={'OK' if d.get('file_down_args') else 'NO'}")

# 4. Download high-priority fileData CSVs cleanly (checking check-limit.json, NO CAPTCHA bypass!)
print("\n=== 4. Downloading high-priority fileData CSVs ===")
priority_ids = [
    "15164156",  # 주차장 혼잡도 정보
    "15138735",  # 올림픽공원 입출차 정보
    "15131671",  # 월별주차현황
    "15127487",  # 올림픽공원 공연장 실감형 콘텐츠
    "15133891",  # 테니스장 이용 정보
    "15099006",  # 공연 포스터 정보
    "15149169",  # 영문 공연정보
    "15147873",  # 공공데이터 개방목록
    "15147992",  # 스포츠센터 강좌 정보
    "15110953",  # 올림픽스포츠센터 강좌정보
    "15101610",  # 올림픽수영장 강좌정보
    "15114776",  # 일산스포츠센터 강좌정보
    "15118652",  # 분당스포츠센터 강좌정보
    "15144839",  # 스포츠센터 종목정보
    "15143220",  # 잔디시설정보
    "15144222",  # 정원현황
    "15161406",  # 공모참여 목록
    "15168248",  # 근무복 주문현황정보 (verify duplicate!)
    "15168288",  # 근무복 주문현황 (verify duplicate!)
    "15090719",  # 스케이트장 이벤트 정보
    "15098997",  # 스포츠센터 이벤트 정보
    "15090715",  # 올림픽공원 핫뉴스 정보
    "15089962",  # 자주 묻는 질문정보
]

dl_log = []
captcha_hit = False
for did in priority_ids:
    item = by_key.get((did, "fileData"))
    if not item or not item.get("file_down_args"):
        print(f"  SKIP {did}: no file_down_args")
        continue
    pk, detail_pk, atch_id, sn, hist_sn = item["file_down_args"]
    # Step A: visit detail page briefly to ensure session cookie + Referer
    referer = item["url"]
    try:
        # Step B: call selectFileDataDownload.do
        form = urllib.parse.urlencode({
            "publicDataDetailPk": detail_pk,
            "publicDataPk": pk,
            "atchFileId": atch_id,
            "fileDetailSn": sn,
            "publicDataTyCode": "PR0051",
        }).encode()
        with req_open("https://www.data.go.kr/tcs/dss/selectFileDataDownload.do", data=form, headers={"X-Requested-With": "XMLHttpRequest", "Referer": referer}) as r:
            meta_json = json.loads(r.read().decode("utf-8", errors="ignore"))
        if not meta_json.get("status"):
            print(f"  FAIL selectFileDataDownload {did}: {meta_json}")
            dl_log.append({"id": did, "status": "meta_fail", "resp": str(meta_json)[:200]})
            continue
        real_atch = meta_json.get("atchFileId", "")
        real_sn = str(meta_json.get("fileDetailSn", "1"))
        info = meta_json.get("dataSetFileDetailInfo") or {}
        data_nm = info.get("publicDataSj") if info.get("publicDataTyDetailCode") == "DATY05" else info.get("dataNm")
        data_nm = data_nm or item.get("name", did)

        # Step C: check-limit.json (respect CAPTCHA strictly!)
        lim_form = urllib.parse.urlencode({"atchFileId": real_atch, "fileDetailSn": real_sn}).encode()
        with req_open("https://www.data.go.kr/cmm/cmm/check-limit.json", data=lim_form, headers={"X-Requested-With": "XMLHttpRequest", "Referer": referer}) as r:
            lim = json.loads(r.read().decode("utf-8", errors="ignore"))
        if lim.get("needCaptcha"):
            print(f"  [CAPTCHA GATE HIT at {did}] Stopping further fileData downloads per policy!")
            captcha_hit = True
            dl_log.append({"id": did, "status": "captcha_gate"})
            break

        # Step D: download file!
        dl_url = f"https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId={urllib.parse.quote(real_atch)}&fileDetailSn={urllib.parse.quote(real_sn)}&dataNm={urllib.parse.quote(data_nm)}"
        with req_open(dl_url, headers={"Referer": referer}, timeout=45) as r:
            cd = r.headers.get("Content-Disposition", "")
            ctype = r.headers.get("Content-Type", "")
            blob = r.read()
        # Infer extension
        ext = ".csv"
        if blob[:2] == b"PK":
            ext = ".zip"
        elif blob[:2] == b"\xff\xd8":
            ext = ".jpg"
        elif b"<html" in blob[:300].lower():
            print(f"  WARN {did}: got HTML ({len(blob)}B), ctype={ctype}")
            dl_log.append({"id": did, "status": "got_html", "size": len(blob)})
            continue
        safe_name = re.sub(r'[\\/:*?"<>|]+', "_", item.get("name", did))
        out_path = RAW_DIR / f"{did}_{safe_name}{ext}"
        out_path.write_bytes(blob)
        print(f"  SAVED {out_path.name} ({len(blob):,} bytes, ctype={ctype[:40]})")
        dl_log.append({"id": did, "status": "ok", "file": str(out_path), "size": len(blob)})
        time.sleep(0.8)
    except Exception as e:
        print(f"  ERR {did}: {e}")
        dl_log.append({"id": did, "status": "err", "err": str(e)})

(OUT_DIR / "download_log.json").write_text(json.dumps(dl_log, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nDownloads complete: ok={sum(1 for x in dl_log if x['status']=='ok')}, captcha_hit={captcha_hit}")
