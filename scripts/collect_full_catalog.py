import concurrent.futures
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

sys.path.insert(0, r"C:\Users\basqu\My-Personal-Assistant")
from scripts.lib import creds

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}
OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
RAW_DIR = OUT_DIR / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)


def fetch(url, timeout=25, headers=None):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.geturl(), resp.read()


# 1. Inspect script_fileDetail.js to learn file download endpoint
print("=== 1. script_fileDetail.js download endpoint ===")
try:
    _, _, raw = fetch("https://www.data.go.kr/js/biz/datset/script_fileDetail.js")
    js = raw.decode("utf-8", errors="ignore")
    for m in re.findall(r"fn_fileDataDown[\s\S]{0,1800}", js):
        print(m[:1800])
except Exception as e:
    print("ERR script_fileDetail.js:", e)

# 2. Crawl ALL data.go.kr datasets for 한국체육산업개발 (FILE, API, STD, plus keyword searches)
print("\n=== 2. Discovering all data.go.kr datasets for 한국체육산업개발 ===")
discovered = {}  # (id, type) -> {id, type, title, list_org, source}

# Seed with ksponco_pubdata_clean.json
ksponco_items = json.loads((OUT_DIR / "ksponco_pubdata_clean.json").read_text(encoding="utf-8"))
for item in ksponco_items:
    u = item["fields"].get("URL", "")
    m = re.search(r"data\.go\.kr/data/(\d+)/(fileData|openapi|standard|linkedData|linked)\.do", u)
    if m:
        did, dtype = m.group(1), m.group(2)
        if dtype == "linked":
            dtype = "linkedData"
        discovered[(did, dtype)] = {
            "id": did, "type": dtype, "title": item["title"],
            "ksponco_pid": item["pid"], "source": ["ksponco"]
        }

def crawl_search(dtype, keyword, max_pages=5):
    for page in range(1, max_pages + 1):
        url = (
            f"https://www.data.go.kr/tcs/dss/selectDataSetList.do"
            f"?dType={dtype}&keyword={urllib.parse.quote(keyword)}&currentPage={page}&perPage=40"
        )
        try:
            _, _, raw = fetch(url, timeout=25)
            html = raw.decode("utf-8", errors="ignore")
            sp = BeautifulSoup(html, "html.parser")
            # Each result item in data.go.kr search
            items_found = 0
            for li in sp.select("div.result-list ul li, ul.data-list li, div.data-set-list li, li"):
                a = li.find("a", href=re.compile(r"^/data/(\d+)/(fileData|openapi|standard|linkedData)\.do"))
                if not a:
                    continue
                m = re.match(r"^/data/(\d+)/(fileData|openapi|standard|linkedData)\.do", a["href"])
                if not m:
                    continue
                did, dt = m.group(1), m.group(2)
                li_text = li.get_text(" ", strip=True)
                # Keep if 한국체육산업개발 is mentioned in the item text (org or title)
                if "한국체육산업개발" not in li_text:
                    continue
                items_found += 1
                title_el = li.select_one("span.title, dt a, .tit")
                title = title_el.get_text(" ", strip=True) if title_el else a.get_text(" ", strip=True)
                key = (did, dt)
                if key not in discovered:
                    discovered[key] = {"id": did, "type": dt, "title": title, "ksponco_pid": None, "source": []}
                if f"search:{dtype}:{keyword}" not in discovered[key]["source"]:
                    discovered[key]["source"].append(f"search:{dtype}:{keyword}")
            print(f"  search dType={dtype} kw={keyword} p={page}: matched={items_found}")
            if items_found == 0:
                break
        except Exception as e:
            print(f"  search ERR {dtype} p={page}: {e}")
            break

for dt in ["FILE", "API", "STD", "TOTAL"]:
    for kw in ["한국체육산업개발주식회사", "한국체육산업개발", "실감형"]:
        if kw == "실감형" and dt != "TOTAL":
            continue
        crawl_search(dt, kw, max_pages=4)

# Also check if data.go.kr has a linkedData tab or search by org code B552024
for kw in ["올림픽공원 2025", "올림픽공원 실감", "체육산업개발"]:
    crawl_search("TOTAL", kw, max_pages=2)

