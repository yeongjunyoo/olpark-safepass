import type { Lang, TabId } from '../types/data';

export interface UILabels {
  skipToMain: string;
  appTitle: string;
  appSubtitle: string;
  contestBadge: string;
  highContrast: string;
  fontSize: string;
  langToggle: string;
  tabs: Record<TabId, { short: string; full: string }>;
  footerNotice: string;
  footerZeroCost: string;
  showDataTable: string;
  hideDataTable: string;
  liveStatusLabel: string;
}

export const UI_LABELS: Record<Lang, UILabels> = {
  ko: {
    skipToMain: '본문 바로가기',
    appTitle: '올팍 세이프패스',
    appSubtitle: '올림픽공원 실시간 혼잡·출차 예측 · 시설 안전·무장애 귀가 · 3D 공연장 시야 검증',
    contestBadge: '2026 KSPO&CO 공공데이터 활용 실서비스',
    highContrast: '고대비',
    fontSize: '글자크기',
    langToggle: 'EN',
    tabs: {
      pulse: { short: '실시간 펄스', full: '① 실시간 펄스 (주차 공백 보완·인구·기상)' },
      forecast: { short: 'ML 예측·ESG', full: '② ML 혼잡·출차 시뮬레이터 & ESG' },
      map: { short: '안전·무장애 지도', full: '③ 시설 안전 지도·스마트 귀가·무장애' },
      venue3d: { short: '3D·휠체어 시야', full: '④ 실감형 3D 공연장 & 휠체어 시야 검증' },
      opendata: { short: '데이터 감사·2028', full: '⑤ 공공데이터 품질 감사 & 2028 0원 SLA' },
    },
    footerNotice:
      '본 서비스는 한국체육산업개발(KSPO&CO) 공공데이터 + 서울시 실시간 도시데이터 + 기상청 단기예보를 융합한 KWCAG 2.2 준수 오픈소스(MIT) 실서비스입니다.',
    footerZeroCost: '2028년 12월까지 서버 운영비 0원 자동 갱신 아키텍처 적용',
    showDataTable: '대체 데이터 표 보기 (KWCAG)',
    hideDataTable: '대체 데이터 표 닫기',
    liveStatusLabel: '데이터 연동 상태',
  },
  en: {
    skipToMain: 'Skip to main content',
    appTitle: 'Olpark SafePass',
    appSubtitle: 'Olympic Park Live Traffic ML Forecast · Barrier-Free Safety Map · 3D Venue Wheelchair Sightline',
    contestBadge: '2026 KSPO&CO Open Data Live Service',
    highContrast: 'High Contrast',
    fontSize: 'Text Size',
    langToggle: '한국어',
    tabs: {
      pulse: { short: 'Live Pulse', full: '1. Live Pulse (Parking Gap-Fill · Crowd · Weather)' },
      forecast: { short: 'ML & ESG', full: '2. ML Congestion & Exit Simulator + ESG' },
      map: { short: 'Safe Map', full: '3. Safety Map · Smart Return · Barrier-Free' },
      venue3d: { short: '3D Sightline', full: '4. 3D Venue Twin & Wheelchair Sightline' },
      opendata: { short: 'Audit & SLA', full: '5. Open Data Audit & 2028 $0 SLA' },
    },
    footerNotice:
      'Built on KSPO&CO Open Data + Seoul Live CityData + KMA Weather API under MIT License with KWCAG 2.2 / WCAG 2.1 AA accessibility compliance.',
    footerZeroCost: 'Zero-Cost Automated Architecture Guaranteed Through Dec 2028',
    showDataTable: 'View Accessible Data Table (KWCAG)',
    hideDataTable: 'Hide Accessible Data Table',
    liveStatusLabel: 'Data Link Status',
  },
};
