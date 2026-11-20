import { useState } from 'react';
import type { Lang, PopulationForecastPoint } from '../types/data';
import type { HourlyPrediction } from '../lib/mlEngine';
import { localizeCongestLevel, localizeHourLabel, localizeMonthLabel, tr } from '../lib/i18n';
import { AccessibleTableToggle } from './AccessibleTableToggle';

interface PopChartProps {
  data: PopulationForecastPoint[];
  lang: Lang;
}

export function PopulationForecastChart({ data, lang }: PopChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const maxVal = Math.max(12500, ...data.map((d) => d.max));
  const width = 680;
  const height = 220;
  const pad = { top: 20, right: 16, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xAt = (i: number) => pad.left + (i + 0.5) * (innerW / Math.max(1, data.length));
  const yAt = (v: number) => pad.top + innerH - (v / maxVal) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(d.mid).toFixed(1)}`)
    .join(' ');

  const areaPath =
    data.length > 0
      ? `${linePath} L ${xAt(data.length - 1).toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`
      : '';

  const levelColor = (lvl: string) => {
    if (lvl.includes('붐빔') && !lvl.includes('약간')) return '#B91C1C';
    if (lvl.includes('약간')) return '#D97706';
    if (lvl.includes('보통')) return '#0F766E';
    return '#0F2C59';
  };

  const active = activeIdx !== null ? data[activeIdx] : null;

  return (
    <div
      role="region"
      aria-label={tr(
        lang,
        '서울시 실시간 도시데이터 올림픽공원 향후 12시간 인구 예측 그래프',
        'Seoul Live CityData 12-hour Olympic Park population forecast chart',
        'ソウル市リアルタイム都市データ オリンピック公園今後12時間人出予測グラフ'
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span aria-live="polite">
          {active
            ? tr(
                lang,
                `선택 시각 ${localizeHourLabel(lang, active.hourLabel)}: 추정 ${active.min.toLocaleString()}~${active.max.toLocaleString()}명 (${active.level})`,
                `Selected ${localizeHourLabel(lang, active.hourLabel)}: Est. ${active.min.toLocaleString()}–${active.max.toLocaleString()} people (${localizeCongestLevel(lang, active.level)})`,
                `選択時刻 ${localizeHourLabel(lang, active.hourLabel)}：推定 ${active.min.toLocaleString()}〜${active.max.toLocaleString()}人（${localizeCongestLevel(lang, active.level)}）`
              )
            : tr(
                lang,
                '막대 또는 점에 마우스를 올리거나 키보드로 선택하면 시간별 추정 인구를 확인할 수 있습니다.',
                'Hover or focus a point to inspect hourly estimated crowd.',
                'ポイントにカーソルを合わせるかキーボードで選択すると、時間帯別の推定人数を確認できます。'
              )}
        </span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0F2C59]" />
            {tr(lang, '여유', 'Smooth', '余裕')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0F766E]" />
            {tr(lang, '보통 (20~21시 피크)', 'Moderate (20–21h peak)', '普通（20〜21時ピーク）')}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={tr(
          lang,
          `향후 12시간 올림픽공원 인구 예측: 최대 ${Math.max(...data.map((d) => d.max)).toLocaleString()}명`,
          `12-hour population forecast peaking at ${Math.max(...data.map((d) => d.max)).toLocaleString()}`,
          `今後12時間オリンピック公園人出予測：最大${Math.max(...data.map((d) => d.max)).toLocaleString()}人`
        )}
      >
        {[0, 4000, 8000, 12000].map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#475569">
                {tick === 0 ? '0' : `${tick / 1000}k`}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="#0F766E" fillOpacity="0.12" />
        <path d={linePath} fill="none" stroke="#0F2C59" strokeWidth="2.5" strokeLinejoin="round" />

        {data.map((d, i) => {
          const x = xAt(i);
          const yMid = yAt(d.mid);
          const yMin = yAt(d.min);
          const yMax = yAt(d.max);
          const col = levelColor(d.level);
          const isSel = activeIdx === i;
          const hLbl = localizeHourLabel(lang, d.hourLabel);
          const lvlLbl = localizeCongestLevel(lang, d.level);

          return (
            <g
              key={d.time}
              tabIndex={0}
              role="button"
              aria-label={`${hLbl}: ${d.min.toLocaleString()}~${d.max.toLocaleString()} (${lvlLbl})`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onFocus={() => setActiveIdx(i)}
              onBlur={() => setActiveIdx(null)}
              className="cursor-pointer outline-none"
            >
              <line x1={x} y1={yMax} x2={x} y2={yMin} stroke={col} strokeWidth={isSel ? 8 : 5} strokeLinecap="round" opacity={0.35} />
              <circle cx={x} cy={yMid} r={isSel ? 6 : 4.5} fill={col} stroke="#FFFFFF" strokeWidth="2" />
              <text x={x} y={height - 10} textAnchor="middle" fontSize="11" fontWeight={isSel ? '700' : '500'} fill="#334155">
                {hLbl}
              </text>
            </g>
          );
        })}
      </svg>

      <AccessibleTableToggle
        lang={lang}
        caption={tr(
          lang,
          '서울시 실시간 도시데이터 올림픽공원 향후 12시간 인구 예측 표',
          'Seoul Live CityData 12-Hour Population Forecast Table',
          'ソウル市リアルタイム都市データ オリンピック公園今後12時間人出予測表'
        )}
        headers={tr(
          lang,
          ['예측 시각', '최소 추정(명)', '최대 추정(명)', '혼잡 단계'],
          ['Forecast Time', 'Min Est.', 'Max Est.', 'Congestion Level'],
          ['予測時刻', '最小推定（人）', '最大推定（人）', '混雑度']
        )}
        rows={data.map((d) => [d.time, d.min.toLocaleString(), d.max.toLocaleString(), localizeCongestLevel(lang, d.level)])}
      />
    </div>
  );
}

interface HourlyTrafficChartProps {
  hourly: HourlyPrediction[];
  lang: Lang;
}

export function HourlyTrafficChart({ hourly, lang }: HourlyTrafficChartProps) {
  const [selectedHour, setSelectedHour] = useState<number | null>(20);
  const width = 760;
  const height = 270;
  const pad = { top: 24, right: 50, bottom: 38, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxFlow = Math.max(950, ...hourly.map((h) => Math.max(h.entries, h.exits)));
  const maxInv = 2900;
  const slotW = innerW / 24;

  const xSlot = (h: number) => pad.left + h * slotW;
  const yFlow = (v: number) => pad.top + innerH - (v / maxFlow) * innerH;
  const yInv = (v: number) => pad.top + innerH - (v / maxInv) * innerH;

  const invPath = hourly
    .map((h, i) => `${i === 0 ? 'M' : 'L'} ${(xSlot(i) + slotW / 2).toFixed(1)} ${yInv(h.netParked).toFixed(1)}`)
    .join(' ');

  const sel = selectedHour !== null ? hourly[selectedHour] : null;

  return (
    <div
      role="region"
      aria-label={tr(
        lang,
        '24시간 시간별 입차·출차·순재차 ML 예측 차트',
        '24-hour ML predicted entries, exits, and net parked vehicles chart',
        '24時間別の入庫・出庫・滞留台数ML予測チャート'
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-slate-700">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-3 w-3 rounded-sm bg-[#2563EB]" />
            {tr(lang, '시간별 입차(대)', 'Hourly Entries', '時間別入庫（台）')}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-3 w-3 rounded-sm bg-[#D97706]" />
            {tr(lang, '시간별 출차(대)', 'Hourly Exits', '時間別出庫（台）')}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-0.5 w-4 bg-[#0F2C59]" />
            {tr(lang, '누적 재차(우축, 2,716면)', 'Net Parked (Right axis)', '累積駐車（右軸・2,716台）')}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#B91C1C]">
            <span className="h-3 w-3 rounded-sm bg-red-100 border border-red-400" />
            {tr(lang, '20~22시 야간 출차 병목대', '20–22h Night Exit Zone', '20〜22時 夜間出庫集中帯')}
          </span>
        </div>

        {sel && (
          <div aria-live="polite" className="rounded-md bg-slate-100 px-2.5 py-1 font-semibold text-[#0F2C59]">
            {tr(
              lang,
              `${sel.label} | 입차 ${sel.entries}대 · 출차 ${sel.exits}대 · 재차 ${sel.netParked.toLocaleString()}대 (${sel.occupancyPct}%)`,
              `${String(sel.hour).padStart(2, '0')}:00 | In ${sel.entries} · Out ${sel.exits} · Parked ${sel.netParked.toLocaleString()} (${sel.occupancyPct}%)`,
              `${String(sel.hour).padStart(2, '0')}時 | 入庫 ${sel.entries}台 · 出庫 ${sel.exits}台 · 滞留 ${sel.netParked.toLocaleString()}台（${sel.occupancyPct}%）`
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={tr(
          lang,
          '24시간 입차, 출차 및 누적 주차 대수 예측 차트',
          '24-hour predicted traffic flow and parking inventory chart',
          '24時間の入庫・出庫および累積駐車台数予測チャート'
        )}
      >
        <rect
          x={xSlot(20)}
          y={pad.top}
          width={slotW * 3}
          height={innerH}
          fill="#FEE2E2"
          opacity="0.65"
        />
        <text x={xSlot(20) + slotW * 1.5} y={pad.top + 13} textAnchor="middle" fontSize="10" fontWeight="700" fill="#B91C1C">
          {tr(lang, '20~22시 출차 병목', '20–22h Bottleneck', '20〜22時 出庫集中')}
        </text>

        {[0, 250, 500, 750, 1000].map((v) => {
          if (v > maxFlow + 50) return null;
          const y = yFlow(v);
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#475569">
                {v}
              </text>
            </g>
          );
        })}

        <line
          x1={pad.left}
          y1={yInv(2308)}
          x2={width - pad.right}
          y2={yInv(2308)}
          stroke="#B91C1C"
          strokeWidth="1.2"
          strokeDasharray="5 4"
        />
        <text x={width - pad.right + 4} y={yInv(2308) + 3} fontSize="10" fontWeight="700" fill="#B91C1C">
          85%
        </text>
        <text x={width - pad.right + 4} y={yInv(2716) + 4} fontSize="10" fill="#475569">
          2,716
        </text>
        <text x={width - pad.right + 4} y={yInv(1358) + 4} fontSize="10" fill="#475569">
          1,358
        </text>

        {hourly.map((h) => {
          const x = xSlot(h.hour);
          const barW = Math.max(4, slotW * 0.36);
          const inY = yFlow(h.entries);
          const outY = yFlow(h.exits);
          const isSel = selectedHour === h.hour;

          return (
            <g
              key={h.hour}
              tabIndex={0}
              role="button"
              aria-label={tr(
                lang,
                `${h.label} 입차 ${h.entries}대, 출차 ${h.exits}대, 순재차 ${h.netParked}대 (${h.occupancyPct}%)`,
                `${String(h.hour).padStart(2, '0')}:00 In ${h.entries}, Out ${h.exits}, Parked ${h.netParked} (${h.occupancyPct}%)`,
                `${String(h.hour).padStart(2, '0')}時 入庫${h.entries}台、出庫${h.exits}台、滞留${h.netParked}台（${h.occupancyPct}%）`
              )}
              onMouseEnter={() => setSelectedHour(h.hour)}
              onFocus={() => setSelectedHour(h.hour)}
              className="cursor-pointer outline-none"
            >
              {isSel && (
                <rect x={x} y={pad.top} width={slotW} height={innerH} fill="#0F2C59" opacity="0.06" />
              )}
              <rect
                x={x + slotW * 0.1}
                y={inY}
                width={barW}
                height={Math.max(1, pad.top + innerH - inY)}
                rx="1.5"
                fill="#2563EB"
                opacity={isSel ? 1 : 0.78}
              />
              <rect
                x={x + slotW * 0.1 + barW + 1}
                y={outY}
                width={barW}
                height={Math.max(1, pad.top + innerH - outY)}
                rx="1.5"
                fill={h.isNightBottleneck ? '#DC2626' : '#D97706'}
                opacity={isSel ? 1 : 0.82}
              />
              {h.hour % 2 === 0 && (
                <text
                  x={x + slotW / 2}
                  y={height - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isSel ? '700' : '500'}
                  fill="#334155"
                >
                  {String(h.hour).padStart(2, '0')}
                </text>
              )}
            </g>
          );
        })}

        <path d={invPath} fill="none" stroke="#0F2C59" strokeWidth="2.6" strokeLinejoin="round" />
        {hourly.map((h) => (
          <circle
            key={`pt-${h.hour}`}
            cx={xSlot(h.hour) + slotW / 2}
            cy={yInv(h.netParked)}
            r={selectedHour === h.hour ? 5 : 2.8}
            fill={h.occupancyPct >= 85 ? '#B91C1C' : '#0F2C59'}
            stroke="#FFFFFF"
            strokeWidth="1.4"
            pointerEvents="none"
          />
        ))}
      </svg>

      <AccessibleTableToggle
        lang={lang}
        caption={tr(
          lang,
          '24시간 시간별 입차·출차·순재차 및 주차 점유율 ML 예측 표',
          '24-Hour ML Predicted Entries, Exits & Occupancy Table',
          '24時間別の入庫・出庫・滞留台数および駐車占有率ML予測表'
        )}
        headers={tr(
          lang,
          ['시각', '예측 입차(대)', '예측 출차(대)', '예측 재차(대)', '점유율(%)'],
          ['Hour', 'Entries', 'Exits', 'Net Parked', 'Occupancy (%)'],
          ['時刻', '予測入庫（台）', '予測出庫（台）', '予測滞留（台）', '占有率（%）']
        )}
        rows={hourly.map((h) => [
          localizeHourLabel(lang, h.label),
          h.entries.toLocaleString(),
          h.exits.toLocaleString(),
          h.netParked.toLocaleString(),
          `${h.occupancyPct}%`,
        ])}
      />
    </div>
  );
}

export function MonthlySeasonalityChart({
  data,
  lang,
}: {
  data: { month: string; vehicles: number }[];
  lang: Lang;
}) {
  const maxVal = Math.max(...data.map((d) => d.vehicles), 110000);
  const width = 560;
  const height = 175;
  const pad = { top: 20, right: 12, bottom: 28, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / data.length;

  return (
    <div
      role="region"
      aria-label={tr(
        lang,
        '2025년 올림픽공원 월별 주차 이용량 계절성 차트 (15131671)',
        '2025 Olympic Park monthly parking seasonality chart (15131671)',
        '2025年オリンピック公園 月別駐車利用量の季節変動チャート（15131671）'
      )}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={tr(lang, '2025년 월별 주차 이용량', '2025 Monthly Parking Volume', '2025年 月別駐車台数')}
      >
        {[0, 50000, 100000].map((v) => {
          const y = pad.top + innerH - (v / maxVal) * innerH;
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#475569">
                {v === 0 ? '0' : lang === 'ko' ? `${v / 10000}만` : lang === 'ja' ? `${v / 10000}万` : `${v / 1000}k`}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.vehicles / maxVal) * innerH;
          const x = pad.left + i * slot + slot * 0.18;
          const y = pad.top + innerH - h;
          const isPeak = d.vehicles >= 95000;
          return (
            <g key={d.month}>
              <rect
                x={x}
                y={y}
                width={slot * 0.64}
                height={h}
                rx="3"
                fill={isPeak ? '#0F766E' : '#0F2C59'}
                opacity={isPeak ? 0.95 : 0.72}
              />
              {isPeak && (
                <text x={x + slot * 0.32} y={y - 4} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#0F766E">
                  {(d.vehicles / 1000).toFixed(0)}k
                </text>
              )}
              <text x={x + slot * 0.32} y={height - 8} textAnchor="middle" fontSize="10" fill="#334155">
                {localizeMonthLabel(lang, d.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