print(f"\nTotal unique data.go.kr datasets discovered: {len(discovered)}")

# 3. Fetch /catalog/{id}/{type}.json AND detail HTML metadata for ALL discovered datasets!
def fetch_catalog_and_detail(key_item):
    (did, dt), info = key_item
    res = dict(info)
    cat_type = dt
    cat_url = f"https://www.data.go.kr/catalog/{did}/{cat_type}.json"
    try:
        _, _, raw = fetch(cat_url, timeout=15)
        cat = json.loads(raw.decode("utf-8", errors="ignore"))
        res["catalog"] = cat
        res["org"] = (cat.get("creator") or {}).get("name", "")
        res["name"] = cat.get("name", res["title"])
        res["dateCreated"] = cat.get("dateCreated", "")
        res["dateModified"] = cat.get("dateModified", "")
        res["encodingFormat"] = cat.get("encodingFormat", "")
        res["license"] = (cat.get("license") or {}).get("name", "")
        res["description"] = cat.get("description", "")
        props = {p.get("name"): p.get("value") for p in (cat.get("additionalProperty") or []) if isinstance(p, dict)}
        res["updateCycle"] = props.get("업데이트 주기", "")
        res["category"] = props.get("분류체계", "")
        res["provideType"] = props.get("제공형태", "")
        res["columns"] = [v.get("name") for v in (cat.get("variableMeasured") or []) if isinstance(v, dict)]
    except Exception as e:
        res["catalog_err"] = str(e)

    # Also fetch detail page for fileData download params or openapi endpoint URL
    page_url = f"https://www.data.go.kr/data/{did}/{dt}.do"
    res["url"] = page_url
    try:
        _, _, raw = fetch(page_url, timeout=15)
        html = raw.decode("utf-8", errors="ignore")
        # Extract fn_fileDataDown args if fileData
        m_dl = re.search(r"fn_fileDataDown\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)", html)
        if m_dl:
            res["file_down_args"] = list(m_dl.groups())
        # Extract data.go.kr openapi base url / swagger / culture.go.kr link / endpoint
        api_urls = sorted(set(re.findall(r"https?://(?:apis\.data\.go\.kr|api\.odcloud\.kr|www\.ksponco\.or\.kr|culture\.go\.kr|api\.kcisa\.kr)[^\s\"'<>)]+", html)))
        if api_urls:
            res["api_urls"] = api_urls[:10]
        # Extract total rows / file size / update date if shown
        sp = BeautifulSoup(html, "html.parser")
        table_meta = {}
        for tr in sp.select("table tr"):
            ths = tr.select("th")
            tds = tr.select("td")
            for th, td in zip(ths, tds):
                k = th.get_text(" ", strip=True)
                v = td.get_text(" ", strip=True)
                if k in ["수정일", "등록일", "차기등록예정일", "업데이트 주기", "제공기관", "확장자", "데이터 기준일자", "참고문서", "엔드포인트", "서비스URL", "요청주소", "데이터포맷", "심의여부", "활용신청", "다운로드(바로가기)", "전체 행", "데이터 한계"]:
                    table_meta[k] = v[:200]
        res["table_meta"] = table_meta
    except Exception as e:
        res["page_err"] = str(e)
    return res

enriched = []
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    for r in ex.map(fetch_catalog_and_detail, list(discovered.items())):
        enriched.append(r)

# Filter strictly to 한국체육산업개발 (including linked data created by 한국문화정보원 for 한국체육산업개발)
kspo_only = [
    r for r in enriched
    if "한국체육산업개발" in (r.get("org", "") + r.get("name", "") + r.get("title", "") + r.get("description", ""))
]
kspo_only.sort(key=lambda x: (x["type"], int(x["id"])))
(OUT_DIR / "datagokr_kspo_full.json").write_text(json.dumps(kspo_only, ensure_ascii=False, indent=2), encoding="utf-8")

by_type = {}
for r in kspo_only:
    by_type[r["type"]] = by_type.get(r["type"], 0) + 1
