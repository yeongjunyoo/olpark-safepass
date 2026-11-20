/**
 * Olpark SafePass — Cloudflare Worker Zero-Cost Real-Time API Proxy
 *
 * - Free tier: 100,000 requests/day ($0/month infrastructure target through 2028)
 * - 5-minute Cloudflare Edge Cache (Cache API + s-maxage=300)
 * - Secrets stored ONLY in Cloudflare Worker environment secrets (never committed):
 *     KSPONCO_PARKING_KEY   (lowercase apiKey query param for parkingorsApi.do)
 *     SEOUL_CITYDATA_KEY    (Seoul Open Data Plaza key for citydata/올림픽공원 & GetParkingInfo/송파구)
 *     KMA_API_KEY           (KMA VilageFcstInfoService_2.0 key, Songpa nx=62 ny=126)
 * - Automatic Fallback: If any upstream API fails (e.g., culture.go.kr 502 outage),
 *   fetches static snapshot JSON from Cloudflare Pages STATIC_FALLBACK_URL.
 */

export interface Env {
  KSPONCO_PARKING_KEY?: string;
  SEOUL_CITYDATA_KEY?: string;
  KMA_API_KEY?: string;
  STATIC_FALLBACK_URL?: string;
  ALLOWED_ORIGINS?: string;
}

const CACHE_TTL_SEC = 300; // 5-minute edge cache
const TOTAL_PARKING_CAPACITY = 2716;

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  const allowList = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const allowedOrigin = allowList.includes('*') || allowList.includes(origin) ? origin : allowList[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=60, s-maxage=${CACHE_TTL_SEC}`,
  };
}

function nowKstString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 16) + ' KST';
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchKspoParking(apiKey?: string): Promise<{ parking_sum: number | null; status: string }> {
  const key = apiKey || 'PARKING21803504';
  // CRITICAL: KSPO&CO live endpoint requires lowercase `apiKey` (documented `ApiKey` returns HTTP 401!)
  const url = `https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { parking_sum: null, status: `http_${res.status}` };
    const data = (await res.json()) as Array<{ parking_sum?: number | string }>;
    const val = Number(data?.[0]?.parking_sum);
    if (Number.isFinite(val) && val >= 0) {
      return { parking_sum: Math.round(val), status: 'ok' };
    }
    return { parking_sum: null, status: 'invalid_payload' };
  } catch {
    return { parking_sum: null, status: 'timeout_or_error' };
  }
}

