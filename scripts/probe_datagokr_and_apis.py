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


def fetch(url, data=None, headers=None, timeout=25):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.geturl(), resp.read()


# 1. Inspect data_go_kr_org_list.html to find how data.go.kr searches & lists datasets
print("=== 1. Inspecting data_go_kr_org_list.html ===")
org_html = Path(r"C:\Users\basqu\My-Personal-Assistant\01 Projects\공모전 파이프라인\착수\KSPO&CO 공공데이터 2026\원문\data_go_kr_org_list.html").read_text(encoding="utf-8", errors="ignore")
s = BeautifulSoup(org_html, "html.parser")
for sel in [".result-list li", "#apiDataList li", "#fileDataList li", "#stdDataList li", ".data-list li", "ul.list li"]:
    found = s.select(sel)
    if found:
        print(f"  selector '{sel}': {len(found)} items")
for m in set(re.findall(r"/tcs/dss/[a-zA-Z0-9_]+\.do", org_html)):
    print("  endpoint:", m)
for m in set(re.findall(r"fn_[a-zA-Z0-9_]+\([^)]*\)", org_html)) :
    if any(k in m.lower() for k in ["search", "org", "page", "list", "tab", "data"]):
        print("  js fn:", m[:100])
# Check org list HTML snippets mentioning orgFilter or orgFullName
for m in re.findall(r".{0,60}selectOrg[A-Za-z0-9_]*\.do.{0,60}", org_html):
    print("  org endpoint:", m.strip())

# 2. Query data.go.kr using orgFullName & check exact HTML structure
print("\n=== 2. Testing data.go.kr search for 한국체육산업개발주식회사 ===")
# Let's check what org code data.go.kr uses via autocomplete / org search endpoint or catalog json of a known KSPO dataset!
for test_url in [
    "https://www.data.go.kr/catalog/276130/linkedData.json",
    "https://www.data.go.kr/catalog/15160326/fileData.json",
    "https://www.data.go.kr/catalog/3074924/openapi.json",
    "https://www.data.go.kr/catalog/15110953/fileData.json",
]:
    try:
        st, final, raw = fetch(test_url)
        txt = raw.decode("utf-8", errors="ignore")
        print(f"\n[CATALOG JSON] {test_url} -> len={len(txt)}")
        print(txt[:1500])
    except Exception as e:
        print(f"[CATALOG JSON] {test_url} ERR: {e}")

# 3. Inspect full pubData/62 linkedData.do page for download links / URLs / external portal
print("\n=== 3. Inspecting linkedData/276130 HTML ===")
st, final, raw = fetch("https://www.data.go.kr/data/276130/linkedData.do")
html62 = raw.decode("utf-8", errors="ignore")
(OUT_DIR / "linkedData_276130.html").write_text(html62, encoding="utf-8")
s62 = BeautifulSoup(html62, "html.parser")
main62 = s62.select_one("#contents, .contents, .data-detail-wrap, main") or s62
# Print all table rows and definition lists and external URLs
for tr in main62.select("tr"):
    cells = [c.get_text(" ", strip=True) for c in tr.select("th, td")]
    if cells:
        print("  TR:", cells)
for dt in main62.select("dt"):
    dd = dt.find_next_sibling("dd")
    print(f"  DT[{dt.get_text(' ', strip=True)}]: {dd.get_text(' ', strip=True)[:200] if dd else ''}")
urls62 = sorted(set(re.findall(r"https?://[^\s\"'<>)]+", html62)))
for u in urls62:
    if not any(skip in u for skip in ["w3.org", "schema.org", "googletagmanager", "kakao", "naver", "facebook", "twitter", "youtube", "instagram"]):
        print("  URL62:", u)

# 4. Inspect fn_fileDataDown in fileData page JS
print("\n=== 4. Checking fn_fileDataDown mechanism ===")
st, final, raw = fetch("https://www.data.go.kr/data/15160326/fileData.do")
html61 = raw.decode("utf-8", errors="ignore")
for m in re.findall(r"fn_fileDataDown[\s\S]{0,600}", html61):
    print("  JS:", m[:400])
for m in set(re.findall(r"/cmm/cmm/fileDownload\.do[^\s\"']*|/tcs/dss/selectFileDataDownload\.do[^\s\"']*|fileDataDown[^\s\"']*", html61)):
    print("  DL pattern:", m)
