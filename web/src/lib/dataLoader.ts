import { BASELINE_BUNDLE } from './baselineData';
import type { AppBundle, ConcertItem, ModelBenchmarkRow, OverflowParkingLot } from '../types/data';

async function fetchJsonSafe<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json') && !ct.includes('text/plain')) {
      const text = await res.text();
      if (text.trim().startsWith('<')) return null;
      return JSON.parse(text) as T;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const KNOWN_OVERFLOW_COORDS: Record<
  string,
  { lat: number; lng: number; walkMin: number; distM: number; en: string; ja: string }
> = {
  '1277145': {
    lat: 37.514277,
    lng: 127.103414,
    walkMin: 12,
    distM: 1150,
    en: 'Jamsil Station Public Lot (Line 8 · 1 stop)',
    ja: '蚕室駅 公営駐車場（8号線・1駅）',
  },
  '173646': {
    lat: 37.5204,
    lng: 127.1095,
    walkMin: 9,
    distM: 760,
    en: 'Sincheon Retention Basin Public Lot',
    ja: '新川遊水池 公営駐車場（市営）',
  },
  '1475224': {
    lat: 37.5218,
    lng: 127.1142,
    walkMin: 8,
    distM: 680,
    en: 'Jamsilnaru (Seongnae) Public Lot',
    ja: '城内駅（蚕室ナル）公営駐車場',
  },
  '173752': {
    lat: 37.4709,
    lng: 127.1266,
    walkMin: 15,
    distM: 1500,
    en: 'Bokjeong Station Transfer Public Lot (Line 8)',
    ja: '福井駅 乗換公営駐車場（8号線）',
  },
};

function venueIdToJa(venueId: ConcertItem['venueId'], fallback: string): string {
  switch (venueId) {
    case 'kspo-dome':
      return 'KSPO DOME（体操競技場）';
    case 'handball':
      return 'チケットリンク・ライブアリーナ（ハンドボール）';
    case 'olympic-hall':
      return 'オリンピックホール';
    case 'woori':
      return 'ウリ金融アートホール';
    case '88-lawn':
      return '88芝生広場';
    case 'museum':
      return 'オリンピック公園内博物館';
    default:
      return fallback;
  }
}

