import json
import re
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"}

def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, resp.geturl(), resp.read().decode("utf-8", errors="ignore")

# 1. Inspect local ksponco list HTML
list_html = Path(r"C:\Users\basqu\My-Personal-Assistant\01 Projects\공모전 파이프라인\착수\KSPO&CO 공공데이터 2026\원문\공공데이터개방목록_a10106020000.html").read_text(encoding="utf-8", errors="ignore")
soup = BeautifulSoup(list_html, "html.parser")
print("=== ksponco list page ===")
for el in soup.select(".board_info, .total, .paging, .pagination, .page, .board_top, .count"):
    txt = el.get_text(" ", strip=True)
    if txt:
        print(el.get("class"), txt[:200])
page_links = [(a.get_text(" ", strip=True), a.get("href")) for a in soup.find_all("a", href=True) if "page" in a.get("href", "").lower() or "pubData" in a.get("href", "")]
print("ksponco page/pubData links:", page_links[:25])

# 2. Fetch sample ksponco detail pages
for pid in [64, 62, 61, 60, 59, 4, 27]:
    url = f"https://www.ksponco.or.kr/pubData/{pid}?mid=a10106020000"
    try:
        st, final, html = fetch(url)
        s = BeautifulSoup(html, "html.parser")
        main = s.select_one("#contents, #content, .sub_cont, .board_view, main") or s
        print(f"\n=== pubData/{pid} (status={st}, len={len(html)}) ===")
        for sel in [".board_view_tit", ".view_tit", ".tit", "h2", "h3", "h4"]:
            found = [x.get_text(" ", strip=True) for x in main.select(sel)]
            if found:
                print(f"  {sel}: {found[:4]}")
        for tr in main.select("tr"):
            ths = [x.get_text(" ", strip=True) for x in tr.select("th")]
            tds = [x.get_text(" ", strip=True) for x in tr.select("td")]
            if ths or tds:
                print(f"  TR: th={ths} | td={[t[:160] for t in tds]}")
        # Also check dl/dt/dd or div.view_cont
        for dt in main.select("dt"):
            dd = dt.find_next_sibling("dd")
            print(f"  DT[{dt.get_text(' ', strip=True)}]: {dd.get_text(' ', strip=True)[:160] if dd else ''}")
        # Links in main
        links = [(a.get_text(" ", strip=True)[:50], a.get("href")) for a in main.find_all("a", href=True)
                 if any(k in a.get("href", "") for k in ["data.go.kr", "download", "api", "olpark", "files", "http"])]
        print("  LINKS:", links[:15])
    except Exception as e:
        print(f"\n=== pubData/{pid} ERROR: {e} ===")

# 3. Inspect data_go_kr_org_list.html form & search params
org_html = Path(r"C:\Users\basqu\My-Personal-Assistant\01 Projects\공모전 파이프라인\착수\KSPO&CO 공공데이터 2026\원문\data_go_kr_org_list.html").read_text(encoding="utf-8", errors="ignore")
s2 = BeautifulSoup(org_html, "html.parser")
print("\n=== data.go.kr form inputs ===")
for inp in s2.select("form#publicDataForm input, form#searchForm input, form input[type=hidden]")[:40]:
    print(f"  input name={inp.get('name')} id={inp.get('id')} value={inp.get('value')}")
# Look for org filter JS or URL patterns in org_html
for m in set(re.findall(r"[a-zA-Z0-9_/]+DataSetList\.do[^\s\"'<>]*", org_html)):
    print("  URL pattern:", m)
for m in set(re.findall(r"org[A-Za-z0-9_]*", org_html)) :
    if len(m) < 25:
        pass
print("  org-related inputs:", [(i.get("name"), i.get("id"), i.get("value")) for i in s2.select("input") if "org" in (i.get("name") or "").lower() or "org" in (i.get("id") or "").lower()])
