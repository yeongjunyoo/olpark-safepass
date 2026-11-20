import { useState } from 'react';
import {
  Car,
  AlertTriangle,
  Users,
  CloudSun,
  Wind,
  Droplets,
  TrainFront,
  Calendar,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import type { AppBundle, Lang, TabId } from '../../types/data';
import { localizeCongestLevel, localizePmGrade, pickText, tr } from '../../lib/i18n';
import { PopulationForecastChart } from '../Charts';

interface LivePulseTabProps {
  bundle: AppBundle;
  lang: Lang;
  onNavigateTab: (tab: TabId) => void;
}

export function LivePulseTab({ bundle, lang, onNavigateTab }: LivePulseTabProps) {
  const { live } = bundle;
  const [venueFilter, setVenueFilter] = useState<string>('all');

  const occ = live.kspoParking.occupancyPct;
  const occColor = occ >= 85 ? 'bg-red-700' : occ >= 70 ? 'bg-amber-600' : 'bg-[#0F766E]';
  const occBadge =
    occ >= 85
      ? { ko: '혼잡·만차 임박', en: 'Near Full', ja: '混雑・満車間近', cls: 'bg-red-100 text-red-800 border-red-300' }
      : occ >= 70
        ? { ko: '보통~혼잡 주의', en: 'Moderate-Busy', ja: '普通〜やや混雑', cls: 'bg-amber-100 text-amber-900 border-amber-300' }
        : { ko: '주차 여유', en: 'Smooth', ja: '駐車余裕あり', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' };

  const modeBadge =
    live.sourceMode === 'live-worker'
      ? tr(lang, '실시간 Worker 5분 캐시', 'Live Worker (5m Cache)', 'リアルタイムWorker（5分キャッシュ）')
      : live.sourceMode === 'static-snapshot'
        ? tr(lang, '정적 스냅샷 (일 4회 갱신)', 'Static Snapshot (4x/day)', '静的スナップショット（1日4回更新）')
        : tr(lang, '검증 기준 스냅샷', 'Verified Baseline Snapshot', '検証基準スナップショット');

  const filteredConcerts =
    venueFilter === 'all' ? live.concerts : live.concerts.filter((c) => c.venueId === venueFilter);

  const weatherAlert = (() => {
    const w = live.weather;
    const pmLbl = localizePmGrade(lang, w.pm25Grade);
    if (w.precipitationMm >= 5) {
      return {
        level: 'warning' as const,
        ko: `우천 경보 (${w.precipitationMm}mm): 야외 88잔디마당·테니스장 미끄럼 주의 및 대형공연 시 자차 쏠림 경계`,
        en: `Rain Alert (${w.precipitationMm}mm): Slippery paths at 88 Lawn & Tennis; elevated car arrival risk on concert nights`,
        ja: `雨天警報（${w.precipitationMm}mm）：88芝生広場・テニスコートの足元注意。大型公演日は自家用車集中に警戒してください`,
      };
    }
    if (w.tempC >= 33) {
      return {
        level: 'warning' as const,
        ko: `폭염 경보 (${w.tempC}°C): 테니스장·88잔디마당 야외활동 주의 — 그늘막·실내 쉼터 이용 권고`,
        en: `Heatwave Alert (${w.tempC}°C): Outdoor caution at Tennis & 88 Lawn — use shade shelters`,
        ja: `猛暑警報（${w.tempC}°C）：屋外活動に注意し、日除け・屋内休憩所をご利用ください`,
      };
    }
    if (w.tempC <= 2) {
      return {
        level: 'info' as const,
        ko: `한랭·저온 주의 (${w.tempC}°C, 체감 한파): 야간 공연 퇴장 대기 시 보온 유의 및 몽촌토성·88호수 결빙 구간 확인`,
        en: `Cold Weather Notice (${w.tempC}°C): Dress warmly for post-concert outdoor queues; watch icy paths near 88 Lake`,
        ja: `低温注意（${w.tempC}°C）：夜間公演後の退場待機時は防寒に留意し、夢村土城・88湖周辺の路面凍結にご注意ください`,
      };
    }
    return {
      level: 'safe' as const,
      ko: `야외 활동 양호 (${w.tempC}°C · 미세먼지 ${pmLbl}): 88잔디마당·산책로·테니스장 정상 이용 가능`,
      en: `Good Outdoor Conditions (${w.tempC}°C · PM2.5 ${pmLbl}): Normal operations across outdoor venues`,
      ja: `屋外利用良好（${w.tempC}°C・PM2.5 ${pmLbl}）：88芝生広場・散策路・テニスコートは通常通り利用可能です`,
    };
  })();

  return (
    <div className="space-y-6">
      {/* HERO: Seoul CityData Parking Gap -> KSPO&CO Real-Time API Bridge */}
      <section
        aria-labelledby="gap-bridge-heading"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="bg-gradient-to-r from-[#0F2C59] via-[#133A73] to-[#0F766E] px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-200" aria-hidden="true" />
              <h2 id="gap-bridge-heading" className="text-base font-bold sm:text-lg">
                {tr(
                  lang,
                  '서울시 실시간 도시데이터 주차 공백(2,716면) × KSPO&CO 실시간 주차 API 최초 융합',
                  'Bridging Seoul Live CityData Parking Gap (2,716 spaces) with KSPO&CO Real-Time API',
                  'ソウル市都市データの駐車空白（2,716台）× KSPO&COリアルタイム駐車API 統合補完'
                )}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 border border-emerald-200/40 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
                {modeBadge}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {tr(lang, '수집 시각', 'Collected', '取得時刻')}: {live.kspoParking.measuredAt}
              </span>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-100 sm:text-sm">
            {tr(
              lang,
              '서울시 도시데이터(POI127 올림픽공원)의 4개 공영·공원 주차장(총 2,716면)은 전부 CUR_PRK_YN="N"(실시간 주차대수 미제공) 상태입니다. 올팍 세이프패스는 KSPO&CO 2026-09 신규 개방 API(parkingorsApi.do)로 이 공백을 실시간 보완합니다.',
              'All 4 Olympic Park lots (2,716 spaces) in Seoul Live CityData return CUR_PRK_YN="N" (blank). Olpark SafePass bridges this gap in real time using KSPO&CO’s parkingorsApi.do OpenAPI.',
              'ソウル市都市データ（POI127 オリンピック公園）内の4駐車場（計2,716台）は全てCUR_PRK_YN="N"（リアルタイム台数未提供）です。本サービスはKSPO&CO公式API（parkingorsApi.do）でリアルタイム補完します。'
            )}
          </p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-12">
          {/* Left: Seoul CityData Gap Proof */}
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-red-900">
                <XCircle className="h-4 w-4 text-red-700" aria-hidden="true" />
                {tr(
                  lang,
                  '기존: 서울시 도시데이터 (PRK_STTS)',
                  'Before: Seoul Live CityData (PRK_STTS)',
                  '従来：ソウル市都市データ（PRK_STTS）'
                )}
              </h3>
              <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                CUR_PRK_YN = &quot;N&quot;
              </span>
            </div>
            <ul className="mt-3 space-y-2 text-xs">
              {live.kspoParking.lots.map((lot) => (
                <li
                  key={lot.code}
                  className="flex items-center justify-between rounded-lg border border-red-200/70 bg-white px-3 py-2"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {pickText(lang, lot.name, lot.nameEn, lot.nameJa)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tr(
                        lang,
                        `총 ${lot.capacity.toLocaleString()}면 · 10분 ${lot.ratePer10Min}원`,
                        `${lot.capacity.toLocaleString()} spaces · ₩${lot.ratePer10Min}/10m`,
                        `計${lot.capacity.toLocaleString()}台 · 10分 ${lot.ratePer10Min}ウォン`
                      )}
                    </div>
                  </div>
                  <span className="rounded bg-red-50 px-2 py-0.5 font-mono text-[11px] font-bold text-red-700">
                    {tr(lang, '미제공 (공백)', 'N/A (Blank)', '未提供（空白）')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: KSPO&CO Real-Time Fill + 31.4% Turnaround Insight */}
          <div className="flex flex-col justify-between rounded-xl border border-teal-200 bg-teal-50/60 p-4 lg:col-span-7">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#0F2C59]">
                  <CheckCircle2 className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                  {tr(
                    lang,
                    '보완 후: KSPO&CO 실시간 주차현황 (15168686 / parkingorsApi.do)',
                    'Bridged Live: KSPO&CO Real-Time Parking (15168686)',
                    '補完後：KSPO&CO リアルタイム駐車状況（15168686）'
                  )}
                </h3>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${occBadge.cls}`}>
                  {tr(lang, occBadge.ko, occBadge.en, occBadge.ja)}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="text-xs font-semibold text-slate-600">
                    {tr(lang, '실시간 주차대수', 'Live Parked Cars', '現在の駐車台数')}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-[#0F2C59]">
                      {live.kspoParking.parkingSum.toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      / {live.kspoParking.totalCapacity.toLocaleString()}
                      {tr(lang, '면', ' lots', '台')}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div
                      className={`h-full rounded-full transition-all ${occColor}`}
                      style={{ width: `${Math.min(100, occ)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] font-semibold text-slate-600">
                    <span>{tr(lang, '점유율', 'Occupancy', '占有率')}</span>
                    <span className="text-[#0F2C59]">{occ}%</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="text-xs font-semibold text-slate-600">
                    {tr(lang, '추정 잔여 주차면', 'Est. Free Spaces', '推定空き台数')}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-[#0F766E]">
                      {Math.max(0, live.kspoParking.totalCapacity - live.kspoParking.parkingSum).toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{tr(lang, '면', 'free', '台')}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                    {tr(
                      lang,
                      '남2·동2·북2 통합 기준. 점유율 85% 초과 시 송파 공영주차장 자동 우회 안내',
                      'Park-wide total. Triggers Songpa public overflow routing above 85%',
                      '公園全体合算。占有率85%超過時は松坡区の周辺公営駐車場へ自動迂回案内'
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                  <div className="text-xs font-bold text-amber-900">
                    {tr(lang, '10분 이내 회차 차량 분리', '≤10m Turnaround Share', '10分以内回送車両の分離')}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-amber-800">
                      {live.kspoParking.tenMinTurnaroundSharePct}%
                    </span>
                    <span className="text-[11px] font-semibold text-amber-900">
                      ({live.kspoParking.tenMinTurnaroundCount.toLocaleString()}
                      {tr(lang, '건', '', '件')})
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-amber-950">
                    {tr(
                      lang,
                      `15138735 실측(${live.kspoParking.totalTripsSample.toLocaleString()}건): 3대 중 1대가 10분 내 드롭오프·회차 → 전용 승하차 존 분리 시 게이트 정체 급감`,
                      `Empirical 15138735 (${live.kspoParking.totalTripsSample.toLocaleString()} trips): 1 in 3 vehicles exit within 10 min → separate drop-off bays cut gate queues`,
                      `15138735実測（${live.kspoParking.totalTripsSample.toLocaleString()}件）：3台に1台が10分以内の送迎出庫 → 専用乗降レーン分離でゲート渋滞を緩和`
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-teal-200/70 pt-3">
              <span className="text-xs font-medium text-slate-700">
                {tr(
                  lang,
                  '기존 공식 parking.do는 "주말 한정 · 89% 평탄 고정" — 올팍 세이프패스는 365일 실시간+ML 예측 제공',
                  'Official parking.do is weekend-only & flat 89% — SafePass delivers 365-day live + ML prediction',
                  '公式parking.doは週末限定・89%固定表示 — 本サービスは365日リアルタイム＋ML予測を提供'
                )}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('forecast')}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#0F2C59] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#163D7A]"
                >
                  {tr(lang, '오늘 출차 ML 예측', 'Run ML Forecast', '本日の出庫ML予測')}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('map')}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#0F766E] bg-white px-3 py-1.5 text-xs font-bold text-[#0F766E] transition hover:bg-teal-50"
                >
                  {tr(lang, '우회 주차·귀가 지도', 'Safe Map', '迂回駐車・帰宅マップ')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WEATHER SAFETY ALERT BAR */}
      <section
        aria-label={tr(
          lang,
          '기상청 송파 방이동 실시간 안전 경보',
          'KMA Songpa Real-Time Weather Safety Alert',
          '気象庁 松坡区芳夷洞 リアルタイム安全気象ブリーフィング'
        )}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
          weatherAlert.level === 'warning'
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : weatherAlert.level === 'info'
              ? 'border-blue-200 bg-blue-50 text-slate-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-950'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#0F2C59]" aria-hidden="true" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[#0F2C59]">
              {tr(
                lang,
                `기상청 송파 방이동 (nx=${live.weather.gridNx}, ny=${live.weather.gridNy}) 실시간 안전 브리핑`,
                `KMA Songpa Bangi-dong (nx=${live.weather.gridNx}, ny=${live.weather.gridNy}) Live Safety Briefing`,
                `気象庁 松坡・芳夷洞（nx=${live.weather.gridNx}, ny=${live.weather.gridNy}）リアルタイム安全ブリーフィング`
              )}
            </div>
            <p className="mt-0.5 text-sm font-semibold">
              {tr(lang, weatherAlert.ko, weatherAlert.en, weatherAlert.ja)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 shadow-xs">
            <CloudSun className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            {live.weather.tempC}°C ({live.weather.minTempC}° / {live.weather.maxTempC}°)
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 shadow-xs">
            <Droplets className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            {tr(
              lang,
              `습도 ${live.weather.humidityPct}% · 강수 ${live.weather.precipitationMm}mm`,
              `RH ${live.weather.humidityPct}% · Rain ${live.weather.precipitationMm}mm`,
              `湿度 ${live.weather.humidityPct}% · 降水 ${live.weather.precipitationMm}mm`
            )}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 shadow-xs">
            <Wind className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            {live.weather.windSpeedMs} m/s · PM2.5 {live.weather.pm25} ({localizePmGrade(lang, live.weather.pm25Grade)})
          </span>
        </div>
      </section>

      {/* MIDDLE ROW: 12h Population Forecast + 4-Station Subway Bottleneck */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="pop-forecast-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="pop-forecast-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59]">
                <Users className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
                {tr(
                  lang,
                  '서울시 실시간 인구 & 향후 12시간 혼잡 예측',
                  'Seoul Live Population & 12-Hour Crowd Forecast',
                  'ソウル市リアルタイム人出 & 今後12時間混雑予測'
                )}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                {tr(
                  lang,
                  `현재 ${live.seoulPopulation.min.toLocaleString()}~${live.seoulPopulation.max.toLocaleString()}명 (${live.seoulPopulation.congestLevel}) · 비거주 방문객 ${live.seoulPopulation.nonResidentPct}% · 기준 ${live.seoulPopulation.observedAt}`,
                  `Live ${live.seoulPopulation.min.toLocaleString()}–${live.seoulPopulation.max.toLocaleString()} (${localizeCongestLevel(lang, live.seoulPopulation.congestLevel)}) · Non-residents ${live.seoulPopulation.nonResidentPct}% · ${live.seoulPopulation.observedAt}`,
                  `現在 ${live.seoulPopulation.min.toLocaleString()}〜${live.seoulPopulation.max.toLocaleString()}人（${localizeCongestLevel(lang, live.seoulPopulation.congestLevel)}）· 来訪者比率 ${live.seoulPopulation.nonResidentPct}% · 基準 ${live.seoulPopulation.observedAt}`
                )}
              </p>
            </div>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-[#0F766E] border border-teal-200">
              {tr(lang, live.seoulPopulation.areaName, 'Olympic Park (POI127)', 'オリンピック公園 (POI127)')}
            </span>
          </div>

          <PopulationForecastChart data={live.seoulPopulation.forecast12h} lang={lang} />
        </section>

        {/* 4 Subway Stations Live / Oct 2026 Peak */}
        <section
          aria-labelledby="subway-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5"
        >
          <div className="mb-3">
            <h2 id="subway-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59]">
              <TrainFront className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {tr(
                lang,
                '올림픽공원권 4개 역사 20~21시 퇴장 분산 지표',
                '4-Station Subway Dispersion (20:00–21:00 Exit Surge)',
                '周辺4駅の20〜21時 退場分散ガイド指標'
              )}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {tr(
                lang,
                '차량 출차↔지하철 승차 상관계수 r = +0.831 (2026-10 총 182.5만 통행 실측)',
                'Car exit vs subway boarding correlation r = +0.831 (1.825M Oct 2026 trips)',
                '車両出庫と地下鉄乗車の相関係数 r = +0.831（2026年10月 計182.5万件実測）'
              )}
            </p>
          </div>

          <div className="space-y-2.5">
            {live.subwayStations.map((st) => {
              const riskBadge =
                st.crowdingRisk === 'high'
                  ? { ko: '혼잡 집중 (대안 권장)', en: 'Peak Bottleneck', ja: '混雑集中（迂回推奨）', cls: 'bg-red-100 text-red-800' }
                  : st.crowdingRisk === 'medium'
                    ? { ko: '보통', en: 'Moderate', ja: '普通', cls: 'bg-amber-100 text-amber-900' }
                    : { ko: '분산 추천', en: 'Recommended', ja: '分散おすすめ', cls: 'bg-emerald-100 text-emerald-900' };

              return (
                <div
                  key={st.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-slate-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: st.lineColor }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-bold text-slate-900">
                        {pickText(lang, st.nameKo, st.nameEn, st.nameJa)}
                      </span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${riskBadge.cls}`}>
                      {tr(lang, riskBadge.ko, riskBadge.en, riskBadge.ja)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>
                      {tr(
                        lang,
                        `20~21시 승차 ${(st.hour20Boardings + st.hour21Boardings).toLocaleString()}명/월`,
                        `20–21h Boardings: ${(st.hour20Boardings + st.hour21Boardings).toLocaleString()}/mo`,
                        `20〜21時乗車 ${(st.hour20Boardings + st.hour21Boardings).toLocaleString()}人/月`
                      )}
                    </span>
                    <span className="font-semibold text-[#0F2C59]">
                      {tr(
                        lang,
                        `월 ${(st.monthlyTotal202610 / 10000).toFixed(1)}만 통행`,
                        `${(st.monthlyTotal202610 / 1000).toFixed(0)}k/mo`,
                        `月 ${(st.monthlyTotal202610 / 10000).toFixed(1)}万利用`
                      )}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {pickText(lang, st.exitInfoKo, st.exitInfoEn, st.exitInfoJa)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* BOTTOM ROW: Simultaneous Concert & Global Ticketing */}
      <section
        aria-labelledby="concerts-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="concerts-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59]">
              <Calendar className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {tr(
                lang,
                '공연·전시 동시개최 현황 및 글로벌 예매 연동 (15149169 + 도시데이터)',
                'Concerts, Simultaneous Event Monitor & Global Ticketing (15149169)',
                '公演・展示の同時開催モニター & グローバルチケット連携（15149169）'
              )}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {tr(
                lang,
                'KSPO&CO 영문 공연정보(15149169, 2026년 70건)와 서울시 도시데이터 실시간 전시를 통합해 동시개최 충돌을 감지합니다.',
                'Integrates KSPO&CO English Concert Info (15149169, 70 shows in 2026) & Seoul Live CityData events to flag simultaneous crowd surges.',
                'KSPO&CO公式公演データ（15149169・2026年70件）とソウル市都市データの展示情報を統合し、同時開催による混雑ピークを検知します。'
              )}
            </p>
          </div>

          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={tr(lang, '공연장 필터', 'Venue filter', '会場フィルター')}
          >
            {[
              { id: 'all', ko: '전체', en: 'All', ja: 'すべて' },
              { id: 'kspo-dome', ko: 'KSPO DOME', en: 'KSPO DOME', ja: 'KSPO DOME' },
              { id: 'handball', ko: '핸드볼(티켓링크)', en: 'Handball Arena', ja: 'ハンドボール' },
              { id: 'olympic-hall', ko: '올림픽홀', en: 'Olympic Hall', ja: 'オリンピックホール' },
              { id: '88-lawn', ko: '88잔디마당', en: '88 Lawn', ja: '88芝生広場' },
              { id: 'museum', ko: '박물관(진행중)', en: 'Museums (Live)', ja: '博物館（開催中）' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                aria-pressed={venueFilter === btn.id}
                onClick={() => setVenueFilter(btn.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  venueFilter === btn.id
                    ? 'border-[#0F2C59] bg-[#0F2C59] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tr(lang, btn.ko, btn.en, btn.ja)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span>
            {tr(
              lang,
              '동시개최 경보: 2026-11-27~29 (조용필 KSPO DOME + 다이나믹 듀오 올림픽홀 + 최현우 우리금융아트홀 — 3~4개관 동시개최), 2026-12-04~06 (이승철 + 비 동시개최) 시 야간 출차가 평균 +42% 이상 급증합니다.',
              'Simultaneous Event Alert: Nov 27–29 (3–4 venues active simultaneously) & Dec 4–6 (3 venues) are projected to spike 20:00–22:00 exit traffic by +42%+.',
              '同時開催警報：2026年11月27〜29日（3〜4会場同時開催）・12月4〜6日（3会場同時開催）は20〜22時の夜間出庫が平均+42%以上急増する見込みです。'
            )}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {filteredConcerts.map((c) => {
            const isLive = c.status === 'live';
            const isUpcoming = c.status === 'upcoming';
            const isDual = (c.maxSimultaneousVenues ?? 0) >= 2 || c.source.includes('동시개최');
            return (
              <article
                key={c.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 transition hover:border-[#0F2C59]/40 hover:bg-white"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                        isDual
                          ? 'bg-red-100 text-red-900'
                          : isUpcoming
                            ? 'bg-blue-100 text-blue-900'
                            : isLive
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {isDual
                        ? tr(
                            lang,
                            `${c.maxSimultaneousVenues ?? 2}개관 동시개최`,
                            `${c.maxSimultaneousVenues ?? 2}-Venue Surge`,
                            `${c.maxSimultaneousVenues ?? 2}会場同時開催`
                          )
                        : isUpcoming
                          ? tr(lang, '예정 공연', 'UPCOMING', '開催予定')
                          : isLive
                            ? tr(lang, '현재 운영중', 'LIVE NOW', '開催中')
                            : tr(lang, '2026 주요공연', '2026 Archive', '2026主要公演')}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">{c.startDate}</span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-bold text-slate-900">
                    {lang === 'ko' ? c.titleKo : c.titleEn}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
                    <Car className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" aria-hidden="true" />
                    <span>
                      {pickText(lang, c.venueKo, c.venueEn, c.venueJa)} · {c.expectedCapacity.toLocaleString()}
                      {tr(lang, '석', ' cap', '席')}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2.5 text-[11px]">
                  <span className="truncate text-slate-500">
                    {lang === 'ko'
                      ? c.source
                      : c.source.includes('EVENT_STTS') || c.source.includes('서울시')
                        ? tr(lang, c.source, 'Seoul Live CityData', 'ソウル市リアルタイム都市データ')
                        : c.source.includes('15149169')
                          ? tr(lang, c.source, 'KSPO&CO 15149169', 'KSPO&CO 15149169')
                          : tr(lang, c.source, 'KSPO&CO Official Events API', 'KSPO&CO公式公演日程API')}
                  </span>
                  {c.ticketUrl && (
                    <a
                      href={c.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-bold text-[#0F2C59] underline-offset-2 hover:underline"
                    >
                      {tr(lang, '예매·상세', 'Tickets', '予約・詳細')}
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