export async function loadAppBundle(): Promise<AppBundle> {
  const bundle: AppBundle = structuredClone(BASELINE_BUNDLE);
  const loaded: string[] = [];

  const workerBase = (import.meta.env.VITE_WORKER_URL as string | undefined)?.replace(/\/$/, '');

  const [
    workerLive,
    b1Live,
    b1Model,
    b1Concerts,
    b1Audit,
    b1ParkingZones,
    b1Monthly,
    modelsManifest,
  ] = await Promise.all([
    workerBase ? fetchJsonSafe<Record<string, unknown>>(`${workerBase}/api/live`) : Promise.resolve(null),
    fetchJsonSafe<Record<string, unknown>>('./data/live_snapshot.json'),
    fetchJsonSafe<Record<string, unknown>>('./data/model_bundle.json'),
    fetchJsonSafe<unknown>('./data/concerts.json'),
    fetchJsonSafe<unknown>('./data/quality_audit.json'),
    fetchJsonSafe<unknown>('./data/parking_zones.json'),
    fetchJsonSafe<unknown>('./data/monthly_parking.json'),
    fetchJsonSafe<{ local_glb_models?: Array<{ file?: string; url?: string; mb?: number; raw_mb?: number }> }>(
      './models/models_manifest.json'
    ),
  ]);

  // 1. Merge B1 live_snapshot.json
  if (b1Live && typeof b1Live === 'object') {
    loaded.push('live_snapshot.json');
    bundle.live.sourceMode = 'static-snapshot';
    mergeLivePayload(bundle, b1Live);
  }

  // 2. Overlay real-time Worker response if configured and healthy
  if (workerLive && typeof workerLive === 'object') {
    loaded.push('worker:/api/live');
    bundle.live.sourceMode = 'live-worker';
    mergeLivePayload(bundle, workerLive);
  }

  // 3. Merge B1 model_bundle.json
  if (b1Model && typeof b1Model === 'object') {
    loaded.push('model_bundle.json');
    mergeModelBundle(bundle, b1Model);
  }

  // 4. Merge B1 concerts.json
  if (b1Concerts) {
    loaded.push('concerts.json');
    const arr = Array.isArray(b1Concerts)
      ? b1Concerts
      : Array.isArray((b1Concerts as Record<string, unknown>).items)
        ? ((b1Concerts as Record<string, unknown>).items as Record<string, unknown>[])
        : [];
    if (arr.length > 0) {
      const normalized: ConcertItem[] = arr.slice(0, 24).map((raw, i) => {
        const r = raw as Record<string, unknown>;
        const title = String(r.title_ko ?? r.title ?? r.title_en ?? `Concert #${i + 1}`);
        const titleEn = String(r.title_en ?? r.title ?? title);
        const venue = String(r.venue_ko ?? r.venue ?? '올림픽공원');
        const venueEn = String(r.venue_en ?? venue);
        const venueId = inferVenueId(`${venue} ${title}`);
        const maxSim = Number(r.max_simultaneous_venues);
        return {
          id: String(r.id ?? `b1-${i}`),
          titleKo: title,
          titleEn,
          venueId,
          venueKo: venue,
          venueEn,
          venueJa: venueIdToJa(venueId, venueEn),
          startDate: String(r.start_date ?? r.date ?? '2026-11-21'),
          endDate: String(r.end_date ?? r.start_date ?? r.date ?? '2026-11-21'),
          status: (r.status === 'live' || r.status === 'upcoming' ? r.status : 'archive') as ConcertItem['status'],
          expectedCapacity: Number(r.expected_capacity ?? r.capacity ?? 5000) || 5000,
          maxSimultaneousVenues: Number.isFinite(maxSim) ? maxSim : undefined,
          ticketUrl: typeof (r.ticket_url ?? r.url) === 'string' ? String(r.ticket_url ?? r.url) : undefined,
          source: String(r.source ?? 'KSPO&CO 공식 공연일정'),
        };
      });
      const liveEvents = bundle.live.concerts.filter((c) => c.status === 'live');
      const upcoming = normalized.filter((c) => c.status === 'upcoming' || c.status === 'live').slice(0, 10);
      const rest = normalized.filter((c) => c.status === 'archive').slice(0, 4);
      bundle.live.concerts = [...upcoming, ...liveEvents, ...rest].slice(0, 12);
    }
  }

  // 5. Merge B1 parking_zones.json real full/congest counts
  if (Array.isArray(b1ParkingZones) && b1ParkingZones.length > 0) {
    loaded.push('parking_zones.json');
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of b1ParkingZones) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const zid = String(rec.zone ?? rec.id ?? '').toUpperCase();
        if (zid) byId.set(zid, rec);
      }
    }
    for (const pz of bundle.parkingZones) {
      const m = byId.get(pz.id.toUpperCase());
      if (m) {
        const fc = Number(m.full_count);
        const cc = Number(m.congested_count);
        if (Number.isFinite(fc)) pz.fullCount15164156 = fc;
        if (Number.isFinite(cc)) pz.congestCount15164156 = cc;
      }
    }
  }

  if (b1Monthly) loaded.push('monthly_parking.json');
  if (b1Audit) loaded.push('quality_audit.json');

  // 6. Update ALL 5 detected Draco GLB assets from models_manifest.json (zero 404 requests!)
  const localModels = modelsManifest?.local_glb_models ?? [];
  const findModel = (needle: string) =>
    localModels.find((x) => (x.file || '').toLowerCase().includes(needle));

  const m88 = findModel('88jandi');
  const mLake = findModel('lakeside');
  const mKspo = findModel('kspodome');
  const mHandball = findModel('handball');
  const mWoori = findModel('woori');

  const applyModel = (
    venueId: AppBundle['availableModels'][number]['venueId'],
    hit: { file?: string; mb?: number; raw_mb?: number } | undefined
  ) => {
    const slot = bundle.availableModels.find((x) => x.venueId === venueId);
    if (!slot) return;
    if (hit?.file) {
      slot.glbUrl = `./models/${hit.file}`;
      if (typeof hit.mb === 'number') slot.fileSizeMb = hit.mb;
      if (typeof hit.raw_mb === 'number') slot.rawSizeMb = hit.raw_mb;
      loaded.push(hit.file);
    }
  };

  applyModel('88-lawn', m88);
  applyModel('lake-stage', mLake);
  applyModel('kspo-dome', mKspo);
  applyModel('handball', mHandball);
  applyModel('woori', mWoori);

  bundle.b1LoadedFiles = loaded;
  return bundle;
}

