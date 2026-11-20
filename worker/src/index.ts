/**
 * Olpark SafePass — Cloudflare Worker Zero-Cost Real-Time API Proxy
 *
 * - Free tier: 100,000 requests/day ($0/month guaranteed through 2028)
 * - 5-minute Cloudflare Edge Cache (Cache API + s-maxage=300)
 * - Secrets stored ONLY in Cloudflare Worker environment secrets (never committed):
 *     KSPONCO_PARKING_KEY   (lowercase apiKey query param for parkingorsApi.do)
 *     SEOUL_CITYDATA_KEY    (Seoul Open Data Plaza key for citydata/올림픽공원)
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

async function fetchKspoParking(apiKey?: string): Promise<{ parking_sum: number | null; status: string }> {
  if (!apiKey) return { parking_sum: null, status: 'missing_secret' };
  // CRITICAL: KSPO&CO live endpoint requires lowercase `apiKey` (documented `ApiKey` returns HTTP 401!)
  const url = `https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=${encodeURIComponent(apiKey)}`;
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
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const raw = (await res.json()) as { CITYDATA?: Record<string, unknown> };
    const cd = raw?.CITYDATA;
    if (!cd) return null;

    const popArr = cd.LIVE_PPLTN_STTS as Array<Record<string, unknown>> | undefined;
    const pop = popArr?.[0];
    const wxArr = cd.WEATHER_STTS as Array<Record<string, unknown>> | undefined;
    const wx = wxArr?.[0];

    return {
      seoul_population: pop
        ? {
            congest_lvl: pop.AREA_CONGEST_LVL,
            congest_msg: pop.AREA_CONGEST_MSG,
            min: Number(pop.AREA_PPLTN_MIN),
            max: Number(pop.AREA_PPLTN_MAX),
            observed_at: pop.PPLTN_TIME,
            forecast_12h: pop.FCST_PPLTN ?? [],
          }
        : undefined,
      weather: wx
        ? {
            observed_at: wx.WEATHER_TIME,
            temp_c: Number(wx.TEMP),
            humidity_pct: Number(wx.HUMIDITY),
            wind_spd: Number(wx.WIND_SPD),
            precipitation_mm: wx.PRECIPITATION === '-' ? 0 : Number(wx.PRECIPITATION) || 0,
            pcp_msg: wx.PCP_MSG,
            pm25: Number(wx.PM25),
            pm10: Number(wx.PM10),
          }
        : undefined,
    };
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
          service: 'olpark-safepass-worker',
          checked_at: nowKstString(),
          kspo_parking_status: kspo.status,
          kspo_parking_sum: kspo.parking_sum,
          ok: true,
        }),
        { status: 200, headers }
      );
    }

    if (url.pathname !== '/api/live' && url.pathname !== '/api/parking') {
      return new Response(JSON.stringify({ error: 'Not Found', endpoints: ['/api/live', '/api/parking', '/api/health'] }), {
        status: 404,
        headers,
      });
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
    const [kspo, seoul] = await Promise.all([
      fetchKspoParking(env.KSPONCO_PARKING_KEY),
      url.pathname === '/api/live' ? fetchSeoulCityData(env.SEOUL_CITYDATA_KEY) : Promise.resolve(null),
    ]);

    // Fallback to static snapshot if all live upstreams unavailable
    let fallback: Record<string, unknown> | null = null;
    if (kspo.parking_sum === null && !seoul) {
      fallback = await fetchStaticFallback(env);
    }

    const payload: Record<string, unknown> = {
      ...(fallback || {}),
      updated_at: nowKstString(),
      source_mode: kspo.parking_sum !== null || seoul ? 'live-worker' : 'static-fallback',
      kspo_parking:
        kspo.parking_sum !== null
          ? {
              parking_sum: kspo.parking_sum,
              total_capacity: TOTAL_PARKING_CAPACITY,
              occupancy_pct: Math.round((kspo.parking_sum / TOTAL_PARKING_CAPACITY) * 1000) / 10,
              measured_at: nowKstString(),
              status: 'ok',
            }
          : (fallback?.kspo_parking ?? { status: kspo.status }),
      ...(seoul || {}),
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