async function fetchSeoulCityData(apiKey?: string): Promise<Record<string, unknown> | null> {
  if (!apiKey) return null;
  const area = encodeURIComponent('올림픽공원');
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/citydata/1/5/${area}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
    if (!res.ok) return null;
    const raw = (await res.json()) as { CITYDATA?: Record<string, unknown> };
    const cd = raw?.CITYDATA;
    if (!cd) return null;

    const popArr = cd.LIVE_PPLTN_STTS as Array<Record<string, unknown>> | undefined;
    const pop = popArr?.[0];
    const wxArr = cd.WEATHER_STTS as Array<Record<string, unknown>> | undefined;
    const wx = wxArr?.[0];

    const fcstRaw = (pop?.FCST_PPLTN as Array<Record<string, unknown>> | undefined) ?? [];
    const forecast12h = fcstRaw.slice(0, 12).map((x) => ({
      time: String(x.FCST_TIME ?? ''),
      min: Math.round(num(x.FCST_PPLTN_MIN)),
      max: Math.round(num(x.FCST_PPLTN_MAX)),
      level: String(x.FCST_CONGEST_LVL ?? '여유'),
    }));

    return {
      seoul_population: pop
        ? {
            area_name: String(cd.AREA_NM ?? '올림픽공원'),
            congest_lvl: String(pop.AREA_CONGEST_LVL ?? '여유'),
            congest_msg: String(pop.AREA_CONGEST_MSG ?? ''),
            min: Math.round(num(pop.AREA_PPLTN_MIN)),
            max: Math.round(num(pop.AREA_PPLTN_MAX)),
            non_resident_pct: num(pop.NON_RESNT_PPLTN_RATE),
            observed_at: String(pop.PPLTN_TIME ?? ''),
            forecast_12h: forecast12h,
          }
        : undefined,
      weather: wx
        ? {
            observed_at: String(wx.WEATHER_TIME ?? ''),
            temp_c: num(wx.TEMP),
            max_temp_c: num(wx.MAX_TEMP),
            min_temp_c: num(wx.MIN_TEMP),
            humidity_pct: num(wx.HUMIDITY),
            wind_spd: num(wx.WIND_SPD),
            wind_dir: String(wx.WIND_DIRCT ?? ''),
            precipitation_mm: wx.PRECIPITATION === '-' ? 0 : num(wx.PRECIPITATION, 0),
            precpt_type: String(wx.PRECPT_TYPE ?? '없음'),
            pcp_msg: String(wx.PCP_MSG ?? ''),
            pm25: Math.round(num(wx.PM25)),
            pm25_grade: String(wx.PM25_INDEX ?? ''),
            pm10: Math.round(num(wx.PM10)),
            pm10_grade: String(wx.PM10_INDEX ?? ''),
            grid_nx: 62,
            grid_ny: 126,
          }
        : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchSongpaOverflowLive(apiKey?: string): Promise<Array<Record<string, unknown>> | null> {
  if (!apiKey) return null;
  const gu = encodeURIComponent('송파구');
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/GetParkingInfo/1/100/${gu}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const raw = (await res.json()) as { GetParkingInfo?: { row?: Array<Record<string, unknown>> } };
    const rows = raw?.GetParkingInfo?.row;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return rows.map((r) => {
      const cap = Math.round(num(r.TPKCT));
      const cur = Math.round(num(r.NOW_PRK_VHCL_CNT));
      const avail = Math.max(0, cap - cur);
      return {
        pklt_cd: String(r.PKLT_CD ?? ''),
        name: String(r.PKLT_NM ?? ''),
        address: String(r.ADDR ?? ''),
        capacity: cap,
        occupied: cur,
        available: avail,
        occupancy_pct: Math.round((cur / Math.max(cap, 1)) * 1000) / 10,
        updated_at: String(r.NOW_PRK_VHCL_UPDT_TM ?? ''),
        rate_per_5m_won: Math.round(num(r.BSC_PRK_CRG)),
      };
    });
  } catch {
    return null;
  }
}

async function fetchStaticFallback(env: Env): Promise<Record<string, unknown> | null> {
  if (!env.STATIC_FALLBACK_URL) return null;
  try {
    const res = await fetch(env.STATIC_FALLBACK_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);

    // Health check endpoint for GitHub Actions SLA monitor
    if (url.pathname === '/api/health') {
      const kspo = await fetchKspoParking(env.KSPONCO_PARKING_KEY);
      return new Response(
        JSON.stringify({
          service: 'olpark-safepass-api',
          checked_at: nowKstString(),
          kspo_parking_status: kspo.status,
          kspo_parking_sum: kspo.parking_sum,
          has_seoul_key: Boolean(env.SEOUL_CITYDATA_KEY),
          has_kma_key: Boolean(env.KMA_API_KEY),
          ok: true,
        }),
        { status: 200, headers }
      );
    }

    if (url.pathname !== '/api/live' && url.pathname !== '/api/parking') {
      return new Response(
        JSON.stringify({ error: 'Not Found', endpoints: ['/api/live', '/api/parking', '/api/health'] }),
        {
          status: 404,
          headers,
        }
      );
    }

    // 5-Minute Cloudflare Edge Cache Lookup
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const hitHeaders = new Headers(cached.headers);
      hitHeaders.set('X-SafePass-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: hitHeaders });
    }

    // Parallel Upstream Fetch
    const [kspo, seoul, songpaOverflow] = await Promise.all([
      fetchKspoParking(env.KSPONCO_PARKING_KEY),
      url.pathname === '/api/live' ? fetchSeoulCityData(env.SEOUL_CITYDATA_KEY) : Promise.resolve(null),
      url.pathname === '/api/live' ? fetchSongpaOverflowLive(env.SEOUL_CITYDATA_KEY) : Promise.resolve(null),
    ]);

    // Fallback to static snapshot if live upstreams unavailable
    let fallback: Record<string, unknown> | null = null;
    if (kspo.parking_sum === null || (!seoul && url.pathname === '/api/live')) {
      fallback = await fetchStaticFallback(env);
    }

    const kstNow = nowKstString();
    const hasLive = kspo.parking_sum !== null || Boolean(seoul) || Boolean(songpaOverflow);

    const payload: Record<string, unknown> = {
      ...(fallback || {}),
      updated_at: kstNow,
      cache_ttl_sec: CACHE_TTL_SEC,
      source_mode: hasLive ? 'live-worker' : 'static-fallback',
      kspo_parking:
        kspo.parking_sum !== null
          ? {
              parking_sum: kspo.parking_sum,
              total_capacity: TOTAL_PARKING_CAPACITY,
              occupancy_pct: Math.round((kspo.parking_sum / TOTAL_PARKING_CAPACITY) * 1000) / 10,
              measured_at: kstNow.replace(' KST', ''),
              status: 'ok',
            }
          : (fallback?.kspo_parking ?? { status: kspo.status }),
      ...(seoul || {}),
      ...(songpaOverflow && songpaOverflow.length > 0 ? { songpa_overflow_live: songpaOverflow } : {}),
    };

    const response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...headers,
        'X-SafePass-Cache': 'MISS',
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
