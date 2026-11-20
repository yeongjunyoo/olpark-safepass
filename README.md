# 올팍 세이프패스 (Olpark SafePass) + 3D 공연장·휠체어 시야 검증 플랫폼

> **2026년도 한국체육산업개발(KSPO&CO) 공공데이터 활용 경진대회 출품 실서비스**
>
> - **실서비스 공개 URL**: https://yeongjunyoo.github.io/olpark-safepass/
> - **MIT 오픈소스 저장소**: https://github.com/yeongjunyoo/olpark-safepass
>
> KSPO&CO 공공데이터(58종 전수 감사·핵심 7종 실연동) × 서울시 실시간 도시데이터 × 서울 지하철 4역 × 기상청 송파 방이동(`nx=62, ny=126`)을 결합한 **KWCAG 2.2 AA 준수 · 2028년 운영비 0원 무중단 PWA**

---

## 1. 핵심 해결 과제 및 차별화 포인트

| 영역 | 기존 한계 (`parking.do` · `olparkspot` · 서울시 도시데이터) | 올팍 세이프패스 (`Olpark SafePass`) 실구현 |
|---|---|---|
| **① 실시간 주차 공백 보완** | 서울시 도시데이터(`POI127`) 4개 주차장(2,716면) 전부 `CUR_PRK_YN=N` 미제공 · 공식 `parking.do`는 주말 한정 & 17~21시 89% 평탄 고정 | **KSPO&CO `parkingorsApi.do` 실시간 보완** + `15138735` 실측 **10분 회차(31.4%) 분리 분석** + 365일 라이브 펄스 |
| **② 기상×공연 비선형 ML 예측** | 기존 민간 서비스 날씨 연동 0% · 단순 규칙 휴리스틱 의존 | **215,528건 실측 + 기상청 ASOS 학습 GroupKFold 검증 ML 엔진** — "우천 × 대형공연 동시개최 비선형 폭증(7/20 야간출차 1,847대 월 1위)" 정량 예측 + **ESG CO₂·소나무 절감 계산기** |
| **③ 시설 안전·무장애 스마트 귀가** | 2026-11-19 KSPO&CO 시민제안(`list_no=85882`) 중 **시설 안전 지도·스마트 귀가 동선** 보류 · 유모차(490회)/휠체어(11/19) 민원 | **무료 Leaflet/OSM 안전·무장애 지도** — 22시 내부 통제 구역, 송파 공영주차장 오버플로우, 장애인 주차 12개소 85면, 단차 없는 경사로 귀가, 국립스포츠박물관(2026-10 개관), AED·그늘막·안전러닝 구간 |
| **④ 3D 공연장 & 휠체어 시야** | 단순 3D 뷰어에 그쳐 대관 설계·휠체어석 시야 민원(VOC 1,262회·470회) 미해결 | **Pure Three.js `15127487` 실물 GLB 뷰어 + 24광선 기하학적 광선추적 시뮬레이터** — 앞열 착석(125cm) vs 기립(165cm) & 난간 높이별 가림률(%)·권장 단상 높이(cm) 자동 처방 + 2D 단면 SVG 폴백 |
| **⑤ 데이터 품질 감사 & 2028 SLA** | `15164156` Oracle `HH24:MM:DD` 버그 699/699행 오염 · `culture.go.kr` 점검 시 27종 OpenAPI 전면 중단 | **전수감사 6대 품질 결함 증빙 + 추가 개방 표준 스키마 5종 원클릭 CSV/JSON 다운로드 + 2028년 운영비 ₩0 무중단 아키텍처** |

---

## 2. 프로젝트 구조

```text
ksponco-data-2026/
├── web/                          # Vite + React 19 + TypeScript + Tailwind v4 + Leaflet + Three.js PWA
│   ├── public/
│   │   ├── data/                 # 실측 JSON 번들 (live_snapshot.json, model_bundle.json 등)
│   │   └── models/               # KSPO&CO 15127487 실감형 3D GLB (88JandiMadang.glb 등)
│   └── src/
│       ├── components/tabs/      # 5대 핵심 화면 (LivePulse, Forecast, SafeMap, Venue3D, OpenData)
│       ├── components/Charts.tsx # KWCAG 대체 데이터 표 내장 반응형 SVG 차트
│       └── lib/                  # dataLoader, mlEngine, sightlineEngine, baselineData, i18n
├── worker/                       # Cloudflare Workers 실시간 API 프록시 (5분 엣지 캐시 · 키 은닉 · 자동 폴백)
│   ├── src/index.ts
│   └── wrangler.toml
├── .github/workflows/
│   └── refresh.yml               # 매일 06/12/18시 KST 자동 데이터 갱신 & Cloudflare Pages 배포
├── data/                         # 원본 공공데이터 감사 산출물
├── scripts/                      # EDA · ML 학습 · QA 검증 스크립트
├── LICENSE                       # MIT 오픈소스 라이선스
└── README.md                     # 서비스 설명 및 기관 이관·운영 매뉴얼
```

