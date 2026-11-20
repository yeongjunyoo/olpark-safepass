"""Playwright real-browser QA & high-resolution screenshot capture for Olpark SafePass."""
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"C:\Users\basqu\Projects\ksponco-data-2026")
WEB_DIR = ROOT / "web"
QA_DIR = ROOT / "runs" / "qa"
SHOT_DIR = QA_DIR / "screenshots"
SHOT_DIR.mkdir(parents=True, exist_ok=True)

PORT = 4173
BASE_URL = f"http://127.0.0.1:{PORT}"


def wait_for_server(url: str, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.35)
    return False


def run_a11y_audit(page, tab_name: str) -> dict:
    return page.evaluate(
        """(tabName) => {
        const skip = document.querySelector('a.skip-link');
        const h1s = Array.from(document.querySelectorAll('h1'));
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => parseInt(h.tagName.slice(1), 10));
        let headingSkip = false;
        for (let i = 1; i < headings.length; i++) {
            if (headings[i] - headings[i - 1] > 1) headingSkip = true;
        }
        const imgsMissingAlt = Array.from(document.querySelectorAll('img')).filter(img => !img.hasAttribute('alt')).length;
        const regions = Array.from(document.querySelectorAll('[role="region"]'));
        const regionsWithoutLabel = regions.filter(r => !r.getAttribute('aria-label') && !r.getAttribute('aria-labelledby')).length;
        const svgsRoleImg = Array.from(document.querySelectorAll('svg[role="img"]'));
        const svgsMissingLabel = svgsRoleImg.filter(s => !s.getAttribute('aria-label')).length;
        const buttonsNoName = Array.from(document.querySelectorAll('button')).filter(b => {
            const text = (b.innerText || '').trim();
            const label = (b.getAttribute('aria-label') || '').trim();
            return !text && !label;
        }).length;
        const overflowPx = document.documentElement.scrollWidth - document.documentElement.clientWidth;

        return {
            tab: tabName,
            has_skip_link: Boolean(skip),
            h1_count: h1s.length,
            heading_levels: headings,
            heading_skip_violation: headingSkip,
            imgs_missing_alt: imgsMissingAlt,
            regions_count: regions.length,
            regions_missing_label: regionsWithoutLabel,
            svgs_missing_label: svgsMissingLabel,
            buttons_missing_accessible_name: buttonsNoName,
            horizontal_overflow_px: overflowPx,
        };
    }""",
        tab_name,
    )


