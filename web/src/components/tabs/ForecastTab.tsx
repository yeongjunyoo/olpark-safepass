import { useMemo, useState } from 'react';
import {
  Activity,
  CloudRain,
  Thermometer,
  AlertOctagon,
  CheckCircle2,
  Leaf,
  TreePine,
  BarChart3,
  SlidersHorizontal,
  TrendingUp,
  Car,
} from 'lucide-react';
import type { AppBundle, Lang } from '../../types/data';
import { pickText, tr } from '../../lib/i18n';
import {
  runTrafficForecast,
  calculateEsgSavings,
  VENUE_SEATS,
  type ForecastInputs,
  type VenueSelection,
} from '../../lib/mlEngine';
import { HourlyTrafficChart, MonthlySeasonalityChart } from '../Charts';

interface ForecastTabProps {
  bundle: AppBundle;
  lang: Lang;
}

const DOW_LABELS: Record<Lang, string[]> = {
  ko: ['월', '화', '수', '목', '금', '토', '일'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ja: ['月', '火', '水', '木', '金', '土', '日'],
};

const PRESETS: {
  id: string;
  labelKo: string;
  labelEn: string;
  labelJa: string;
  inputs: ForecastInputs;
}[] = [
  {
    id: 'rain-dual-0720',
    labelKo: '우천 × 동시개최 폭증 (7/20 재현)',
    labelEn: 'Rain × Dual Concerts (Jul 20 Replay)',
    labelJa: '雨天 × 同時開催急増（7/20再現）',
    inputs: {
      dow: 5,
      venues: { kspoDome: true, handball: false, olympicHall: true, wooriArtHall: false, lawn88: false },
      rainMm: 15,
      tempC: 27,
      travelMode: 'car',
    },
  },
  {
    id: 'dry-dual-0712',
    labelKo: '맑음 × 초대형 동시개최 (7/12 재현)',
    labelEn: 'Clear × Mega Dual (Jul 12 Replay)',
    labelJa: '晴天 × 大型同時開催（7/12再現）',
    inputs: {
      dow: 4,
      venues: { kspoDome: true, handball: true, olympicHall: false, wooriArtHall: false, lawn88: false },
      rainMm: 0,
      tempC: 30,
      travelMode: 'car',
    },
  },
  {
    id: 'single-dome',
    labelKo: '단독 KSPO DOME 공연',
    labelEn: 'Single KSPO DOME Concert',
    labelJa: '単独 KSPO DOME 公演',
    inputs: {
      dow: 5,
      venues: { kspoDome: true, handball: false, olympicHall: false, wooriArtHall: false, lawn88: false },
      rainMm: 0,
      tempC: 18,
      travelMode: 'subway',
    },
  },
  {
    id: 'rain-noconcert-0707',
    labelKo: '장마 우천 · 공연 없음 (7/7 재현)',
    labelEn: 'Rainy Non-Concert (Jul 7 Replay)',
    labelJa: '梅雨・公演なし（7/7再現）',
    inputs: {
      dow: 6,
      venues: { kspoDome: false, handball: false, olympicHall: false, wooriArtHall: false, lawn88: false },
      rainMm: 29,
      tempC: 24,
      travelMode: 'car',
    },
  },
];

export function ForecastTab({ bundle, lang }: ForecastTabProps) {
  const [inputs, setInputs] = useState<ForecastInputs>(PRESETS[0].inputs);
  const [activePreset, setActivePreset] = useState<string>(PRESETS[0].id);

  const [esgShiftedCars, setEsgShiftedCars] = useState<number>(1000);
  const [esgRoundTripKm, setEsgRoundTripKm] = useState<number>(18);

  const forecast = useMemo(() => runTrafficForecast(inputs, bundle.model), [inputs, bundle.model]);
  const esg = useMemo(
    () => calculateEsgSavings(forecast.estimatedExitWaitMin, esgRoundTripKm, esgShiftedCars),
    [forecast.estimatedExitWaitMin, esgRoundTripKm, esgShiftedCars]
  );

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setActivePreset(p.id);
    setInputs(p.inputs);
  };

  const toggleVenue = (key: keyof VenueSelection) => {
    setActivePreset('custom');
    setInputs((prev) => ({
      ...prev,
      venues: { ...prev.venues, [key]: !prev.venues[key] },
    }));
  };

  const tierStyle = {
    critical: {
      ko: '심각 (즉시 우회·지하철 권장)',
      en: 'CRITICAL (Divert Now)',
      ja: '深刻（即時迂回・地下鉄推奨）',
      cls: 'bg-red-100 text-red-900 border-red-300',
    },
    severe: {
      ko: '혼잡 (출차 병목 주의)',
      en: 'SEVERE (Exit Bottleneck)',
      ja: '混雑（出庫渋滞注意）',
      cls: 'bg-amber-100 text-amber-950 border-amber-300',
    },
    busy: {
      ko: '보통~혼잡',
      en: 'BUSY',
      ja: '普通〜やや混雑',
      cls: 'bg-blue-100 text-blue-900 border-blue-300',
    },
    smooth: {
      ko: '원활',
      en: 'SMOOTH',
      ja: '円滑',
      cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    },
  }[forecast.congestionTier];

  return (
    <div className="space-y-6">
      {/* SIMULATOR HEADER & PRESETS */}
      <section aria-labelledby="ml-sim-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="ml-sim-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Activity className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {tr(
                lang,
                '실측 ML 24시간 입출차 · 야간 출차 병목 시뮬레이터',
                'Empirical ML 24-Hour Traffic & Night Exit Bottleneck Simulator',
                '実測ML 24時間入出庫・夜間出庫ボトルネック シミュレーター'
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(
                lang,
                `학습 근거: ${bundle.model.trainedOn} · 검증: ${bundle.model.validationMethod}`,
                `Trained on 215,528 KSPO&CO trips × KMA ASOS 108 × 4 Subway Stations · ${bundle.model.validationMethod}`,
                '学習根拠：KSPO&CO入出庫215,528件 × 気象庁ASOS 108 × 地下鉄4駅 · 5-Fold Date GroupKFold交差検証'
              )}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${tierStyle.cls}`}>
            {tr(lang, tierStyle.ko, tierStyle.en, tierStyle.ja)}
          </span>
        </div>

        {/* Scenario Preset Pills */}
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label={tr(lang, '시나리오 프리셋', 'Scenario presets', 'シナリオプリセット')}
        >
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={activePreset === p.id}
              onClick={() => applyPreset(p)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                activePreset === p.id
                  ? 'border-[#0F2C59] bg-[#0F2C59] text-white'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tr(lang, p.labelKo, p.labelEn, p.labelJa)}
            </button>
          ))}
        </div>

        {/* Interactive Controls + Chart Grid */}
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2C59]">
              <SlidersHorizontal className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
              {tr(lang, '시뮬레이션 변수 조작', 'Simulation Parameters', 'シミュレーション条件設定')}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-700">
                {tr(lang, '방문 요일', 'Day of Week', '来園曜日')}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DOW_LABELS[lang].map((lbl, idx) => (
                  <button
                    key={lbl}
                    type="button"
                    aria-pressed={inputs.dow === idx}
                    onClick={() => {
                      setActivePreset('custom');
                      setInputs((prev) => ({ ...prev, dow: idx }));
                    }}
                    className={`rounded-md border py-1.5 text-xs font-bold transition ${
                      inputs.dow === idx
                        ? 'border-[#0F2C59] bg-[#0F2C59] text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-slate-700">
                {tr(
                  lang,
                  `공연장 동시개최 선택 (합계 ${forecast.activeSeatsTotal.toLocaleString()}석)`,
                  `Active Venues (${forecast.activeSeatsTotal.toLocaleString()} seats)`,
                  `同時開催会場の選択（合計 ${forecast.activeSeatsTotal.toLocaleString()}席）`
                )}
              </legend>
              <div className="space-y-1.5">
                {(Object.keys(VENUE_SEATS) as (keyof VenueSelection)[]).map((vk) => {
                  const v = VENUE_SEATS[vk];
                  const checked = inputs.venues[vk];
                  return (
                    <label
                      key={vk}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition ${
                        checked
                          ? 'border-[#0F766E] bg-teal-50/80 font-bold text-[#0F2C59]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleVenue(vk)}
                          className="h-4 w-4 accent-[#0F766E]"
                        />
                        <span>{tr(lang, v.nameKo, v.nameEn, v.nameJa)}</span>
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {v.seats.toLocaleString()}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
                <label htmlFor="rain-slider" className="flex items-center gap-1">
                  <CloudRain className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                  {tr(lang, '일 강수량 (mm)', 'Daily Rainfall (mm)', '日降水量 (mm)')}
                </label>
                <span className="font-bold text-[#0F2C59]">{inputs.rainMm} mm</span>
              </div>
              <input
                id="rain-slider"
                type="range"
                min={0}
                max={45}
                step={1}
                value={inputs.rainMm}
                onChange={(e) => {
                  setActivePreset('custom');
                  setInputs((prev) => ({ ...prev, rainMm: Number(e.target.value) }));
                }}
                className="w-full accent-[#0F2C59]"
              />
              <div className="mt-1.5 flex gap-1.5">
                {[0, 5, 15, 30].map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => {
                      setActivePreset('custom');
                      setInputs((prev) => ({ ...prev, rainMm: mm }));
                    }}
                    className={`flex-1 rounded border py-1 text-[11px] font-bold ${
                      inputs.rainMm === mm
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {mm === 0 ? tr(lang, '맑음 0mm', 'Dry 0', '晴天 0') : `${mm}mm`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
                <label htmlFor="temp-slider" className="flex items-center gap-1">
                  <Thermometer className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  {tr(lang, '예상 최고기온 (°C)', 'Max Temp (°C)', '予想最高気温 (°C)')}
                </label>
                <span className="font-bold text-[#0F2C59]">{inputs.tempC}°C</span>
              </div>
              <input
                id="temp-slider"
                type="range"
                min={-5}
                max={36}
                step={1}
                value={inputs.tempC}
                onChange={(e) => {
                  setActivePreset('custom');
                  setInputs((prev) => ({ ...prev, tempC: Number(e.target.value) }));
                }}
                className="w-full accent-[#0F766E]"
              />
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-700">
                {tr(lang, '방문 수단', 'Visit Mode', '来園手段')}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'car', ko: '자가용', en: 'Car', ja: '自家用車' },
                    { id: 'subway', ko: '지하철 분산', en: 'Subway', ja: '地下鉄分散' },
                    { id: 'park-and-ride', ko: '잠실 환승', en: 'Park&Ride', ja: '蚕室乗換' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={inputs.travelMode === m.id}
                    onClick={() => setInputs((prev) => ({ ...prev, travelMode: m.id }))}
                    className={`rounded-lg border py-1.5 text-xs font-bold ${
                      inputs.travelMode === m.id
                        ? 'border-[#0F766E] bg-[#0F766E] text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tr(lang, m.ko, m.en, m.ja)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-600">
                  {tr(lang, '예측 일 총입차량', 'Predicted Daily Entries', '予測1日総入庫台数')}
                </div>
                <div className="mt-1 text-xl font-extrabold text-[#0F2C59]">
                  {forecast.totalDailyEntries.toLocaleString()}
                  <span className="ml-0.5 text-xs font-semibold text-slate-500">
                    {tr(lang, '대', ' cars', '台')}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {tr(
                    lang,
                    `유효(>10분) ${forecast.stayGt10mEntries.toLocaleString()}대`,
                    `Stay >10m: ${forecast.stayGt10mEntries.toLocaleString()}`,
                    `実質駐車(>10分) ${forecast.stayGt10mEntries.toLocaleString()}台`
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50/70 p-3">
                <div className="text-[11px] font-bold text-red-900">
                  {tr(lang, '20~22시 야간 출차 병목', '20–22h Night Exit Wave', '20〜22時 夜間出庫集中')}
                </div>
                <div className="mt-1 text-xl font-extrabold text-red-800">
                  {forecast.nightExit2022.toLocaleString()}
                  <span className="ml-0.5 text-xs font-semibold text-red-700">{tr(lang, '대', '', '台')}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-red-800">
                  {tr(
                    lang,
                    `예상 출차 대기 약 ${forecast.estimatedExitWaitMin}분`,
                    `Est. exit queue ~${forecast.estimatedExitWaitMin} min`,
                    `予想出庫待ち 約${forecast.estimatedExitWaitMin}分`
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-600">
                  {tr(lang, '피크 재차 점유율', 'Peak Occupancy', 'ピーク駐車占有率')}
                </div>
                <div className="mt-1 text-xl font-extrabold text-[#0F766E]">{forecast.peakOccupancyPct}%</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {tr(
                    lang,
                    `${forecast.peakHour}시경 ${forecast.peakOccupancyVehicles.toLocaleString()}대`,
                    `${forecast.peakOccupancyVehicles.toLocaleString()} @ ${forecast.peakHour}:00`,
                    `${forecast.peakHour}時頃 ${forecast.peakOccupancyVehicles.toLocaleString()}台`
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3">
                <div className="text-[11px] font-bold text-[#0F2C59]">
                  {tr(lang, '권장 게이트 · 분산 전략', 'Recommended Gate', '推奨ゲート・分散戦略')}
                </div>
                <div className="mt-1 text-xs font-bold leading-snug text-[#0F766E]">
                  {tr(lang, forecast.recommendedGateKo, forecast.recommendedGateEn, forecast.recommendedGateJa)}
                </div>
              </div>
            </div>

            {forecast.isNonlinearRainSurge ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-950"
              >
                <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                <div>
                  <div className="font-extrabold text-red-900">
                    {tr(
                      lang,
                      '비선형 폭증 경보: 우천 × 대형 실내공연 자차 전환 효과 작동!',
                      'Nonlinear Surge Triggered: Rain × Indoor Concert Private-Car Shift!',
                      '非線形急増警報：雨天 × 屋内大型公演による自家用車シフト発動！'
                    )}
                  </div>
                  <p className="mt-0.5 leading-relaxed">
                    {tr(lang, forecast.adviceKo, forecast.adviceEn, forecast.adviceJa)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
                <strong className="text-[#0F2C59]">{tr(lang, 'AI 행동 권고: ', 'AI Action Advice: ', 'AI行動ガイド：')}</strong>
                {tr(lang, forecast.adviceKo, forecast.adviceEn, forecast.adviceJa)}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <HourlyTrafficChart hourly={forecast.hourly} lang={lang} />
            </div>
          </div>
        </div>
      </section>

      {/* REAL EMPIRICAL CASE STUDIES */}
      <section aria-labelledby="case-study-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 id="case-study-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59]">
            <TrendingUp className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
            {tr(
              lang,
              '실측 215,528건 검증: “우천 × 대형공연 동시개최 비선형 폭증” 실제 사례 비교',
              'Empirical Proof (215,528 Trips): Nonlinear “Rain × Simultaneous Concert” Surge',
              '実測215,528件検証：「雨天 × 大型公演同時開催」非線形急増の事例比較'
            )}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {tr(
              lang,
              '비만 오면 일반 공원 방문 차량은 -17.5% 급감(7/7 4,984대)하지만, 대형 공연이 겹친 우천 주말(7/20 14.9mm)에는 공연객 자차 전환으로 20~22시 야간 출차가 1,847대(월 1위)로 역전 폭증합니다.',
              'Rain alone drops park traffic by -17.5% (Jul 7: 4,984 cars), yet rainy simultaneous concert days (Jul 20: 14.9mm) invert into the #1 monthly night exit bottleneck (1,847 cars).',
              '雨天のみでは一般来園車両が-17.5%減少（7/7：4,984台）しますが、大型公演が重なる雨天週末（7/20：14.9mm）は自家用車転換により20〜22時出庫が月間1位の1,847台へ逆転急増します。'
            )}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {bundle.model.caseStudies.map((cs) => {
            const isPeakNight = cs.date === '2024-07-20';
            return (
              <article
                key={cs.date}
                className={`rounded-xl border p-4 ${
                  isPeakNight ? 'border-red-300 bg-red-50/70' : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0F2C59]">
                    {cs.date} ({pickText(lang, cs.dowKo, cs.dowEn, cs.dowJa)})
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isPeakNight ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {pickText(lang, cs.highlightTagKo, cs.highlightTagEn, cs.highlightTagJa)}
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm font-bold text-slate-900">
                  {pickText(lang, cs.labelKo, cs.labelEn, cs.labelJa)}
                </h3>
                <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-white p-2 text-center text-xs border border-slate-200/80">
                  <div>
                    <div className="text-[10px] text-slate-500">{tr(lang, '총입차', 'Entries', '総入庫')}</div>
                    <div className="font-extrabold text-[#0F2C59]">{cs.totalEntries.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">{tr(lang, '20~22출차', '20–22 Out', '20-22出庫')}</div>
                    <div className={`font-extrabold ${isPeakNight ? 'text-red-700' : 'text-amber-700'}`}>
                      {cs.nightExit2022.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">{tr(lang, '강수량', 'Rain', '降水量')}</div>
                    <div className="font-extrabold text-blue-700">{cs.rainMm}mm</div>
                  </div>
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-slate-700">
                  {pickText(lang, cs.concertsKo, cs.concertsEn, cs.concertsJa)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* BENCHMARK TABLE + ESG CALCULATOR */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="benchmark-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7"
        >
          <h2 id="benchmark-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59]">
            <BarChart3 className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
            {tr(
              lang,
              'GroupKFold 교차검증 성능 비교 (공식 parking.do · olparkspot 대비)',
              'GroupKFold Cross-Validation Benchmark vs Official parking.do & olparkspot',
              'GroupKFold交差検証 精度ベンチマーク（公式parking.do・既存サービス比較）'
            )}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {tr(
              lang,
              '일자 그룹 분할(31일 GroupKFold · 누출 0)로 미래 공연일 일반화 성능을 측정했습니다. 단순 규칙(Baseline B) 대비 MAE -33% 개선 및 야간 출차 병목(20~22시) 정밀 포착.',
              '31-day Date GroupKFold prevents temporal leakage. Cuts MAE by -33% vs heuristic rule baseline while accurately predicting 20–22h night exit surges.',
              '日付単位のGroupKFold（31日・リークゼロ）で汎化性能を検証。単純ルール比MAE -33%改善し、20〜22時の夜間出庫集中を高精度に捕捉します。'
            )}
          </p>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-bold">{tr(lang, '예측 모델', 'Model', '予測モデル')}</th>
                  <th scope="col" className="px-2.5 py-2.5 font-bold text-right">MAE</th>
                  <th scope="col" className="px-2.5 py-2.5 font-bold text-right">RMSE</th>
                  <th scope="col" className="px-2.5 py-2.5 font-bold text-right">R²</th>
                  <th scope="col" className="px-2.5 py-2.5 font-bold text-right whitespace-nowrap">
                    {tr(lang, '야간출차 MAE', 'Night MAE', '夜間出庫MAE')}
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-bold text-center">{tr(lang, '기상·공연', 'Wx/Event', '気象・公演')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {bundle.model.benchmarks.map((b) => (
                  <tr
                    key={b.modelId}
                    className={b.isWinner ? 'bg-teal-50/70 font-bold text-[#0F2C59]' : 'text-slate-700'}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {b.isWinner && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F766E]" aria-hidden="true" />}
                        <span>{pickText(lang, b.nameKo, b.nameEn, b.nameJa)}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                        {pickText(lang, b.typeKo, b.typeEn, b.typeJa)}
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono">{b.hourlyMae.toFixed(1)}</td>
                    <td className="px-2.5 py-2.5 text-right font-mono">{b.hourlyRmse.toFixed(1)}</td>
                    <td className="px-2.5 py-2.5 text-right font-mono">{b.r2.toFixed(2)}</td>
                    <td className="px-2.5 py-2.5 text-right font-mono">{b.nightExitMae.toFixed(1)}</td>
                    <td className="px-2.5 py-2.5 text-center">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          b.usesWeather && b.usesConcerts
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {b.usesWeather && b.usesConcerts
                          ? tr(lang, '기상+공연', 'Wx+Event', '気象+公演')
                          : b.usesConcerts
                            ? tr(lang, '공연만', 'Event only', '公演のみ')
                            : tr(lang, '미반영', 'None', '未反映')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-bold text-[#0F2C59]">
                {tr(
                  lang,
                  '2025년 월별 주차 계절성 (15131671 · 연 950,695대)',
                  '2025 Monthly Seasonality (15131671 · 950,695/yr)',
                  '2025年 月別駐車の季節変動（15131671・年950,695台）'
                )}
              </span>
              <span className="text-[11px] font-semibold text-[#0F766E]">
                {tr(
                  lang,
                  '5월 10.3만 · 11월 9.9만 피크 (1월 대비 1.83배)',
                  'May 103k & Nov 99k peaks (1.83x Jan)',
                  '5月10.3万・11月9.9万ピーク（1月比1.83倍）'
                )}
              </span>
            </div>
            <MonthlySeasonalityChart data={bundle.model.monthlySeasonality2025} lang={lang} />
          </div>
        </section>

        {/* ESG Carbon Savings Calculator */}
        <section
          aria-labelledby="esg-heading"
          className="flex flex-col justify-between rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50/70 to-white p-5 shadow-sm lg:col-span-5"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 id="esg-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59]">
                <Leaf className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
                {tr(
                  lang,
                  'ESG 탄소 저감 시나리오 계산기',
                  'ESG CO₂ Reduction Scenario Calculator',
                  'ESG CO₂削減シナリオ計算機'
                )}
              </h2>
              <span className="rounded-full bg-[#0F766E] px-2.5 py-0.5 text-[11px] font-bold text-white">
                Scope 3 Ref
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {tr(
                lang,
                '이용자 전환율 가정 기반 잠재 저감 시나리오(Scope 3 참고 지표)입니다. KSPO&CO 2026-11-18 ESG 진단(905점) 중 환경(E, 86.1%) 보강을 위해 주차 공회전·자차 대기 대신 지하철 분산 전환 시 잠재 CO₂ 저감량을 산출합니다.',
                'Potential CO₂ reduction scenario based on assumed user mode-shift rates (Scope 3 reference indicator), quantifying idling & driving emissions avoided via Seoul Metro dispersion.',
                '利用者転換率の仮定に基づく潜在削減シナリオ（Scope 3 参考指標）です。駐車アイドリングや自家用車来園から地下鉄分散へ転換した場合の潜在CO₂削減量を試算します。'
              )}
            </p>

            <div className="mt-4 space-y-3 rounded-xl border border-teal-200/80 bg-white p-3.5 text-xs">
              <div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <label htmlFor="esg-cars">
                    {tr(lang, '가정 전환 차량 수 (공연 1회 기준)', 'Assumed Shifted Cars / Concert', '想定転換車両数（1公演あたり）')}
                  </label>
                  <span className="font-bold text-[#0F766E]">
                    {esgShiftedCars.toLocaleString()}
                    {tr(lang, '대', ' cars', '台')}
                  </span>
                </div>
                <input
                  id="esg-cars"
                  type="range"
                  min={100}
                  max={3000}
                  step={100}
                  value={esgShiftedCars}
                  onChange={(e) => setEsgShiftedCars(Number(e.target.value))}
                  className="mt-1 w-full accent-[#0F766E]"
                />
              </div>
              <div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <label htmlFor="esg-km">
                    {tr(lang, '평균 왕복 이동거리 (km)', 'Avg Round-Trip Distance (km)', '平均往復移動距離 (km)')}
                  </label>
                  <span className="font-bold text-[#0F766E]">{esgRoundTripKm} km</span>
                </div>
                <input
                  id="esg-km"
                  type="range"
                  min={6}
                  max={40}
                  step={2}
                  value={esgRoundTripKm}
                  onChange={(e) => setEsgRoundTripKm(Number(e.target.value))}
                  className="mt-1 w-full accent-[#0F766E]"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Car className="h-3.5 w-3.5 text-[#0F2C59]" aria-hidden="true" />
                  {tr(lang, '시뮬레이션 반영 출차 공회전 시간', 'Simulated Exit Idling Wait', 'シミュレーション反映 出庫アイドリング')}
                </span>
                <strong className="text-[#0F2C59]">
                  {forecast.estimatedExitWaitMin}
                  {tr(lang, '분', ' min', '分')}
                </strong>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-white p-3.5">
                <div className="text-[11px] font-semibold text-slate-600">
                  {tr(lang, '1인 전환 잠재 CO₂ 저감', 'Est. CO₂ Saved / Person', '1人転換あたり潜在CO₂削減')}
                </div>
                <div className="mt-1 text-2xl font-extrabold text-[#0F766E]">
                  {esg.perPersonCo2SavedKg} <span className="text-xs font-bold">kg</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {tr(
                    lang,
                    `공회전 절감 ${esg.idlingSavedKgPerCar}kg 포함`,
                    `Incl. ${esg.idlingSavedKgPerCar}kg idling saved`,
                    `アイドリング削減 ${esg.idlingSavedKgPerCar}kg含む`
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-white p-3.5">
                <div className="text-[11px] font-semibold text-slate-600">
                  {tr(
                    lang,
                    `공연 1회 (${esgShiftedCars.toLocaleString()}대 가정)`,
                    `1 Concert (${esgShiftedCars.toLocaleString()} cars)`,
                    `1公演（${esgShiftedCars.toLocaleString()}台想定）`
                  )}
                </div>
                <div className="mt-1 text-2xl font-extrabold text-[#0F2C59]">
                  {esg.perConcertCo2SavedKg.toLocaleString()} <span className="text-xs font-bold">kg</span>
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-[#0F766E]">
                  ({esg.perConcertCo2SavedTons} tCO₂)
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-[#0F766E]/30 bg-[#0F766E] p-4 text-white">
              <div className="flex items-center gap-3">
                <TreePine className="h-8 w-8 shrink-0 text-teal-200" aria-hidden="true" />
                <div>
                  <div className="text-xs font-semibold text-teal-100">
                    {tr(
                      lang,
                      '30년생 소나무 식재 환산 (공연 1회 시나리오)',
                      '30-Yr Pine Tree Equivalent (Scenario)',
                      '樹齢30年アカマツ植樹換算（1公演試算）'
                    )}
                  </div>
                  <div className="text-2xl font-extrabold">
                    {esg.pineTreesEquivalent.toLocaleString()}{' '}
                    <span className="text-sm font-semibold">{tr(lang, '그루', 'trees', '本')}</span>
                  </div>
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="text-teal-100">{tr(lang, '연간 70회 가정 시', '70 Shows / Yr Scenario', '年70回想定時')}</div>
                <div className="text-base font-extrabold">{esg.annualProjectedTons} tCO₂</div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            {tr(
              lang,
              '※ 이용자 전환율 가정 기반 잠재 저감 시나리오(Scope 3 참고 지표). 산출 계수: 환경부·한국교통연구원 승용차 주행 0.21kg/km · 공회전 2.18kg/h · 도시철도 0.035kg/인·km · 산림청 30년생 소나무 1그루당 연 6.6kg 흡수.',
              '* Potential reduction scenario based on assumed mode-shift rate (Scope 3 reference indicator). Factors: MOE/KOTI car 0.21 kg/km, idling 2.18 kg/h, Seoul Metro 0.035 kg/p-km, KFS pine tree 6.6 kg CO₂/yr.',
              '※ 利用者転換率の仮定に基づく潜在削減シナリオ（Scope 3 参考指標）。係数：乗用車走行0.21kg/km・アイドリング2.18kg/h・都市鉄道0.035kg/人km・アカマツ1本あたり年6.6kg吸収。'
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