---

## 3. 로컬 실행 및 빌드 방법

### 프론트엔드 (`web/`)
```bash
cd web
npm install
# 개발 서버
npm run dev
# 프로덕션 빌드 (저메모리 환경 권장 옵션)
NODE_OPTIONS=--max-old-space-size=1536 npm run build
npm run preview
```

### Cloudflare Worker 실시간 프록시 (`worker/`)
```bash
cd worker
npm install
# 비밀 키는 코드에 절대 커밋하지 않고 Cloudflare Secret으로만 주입합니다.
npx wrangler secret put KSPONCO_PARKING_KEY
npx wrangler secret put SEOUL_CITYDATA_KEY
npx wrangler secret put KMA_API_KEY
npx wrangler deploy
```
> **주의**: KSPO&CO `parkingorsApi.do` 실서버는 문서 표기(`ApiKey`)와 달리 소문자 `apiKey` 파라미터만 허용합니다(`worker/src/index.ts`에 반영 완료).

---

## 4. 2028년 운영비 0원 무중단 아키텍처 & 기관 이관 매뉴얼

1. **프론트엔드 호스팅 — Cloudflare Pages (₩0/월)**
   - 정적 빌드 산출물(`web/dist`)을 글로벌 CDN으로 무료 서빙(무제한 대역폭, HTTPS 기본 제공).
   - ML 추론·ESG 계산·3D WebGL 광선추적은 100% 브라우저 클라이언트에서 실행되어 백엔드 GPU/서버 비용이 0원입니다.
2. **실시간 API 프록시 — Cloudflare Workers (₩0/월)**
   - 무료 티어 일 100,000건 제공 + 5분 엣지 캐시(`s-maxage=300`) 적용 시 일 평균 상류 API 호출은 288회 미만으로 무료 한도의 0.3% 이하입니다.
   - `culture.go.kr` 점검(HTTP 502) 등 상류 장애 발생 시 `STATIC_FALLBACK_URL`의 검증 스냅샷 JSON으로 자동 전환합니다.
3. **정기 갱신 & 헬스체크 — GitHub Actions (₩0/월)**
   - `.github/workflows/refresh.yml`이 매일 06:00 / 12:00 / 18:00 KST에 자동 실행되어 최신 스냅샷을 검증·배포합니다.
4. **기관 이관 절차 (KSPO&CO 디지털혁신팀 이관 시)**
   - 본 저장소(MIT License)를 기관 GitHub Organization으로 Fork/Transfer 후, Repository Secrets(`KSPONCO_PARKING_KEY`, `SEOUL_CITYDATA_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) 4건만 등록하면 즉시 무중단 이관이 완료됩니다.

---

## 5. KWCAG 2.2 / WCAG 2.1 AA 웹 접근성 체크리스트

- 스킵 내비게이션(`본문 바로가기`) 및 시맨틱 랜드마크(`<header>`, `<nav>`, `<main>`, `<footer>`, 단일 `<h1>` 계층)
- WAI-ARIA `tablist`/`tab`/`tabpanel` 및 방향키(`ArrowLeft`/`ArrowRight`/`Home`/`End`) 키보드 100% 조작
- 고대비 모드(`data-contrast="high"`) 및 글자 크기 확대(`100% / 115% / 130%`) 즉시 토글
- 모든 SVG 차트·Leaflet 지도·Three.js 3D 뷰어에 `role="region"`, `aria-label`, **대체 HTML 데이터 표(토글)** 및 2D 단면 SVG 자동 폴백 완비
- 한/영(`KO / EN`) 즉시 전환 및 KSPO&CO 영문 공연정보(`15149169`) 글로벌 예매 링크 연동
