import concurrent.futures
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
}
OUT_DIR = Path(r"C:\Users\basqu\Projects\ksponco-data-2026\data")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.geturl(), resp.read().decode("utf-8", errors="ignore")


def crawl_ksponco_pid(pid):
    url = f"https://www.ksponco.or.kr/pubData/{pid}?mid=a10106020000"
    try:
        st, final, html = fetch(url, timeout=15)
        s = BeautifulSoup(html, "html.parser")
        main = s.select_one("#contents, #content, .sub_cont, .board_view, main") or s
        h4s = [x.get_text(" ", strip=True) for x in main.select("h4") if x.get_text(" ", strip=True) != "콘텐츠 하단정보"]
        fields = {}
        for tr in main.select("tr"):
            ths = [x.get_text(" ", strip=True) for x in tr.select("th")]
            tds = [x.get_text(" ", strip=True) for x in tr.select("td")]
            if len(ths) == 1 and len(tds) == 1:
                fields[ths[0]] = tds[0]
            elif len(ths) == len(tds) and ths:
                for k, v in zip(ths, tds):
                    fields[k] = v
        if not fields and not h4s:
            return None
        title = (h4s[0] if h4s else "") or fields.get("파일데이터명", "")
        if not title or title == "사이트맵":
            return None
        # extract date from view info if present
        meta_txt = main.get_text(" ", strip=True)
        m_date = re.search(r"작성일\s*(\d{4}-\d{2}-\d{2})", meta_txt)
        m_hit = re.search(r"조회수\s*(\d+)", meta_txt)
        # extract attach files if any
        attaches = []
        for a in main.find_all("a", href=True):
            href = a.get("href", "")
            if "/files/download" in href or "fileDown" in href:
                attaches.append({"text": a.get_text(" ", strip=True), "href": urllib.parse.urljoin(url, href)})
        return {
            "pid": pid,
            "page_url": url,
            "title": title,
            "created_date": m_date.group(1) if m_date else "",
            "hits": int(m_hit.group(1)) if m_hit else None,
            "fields": fields,
            "attaches": attaches,
        }
    except Exception as e:
        return None


def crawl_ksponco_all():
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(crawl_ksponco_pid, pid): pid for pid in range(1, 80)}
        for fut in concurrent.futures.as_completed(futs):
            r = fut.result()
            if r:
                results.append(r)
    results.sort(key=lambda x: x["pid"])
    (OUT_DIR / "ksponco_pubdata_clean.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ksponco] crawled {len(results)} valid pubData pages (pids: {[r['pid'] for r in results]})")
    return results


