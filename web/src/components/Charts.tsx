import { useState } from 'react';
import type { Lang, PopulationForecastPoint } from '../types/data';
import type { HourlyPrediction } from '../lib/mlEngine';
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
      aria-label={
        lang === 'ko'
          ? '서울시 실시간 도시데이터 올림픽공원 향후 12시간 인구 예측 그래프'
          : 'Seoul Live CityData 12-hour Olympic Park population forecast chart'
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          {active
            ? lang === 'ko'
              ? `선택 시각 ${active.hourLabel}: 추정 ${active.min.toLocaleString()}~${active.max.toLocaleString()}명 (${active.level})`
              : `Selected ${active.hourLabel}: Est. ${active.min.toLocaleString()}–${active.max.toLocaleString()} people (${active.level})`
            : lang === 'ko'
              ? '막대 또는 점에 마우스를 올리거나 키보드로 선택하면 시간별 추정 인구를 확인할 수 있습니다.'
              : 'Hover or focus a point to inspect hourly estimated crowd.'}
        </span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0F2C59]" />
            {lang === 'ko' ? '여유' : 'Smooth'}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0F766E]" />
            {lang === 'ko' ? '보통 (20~21시 피크)' : 'Moderate (20-21h peak)'}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={
          lang === 'ko'
            ? `향후 12시간 올림픽공원 인구 예측: 최대 ${Math.max(...data.map((d) => d.max)).toLocaleString()}명`
            : `12-hour population forecast peaking at ${Math.max(...data.map((d) => d.max)).toLocaleString()}`
        }
      >
        {/* Horizontal grid lines */}
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

        {/* Area fill */}
        <path d={areaPath} fill="#0F766E" fillOpacity="0.12" />
        <path d={linePath} fill="none" stroke="#0F2C59" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Points and range bars */}
        {data.map((d, i) => {
          const x = xAt(i);
          const yMid = yAt(d.mid);
          const yMin = yAt(d.min);
          const yMax = yAt(d.max);
          const col = levelColor(d.level);
          const isSel = activeIdx === i;

          return (
            <g
              key={d.time}
              tabIndex={0}
              role="button"
              aria-label={`${d.hourLabel}: ${d.min.toLocaleString()}~${d.max.toLocaleString()} (${d.level})`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onFocus={() => setActiveIdx(i)}
              onBlur={() => setActiveIdx(null)}
              className="cursor-pointer outline-none"
            >
              <line x1={x} y1={yMax} x2={x} y2={yMin} stroke={col} strokeWidth={isSel ? 8 : 5} strokeLinecap="round" opacity={0.35} />
              <circle cx={x} cy={yMid} r={isSel ? 6 : 4.5} fill={col} stroke="#FFFFFF" strokeWidth="2" />
              <text x={x} y={height - 10} textAnchor="middle" fontSize="11" fontWeight={isSel ? '700' : '500'} fill="#334155">
                {d.hourLabel}
              </text>
            </g>
          );
        })}
      </svg>

      <AccessibleTableToggle
        lang={lang}
        caption={
          lang === 'ko'
            ? '서울시 실시간 도시데이터 올림픽공원 향후 12시간 인구 예측 표'
            : 'Seoul Live CityData 12-Hour Population Forecast Table'
        }
        headers={
          lang === 'ko'
            ? ['예측 시각', '최소 추정(명)', '최대 추정(명)', '혼잡 단계']
            : ['Forecast Time', 'Min Est.', 'Max Est.', 'Congestion Level']
        }
        rows={data.map((d) => [d.time, d.min.toLocaleString(), d.max.toLocaleString(), d.level])}
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
      aria-label={
        lang === 'ko'
          ? '24시간 시간별 입차·출차·순재차 ML 예측 차트'
          : '24-hour ML predicted entries, exits, and net parked vehicles chart'
      }
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-slate-700">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-3 w-3 rounded-sm bg-[#2563EB]" />
            {lang === 'ko' ? '시간별 입차(대)' : 'Hourly Entries'}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-3 w-3 rounded-sm bg-[#D97706]" />
            {lang === 'ko' ? '시간별 출차(대)' : 'Hourly Exits'}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-0.5 w-4 bg-[#0F2C59]" />
            {lang === 'ko' ? '누적 재차(우축, 2,716면)' : 'Net Parked (Right axis)'}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#B91C1C]">
            <span className="h-3 w-3 rounded-sm bg-red-100 border border-red-400" />
            {lang === 'ko' ? '20~22시 야간 출차 병목대' : '20–22h Night Exit Zone'}
          </span>
        </div>

        {sel && (
          <div className="rounded-md bg-slate-100 px-2.5 py-1 font-semibold text-[#0F2C59]">
            {lang === 'ko'
              ? `${sel.label} | 입차 ${sel.entries}대 · 출차 ${sel.exits}대 · 재차 ${sel.netParked.toLocaleString()}대 (${sel.occupancyPct}%)`
              : `${String(sel.hour).padStart(2, '0')}:00 | In ${sel.entries} · Out ${sel.exits} · Parked ${sel.netParked.toLocaleString()} (${sel.occupancyPct}%)`}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={
          lang === 'ko'
            ? '24시간 입차, 출차 및 누적 주차 대수 예측 차트'
            : '24-hour predicted traffic flow and parking inventory chart'
        }
      >
        {/* 20~22h Night Bottleneck Highlight Band */}
        <rect
          x={xSlot(20)}
          y={pad.top}
          width={slotW * 3}
          height={innerH}
          fill="#FEE2E2"
          opacity="0.65"
        />
        <text x={xSlot(20) + slotW * 1.5} y={pad.top + 13} textAnchor="middle" fontSize="10" fontWeight="700" fill="#B91C1C">
          {lang === 'ko' ? '20~22시 출차 병목' : '20-22h Bottleneck'}
        </text>

        {/* Horizontal Flow Gridlines */}
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

        {/* 85% Warning Capacity Line on Right Axis */}
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

        {/* Bars per hour */}
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
              aria-label={`${h.label} 입차 ${h.entries}대, 출차 ${h.exits}대, 순재차 ${h.netParked}대 (${h.occupancyPct}%)`}
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

        {/* Net Parked Line */}
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
        caption={
          lang === 'ko'
            ? '24시간 시간별 입차·출차·순재차 및 주차 점유율 ML 예측 표'
            : '24-Hour ML Predicted Entries, Exits & Occupancy Table'
        }
        headers={
          lang === 'ko'
            ? ['시각', '예측 입차(대)', '예측 출차(대)', '예측 재차(대)', '점유율(%)']
            : ['Hour', 'Entries', 'Exits', 'Net Parked', 'Occupancy (%)']
        }
        rows={hourly.map((h) => [
          h.label,
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
      aria-label={
        lang === 'ko'
          ? '2025년 올림픽공원 월별 주차 이용량 계절성 차트 (15131671)'
          : '2025 Olympic Park monthly parking seasonality chart (15131671)'
      }
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="2025 Monthly Parking Volume">
        {[0, 50000, 100000].map((v) => {
          const y = pad.top + innerH - (v / maxVal) * innerH;
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#475569">
                {v === 0 ? '0' : `${v / 10000}만`}
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
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
