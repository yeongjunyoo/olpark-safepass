import concurrent.futures
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}
OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")


def fetch(url, data=None, headers=None, timeout=25):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.geturl(), resp.read()


# 1. Check selectOrgCodePop.do to find official org code for 한국체육산업개발주식회사
print("=== 1. data.go.kr Org Code lookup ===")
for kw in ["한국체육산업개발", "한국체육산업개발주식회사"]:
    try:
        u = f"https://www.data.go.kr/tcs/dss/selectOrgCodePop.do?orgNm={urllib.parse.quote(kw)}"
        _, _, raw = fetch(u)
        txt = raw.decode("utf-8", errors="ignore")
        print(f"  selectOrgCodePop({kw}) len={len(txt)}")
        sp = BeautifulSoup(txt, "html.parser")
        for el in sp.select("tr, li, a, input"):
            t = el.get_text(" ", strip=True)
            if "한국체육" in t:
                print("   HIT:", t[:120], el.attrs)
    except Exception as e:
        print("  ERR:", e)

# 2. Properly scan ALL data.go.kr tabs for 한국체육산업개발주식회사 & 한국체육산업개발 & 올림픽공원
print("\n=== 2. Crawling data.go.kr with perPage=100 (all dTypes) ===")
found = {}  # (id, type) -> title

# Also seed from existing datagokr_kspo_full.json
prev = json.loads((OUT_DIR / "datagokr_kspo_full.json").read_text(encoding="utf-8"))
for item in prev:
    found[(item["id"], item["type"])] = item.get("name") or item.get("title", "")

search_specs = [
    ("FILE", "한국체육산업개발주식회사"),
    ("API", "한국체육산업개발주식회사"),
    ("STD", "한국체육산업개발주식회사"),
    ("FILE", "한국체육산업개발"),
    ("API", "한국체육산업개발"),
    ("STD", "한국체육산업개발"),
    ("TOTAL", "한국체육산업개발"),
    ("FILE", "올림픽공원"),
    ("API", "올림픽공원"),
    ("TOTAL", "실감형"),
    ("FILE", "실감"),
    ("API", "실감"),
    ("TOTAL", "276130"),
    ("TOTAL", "연계 데이터 올림픽공원"),
]

for dt, kw in search_specs:
    for page in range(1, 5):
        url = (
            f"https://www.data.go.kr/tcs/dss/selectDataSetList.do"
            f"?dType={dt}&keyword={urllib.parse.quote(kw)}&currentPage={page}&perPage=100"
        )
        try:
            _, _, raw = fetch(url)
            html = raw.decode("utf-8", errors="ignore")
            sp = BeautifulSoup(html, "html.parser")
            # Find all /data/{id}/{type}.do anchors
            page_hits = 0
            kspo_hits = 0
            for a in sp.find_all("a", href=True):
                m = re.match(r"^/data/(\d+)/(fileData|openapi|standard|linkedData|linked)\.do", a["href"])
                if not m:
                    continue
                did, dtype = m.group(1), m.group(2)
                if dtype == "linked":
                    dtype = "linkedData"
                page_hits += 1
                # Walk up to container li or div
                parent = a.find_parent("li") or a.find_parent("div", class_="result-item") or a.parent
                ptxt = parent.get_text(" ", strip=True) if parent else a.get_text(" ", strip=True)
                if "한국체육산업개발" in ptxt or "올림픽공원 2025" in ptxt or "실감" in ptxt and "올림픽" in ptxt:
                    title = a.get_text(" ", strip=True)
                    if (did, dtype) not in found or len(title) > len(found[(did, dtype)]):
                        found[(did, dtype)] = title
                    kspo_hits += 1
            print(f"  dType={dt:5s} kw={kw:14s} p={page}: total_links={page_hits}, kspo_matched={kspo_hits}")
            if page_hits < 95:
                break
        except Exception as e:
            print(f"  ERR {dt} {kw} p={page}: {e}")
            break

# 3. Also test data.go.kr linked data search (dType=LINKED? or tab?)
for dt_try in ["LINKED", "LINK", "LNKD", "ETC"]:
    url = f"https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType={dt_try}&keyword={urllib.parse.quote('한국체육산업개발')}&currentPage=1&perPage=100"
    try:
        _, _, raw = fetch(url)
        html = raw.decode("utf-8", errors="ignore")
        links = set(re.findall(r"/data/(\d+)/(fileData|openapi|standard|linkedData|linked)\.do", html))
        print(f"  dType={dt_try}: {len(links)} links")
        for did, dtype in links:
            if dtype == "linked":
                dtype = "linkedData"
            if (did, dtype) not in found:
                found[(did, dtype)] = ""
    except Exception as e:
        print(f"  dType={dt_try} ERR: {e}")

print(f"\nTotal candidate (id, type) before catalog verification: {len(found)}")

