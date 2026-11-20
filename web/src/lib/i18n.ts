import type { Lang, TabId } from '../types/data';

export function tr<T>(lang: Lang, ko: T, en: T, ja: T): T {
  return lang === 'ko' ? ko : lang === 'ja' ? ja : en;
}

export function pickText(lang: Lang, ko: string, en: string, ja?: string): string {
  if (lang === 'ko') return ko;
  if (lang === 'ja') return ja || en;
  return en;
}

export function localizeCongestLevel(lang: Lang, level: string): string {
  if (lang === 'ko') return level;
  if (level.includes('매우') || (level.includes('붐빔') && !level.includes('약간'))) {
    return lang === 'ja' ? '混雑' : 'Crowded';
  }
  if (level.includes('약간')) {
    return lang === 'ja' ? 'やや混雑' : 'Slightly Busy';
  }
  if (level.includes('보통')) {
    return lang === 'ja' ? '普通' : 'Moderate';
  }
  return lang === 'ja' ? '余裕' : 'Smooth';
}

export function localizePmGrade(lang: Lang, grade: string): string {
  if (lang === 'ko') return grade;
  if (grade.includes('매우나쁨')) return lang === 'ja' ? '非常に悪い' : 'Very Poor';
  if (grade.includes('나쁨')) return lang === 'ja' ? '悪い' : 'Poor';
  if (grade.includes('보통')) return lang === 'ja' ? '普通' : 'Moderate';
  return lang === 'ja' ? '良好' : 'Good';
}

export function localizeHourLabel(lang: Lang, label: string): string {
  const m = label.match(/(\d{1,2})/);
  if (!m) return label;
  const hh = m[1].padStart(2, '0');
  if (lang === 'ko') return `${hh}시`;
  if (lang === 'ja') return `${hh}時`;
  return `${hh}:00`;
}

export function localizeMonthLabel(lang: Lang, month: string): string {
  const m = month.match(/(\d{1,2})/);
  if (!m) return month;
  const idx = Number(m[1]) - 1;
  if (lang === 'ko') return `${m[1]}월`;
  if (lang === 'ja') return `${m[1]}月`;
  const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return enMonths[idx] ?? month;
}

export interface UILabels {
  skipToMain: string;
  appTitle: string;
  appSubtitle: string;
  contestBadge: string;
  highContrast: string;
  fontSize: string;
  langGroupLabel: string;
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
    langGroupLabel: '언어 선택',
    tabs: {
      pulse: { short: '실시간 펄스', full: '① 실시간 펄스 (주차 공백 보완·인구·기상)' },
      forecast: { short: 'ML 예측·ESG', full: '② ML 혼잡·출차 시뮬레이터 & ESG' },
      map: { short: '안전·무장애 지도', full: '③ 시설 안전 지도·스마트 귀가·무장애' },
      venue3d: { short: '3D·휠체어 시야', full: '④ 실감형 3D 공연장 & 휠체어 시야 검증' },
      opendata: { short: '데이터 감사·2028', full: '⑤ 공공데이터 품질 감사 & 2028 0원 아키텍처' },
    },
    footerNotice:
      '본 서비스는 한국체육산업개발(KSPO&CO) 공공데이터 + 서울시 실시간 도시데이터 + 기상청 단기예보를 융합한 KWCAG 2.2 준수 오픈소스(MIT) 실서비스입니다.',
    footerZeroCost: '2026.12~2028.12(총 25개월) 인프라 비용 0원 목표 · 일 4회 자동 갱신 + 5분 엣지 캐시 아키텍처 적용',
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
    langGroupLabel: 'Language Selection',
    tabs: {
      pulse: { short: 'Live Pulse', full: '1. Live Pulse (Parking Gap-Fill · Crowd · Weather)' },
      forecast: { short: 'ML & ESG', full: '2. ML Congestion & Exit Simulator + ESG' },
      map: { short: 'Safe Map', full: '3. Safety Map · Smart Return · Barrier-Free' },
      venue3d: { short: '3D Sightline', full: '4. 3D Venue Twin & Wheelchair Sightline' },
      opendata: { short: 'Audit & 2028', full: '5. Open Data Audit & 2028 $0 Architecture' },
    },
    footerNotice:
      'Built on KSPO&CO Open Data + Seoul Live CityData + KMA Weather API under MIT License with KWCAG 2.2 / WCAG 2.1 AA accessibility compliance.',
    footerZeroCost: '25-Month Operation (Dec 2026–Dec 2028) · $0 Infrastructure Cost Target · 4x Daily Sync + 5-Min Edge Cache',
    showDataTable: 'View Accessible Data Table (KWCAG)',
    hideDataTable: 'Hide Accessible Data Table',
    liveStatusLabel: 'Data Link Status',
  },
  ja: {
    skipToMain: 'メインコンテンツへスキップ',
    appTitle: 'オルパク・セーフパス',
    appSubtitle: 'オリンピック公園 リアルタイム混雑・出庫ML予測 · バリアフリー安全マップ · 3D会場車椅子視界検証',
    contestBadge: '2026 KSPO&CO 公共データ活用ライブサービス',
    highContrast: 'ハイコントラスト',
    fontSize: '文字サイズ',
    langGroupLabel: '言語選択',
    tabs: {
      pulse: { short: 'リアルタイム', full: '① リアルタイム状況（駐車空白補完・人出・気象）' },
      forecast: { short: 'ML予測・ESG', full: '② ML混雑・夜間出庫シミュレーター & ESG' },
      map: { short: '安全・バリアフリー地図', full: '③ 施設安全マップ・分散帰宅・バリアフリー導線' },
      venue3d: { short: '3D・車椅子視界', full: '④ 実物3D公演会場 & 車椅子席視界レイキャスト検証' },
      opendata: { short: 'データ監査・2028', full: '⑤ 公共データ品質監査 & 2028年運用設計' },
    },
    footerNotice:
      '本サービスは韓国体育産業開発(KSPO&CO)公共データ・ソウル市リアルタイム都市データ・気象庁予報を融合したKWCAG 2.2準拠オープンソース(MIT)サービスです。',
    footerZeroCost: '2026年12月〜2028年12月（計25か月）インフラ費0円目標 · 1日4回自動更新＋5分エッジキャッシュ構成',
    showDataTable: '代替データ表を表示 (KWCAG)',
    hideDataTable: '代替データ表を閉じる',
    liveStatusLabel: 'データ連携状態',
  },
};