print(f"\n[SAVED] datagokr_kspo_full.json: total={len(kspo_only)}, breakdown={by_type}")
for i, r in enumerate(kspo_only, 1):
    print(f"  {i:2d}. [{r['type']:10s}] {r['id']:8s} | pid={str(r.get('ksponco_pid')):4s} | mod={r.get('dateModified',''):10s} | {r.get('encodingFormat',''):6s} | {r.get('name', r['title'])}")

# 4. Inspect culture.go.kr id=675 (pubData/62!) and search culture.go.kr for 한국체육산업개발
print("\n=== 4. Inspecting culture.go.kr id=675 (pubData/62) ===")
for curl in [
    "https://www.culture.go.kr/data/openapi/openapiView.do?id=675&gubun=A",
    "https://www.culture.go.kr/data/openapi/openapiList.do?searchKeyword=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C",
    "https://www.culture.go.kr/data/openapi/openapiList.do?searchKeyword=%EC%98%AC%EB%A6%BC%ED%94%BD%EA%B3%B5%EC%9B%90",
]:
    try:
        _, final, raw = fetch(curl, timeout=20)
        html = raw.decode("utf-8", errors="ignore")
        sp = BeautifulSoup(html, "html.parser")
        print(f"\n[CULTURE] {curl} -> len={len(html)}")
        if "openapiView" in curl:
            (OUT_DIR / "culture_675.html").write_text(html, encoding="utf-8")
            # Print text summary & tables & API URLs & download links
            for tr in sp.select("table tr")[:30]:
                cells = [c.get_text(" ", strip=True)[:120] for c in tr.select("th, td")]
                if cells:
                    print("  TR:", cells)
            for m in sorted(set(re.findall(r"https?://[^\s\"'<>)]+(?:api|kcisa|culture|download|file|csv|zip|json|xml)[^\s\"'<>)]*", html, re.I))):
                if not any(sk in m for sk in [".js", ".css", "w3.org", "jquery", "google"]):
                    print("  URL:", m)
            # Also look for file download buttons/links
            for a in sp.select("a, button"):
                txt = a.get_text(" ", strip=True)
                oc = (a.get("onclick") or "") + " " + (a.get("href") or "")
                if any(k in (txt + oc).lower() for k in ["다운", "down", "파일", "file", "샘플", "명세", "api", "연계", "가이드"]):
                    print(f"  ACT[{txt[:50]}]: href={a.get('href')} onclick={a.get('onclick')}")
        else:
            for a in sp.find_all("a", href=True):
                if "openapiView" in a["href"] or "View.do" in a["href"]:
                    print("  ITEM:", a.get_text(" ", strip=True)[:80], "->", a["href"])
    except Exception as e:
        print(f"[CULTURE] {curl} ERR: {e}")

# 5. Save Seoul Citydata 올림픽공원 snapshot (NEVER print API key!)
print("\n=== 5. Saving Seoul Citydata 올림픽공원 sample ===")
seoul_row = creds.get_account("seoul-opendata")
seoul_key = (seoul_row.get("password") or seoul_row.get("login_id")) if seoul_row else None
if seoul_key:
    u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/citydata/1/5/{urllib.parse.quote('올림픽공원')}"
    try:
        _, _, raw = fetch(u, timeout=15)
        obj = json.loads(raw.decode("utf-8", errors="ignore"))
        (RAW_DIR / "seoul_citydata_olympicpark_sample.json").write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
        cd = obj.get("CITYDATA", {})
        print("  Saved seoul_citydata_olympicpark_sample.json! Keys:", list(cd.keys()))
        print("  Parking lots:", [(p.get("PRK_NM"), p.get("CPCTY"), p.get("CUR_PRK_CNT"), p.get("CUR_PRK_YN")) for p in cd.get("PRK_STTS", [])])
        print("  Subways:", [(s.get("SUB_STN_NM"), s.get("SUB_STN_LINE")) for s in cd.get("SUB_STTS", [])])
        print("  Events:", [e.get("EVENT_NM") for e in cd.get("EVENT_STTS", [])])
        print("  Forecasts count:", len((cd.get("LIVE_PPLTN_STTS") or [{}])[0].get("FCST_PPLTN", [])))
    except Exception as e:
        print("  Seoul Citydata ERR:", type(e).__name__)