# 4. Fetch catalog JSON + detail HTML for ALL newly discovered ones (or all)
def fetch_one(pair):
    did, dt = pair
    res = {"id": did, "type": dt, "list_title": found[pair], "url": f"https://www.data.go.kr/data/{did}/{dt}.do"}
    try:
        _, _, raw = fetch(f"https://www.data.go.kr/catalog/{did}/{dt}.json", timeout=15)
        cat = json.loads(raw.decode("utf-8", errors="ignore"))
        res["org"] = (cat.get("creator") or {}).get("name", "")
        res["name"] = cat.get("name", "")
        res["alternateName"] = cat.get("alternateName", "")
        res["dateCreated"] = cat.get("dateCreated", "")
        res["dateModified"] = cat.get("dateModified", "")
        res["encodingFormat"] = cat.get("encodingFormat", "")
        res["license"] = (cat.get("license") or {}).get("name", "")
        res["description"] = cat.get("description", "")
        res["keywords"] = cat.get("keywords", "")
        props = {p.get("name"): p.get("value") for p in (cat.get("additionalProperty") or []) if isinstance(p, dict)}
        res["updateCycle"] = props.get("업데이트 주기", "")
        res["category"] = props.get("분류체계", "")
        res["provideType"] = props.get("제공형태", "")
        res["columns"] = [v.get("name") for v in (cat.get("variableMeasured") or []) if isinstance(v, dict)]
    except Exception as e:
        res["catalog_err"] = str(e)

    try:
        _, _, raw = fetch(res["url"], timeout=15)
        html = raw.decode("utf-8", errors="ignore")
        m_dl = re.search(r"fn_fileDataDown\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)", html)
        if m_dl:
            res["file_down_args"] = list(m_dl.groups())
        # Also check linked URL or API URL
        api_urls = sorted(set(re.findall(r"https?://(?:apis\.data\.go\.kr|api\.odcloud\.kr|www\.ksponco\.or\.kr|ksponco\.or\.kr|culture\.go\.kr|www\.culture\.go\.kr|api\.kcisa\.kr)[^\s\"'<>)]+", html)))
        if api_urls:
            res["api_urls"] = api_urls[:12]
        # Extract key detail table fields
        sp = BeautifulSoup(html, "html.parser")
        meta = {}
        for tr in sp.select("table tr"):
            ths = tr.select("th")
            tds = tr.select("td")
            for th, td in zip(ths, tds):
                k = th.get_text(" ", strip=True)
                v = td.get_text(" ", strip=True)
                if k in ["제공기관", "수정일", "등록일", "차기등록예정일", "업데이트 주기", "확장자", "데이터 기준일자", "전체 행", "데이터 한계", "서비스URL", "요청주소", "엔드포인트", "데이터포맷", "참고문서", "다운로드(바로가기)", "제공형태", "심의여부"]:
                    meta[k] = v[:200]
        res["table_meta"] = meta
        # Check Swagger / odcloud URL
        m_sw = re.search(r"https://infuser\.odcloud\.kr/oas/docs\?namespace=[^\s\"'<>]+", html)
        if m_sw:
            res["oas_url"] = m_sw.group(0)
        # Check openAPI detail endpoint in script or td
        m_ep = re.search(r"(https?://[a-zA-Z0-9._-]+(?::\d+)?/[a-zA-Z0-9_./-]+(?:\.do|Service|Api|api)[a-zA-Z0-9_./?-]*)", html)
        if m_ep and "data.go.kr" not in m_ep.group(1):
            res["detected_ep"] = m_ep.group(1)
    except Exception as e:
        res["page_err"] = str(e)
    return res

all_items = []
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
    for r in ex.map(fetch_one, list(found.keys())):
        all_items.append(r)

kspo_items = [
    r for r in all_items
    if "한국체육산업개발" in (r.get("org", "") + r.get("name", "") + r.get("list_title", "") + r.get("description", "") + r.get("table_meta", {}).get("제공기관", ""))
]
kspo_items.sort(key=lambda x: (x["type"], int(x["id"])))
(OUT_DIR / "datagokr_kspo_verified.json").write_text(json.dumps(kspo_items, ensure_ascii=False, indent=2), encoding="utf-8")

counts = {}
for r in kspo_items:
    counts[r["type"]] = counts.get(r["type"], 0) + 1
print(f"\n[VERIFIED] datagokr_kspo_verified.json: total={len(kspo_items)}, by_type={counts}")
for i, r in enumerate(kspo_items, 1):
    print(f"  {i:2d}. [{r['type']:10s}] {r['id']:8s} | {r.get('org','')[:14]:14s} | mod={r.get('dateModified',''):10s} | {r.get('encodingFormat',''):6s} | {r.get('name') or r.get('list_title')}")

# 5. Also find where fn_fileDataDownload is defined in data.go.kr JS!
print("\n=== 5. Finding fn_fileDataDownload URL ===")
_, _, raw = fetch("https://www.data.go.kr/data/15160326/fileData.do")
html61 = raw.decode("utf-8", errors="ignore")
scripts = re.findall(r'src="(/js/[^"]+\.js)"', html61)
for sc in scripts:
    if any(k in sc.lower() for k in ["common", "cmm", "file", "data", "util", "dss"]):
        try:
            _, _, sraw = fetch("https://www.data.go.kr" + sc, timeout=10)
            stxt = sraw.decode("utf-8", errors="ignore")
            if "fn_fileDataDownload" in stxt:
                idx = stxt.find("fn_fileDataDownload")
                print(f"  FOUND in {sc}:\n", stxt[idx:idx+900])
        except Exception:
            pass