for sc in BeautifulSoup(html61, "html.parser").select("script[src]"):
    src = sc.get("src", "")
    if any(k in src.lower() for k in ["file", "detail", "data", "dss"]):
        print("  script:", src)

# 5. Check data.go.kr org search with exact query params from data.go.kr
print("\n=== 5. Testing data.go.kr org filter endpoints ===")
# Check what `org` code is used in data.go.kr for 한국체육산업개발주식회사
for ep in [
    "https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=TOTAL&keyword=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&currentPage=1&perPage=100",
    "https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=FILE&keyword=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&currentPage=1&perPage=100",
    "https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&currentPage=1&perPage=100",
]:
    st, final, raw = fetch(ep)
    ht = raw.decode("utf-8", errors="ignore")
    sp = BeautifulSoup(ht, "html.parser")
    # Look for any /data/\d+/ links!
    dlinks = []
    for a in sp.find_all("a", href=True):
        m = re.match(r"^/data/(\d+)/(fileData|openapi|standard|linkedData)\.do", a["href"])
        if m:
            dlinks.append((m.group(1), m.group(2), a.get_text(" ", strip=True)[:80]))
    # Deduplicate by (id, type)
    seen = {}
    for did, dt, txt in dlinks:
        if (did, dt) not in seen or len(txt) > len(seen[(did, dt)]):
            seen[(did, dt)] = txt
    # Check total count badges
    cnts = [(el.get("id") or el.get("class"), el.get_text(" ", strip=True)) for el in sp.select("#totalCnt, #fileCnt, #apiCnt, #stdCnt, .tab-layer-count, .count, span.num") if el.get_text(strip=True)]
    print(f"  {ep.split('dType=')[1][:20]} -> unique /data/ links: {len(seen)}, counts={cnts[:12]}")
    for (did, dt), txt in list(seen.items())[:8]:
        print(f"    {did}/{dt}: {txt}")

# 6. Test Seoul OpenData real-time city data & credentials presence (NEVER PRINT KEYS!)
print("\n=== 6. Checking credentials presence & Seoul OpenData / KMA / data.go.kr probes ===")
for k in ["data-go-kr", "nps-data", "seoul-opendata", "kma-apihub"]:
    row = creds.get_account(k)
    sec = creds.read_secret(k)
    print(f"  cred '{k}': account={'YES' if row else 'NO'} (kind={row.get('kind') if row else ''}, has_pw={bool(row.get('password')) if row else False}, has_login={bool(row.get('login_id')) if row else False}), secret={'YES' if sec else 'NO'}")

seoul_row = creds.get_account("seoul-opendata")
seoul_key = (seoul_row.get("password") or seoul_row.get("login_id")) if seoul_row else creds.read_secret("seoul-opendata")
if seoul_key:
    # Test Seoul Real-time City Data (citydata) for Olympic Park & nearby places
    for area in ["올림픽공원", "잠실 관광특구", "잠실종합운동장", "잠실한강공원", "몽촌토성역", "올림픽공원역", "석촌호수", "방이맛골"]:
        u = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(seoul_key)}/json/citydata/1/5/{urllib.parse.quote(area)}"
        try:
            st, _, raw = fetch(u, timeout=10)
            obj = json.loads(raw.decode("utf-8", errors="ignore"))
            if "CITYDATA" in obj:
                cd = obj["CITYDATA"]
                live = cd.get("LIVE_PPLTN_STTS", [{}])
                cong = live[0].get("AREA_CONGEST_LVL") if live else None
                minp = live[0].get("AREA_PPLTN_MIN") if live else None
                maxp = live[0].get("AREA_PPLTN_MAX") if live else None
                prk = len(cd.get("PRK_STTS", []))
                sub = len(cd.get("SUB_STTS", []))
                ev = len(cd.get("EVENT_STTS", []))
                print(f"  [SEOUL CITYDATA HIT!] {area}: AREA_NM={cd.get('AREA_NM')}, congest={cong}, ppltn={minp}~{maxp}, prk={prk}, sub={sub}, events={ev}")
            else:
                res = obj.get("RESULT", obj)
                print(f"  [SEOUL CITYDATA MISS] {area}: {res.get('CODE') if isinstance(res, dict) else str(res)[:80]}")
        except Exception as e:
            print(f"  [SEOUL CITYDATA ERR] {area}: {type(e).__name__}")
