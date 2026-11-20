import {
  Database,
  ShieldAlert,
  Download,
  FileJson,
  FileSpreadsheet,
  Server,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Clock,
  Cpu,
} from 'lucide-react';
import type { AppBundle, Lang, OpenDataProposalSchema } from '../../types/data';

interface OpenDataTabProps {
  bundle: AppBundle;
  lang: Lang;
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadProposalCsv(p: OpenDataProposalSchema) {
  const header = p.columns.join(',');
  const lines = p.sampleRows.map((row) =>
    p.columns
      .map((col) => {
        const val = String(row[col] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      })
      .join(',')
  );
  // UTF-8 BOM for seamless Korean Excel opening
  triggerDownload(p.filename, '\uFEFF' + [header, ...lines].join('\r\n'), 'text/csv;charset=utf-8');
}

function downloadProposalJson(p: OpenDataProposalSchema) {
  const payload = {
    schema_id: p.id,
    target_dataset: p.targetDataset,
    title_ko: p.titleKo,
    title_en: p.titleEn,
    columns: p.columns,
    sample_records: p.sampleRows,
    license: 'MIT / KOGL Type 1 Compatible',
    proposed_by: 'Olpark SafePass (2026 KSPO&CO Open Data Contest)',
  };
  triggerDownload(
    p.filename.replace(/\.csv$/, '.json'),
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8'
  );
}

export function OpenDataTab({ bundle, lang }: OpenDataTabProps) {
  return (
    <div className="space-y-6">
      {/* 1. INTEGRATED PUBLIC DATA PROVENANCE MATRIX */}
      <section
        aria-labelledby="provenance-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="provenance-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Database className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {lang === 'ko'
                ? '공공데이터 융합 출처 · 실시간 상태 투명성 대시보드 (KSPO&CO + 3개 타 기관)'
                : 'Integrated Public Data Provenance & Live Health Matrix'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {lang === 'ko'
                ? 'KSPO&CO 핵심 개방 데이터 7종과 서울열린데이터광장·기상청 API를 결합하며, culture.go.kr 점검(11/19~22) 시에도 정적 스냅샷 Fallback으로 무중단 동작합니다.'
                : 'Combines 7 core KSPO&CO datasets with Seoul CityData, Seoul Subway, and KMA Weather with automated failover during culture.go.kr maintenance.'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-[#0F766E]">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {bundle.live.updatedAt}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-bold">ID</th>
                <th scope="col" className="px-3 py-2.5 font-bold">{lang === 'ko' ? '제공기관 · 데이터명' : 'Agency & Dataset'}</th>
                <th scope="col" className="px-3 py-2.5 font-bold">{lang === 'ko' ? '규모 · 주기' : 'Volume & Refresh'}</th>
                <th scope="col" className="px-3 py-2.5 font-bold">{lang === 'ko' ? '서비스 활용 역할' : 'Role in SafePass'}</th>
                <th scope="col" className="px-3 py-2.5 font-bold text-center">{lang === 'ko' ? '상태' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bundle.provenance.map((p) => {
                const badge =
                  p.status === 'live'
                    ? { ko: 'LIVE 정상', en: 'LIVE OK', cls: 'bg-emerald-100 text-emerald-900' }
                    : p.status === 'static-verified'
                      ? { ko: '실물 검증', en: 'VERIFIED', cls: 'bg-blue-100 text-blue-900' }
                      : { ko: '점검 Fallback', en: 'MAINT FALLBACK', cls: 'bg-amber-100 text-amber-950' };

                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-[#0F2C59] whitespace-nowrap">{p.id}</td>
                    <td className="px-3 py-2.5">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-slate-900 hover:text-[#0F2C59] hover:underline"
                      >
                        {lang === 'ko' ? p.nameKo : p.nameEn}
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                      <div className="text-[11px] text-slate-500">
                        {lang === 'ko' ? p.agencyKo : p.agencyEn} · {p.format}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      <div className="font-semibold">{p.records}</div>
                      <div className="text-[11px] text-slate-500">
                        {lang === 'ko' ? p.refreshCycleKo : p.refreshCycleEn}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {lang === 'ko' ? p.usageKo : p.usageEn}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {lang === 'ko' ? badge.ko : badge.en}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. 6 EMPIRICAL DATA QUALITY AUDIT DEFECTS */}
      <section
        aria-labelledby="audit-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 id="audit-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
          <ShieldAlert className="h-5 w-5 text-red-700" aria-hidden="true" />
          {lang === 'ko'
            ? '실물 전수감사(58종) 적발: KSPO&CO 공공데이터 6대 품질 결함 & 정제 증빙'
            : 'Empirical Full-Catalog Audit (58 Datasets): 6 Detected Quality Defects & Fixes'}
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {lang === 'ko'
            ? '행안부 공공데이터 품질인증 최우수(2년 연속) 기관의 차년도 품질 고도화를 위해 실제 CSV/API 전수 검증에서 적발한 6대 결함을 원문 증거와 함께 보고합니다.'
            : 'Actionable engineering audit of all 58 KSPO&CO datasets with row-level proof to strengthen next-year public data quality certification.'}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {bundle.auditDefects.map((d) => (
            <article
              key={d.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0F2C59]">
                    #{d.id} · {d.datasetId}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                      d.severity === 'critical'
                        ? 'bg-red-100 text-red-900'
                        : d.severity === 'high'
                          ? 'bg-amber-100 text-amber-950'
                          : 'bg-blue-100 text-blue-900'
                    }`}
                  >
                    {d.severity}
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm font-bold text-slate-900">
                  {lang === 'ko' ? d.titleKo : d.titleEn}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">
                  {lang === 'ko' ? d.evidenceKo : d.evidenceEn}
                </p>
              </div>

              <div className="mt-3 space-y-1.5 font-mono text-[11px]">
                <div className="overflow-x-auto rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1.5 text-red-950">
                  <span className="mr-1.5 font-bold text-red-700">BEFORE:</span>
                  {d.beforeSample}
                </div>
                <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5 text-emerald-950">
                  <span className="mr-1.5 font-bold text-emerald-800">AFTER:</span>
                  {d.afterFixSample}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 3. 5 PROPOSED OPEN DATA SCHEMAS (ONE-CLICK CSV/JSON DOWNLOAD) */}
      <section
        aria-labelledby="proposals-heading"
        className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50/50 to-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="proposals-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Download className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {lang === 'ko'
                ? '향후 추가 개방 제안 표준 스키마 5종 (원클릭 CSV · JSON 다운로드)'
                : '5 Proposed New Open Data Standard Schemas (1-Click CSV / JSON Download)'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {lang === 'ko'
                ? '상세기획서 5장 추가 개방 의견과 1:1 연동되는 실무형 표준 스키마 5종입니다. 클릭 즉시 UTF-8 CSV 또는 JSON 샘플을 내려받을 수 있습니다.'
                : 'Production-ready standard schemas corresponding 1:1 to Section 5 of the competition proposal. Click to download UTF-8 CSV or JSON.'}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {bundle.proposals.map((p) => (
            <article
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <div className="text-[11px] font-bold text-[#0F766E]">{p.targetDataset}</div>
                  <h3 className="mt-0.5 text-sm font-bold text-[#0F2C59]">
                    {lang === 'ko' ? p.titleKo : p.titleEn}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    {lang === 'ko' ? p.rationaleKo : p.rationaleEn}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.columns.map((col) => (
                      <span
                        key={col}
                        className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadProposalCsv(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2C59] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#173E7A]"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadProposalJson(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F766E] bg-white px-3 py-2 text-xs font-bold text-[#0F766E] transition hover:bg-teal-50"
                  >
                    <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
                    JSON
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 4. 2028 ZERO-COST ARCHITECTURE & UNINTERRUPTED SLA */}
      <section
        aria-labelledby="sla-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="sla-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Server className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {lang === 'ko'
                ? '2028년 12월까지 운영비 0원 무중단 자동화 아키텍처 & SLA (24개월)'
                : 'Zero-Cost Uninterrupted Architecture & 24-Month SLA Through Dec 2028'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {lang === 'ko'
                ? '참가 서약서 6호(2028년 서비스 운영 협조 및 원천소스 제공)를 완벽 이행하기 위해 유료 서버·DB를 0% 배제한 영구 무료 클라우드 아키텍처를 설계했습니다.'
                : '100% serverless, zero-paid-DB architecture honoring Contest Pledge #6 (continuous operation through 2028 + MIT source handover).'}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
            {lang === 'ko' ? '월 운영비 ₩0 확정' : '$0 / Month Verified'}
          </span>
        </div>

        {/* SVG Architecture Diagram */}
        <div
          role="region"
          aria-label={lang === 'ko' ? '2028년 운영비 0원 아키텍처 도식' : '2028 Zero-Cost Architecture Diagram'}
          className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <svg viewBox="0 0 820 195" className="min-w-[680px] w-full" role="img" aria-label="2028 Zero-Cost SLA Architecture">
            {/* Box 1: Public APIs */}
            <rect x="10" y="25" width="185" height="140" rx="12" fill="#FFFFFF" stroke="#0F2C59" strokeWidth="2" />
            <text x="102" y="50" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0F2C59">
              {lang === 'ko' ? '공공데이터 원천 (무료)' : 'Public Data APIs'}
            </text>
            <text x="102" y="75" textAnchor="middle" fontSize="10.5" fill="#334155">• KSPO&CO parkingorsApi</text>
            <text x="102" y="96" textAnchor="middle" fontSize="10.5" fill="#334155">• Seoul Live CityData</text>
            <text x="102" y="117" textAnchor="middle" fontSize="10.5" fill="#334155">• KMA Songpa (62,126)</text>
            <text x="102" y="138" textAnchor="middle" fontSize="10.5" fill="#334155">• 15127487 GLB / CSV</text>

            {/* Arrow 1 */}
            <path d="M195 75 L245 75" stroke="#0F766E" strokeWidth="2.5" markerEnd="url(#arr)" />
            <path d="M195 130 L245 130" stroke="#0F2C59" strokeWidth="2" strokeDasharray="4 3" />

            {/* Box 2: Cloudflare Worker */}
            <rect x="248" y="18" width="210" height="78" rx="12" fill="#CCFBF1" stroke="#0F766E" strokeWidth="2" />
            <text x="353" y="42" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0F2C59">
              Cloudflare Workers (₩0)
            </text>
            <text x="353" y="61" textAnchor="middle" fontSize="10" fill="#115E59">
              {lang === 'ko' ? '일 10만 요청 무료 · 5분 엣지 캐시' : '100k req/day free · 5-min Edge Cache'}
            </text>
            <text x="353" y="79" textAnchor="middle" fontSize="10" fill="#115E59">
              {lang === 'ko' ? 'Secret 키 은닉 · 장애 시 정적 폴백' : 'Env Secrets · Auto Static Fallback'}
            </text>

            {/* Box 3: GitHub Actions */}
            <rect x="248" y="108" width="210" height="72" rx="12" fill="#EFF6FF" stroke="#1D4ED8" strokeWidth="2" />
            <text x="353" y="131" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1E3A8A">
              GitHub Actions Cron (₩0)
            </text>
            <text x="353" y="150" textAnchor="middle" fontSize="10" fill="#1E40AF">
              {lang === 'ko' ? '매일 06/12/18시 KST 자동 갱신' : 'Daily 06/12/18 KST Auto Refresh'}
            </text>
            <text x="353" y="167" textAnchor="middle" fontSize="10" fill="#1E40AF">
              {lang === 'ko' ? '스냅샷 커밋 + 3회 실패 시 Issue 경보' : 'Snapshot Commit + Issue Health Alert'}
            </text>

            {/* Arrow 2 */}
            <path d="M458 57 L515 80" stroke="#0F766E" strokeWidth="2.5" />
            <path d="M458 144 L515 115" stroke="#1D4ED8" strokeWidth="2.5" />

            {/* Box 4: GitHub Pages / Cloudflare Pages + Browser Client */}
            <rect x="518" y="25" width="290" height="145" rx="12" fill="#0F2C59" />
            <text x="663" y="52" textAnchor="middle" fontSize="13" fontWeight="800" fill="#FFFFFF">
              GitHub Pages · CF Pages PWA (₩0)
            </text>
            <text x="663" y="75" textAnchor="middle" fontSize="10.5" fill="#99F6E4">
              {lang === 'ko' ? '글로벌 CDN · HTTPS 기본 · 0원 영구 배포' : 'Global CDN · Free HTTPS · Zero-Cost Deploy'}
            </text>
            <text x="663" y="99" textAnchor="middle" fontSize="10.5" fill="#E2E8F0">
              {lang === 'ko' ? '• ML 추론 & 3D WebGL 100% 브라우저 실행' : '• 100% Client-Side ML & Three.js WebGL'}
            </text>
            <text x="663" y="121" textAnchor="middle" fontSize="10.5" fill="#E2E8F0">
              {lang === 'ko' ? '• KWCAG 2.2 AA + MIT 원천소스 기관 이관' : '• KWCAG 2.2 AA + MIT Source Handover'}
            </text>
            <text x="663" y="146" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FDE047">
              {lang === 'ko' ? '2026.12 ~ 2028.12 가동률 99.9%+' : '2026.12 – 2028.12 Uptime 99.9%+'}
            </text>
          </svg>
        </div>

        {/* Cost & SLA Table */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Server,
              titleKo: '정적 호스팅 (GitHub / CF Pages)',
              titleEn: 'GitHub / CF Pages CDN',
              cost: '₩0 / 월',
              detailKo: '무료 HTTPS · 자동 빌드·배포 · 기관 저장소 이관 즉시 가능',
              detailEn: 'Free HTTPS · Auto CI/CD · Instant org repo handover',
            },
            {
              icon: Cpu,
              titleKo: '실시간 프록시 (CF Workers)',
              titleEn: 'Cloudflare Workers API',
              cost: '₩0 / 월',
              detailKo: '일 100,000요청 무료 · 5분 캐시 적용 시 실사용 < 1%',
              detailEn: '100k req/day free · <1% quota with 5m cache',
            },
            {
              icon: CheckCircle2,
              titleKo: '자동 갱신 (GitHub Actions)',
              titleEn: 'GitHub Actions Automation',
              cost: '₩0 / 월',
              detailKo: 'Public Repo 무제한 실행 · 일 3회 스냅샷 & 헬스체크',
              detailEn: 'Unlimited public repo minutes · 3x daily refresh',
            },
            {
              icon: AlertTriangle,
              titleKo: '장애 자가복구 & 기관 이관',
              titleEn: 'Auto Failover & MIT Handover',
              cost: 'SLA 99.9%',
              detailKo: 'culture.go.kr 502 시 정적 스냅샷 즉시 전환 + MIT 이관',
              detailEn: 'Instant static failover on 502 + full MIT repo',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.titleKo} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-extrabold text-emerald-900">
                    {item.cost}
                  </span>
                </div>
                <div className="mt-2 text-xs font-bold text-[#0F2C59]">
                  {lang === 'ko' ? item.titleKo : item.titleEn}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  {lang === 'ko' ? item.detailKo : item.detailEn}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
