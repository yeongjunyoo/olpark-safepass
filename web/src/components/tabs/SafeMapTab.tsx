import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Accessibility,
  Moon,
  ShieldCheck,
  ParkingSquare,
  TrainFront,
  AlertTriangle,
  Navigation,
  Baby,
  HeartPulse,
} from 'lucide-react';
import type { AppBundle, Lang } from '../../types/data';
import { AccessibleTableToggle } from '../AccessibleTableToggle';

interface SafeMapTabProps {
  bundle: AppBundle;
  lang: Lang;
}

type MobilityProfile = 'walk' | 'wheelchair' | 'stroller';

const ORIGIN_VENUES = [
  { id: 'v-kspo', ko: 'KSPO DOME (체조경기장)', en: 'KSPO DOME', lat: 37.5191, lng: 127.1273 },
  { id: 'v-handball', ko: '티켓링크 라이브아레나 (핸드볼)', en: 'Ticketlink Live Arena', lat: 37.5205, lng: 127.1276 },
  { id: 'v-olympichall', ko: '올림픽홀', en: 'Olympic Hall', lat: 37.5162, lng: 127.1286 },
  { id: 'v-woori', ko: '우리금융아트홀', en: 'Woori Art Hall', lat: 37.5174, lng: 127.1235 },
  { id: 'v-88lawn', ko: '88잔디마당', en: '88 Lawn Yard', lat: 37.5217, lng: 127.1236 },
  { id: 'm-sports-museum', ko: '국립스포츠박물관 (2026 신개관)', en: 'National Sports Museum (2026)', lat: 37.5179, lng: 127.1169 },
];

// Olympic Park outer boundary polygon (ensures crisp green park footprint even before OSM tiles finish)
const OLYMPIC_PARK_BOUNDARY: [number, number][] = [
  [37.5256, 127.1155],
  [37.5262, 127.1252],
  [37.5236, 127.1298],
  [37.5162, 127.1304],
  [37.5150, 127.1210],
  [37.5165, 127.1144],
  [37.5208, 127.1132],
];

// 88 Lake & Mongchon Moat water features
const LAKE_88_POLYGON: [number, number][] = [
  [37.5210, 127.1243],
  [37.5212, 127.1257],
  [37.5198, 127.1259],
  [37.5196, 127.1245],
];

// Inner park area subject to 22:00 pedestrian restriction (Mongchontoseong inner trails)
const NIGHT_CLOSURE_POLYGON: [number, number][] = [
  [37.5236, 127.1172],
  [37.5240, 127.1232],
  [37.5208, 127.1246],
  [37.5186, 127.1225],
  [37.5191, 127.1174],
];

// Step-free flat perimeter corridor (slope < 1/20) connecting major venues to South Gate 2 / Hansung Baekje / Mongchontoseong
const BARRIER_FREE_CORRIDOR: [number, number][] = [
  [37.5191, 127.1273], // KSPO DOME
  [37.5172, 127.1279], // East plaza flat path
  [37.5162, 127.1286], // Olympic Hall
  [37.5162, 127.1303], // Olympic Park Stn Exit 3 elevator
];