def test_data_go_kr_org():
    # First inspect JS in local data_go_kr_org_list.html for org query mechanism
    org_html = Path(r"C:\Users\basqu\My-Personal-Assistant\01 Projects\공모전 파이프라인\착수\KSPO&CO 공공데이터 2026\원문\data_go_kr_org_list.html").read_text(encoding="utf-8", errors="ignore")
    for pat in [r"orgFullName[^\n;]{0,120}", r"orgFilter[^\n;]{0,120}", r"selectDataSetList[^\n;]{0,120}"]:
        matches = re.findall(pat, org_html)
        if matches:
            print(f"[js hint {pat[:12]}]:", matches[:5])

    # Try multiple query combinations on data.go.kr
    queries = [
        ("orgFilter_B552024", "https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=TOTAL&keyword=&detailKeyword=&publicDataPk=&recmSe=&detailText=&relatedKeyword=&commaNotInData=&commaAndData=&commaOrData=&must_not=&tabId=&dataSetCoreTf=&coreDataNm=&sort=date&relRadio=&orgFullName=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&orgFilter=B552024&org=B552024&orgSearch=Y&currentPage=1&perPage=100&brm=&instt=&svcType=&kwrdArray=&extsn=&coreDataNmArray=&pblonsipScopeCode="),
        ("keyword_org", "https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=TOTAL&keyword=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C&currentPage=1&perPage=100"),
        ("orgNm_detail", "https://www.data.go.kr/tcs/dss/selectDataSetList.do?sType=detail&dType=TOTAL&orgNm=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&currentPage=1&perPage=100"),
        ("linked_keyword", "https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=TOTAL&org=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&orgFullName=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&orgFilter=%ED%95%9C%EA%B5%AD%EC%B2%B4%EC%9C%A1%EC%82%B0%EC%97%85%EA%B0%9C%EB%B0%9C%EC%A3%BC%EC%8B%9D%ED%9A%8C%EC%82%AC&currentPage=1&perPage=100"),
    ]
    for name, url in queries:
        try:
            st, final, html = fetch(url, timeout=25)
            s = BeautifulSoup(html, "html.parser")
            # counts per tab
            tabs = [(a.get_text(" ", strip=True)) for a in s.select(".tab-list li, .result-list-tab li, .search-tab li, #totalCnt, .count, em.count")]
            items = []
            for li in s.select("div.result-list ul li"):
                a = li.select_one("dl dt a")
                if not a:
                    continue
                href = a.get("href", "")
                title = a.get_text(" ", strip=True)
                org_el = li.select_one("div.info-data p span.data, p.info-data")
                info_txt = li.select_one("div.info-data").get_text(" | ", strip=True) if li.select_one("div.info-data") else ""
                items.append({"title": title, "href": href, "info": info_txt})
            print(f"\n[data.go.kr {name}] items={len(items)} tabs={tabs[:8]}")
            for it in items[:5]:
                print("  ", it["title"][:60], "|", it["href"], "|", it["info"][:80])
            if len(items) > 0 and any("한국체육산업개발" in (it["title"] + it["info"]) for it in items):
                (OUT_DIR / f"datagokr_{name}.html").write_text(html, encoding="utf-8")
        except Exception as e:
            print(f"[data.go.kr {name}] ERR: {e}")


def test_direct_endpoints():
    print("\n=== Direct KSPO&CO live API probes ===")
    for name, url in [
        ("pub64_parking", "https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=PARKING21803504"),
        ("pub64_parking_Cap", "https://www.ksponco.or.kr/online/main/parkingorsApi.do?ApiKey=PARKING21803504"),
        ("pub60_tennis", "https://www.ksponco.or.kr/online/main/monthlyApi.do"),
        ("pub62_linked", "https://www.data.go.kr/data/276130/linkedData.do"),
        ("pub61_eco", "https://www.data.go.kr/data/15160326/fileData.do"),
    ]:
        try:
            st, final, body = fetch(url, timeout=20)
            print(f"\n[{name}] status={st} len={len(body)} final={final}")
            if len(body) < 3000:
                print("  BODY:", body[:1500])
            else:
                s = BeautifulSoup(body, "html.parser")
                title = s.title.get_text(" ", strip=True) if s.title else ""
                print("  HTML title:", title)
                # Look for download buttons, file links, org code, API endpoint
                for el in s.select("a, button"):
                    oc = (el.get("onclick") or "") + " " + (el.get("href") or "")
                    txt = el.get_text(" ", strip=True)
                    if any(k in (oc + txt) for k in ["다운로드", "download", "fileDetail", "atchFile", "fn_file", "linked", ".csv", ".zip", ".xlsx"]):
                        print(f"    BTN/A[{txt[:40]}]: href={el.get('href')} onclick={el.get('onclick')}")
                # Print metadata table
                for tr in s.select("table tr")[:20]:
                    row = [c.get_text(" ", strip=True)[:80] for c in tr.select("th, td")]
                    if row:
                        print("    ROW:", row)
        except Exception as e:
            print(f"[{name}] ERR: {e}")


if __name__ == "__main__":
    crawl_ksponco_all()
    test_data_go_kr_org()
    test_direct_endpoints()