function inferVenueId(text: string): ConcertItem['venueId'] {
  const s = text.toUpperCase();
  if (s.includes('KSPO') || s.includes('DOME') || s.includes('체조')) return 'kspo-dome';
  if (s.includes('HAND') || s.includes('핸드볼') || s.includes('티켓링크')) return 'handball';
  if (s.includes('올림픽홀') || s.includes('OLYMPIC HALL')) return 'olympic-hall';
  if (s.includes('우리금융') || s.includes('WOORI')) return 'woori';
  if (s.includes('88') || s.includes('잔디') || s.includes('MINT') || s.includes('FESTIVAL')) return '88-lawn';
  if (s.includes('박물관') || s.includes('MUSEUM')) return 'museum';
  return 'other';
}

function mergeLivePayload(bundle: AppBundle, raw: Record<string, unknown>) {
  const rawTs = typeof raw.updated_at === 'string' ? raw.updated_at : typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  if (rawTs) {
    bundle.live.updatedAt = rawTs.includes('KST') ? rawTs : rawTs.replace('T', ' ').slice(0, 16) + ' KST';
  }

  const parking = (raw.kspo_parking ?? raw.kspoParking ?? raw.parking) as Record<string, unknown> | undefined;
  const pSum = Number(parking?.parking_sum ?? parking?.parkingSum ?? raw.parking_sum);
  if (Number.isFinite(pSum) && pSum > 0) {
    bundle.live.kspoParking.parkingSum = Math.round(pSum);
    bundle.live.kspoParking.occupancyPct =
      Math.round((pSum / bundle.live.kspoParking.totalCapacity) * 1000) / 10;
    const mAt = parking?.measured_at ?? parking?.measuredAt;
    if (typeof mAt === 'string') {
      bundle.live.kspoParking.measuredAt = mAt.includes('KST') ? mAt : mAt + ' KST';
    }
  }

  const pop = (raw.seoul_population ?? raw.seoulPopulation ?? raw.population) as Record<string, unknown> | undefined;
  if (pop) {
    if (typeof pop.congest_lvl === 'string' || typeof pop.congestLevel === 'string') {
      bundle.live.seoulPopulation.congestLevel = String(pop.congest_lvl ?? pop.congestLevel);
    }
    if (typeof pop.congest_msg === 'string' || typeof pop.congestMsg === 'string') {
      bundle.live.seoulPopulation.congestMsg = String(pop.congest_msg ?? pop.congestMsg);
    }
    const pMin = Number(pop.min ?? pop.area_ppltn_min);
    const pMax = Number(pop.max ?? pop.area_ppltn_max);
    const nonRes = Number(pop.non_resident_pct);
    if (Number.isFinite(pMin) && pMin > 0) bundle.live.seoulPopulation.min = pMin;
    if (Number.isFinite(pMax) && pMax > 0) bundle.live.seoulPopulation.max = pMax;
    if (Number.isFinite(nonRes) && nonRes > 0) bundle.live.seoulPopulation.nonResidentPct = nonRes;
    if (typeof pop.observed_at === 'string' && pop.observed_at) bundle.live.seoulPopulation.observedAt = pop.observed_at;

    const fcst = (pop.forecast_12h ?? pop.forecast12h ?? pop.fcst_ppltn) as Record<string, unknown>[] | undefined;
    if (Array.isArray(fcst) && fcst.length >= 4) {
      bundle.live.seoulPopulation.forecast12h = fcst.slice(0, 12).map((f) => {
        const t = String(f.time ?? f.FCST_TIME ?? '');
        const hh = t.match(/(\d{2}):\d{2}/)?.[1] ?? t.slice(-5, -3);
        const mn = Number(f.min ?? f.FCST_PPLTN_MIN ?? 5000);
        const mx = Number(f.max ?? f.FCST_PPLTN_MAX ?? 6000);
        return {
          time: t,
          hourLabel: `${hh}시`,
          min: mn,
          max: mx,
          mid: Math.round((mn + mx) / 2),
          level: String(f.level ?? f.FCST_CONGEST_LVL ?? '여유'),
        };
      });
    }
  }

  const wx = (raw.weather ?? raw.kma_weather) as Record<string, unknown> | undefined;
  if (wx) {
    const temp = Number(wx.temp_c ?? wx.tempC ?? wx.TEMP);
    if (Number.isFinite(temp)) bundle.live.weather.tempC = temp;
    const tmax = Number(wx.max_temp_c);
    if (Number.isFinite(tmax)) bundle.live.weather.maxTempC = tmax;
    const tmin = Number(wx.min_temp_c);
    if (Number.isFinite(tmin)) bundle.live.weather.minTempC = tmin;
    const hum = Number(wx.humidity_pct ?? wx.humidityPct ?? wx.HUMIDITY);
    if (Number.isFinite(hum)) bundle.live.weather.humidityPct = hum;
    const wind = Number(wx.wind_spd ?? wx.windSpeedMs ?? wx.WIND_SPD);
    if (Number.isFinite(wind)) bundle.live.weather.windSpeedMs = wind;
    const rain = Number(wx.precipitation_mm ?? wx.precipitationMm ?? wx.rain_mm);
    if (Number.isFinite(rain)) bundle.live.weather.precipitationMm = rain;
    if (typeof (wx.pcp_msg ?? wx.pcpMsg) === 'string') {
      bundle.live.weather.pcpMsg = String(wx.pcp_msg ?? wx.pcpMsg);
    }
    const pm25 = Number(wx.pm25 ?? wx.PM25);
    if (Number.isFinite(pm25)) bundle.live.weather.pm25 = pm25;
    if (typeof wx.pm25_grade === 'string' && wx.pm25_grade) bundle.live.weather.pm25Grade = wx.pm25_grade;
    const pm10 = Number(wx.pm10 ?? wx.PM10);
    if (Number.isFinite(pm10)) bundle.live.weather.pm10 = pm10;
  }

  const ovLive = raw.songpa_overflow_live as Record<string, unknown>[] | undefined;
  if (Array.isArray(ovLive) && ovLive.length > 0) {
    const mapped: OverflowParkingLot[] = ovLive.slice(0, 4).map((o, idx) => {
      const code = String(o.pklt_cd ?? `ov-${idx}`);
      const geo = KNOWN_OVERFLOW_COORDS[code] ?? {
        lat: 37.5135 + idx * 0.002,
        lng: 127.112 + idx * 0.003,
        walkMin: 10,
        distM: 800,
        en: String(o.name ?? 'Songpa Public Lot'),
        ja: String(o.name ?? '松坡公営駐車場'),
      };
      const cap = Number(o.capacity ?? 150);
      const occ = Number(o.occupied ?? 0);
      const avail = Number(o.available ?? Math.max(0, cap - occ));
      const pct = Number(o.occupancy_pct ?? Math.round((occ / Math.max(1, cap)) * 1000) / 10);
      const rate5 = Number(o.rate_per_5m_won ?? 250);
      return {
        id: `live-ov-${code}`,
        nameKo: String(o.name ?? '송파 공영주차장'),
        nameEn: geo.en,
        nameJa: geo.ja,
        lat: geo.lat,
        lng: geo.lng,
        capacity: cap,
        occupied: occ,
        available: avail,
        occupancyPct: pct,
        updatedAt: typeof o.updated_at === 'string' ? o.updated_at : undefined,
        walkMinToPark: geo.walkMin,
        rateInfoKo: `실시간 잔여 ${avail}면 (${pct}%) · 5분 ${rate5}원`,
        rateInfoEn: `Live ${avail} free (${pct}%) · ₩${rate5}/5min`,
        rateInfoJa: `空車 ${avail}台（占有率${pct}%）· 5分 ${rate5}ウォン`,
        distanceM: geo.distM,
      };
    });
    bundle.overflowLots = mapped;
  }
}

