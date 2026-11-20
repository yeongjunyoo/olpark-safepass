# 올팍 세이프패스 (Olpark SafePass) KWCAG 2.2 / WCAG 2.1 AA 접근성 점검 기록

- **점검 일시**: 2026-11-20 22:06 KST
- **점검 대상 URL**: `http://127.0.0.1:4173`
- **점검 브라우저**: Chromium (Playwright Headless + SwiftShader WebGL)
- **런타임 오류**: `console_errors=0`, `page_errors=0`, `failed_requests=0`

## 1. 키보드 단독 조작 · 포커스 트랩 점검 (정량 실측)

| 점검 항목 | 기준 | 실측 결과 | 판정 |
|---|---|---|---|
| 건너뛰기 링크(Skip Navigation) 첫 Tab 포커스 | 첫 Tab에 `.skip-link` 도달 | `True` | PASS |
| 건너뛰기 링크 Enter → 본문 이동 | `#main-content` 포커스 이동 | `True` | PASS |
| 탭목록 `ArrowRight` 이동 | `aria-selected='true'` 전환 | `True` | PASS |
| 탭목록 `End` / `Home` 점프 | 마지막/첫 탭 즉시 전환 | `End=True, Home=True` | PASS |
| 포커스 트랩 부재 (Tab 18회 / Shift+Tab 5회) | 갇힘 없이 순방향·역방향 이동 | 순방향 `18/18`, 역방향 `5/5` | PASS |

## 2. ARIA 랜드마크 · 라이브 리전 · 시맨틱 구조 (전 탭 + 모바일 390px)

| 뷰 / 탭 | `html[lang]` | H1 수 | 제목 계층 건너뜀 | 랜드마크 (`header/nav/main/footer/tablist/tabpanel`) | `aria-live`/alert 수 | 미명명 버튼 | 가로 스크롤(px) |
|---|---:|---:|---:|---|---:|---:|---:|
| `pulse-desktop-ko` | `ko` | 1 | 0 (OK) | `1/1/1/1/1/1` | 2 | 0 | 0px |
| `forecast-desktop-ko` | `ko` | 1 | 0 (OK) | `1/1/1/1/1/1` | 3 | 0 | 0px |
| `map-desktop-ko` | `ko` | 1 | 0 (OK) | `1/1/1/1/1/1` | 1 | 0 | 0px |
| `venue3d-kspo-desktop-ko` | `ko` | 1 | 0 (OK) | `1/1/1/1/1/1` | 3 | 0 | 0px |
| `opendata-desktop-ko` | `ko` | 1 | 0 (OK) | `1/1/1/1/1/1` | 1 | 0 | 0px |
| `pulse-desktop-ja` | `ja` | 1 | 0 (OK) | `1/1/1/1/1/1` | 2 | 0 | 0px |
| `pulse-mobile-390` | `ko` | 1 | 0 (OK) | `1/1/1/1/1/1` | 2 | 0 | 0px |
| `venue3d-mobile-390` | `ko` | 1 | 0 (OK) | `1/1/1/1/1/1` | 3 | 0 | 0px |

## 3. 종합 요약 (KWCAG 2.2 AA 정량 기준)

- **제목 계층 위반**: `0`건 (기준 0건)
- **대체 텍스트 누락 이미지 (`img[alt]`)**: `0`건 (기준 0건)
- **접근성 이름 누락 `role="region"`**: `0`건 (기준 0건)
- **접근성 이름 누락 `svg[role="img"]`**: `0`건 (기준 0건)
- **접근성 이름 누락 `<button>`**: `0`건 (기준 0건)
- **최대 가로 오버플로우 (데스크톱 1440px / 모바일 390px)**: `0px` (기준 0px)
- **다국어 `html[lang]` 동적 전환 검증**: `ko` → `en` → `ja` 모두 실측 PASS
- **고대비 모드 (`data-contrast="high"`) & 글자 크기 확대 (`100%→115%→130%`)**: 정상 동작 확인
- **차트·지도·3D KWCAG 대체 데이터 표 (`AccessibleTableToggle`)**: 전 탭 제공 및 키보드 토글 가능