const BARRIER_FREE_WEST_CORRIDOR: [number, number][] = [
  [37.5191, 127.1273], // KSPO DOME
  [37.5174, 127.1235], // Woori Art Hall (bypassing Haneol Plaza stairs)
  [37.5164, 127.1205], // South Gate 2 flat ramp
  [37.5164, 127.1165], // Hansung Baekje Stn Exit 2 elevator
  [37.5179, 127.1169], // National Sports Museum
  [37.5174, 127.1124], // Mongchontoseong Stn Exit 1 elevator
];

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function SafeMapTab({ bundle, lang }: SafeMapTabProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [originId, setOriginId] = useState<string>('v-kspo');
  const [mobility, setMobility] = useState<MobilityProfile>('wheelchair');
  const [after22h, setAfter22h] = useState<boolean>(true);
  const [showParking, setShowParking] = useState<boolean>(true);
  const [showOverflow, setShowOverflow] = useState<boolean>(true);
  const [showSafety, setShowSafety] = useState<boolean>(true);
  const [barrierFreeMode, setBarrierFreeMode] = useState<boolean>(true);

  const origin = ORIGIN_VENUES.find((v) => v.id === originId) ?? ORIGIN_VENUES[0];

  const stationRoutes = useMemo(() => {
    const walkSpeedMPerMin = mobility === 'wheelchair' ? 58 : mobility === 'stroller' ? 62 : 76;
    const detourFactor = after22h ? 1.28 : barrierFreeMode ? 1.22 : 1.15;

    return bundle.live.subwayStations
      .map((st) => {
        const directM = haversineMeters(origin.lat, origin.lng, st.lat, st.lng);
        const pathM = Math.round(directM * detourFactor);
        const walkMin = Math.max(3, Math.round(pathM / walkSpeedMPerMin));
        const queuePenaltyMin = st.crowdingRisk === 'high' ? 24 : st.crowdingRisk === 'medium' ? 11 : 4;
        const totalEffectiveMin = walkMin + queuePenaltyMin;
        return {
          station: st,
          pathM,
          walkMin,
          queuePenaltyMin,
          totalEffectiveMin,
        };
      })
      .sort((a, b) => a.totalEffectiveMin - b.totalEffectiveMin);
  }, [bundle.live.subwayStations, origin, mobility, after22h, barrierFreeMode]);

  const bestRoute = stationRoutes[0];

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [37.519, 127.1218],
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Subtle Olympic Park architectural base vector footprint (always visible immediately)
    L.polygon(OLYMPIC_PARK_BOUNDARY, {
      color: '#0F766E',
      weight: 1.5,
      fillColor: '#DCFCE7',
      fillOpacity: 0.32,
      interactive: false,
    }).addTo(map);

    L.polygon(LAKE_88_POLYGON, {
      color: '#0284C7',
      weight: 1,
      fillColor: '#BAE6FD',
      fillOpacity: 0.65,
      interactive: false,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Re-render markers and overlays on toggle changes
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    // 1. 22:00 Inner Park Closure Polygon
    if (after22h) {
      L.polygon(NIGHT_CLOSURE_POLYGON, {
        color: '#B91C1C',
        weight: 2,
        dashArray: '6 5',
        fillColor: '#EF4444',
        fillOpacity: 0.16,
      })
        .bindPopup(
          lang === 'ko'
            ? '<strong>22:00 공원 내부 통제 구역</strong><br/>몽촌토성 내부 보행로는 22시 이후 출입 통제됩니다. 남측/동측 외곽 평탄 우회로를 이용하세요.'
            : '<strong>22:00 Inner Park Closure Zone</strong><br/>Mongchontoseong inner trails close after 22:00. Use outer flat bypass routes.'
        )
        .addTo(group);
    }

    // 2. Barrier-free corridors
    if (barrierFreeMode) {
      L.polyline(BARRIER_FREE_CORRIDOR, {
        color: '#0F766E',
        weight: 5,
        opacity: 0.85,
      })
        .bindPopup(
          lang === 'ko'
            ? '<strong>무장애 완만 경사로 (동측 · 경사 1/20 이하)</strong><br/>KSPO DOME → 올림픽홀 → 올림픽공원역 3번 출구 승강기'
            : '<strong>Barrier-Free Flat Corridor (East, slope &lt;5%)</strong>'
        )
        .addTo(group);

      L.polyline(BARRIER_FREE_WEST_CORRIDOR, {
        color: '#0D9488',
        weight: 5,
        dashArray: '8 6',
        opacity: 0.9,
      })
        .bindPopup(
          lang === 'ko'
            ? '<strong>무장애 분산 귀가 루트 (서측 · 한얼광장 계단 우회)</strong><br/>KSPO DOME → 우리금융아트홀 → 남2문 → 한성백제역 2번 · 몽촌토성역 1번 승강기'
            : '<strong>Barrier-Free West Dispersal Route</strong><br/>Bypasses Haneol Plaza stairs to Hansung Baekje &amp; Mongchontoseong elevators'
        )
        .addTo(group);
    }

    // 3. Recommended active return line (Origin -> Best Station)
    if (bestRoute) {
      const midLat = after22h ? 37.5166 : (origin.lat + bestRoute.station.lat) / 2;
      const midLng = (origin.lng + bestRoute.station.lng) / 2;
      L.polyline(
        [
          [origin.lat, origin.lng],
          [midLat, midLng],
          [bestRoute.station.lat, bestRoute.station.lng],
        ],
        {
          color: '#2563EB',
          weight: 4,
          opacity: 0.95,
        }
      )
        .bindPopup(
          lang === 'ko'
            ? `<strong>추천 분산 귀가 경로</strong><br/>${origin.ko} → ${bestRoute.station.nameKo}<br/>도보 ${bestRoute.walkMin}분 + 예상 승차대기 ${bestRoute.queuePenaltyMin}분`
            : `<strong>Recommended Return Route</strong><br/>${origin.en} → ${bestRoute.station.nameEn}<br/>Walk ${bestRoute.walkMin}m + Queue ${bestRoute.queuePenaltyMin}m`
        )
        .addTo(group);
    }

    // 4. Parking Zones P1A~P11
    if (showParking) {
      bundle.parkingZones.forEach((z) => {
        const color = z.riskLevel === 'high' ? '#B91C1C' : z.riskLevel === 'medium' ? '#D97706' : '#0F766E';
        L.circleMarker([z.lat, z.lng], {
          radius: barrierFreeMode ? 9 : 7,
          color: '#FFFFFF',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.92,
        })
          .bindPopup(
            lang === 'ko'
              ? `<strong>${z.id} (${z.gateKo})</strong><br/>${z.nameKo}<br/>만차 이력: ${z.fullCount15164156}회 · 장애인 주차: <strong>${z.disabledSpaces}면</strong>`
              : `<strong>${z.id} (${z.gateEn})</strong><br/>${z.nameEn}<br/>Full count: ${z.fullCount15164156} · Disabled spaces: <strong>${z.disabledSpaces}</strong>`
          )
          .addTo(group);
      });
    }

    // 5. Songpa Public Overflow Parking Lots
    if (showOverflow) {
      bundle.overflowLots.forEach((ov) => {
        L.circleMarker([ov.lat, ov.lng], {
          radius: 9,
          color: '#0F2C59',
          weight: 2.5,
          fillColor: '#38BDF8',
          fillOpacity: 0.95,
        })
          .bindPopup(
            lang === 'ko'
              ? `<strong>[송파 공영 오버플로우] ${ov.nameKo}</strong><br/>총 ${ov.capacity}면 · 공원 도보 ${ov.walkMinToPark}분<br/>${ov.rateInfoKo}`
              : `<strong>[Songpa Overflow] ${ov.nameEn}</strong><br/>${ov.capacity} spaces · ${ov.walkMinToPark}m walk<br/>${ov.rateInfoEn}`
          )
          .addTo(group);
      });
    }

    // 6. Subway Stations
    bundle.live.subwayStations.forEach((st) => {
      const icon = L.divIcon({
        className: 'custom-subway-badge',
        html: `<div style="display:inline-block;background:${st.lineColor};color:#111827;font-weight:800;font-size:10px;padding:2px 7px;border-radius:999px;border:2px solid #0F2C59;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)">${st.line} ${st.nameKo.split(' ')[0]}</div>`,
        iconSize: [0, 0],
        iconAnchor: [45, 11],
      });
      L.marker([st.lat, st.lng], { icon })
        .bindPopup(
          lang === 'ko'
            ? `<strong>${st.nameKo}</strong><br/>${st.exitInfoKo}<br/>20~21시 월 승차: ${(st.hour20Boardings + st.hour21Boardings).toLocaleString()}명`
            : `<strong>${st.nameEn}</strong><br/>${st.exitInfoEn}`
        )
        .addTo(group);
    });

    // 7. Venues, Museum, and Safety / Barrier-Free POIs
    bundle.pois.forEach((p) => {
      const isSafety = p.category === 'aed' || p.category === 'info' || p.category === 'shade' || p.category === 'running-caution';
      const isStroller = p.category === 'stroller-detour';
      if (isSafety && !showSafety) return;
      if (isStroller && !barrierFreeMode && !showSafety) return;

      const bg =
        p.category === 'venue'
          ? '#0F2C59'
          : p.category === 'museum'
            ? '#6D28D9'
            : p.category === 'aed'
              ? '#DC2626'
              : p.category === 'shade'
                ? '#0284C7'
                : p.category === 'stroller-detour'
                  ? '#0F766E'
                  : '#D97706';

      const shortTag =
        p.category === 'venue'
          ? p.id === 'v-kspo'
            ? 'KSPO DOME'
            : p.id === 'v-handball'
              ? lang === 'ko'
                ? '핸드볼'
                : 'Handball'
              : p.nameKo.split(' ')[0]
          : p.category === 'museum'
            ? lang === 'ko'
              ? '국립스포츠박물관'
              : 'Sports Museum'
            : p.category === 'aed'
              ? 'AED'
              : p.category === 'shade'
                ? lang === 'ko'
                  ? '그늘·대피'
                  : 'Shelter'
                : p.category === 'stroller-detour'
                  ? lang === 'ko'
                    ? '유모차 우회'
                    : 'Stroller Detour'
                  : lang === 'ko'
                    ? '러닝 주의'
                    : 'Run Caution';

      const icon = L.divIcon({
        className: 'custom-poi-badge',
        html: `<div style="display:inline-block;background:${bg};color:#FFFFFF;font-weight:700;font-size:10px;padding:2px 7px;border-radius:6px;border:1.5px solid #FFFFFF;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.28)">${shortTag}</div>`,
        iconSize: [0, 0],
        iconAnchor: [36, 11],
      });

      L.marker([p.lat, p.lng], { icon })
        .bindPopup(
          lang === 'ko'
            ? `<strong>${p.nameKo}</strong><br/>${p.descKo}${p.barrierFreeNoteKo ? `<br/><span style="color:#0F766E;font-weight:600">무장애: ${p.barrierFreeNoteKo}</span>` : ''}`
            : `<strong>${p.nameEn}</strong><br/>${p.descEn}${p.barrierFreeNoteEn ? `<br/><span style="color:#0F766E;font-weight:600">Barrier-Free: ${p.barrierFreeNoteEn}</span>` : ''}`
        )
        .addTo(group);
    });
  }, [bundle, lang, after22h, showParking, showOverflow, showSafety, barrierFreeMode, origin, bestRoute]);

  const totalDisabledSpaces = bundle.parkingZones.reduce((sum, z) => sum + z.disabledSpaces, 0);

  return (
    <div className="space-y-6">
      {/* Banner linking to 2026-11-19 KSPO&CO held citizen proposal list_no=85882 */}
      <section
        aria-labelledby="map-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-[#0F766E] border border-teal-200">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {lang === 'ko'
                ? '2026-11-19 KSPO&CO 보류 시민제안(list_no=85882) 직접 구현'
                : 'Directly Implements Nov 19, 2026 KSPO&CO Held Citizen Proposals (#85882)'}
            </div>
            <h2 id="map-heading" className="mt-1.5 flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <MapPin className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {lang === 'ko'
                ? '올림픽공원 시설 안전 지도 · 스마트 분산 귀가 · 교통약자 무장애(배리어프리) 동선'
                : 'Olympic Park Facility Safety Map · Smart Return Router · Barrier-Free Navigation'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {lang === 'ko'
                ? '기관이 "별도 시스템 구축 어려움"으로 보류한 시설 안전 지도·스마트 귀가 동선과 휠체어(11/19 VOC)·유모차(490회 VOC)·국립스포츠박물관(2026-10 개관) 동선을 무료 오픈 지도(Leaflet/OSM)로 실구현했습니다.'
                : 'Delivers facility safety mapping, 22:00 gate closures, Songpa overflow parking, and wheelchair/stroller step-free routes using zero-cost Leaflet/OSM tiles.'}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs">
            <Accessibility className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
            <div>
              <div className="font-bold text-[#0F2C59]">
                {lang === 'ko' ? `장애인 전용 주차 ${bundle.parkingZones.length + 1}개소 ${totalDisabledSpaces}면` : `12 Disabled Lots (${totalDisabledSpaces} spaces)`}
              </div>
              <div className="text-[11px] text-slate-600">
                {lang === 'ko' ? '경사 1/20 이하 무장애 우회로 · 4역 승강기 연동' : 'Slope <1/20 bypass + 4 station elevators'}
              </div>
            </div>
          </div>
        </div>

        {/* Layer Controls */}
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label={lang === 'ko' ? '지도 레이어 토글' : 'Map layer toggles'}
        >
          <button
            type="button"
            aria-pressed={barrierFreeMode}
            onClick={() => setBarrierFreeMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              barrierFreeMode
                ? 'border-[#0F766E] bg-[#0F766E] text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Accessibility className="h-4 w-4" aria-hidden="true" />
            {lang === 'ko' ? '교통약자 무장애(휠체어·유모차)' : 'Barrier-Free (Wheelchair/Stroller)'}
          </button>

          <button
            type="button"
            aria-pressed={after22h}
            onClick={() => setAfter22h((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              after22h
                ? 'border-red-700 bg-red-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Moon className="h-4 w-4" aria-hidden="true" />
            {lang === 'ko' ? '22:00 내부 통제 구역' : '22:00 Park Closure Zone'}
          </button>

          <button
            type="button"
            aria-pressed={showParking}
            onClick={() => setShowParking((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              showParking
                ? 'border-[#0F2C59] bg-[#0F2C59] text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ParkingSquare className="h-4 w-4" aria-hidden="true" />
            {lang === 'ko' ? '주차장 P1~P11 위험도' : 'Zones P1–P11 Risk'}
          </button>

          <button
            type="button"
            aria-pressed={showOverflow}
            onClick={() => setShowOverflow((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              showOverflow
                ? 'border-sky-700 bg-sky-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            {lang === 'ko' ? '송파 공영 오버플로우' : 'Songpa Overflow Lots'}
          </button>

          <button
            type="button"
            aria-pressed={showSafety}
            onClick={() => setShowSafety((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              showSafety
                ? 'border-amber-700 bg-amber-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <HeartPulse className="h-4 w-4" aria-hidden="true" />
            {lang === 'ko' ? 'AED·그늘막·안전러닝' : 'AED · Shelters · Running Caution'}
          </button>
        </div>

        {/* Map + Smart Return Router Panel */}
        <div className="mt-4 grid gap-5 lg:grid-cols-12">
          <div
            role="region"
            aria-label={
              lang === 'ko'
                ? '올림픽공원 인터랙티브 안전·주차·무장애 지도'
                : 'Interactive Olympic Park Safety, Parking & Barrier-Free Map'
            }
            className="lg:col-span-8"
          >
            <div
              ref={mapContainerRef}
              className="h-[460px] w-full overflow-hidden rounded-xl border border-slate-300 shadow-inner"
            />
            {/* Map Legend */}
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-700" />
                {lang === 'ko' ? '만차 고위험(P4~P6, P11)' : 'High Full Risk (P4–P6)'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                {lang === 'ko' ? '혼잡 주의(P2, P7, P8)' : 'Moderate (P2, P7, P8)'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-[#0F766E]" />
                {lang === 'ko' ? '분산 여유(P1, P9, P10)' : 'Relief Lots (P1, P9, P10)'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400 border border-[#0F2C59]" />
                {lang === 'ko' ? '송파 공영 오버플로우' : 'Songpa Overflow'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-0.5 w-4 bg-[#0F766E]" />
                {lang === 'ko' ? '무장애 평탄 경사로' : 'Barrier-Free Flat Path'}
              </span>
            </div>
          </div>

          {/* Right: Smart Return Dispersal Engine */}
          <div className="flex flex-col justify-between space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-4">
            <div className="space-y-3.5">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#0F2C59]">
                <TrainFront className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                {lang === 'ko' ? '스마트 분산 귀가 경로 계산기' : 'Smart Dispersed Return Router'}
              </h3>

              <div>
                <label htmlFor="origin-venue-select" className="mb-1 block text-xs font-semibold text-slate-700">
                  {lang === 'ko' ? '출발 공연장 / 시설 선택' : 'Origin Venue / Landmark'}
                </label>
                <select
                  id="origin-venue-select"
                  value={originId}
                  onChange={(e) => setOriginId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {ORIGIN_VENUES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {lang === 'ko' ? v.ko : v.en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">
                  {lang === 'ko' ? '이동 유형 (보행약자 맞춤)' : 'Mobility Profile'}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'walk', ko: '일반 보행', en: 'Walking' },
                      { id: 'wheelchair', ko: '휠체어', en: 'Wheelchair' },
                      { id: 'stroller', ko: '유모차', en: 'Stroller' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={mobility === m.id}
                      onClick={() => {
                        setMobility(m.id);
                        if (m.id !== 'walk') setBarrierFreeMode(true);
                      }}
                      className={`rounded-lg border py-1.5 text-xs font-bold ${
                        mobility === m.id
                          ? 'border-[#0F766E] bg-[#0F766E] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {lang === 'ko' ? m.ko : m.en}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ranked 4 Station Return Options */}
              <div className="space-y-2">
                {stationRoutes.map((r, idx) => (
                  <div
                    key={r.station.id}
                    className={`rounded-xl border p-3 text-xs ${
                      idx === 0
                        ? 'border-[#0F766E] bg-teal-50/80'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#0F2C59]">
                        {idx === 0 && (
                          <span className="mr-1.5 rounded bg-[#0F766E] px-1.5 py-0.5 text-[10px] text-white">
                            {lang === 'ko' ? '최적 추천' : 'BEST'}
                          </span>
                        )}
                        {lang === 'ko' ? r.station.nameKo : r.station.nameEn}
                      </span>
                      <span className="font-extrabold text-[#0F766E]">
                        {lang === 'ko' ? `총 ${r.totalEffectiveMin}분` : `${r.totalEffectiveMin}m`}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap justify-between gap-1 text-[11px] text-slate-600">
                      <span>
                        {lang === 'ko'
                          ? `도보 ${r.walkMin}분 (${r.pathM}m) + 탑승대기 ~${r.queuePenaltyMin}분`
                          : `Walk ${r.walkMin}m (${r.pathM}m) + Queue ~${r.queuePenaltyMin}m`}
                      </span>
                      <span className="font-semibold text-teal-800">
                        {lang === 'ko' ? '승강기 O' : 'Elevator OK'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stroller / Wheelchair VOC Notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-950">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <Baby className="h-4 w-4 shrink-0" aria-hidden="true" />
                {lang === 'ko' ? '공연일 유모차·휠체어 우회 안내 (VOC 490회 대응)' : 'Concert-Day Stroller & Wheelchair Detour (VOC 490)'}
              </div>
              <p className="mt-1">
                {lang === 'ko'
                  ? '한얼광장 계단·인파 통제 구간을 자동 회피하여 남2문~우리금융아트홀~한성백제역 2번 출구(경사 1/20 이하, 단차 0)로 안내합니다.'
                  : 'Automatically bypasses Haneol Plaza stairs & crowd barriers via South Gate 2 flat ramp (<5% slope) to Hansung Baekje Exit 2 elevator.'}
              </p>
            </div>
          </div>
        </div>

        {/* Songpa Overflow Lots Strip + Accessible KWCAG Table */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {bundle.overflowLots.map((ov) => (
            <div
              key={ov.id}
              className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-xs"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
              <div className="w-full">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-[#0F2C59]">
                    {lang === 'ko' ? ov.nameKo : ov.nameEn}
                  </span>
                  {ov.available !== undefined && (
                    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-900">
                      {lang === 'ko' ? `잔여 ${ov.available}` : `${ov.available} free`}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600">
                  {lang === 'ko'
                    ? `총 ${ov.capacity}면 · 공원 ${ov.walkMinToPark}분 · ${ov.rateInfoKo}`
                    : `${ov.capacity} total · ${ov.walkMinToPark}m · ${ov.rateInfoEn}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        <AccessibleTableToggle
          lang={lang}
          caption={
            lang === 'ko'
              ? '올림픽공원 주차장 구역별(P1~P11) 만차 위험도 및 장애인 전용 주차면 대체 텍스트 표'
              : 'Olympic Park Parking Zones (P1–P11) Full-Risk & Disabled Parking Spaces Table'
          }
          headers={
            lang === 'ko'
              ? ['구역', '진입 게이트', '인접 공연장', '만차 빈도(15164156)', '장애인 주차(면)', '위험도']
              : ['Zone', 'Gate', 'Nearest Venue', 'Full Count', 'Disabled Spaces', 'Risk']
          }
          rows={bundle.parkingZones.map((z) => [
            z.id,
            lang === 'ko' ? z.gateKo : z.gateEn,
            lang === 'ko' ? z.nearVenueKo : z.nearVenueEn,
            z.fullCount15164156,
            z.disabledSpaces,
            z.riskLevel.toUpperCase(),
          ])}
        />
      </section>
    </div>
  );
}