def main():
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    env = os.environ.copy()
    env["NODE_OPTIONS"] = "--max-old-space-size=1536"
    proc = subprocess.Popen(
        ["npx.cmd", "vite", "preview", "--host", "127.0.0.1", "--port", str(PORT), "--strictPort"],
        cwd=str(WEB_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=creationflags,
    )

    report = {
        "base_url": BASE_URL,
        "console_errors": [],
        "page_errors": [],
        "failed_requests": [],
        "a11y_checks": [],
        "keyboard_nav_ok": False,
        "b1_data_verified": {},
        "screenshots": [],
    }

    try:
        if not wait_for_server(BASE_URL):
            raise RuntimeError("Vite preview server failed to start on port 4173")

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--use-gl=angle",
                    "--use-angle=swiftshader",
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                ],
            )
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                locale="ko-KR",
            )
            page = context.new_page()

            page.on(
                "console",
                lambda msg: report["console_errors"].append(f"[{msg.type}] {msg.text}")
                if msg.type == "error"
                else None,
            )
            page.on("pageerror", lambda err: report["page_errors"].append(str(err)))
            page.on(
                "requestfailed",
                lambda req: report["failed_requests"].append(f"{req.url} ({req.failure})")
                if "127.0.0.1" in req.url
                else None,
            )

            # 1. Tab 1: Live Pulse (Desktop 1440x900)
            page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1200)
            body_text = page.inner_text("body")
            live_json = json.loads((WEB_DIR / "public" / "data" / "live_snapshot.json").read_text(encoding="utf-8"))
            expected_sum = f"{int(live_json['kspo_parking']['parking_sum']):,}"
            report["b1_data_verified"]["live_parking_sum_expected"] = expected_sum
            report["b1_data_verified"]["live_parking_sum_present"] = expected_sum in body_text
            report["b1_data_verified"]["linked_assets_present"] = "live_snapshot.json" in body_text
            report["b1_data_verified"]["concerts_nov_roykim_present"] = "로이킴" in body_text
            report["a11y_checks"].append(run_a11y_audit(page, "pulse-desktop"))
            shot1 = SHOT_DIR / "01_desktop_live_pulse.png"
            page.screenshot(path=str(shot1), full_page=True)
            report["screenshots"].append(str(shot1))

            # Verify keyboard ArrowRight tab navigation
            page.locator("#tab-pulse").focus()
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(350)
            selected_after_arrow = page.locator("#tab-forecast").get_attribute("aria-selected")
            report["keyboard_nav_ok"] = selected_after_arrow == "true"

            # 2. Tab 2: ML Forecast & ESG
            page.locator("#tab-forecast").click()
            page.wait_for_timeout(800)
            report["a11y_checks"].append(run_a11y_audit(page, "forecast-desktop"))
            shot2 = SHOT_DIR / "02_desktop_ml_forecast_esg.png"
            page.screenshot(path=str(shot2), full_page=True)
            report["screenshots"].append(str(shot2))

            # 3. Tab 3: Safe Map & Barrier-Free (wait for OSM tiles)
            page.locator("#tab-map").click()
            page.wait_for_timeout(3200)
            report["a11y_checks"].append(run_a11y_audit(page, "map-desktop"))
            shot3 = SHOT_DIR / "03_desktop_safe_map_barrierfree.png"
            page.screenshot(path=str(shot3), full_page=True)
            report["screenshots"].append(str(shot3))

            # 4. Tab 4: 3D Venue & Wheelchair Sightline (KSPO DOME Standing BEFORE -> AFTER Riser Fix)
            page.locator("#tab-venue3d").click()
            page.wait_for_timeout(1600)
            report["a11y_checks"].append(run_a11y_audit(page, "venue3d-kspo-desktop"))
            shot4 = SHOT_DIR / "04_desktop_3d_sightline_kspo.png"
            page.screenshot(path=str(shot4), full_page=True)
            report["screenshots"].append(str(shot4))

            # 4c. Click Auto-Recommend Riser Fix button (BEFORE 100% blocked -> AFTER 0% blocked!)
            page.get_by_role("button", name="권장 단상(+55cm)·저시야 난간 즉시 적용").click()
            page.wait_for_timeout(800)
            shot4c = SHOT_DIR / "04c_desktop_3d_sightline_fixed.png"
            page.screenshot(path=str(shot4c), full_page=False)
            report["screenshots"].append(str(shot4c))

            # 4b. Load official KSPO&CO 15127487 real GLB (88JandiMadang.glb)
            page.get_by_role("button", name="88잔디마당 (실물 15127487 GLB)").click()
            page.wait_for_timeout(3500)
            glb_text = page.inner_text("main")
            report["b1_data_verified"]["glb_88_loaded"] = "88JandiMadang.glb" in glb_text
            shot4b = SHOT_DIR / "04b_desktop_3d_88lawn_glb.png"
            page.screenshot(path=str(shot4b), full_page=False)
            report["screenshots"].append(str(shot4b))

            # 5. Tab 5: Open Data Quality Audit & 2028 Zero-Cost SLA
            page.locator("#tab-opendata").click()
            page.wait_for_timeout(800)
            report["a11y_checks"].append(run_a11y_audit(page, "opendata-desktop"))
            shot5 = SHOT_DIR / "05_desktop_opendata_audit_sla.png"
            page.screenshot(path=str(shot5), full_page=True)
            report["screenshots"].append(str(shot5))

            # 6. KWCAG High-Contrast + English Mode Verification
            page.locator("#tab-pulse").click()
            page.get_by_role("button", name="고대비").click()
            page.get_by_role("button", name="Switch language to English").click()
            page.wait_for_timeout(600)
            shot6 = SHOT_DIR / "06_desktop_kwcag_highcontrast_en.png"
            page.screenshot(path=str(shot6), full_page=False)
            report["screenshots"].append(str(shot6))

            # 7. Mobile 390x844 Verification (KO Normal)
            mobile_ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                locale="ko-KR",
                is_mobile=True,
                has_touch=True,
            )
            mpage = mobile_ctx.new_page()
            mpage.on(
                "console",
                lambda msg: report["console_errors"].append(f"[mobile:{msg.type}] {msg.text}")
                if msg.type == "error"
                else None,
            )
            mpage.on("pageerror", lambda err: report["page_errors"].append(f"[mobile] {err}"))

            mpage.goto(BASE_URL, wait_until="networkidle", timeout=30000)
            mpage.wait_for_timeout(1200)
            report["a11y_checks"].append(run_a11y_audit(mpage, "pulse-mobile-390"))
            shot7 = SHOT_DIR / "07_mobile_live_pulse.png"
            mpage.screenshot(path=str(shot7), full_page=True)
            report["screenshots"].append(str(shot7))

            mpage.locator("#tab-venue3d").click()
            mpage.wait_for_timeout(1600)
            report["a11y_checks"].append(run_a11y_audit(mpage, "venue3d-mobile-390"))
            shot8 = SHOT_DIR / "08_mobile_3d_sightline.png"
            mpage.screenshot(path=str(shot8), full_page=True)
            report["screenshots"].append(str(shot8))

            mobile_ctx.close()
            context.close()
            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    out_json = QA_DIR / "qa_report.json"
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    # Exit non-zero if console/page errors occurred
    if report["console_errors"] or report["page_errors"] or report["failed_requests"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