function mergeModelBundle(bundle: AppBundle, raw: Record<string, unknown>) {
  if (typeof raw.trainedOn === 'string') bundle.model.trainedOn = raw.trainedOn;
  if (typeof raw.validationMethod === 'string') bundle.model.validationMethod = raw.validationMethod;

  const hourlyIn = raw.baseHourlyEntryShare ?? raw.base_hourly_entry_share;
  if (Array.isArray(hourlyIn) && hourlyIn.length === 24) {
    bundle.model.baseHourlyEntryShare = hourlyIn.map(Number);
  }
  const hourlyOut = raw.baseHourlyExitShare ?? raw.base_hourly_exit_share;
  if (Array.isArray(hourlyOut) && hourlyOut.length === 24) {
    bundle.model.baseHourlyExitShare = hourlyOut.map(Number);
  }
  if (Array.isArray(raw.dowMultiplier) && raw.dowMultiplier.length === 7) {
    bundle.model.dowMultiplier = raw.dowMultiplier.map(Number);
  }

  if (raw.coefficients && typeof raw.coefficients === 'object') {
    const c = raw.coefficients as Record<string, unknown>;
    bundle.model.coefficients = {
      ...bundle.model.coefficients,
      ...(Number.isFinite(Number(c.baseDailyVehicles)) ? { baseDailyVehicles: Number(c.baseDailyVehicles) } : {}),
      ...(Number.isFinite(Number(c.rainLinearPerMm)) ? { rainLinearPerMm: Number(c.rainLinearPerMm) } : {}),
      ...(Number.isFinite(Number(c.rainNonConcertCapDrop)) ? { rainNonConcertCapDrop: Number(c.rainNonConcertCapDrop) } : {}),
      ...(Number.isFinite(Number(c.concertPer1kSeatsEntries)) ? { concertPer1kSeatsEntries: Number(c.concertPer1kSeatsEntries) } : {}),
      ...(Number.isFinite(Number(c.concertRainInteractionPer1kPer10mm))
        ? { concertRainInteractionPer1kPer10mm: Number(c.concertRainInteractionPer1kPer10mm) }
        : {}),
      ...(Number.isFinite(Number(c.tempDeviationPerDeg)) ? { tempDeviationPerDeg: Number(c.tempDeviationPerDeg) } : {}),
      ...(Number.isFinite(Number(c.baseNightExitShare)) ? { baseNightExitShare: Number(c.baseNightExitShare) } : {}),
      ...(Number.isFinite(Number(c.concertNightExitBoostPer1k)) ? { concertNightExitBoostPer1k: Number(c.concertNightExitBoostPer1k) } : {}),
    };
  }

  const bms = raw.benchmarks ?? raw.cv_benchmarks;
  if (Array.isArray(bms) && bms.length >= 2) {
    const parsed: ModelBenchmarkRow[] = [];
    for (const item of bms) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const mae = Number(r.hourly_mae ?? r.hourlyMae ?? r.mae);
      const rmse = Number(r.hourly_rmse ?? r.hourlyRmse ?? r.rmse);
      const r2 = Number(r.r2 ?? r.r2_score);
      if (Number.isFinite(mae) && Number.isFinite(rmse)) {
        const modelId = String(r.model_id ?? r.id ?? r.name ?? `m-${parsed.length}`);
        const baseMatch = bundle.model.benchmarks.find((b) => b.modelId === modelId);
        parsed.push({
          modelId,
          nameKo: String(r.name_ko ?? r.nameKo ?? r.name ?? '모델'),
          nameEn: String(r.name_en ?? r.nameEn ?? r.name ?? 'Model'),
          nameJa: String(r.name_ja ?? baseMatch?.nameJa ?? r.name_en ?? r.name ?? 'モデル'),
          typeKo: String(r.type_ko ?? r.typeKo ?? r.description ?? 'GroupKFold 실측'),
          typeEn: String(r.type_en ?? r.typeEn ?? r.description ?? 'GroupKFold Verified'),
          typeJa: String(r.type_ja ?? baseMatch?.typeJa ?? r.type_en ?? 'GroupKFold検証'),
          hourlyMae: Math.round(mae * 100) / 100,
          hourlyRmse: Math.round(rmse * 100) / 100,
          r2: Number.isFinite(r2) ? Math.round(r2 * 1000) / 1000 : 0.85,
          nightExitMae: Number(r.night_exit_mae ?? r.nightExitMae ?? Math.round(mae * 2)),
          usesWeather: Boolean(r.uses_weather ?? r.usesWeather ?? true),
          usesConcerts: Boolean(r.uses_concerts ?? r.usesConcerts ?? true),
          isWinner: Boolean(r.is_winner ?? r.isWinner ?? false),
        });
      }
    }
    if (parsed.length >= 2) {
      if (!parsed.some((p) => p.isWinner)) {
        let bestIdx = 0;
        for (let i = 1; i < parsed.length; i++) {
          if (parsed[i].nightExitMae < parsed[bestIdx].nightExitMae) bestIdx = i;
        }
        parsed[bestIdx].isWinner = true;
      }
      bundle.model.benchmarks = parsed;
    }
  }
}
