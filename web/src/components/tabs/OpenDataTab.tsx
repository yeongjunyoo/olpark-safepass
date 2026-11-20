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
import { pickText, tr } from '../../lib/i18n';

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
  triggerDownload(p.filename, '\uFEFF' + [header, ...lines].join('\r\n'), 'text/csv;charset=utf-8');
}

function downloadProposalJson(p: OpenDataProposalSchema) {
  const payload = {
    schema_id: p.id,
    target_dataset: p.targetDataset,
    title_ko: p.titleKo,
    title_en: p.titleEn,
    title_ja: p.titleJa,
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
      <section aria-labelledby="provenance-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="provenance-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Database className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {tr(
                lang,
                '공공데이터 융합 출처 · 실시간 상태 투명성 대시보드 (KSPO&CO + 3개 타 기관)',
                'Integrated Public Data Provenance & Live Health Matrix',
                '公共データ融合ソース・リアルタイム稼働透明性ダッシュボード'
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(
                lang,
                'KSPO&CO 핵심 개방 데이터 7종과 서울열린데이터광장·기상청 API를 결합하며, culture.go.kr 점검(11/19~22) 시에도 정적 스냅샷 Fallback으로 중단 없이 동작합니다.',
                'Combines 7 core KSPO&CO datasets with Seoul CityData, Seoul Subway, and KMA Weather with automated failover during culture.go.kr maintenance.',
                'KSPO&CO主要公共データ7種とソウル市都市データ・地下鉄・気象庁APIを融合し、外部メンテナンス時も静的スナップショットへ自動切替します。'
              )}
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
                <th scope="col" className="px-3 py-2.5 font-bold">{tr(lang, '제공기관 · 데이터명', 'Agency & Dataset', '提供機関・データ名')}</th>
                <th scope="col" className="px-3 py-2.5 font-bold">{tr(lang, '규모 · 주기', 'Volume & Refresh', '規模・更新周期')}</th>
                <th scope="col" className="px-3 py-2.5 font-bold">{tr(lang, '서비스 활용 역할', 'Role in SafePass', 'サービスでの活用役割')}</th>
                <th scope="col" className="px-3 py-2.5 font-bold text-center">{tr(lang, '상태', 'Status', '状態')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bundle.provenance.map((p) => {
                const badge =
                  p.status === 'live'
                    ? { ko: 'LIVE 정상', en: 'LIVE OK', ja: 'LIVE 正常', cls: 'bg-emerald-100 text-emerald-900' }
                    : p.status === 'static-verified'
                      ? { ko: '실물 검증', en: 'VERIFIED', ja: '実測検証済', cls: 'bg-blue-100 text-blue-900' }
                      : { ko: '점검 Fallback', en: 'MAINT FALLBACK', ja: '保守フォールバック', cls: 'bg-amber-100 text-amber-950' };

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
                        {pickText(lang, p.nameKo, p.nameEn, p.nameJa)}
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                      <div className="text-[11px] text-slate-500">
                        {pickText(lang, p.agencyKo, p.agencyEn, p.agencyJa)} · {p.format}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      <div className="font-semibold">{p.records}</div>
                      <div className="text-[11px] text-slate-500">
                        {pickText(lang, p.refreshCycleKo, p.refreshCycleEn, p.refreshCycleJa)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {pickText(lang, p.usageKo, p.usageEn, p.usageJa)}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {tr(lang, badge.ko, badge.en, badge.ja)}
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
      <section aria-labelledby="audit-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="audit-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
          <ShieldAlert className="h-5 w-5 text-red-700" aria-hidden="true" />
          {tr(
            lang,
            '실물 전수감사(58종) 적발: KSPO&CO 공공데이터 6대 품질 결함 & 정제 증빙',
            'Empirical Full-Catalog Audit (58 Datasets): 6 Detected Quality Defects & Fixes',
            '全件実物監査（58種）：KSPO&CO公共データ6大品質課題と改善エビデンス'
          )}
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {tr(
            lang,
            '행안부 공공데이터 품질인증 최우수(2년 연속) 기관의 차년도 품질 고도화를 위해 실제 CSV/API 전수 검증에서 적발한 6대 결함을 원문 증거와 함께 보고합니다.',
            'Actionable engineering audit of all 58 KSPO&CO datasets with row-level proof to strengthen next-year public data quality certification.',
            '全58種のCSV/API実測監査から検出した6つの品質課題を、原文エビデンスと正規化スキーマ案とともに提示します。'
          )}
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
                  {pickText(lang, d.titleKo, d.titleEn, d.titleJa)}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">
                  {pickText(lang, d.evidenceKo, d.evidenceEn, d.evidenceJa)}
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

      {/* 3. 5 PROPOSED OPEN DATA SCHEMAS */}
      <section
        aria-labelledby="proposals-heading"
        className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50/50 to-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="proposals-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Download className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {tr(
                lang,
                '향후 추가 개방 제안 표준 스키마 5종 (원클릭 CSV · JSON 다운로드)',
                '5 Proposed New Open Data Standard Schemas (1-Click CSV / JSON Download)',
                '追加開放提案 標準スキーマ5種（ワンクリックCSV・JSONダウンロード）'
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(
                lang,
                '상세기획서 5장 추가 개방 의견과 1:1 연동되는 실무형 표준 스키마 5종입니다. 클릭 즉시 UTF-8 CSV 또는 JSON 샘플을 내려받을 수 있습니다.',
                'Production-ready standard schemas corresponding 1:1 to Section 5 of the competition proposal. Click to download UTF-8 CSV or JSON.',
                '詳細企画書の追加開放提案と1:1で連動する実務標準スキーマ5種です。クリックでUTF-8 CSVまたはJSONサンプルを取得できます。'
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {bundle.proposals.map((p) => (
            <article key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <div className="text-[11px] font-bold text-[#0F766E]">{p.targetDataset}</div>
                  <h3 className="mt-0.5 text-sm font-bold text-[#0F2C59]">
                    {pickText(lang, p.titleKo, p.titleEn, p.titleJa)}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    {pickText(lang, p.rationaleKo, p.rationaleEn, p.rationaleJa)}
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

      {/* 4. 2026.12~2028.12 (25 MONTHS) ZERO-COST TARGET ARCHITECTURE */}
      <section aria-labelledby="sla-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="sla-heading" className="flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Server className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {tr(
                lang,
                '2026.12~2028.12 (총 25개월) 인프라 비용 0원 목표 자동화 아키텍처',
                'Dec 2026–Dec 2028 (25 Months) $0 Infrastructure Cost Target Architecture',
                '2026年12月〜2028年12月（計25か月）インフラ費0円目標 自動運用アーキテクチャ'
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {tr(
                lang,
                '참가 서약서 6호(2028년 서비스 운영 협조 및 원천소스 제공) 이행을 위해 무료 티어(Cloudflare Pages/Workers + GitHub Actions 일 4회 갱신) 기반 인프라 비용 0원 목표 · 목표 가동률 99%+ 구조로 설계했습니다.',
                'Built on free-tier serverless infrastructure (Cloudflare Pages/Workers + 4x daily GitHub Actions sync) targeting $0 infrastructure cost and 99%+ uptime through Dec 2028 (25 months).',
                '2028年末までの継続運用とMITソース提供を前提に、Cloudflare Pages/Workers＋GitHub Actions（1日4回更新）でインフラ費0円目標・目標稼働率99%+の構成を実運用しています。'
              )}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
            {tr(lang, '인프라 비용 0원 목표 · 목표 가동률 99%+', '$0 Infra Target · 99%+ Uptime Target', 'インフラ費0円目標・目標稼働率99%+')}
          </span>
        </div>

        {/* SVG Architecture Diagram */}
        <div
          role="region"
          aria-label={tr(
            lang,
            '2026.12~2028.12 인프라 비용 0원 목표 아키텍처 도식',
            'Dec 2026–Dec 2028 Zero-Cost Target Architecture Diagram',
            '2026.12〜2028.12 インフラ費0円目標アーキテクチャ構成図'
          )}
          className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <svg
            viewBox="0 0 820 195"
            className="min-w-[680px] w-full"
            role="img"
            aria-label={tr(
              lang,
              '25개월 인프라 비용 0원 목표 아키텍처 구성도',
              '25-Month $0 Infrastructure Cost Target Architecture',
              '25か月インフラ費0円目標アーキテクチャ構成図'
            )}
          >
            <rect x="10" y="25" width="185" height="140" rx="12" fill="#FFFFFF" stroke="#0F2C59" strokeWidth="2" />
            <text x="102" y="50" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0F2C59">
              {tr(lang, '공공데이터 원천 (무료)', 'Public Data APIs', '公共データAPI（無料）')}
            </text>
            <text x="102" y="75" textAnchor="middle" fontSize="10.5" fill="#334155">• KSPO&amp;CO parkingorsApi</text>
            <text x="102" y="96" textAnchor="middle" fontSize="10.5" fill="#334155">• Seoul Live CityData</text>
            <text x="102" y="117" textAnchor="middle" fontSize="10.5" fill="#334155">• KMA Songpa (62,126)</text>
            <text x="102" y="138" textAnchor="middle" fontSize="10.5" fill="#334155">• 15127487 5-Venue Draco GLB</text>

            <path d="M195 75 L245 75" stroke="#0F766E" strokeWidth="2.5" />
            <path d="M195 130 L245 130" stroke="#0F2C59" strokeWidth="2" strokeDasharray="4 3" />

            <rect x="248" y="18" width="210" height="78" rx="12" fill="#CCFBF1" stroke="#0F766E" strokeWidth="2" />
            <text x="353" y="42" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0F2C59">
              Cloudflare Workers (₩0)
            </text>
            <text x="353" y="61" textAnchor="middle" fontSize="10" fill="#115E59">
              {tr(lang, '일 10만 요청 무료 · 5분 엣지 캐시', '100k req/day free · 5-min Edge Cache', '1日10万req無料・5分エッジキャッシュ')}
            </text>
            <text x="353" y="79" textAnchor="middle" fontSize="10" fill="#115E59">
              {tr(lang, 'Secret 키 은닉 · 장애 시 정적 폴백', 'Env Secrets · Auto Static Fallback', '鍵秘匿・障害時静的フォールバック')}
            </text>

            <rect x="248" y="108" width="210" height="72" rx="12" fill="#EFF6FF" stroke="#1D4ED8" strokeWidth="2" />
            <text x="353" y="131" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1E3A8A">
              GitHub Actions Cron (₩0)
            </text>
            <text x="353" y="150" textAnchor="middle" fontSize="10" fill="#1E40AF">
              {tr(lang, '일 4회 (06/12/18/00시 KST) 자동 갱신', '4x Daily (06/12/18/00 KST) Auto Sync', '1日4回（06/12/18/00 KST）自動更新')}
            </text>
            <text x="353" y="167" textAnchor="middle" fontSize="10" fill="#1E40AF">
              {tr(lang, '스냅샷 커밋 + Pages 자동 미러 배포', 'Snapshot Commit + Auto Mirror Deploy', 'スナップショット保存＋自動ミラー配備')}
            </text>

            <path d="M458 57 L515 80" stroke="#0F766E" strokeWidth="2.5" />
            <path d="M458 144 L515 115" stroke="#1D4ED8" strokeWidth="2.5" />

            <rect x="518" y="25" width="290" height="145" rx="12" fill="#0F2C59" />
            <text x="663" y="52" textAnchor="middle" fontSize="13" fontWeight="800" fill="#FFFFFF">
              CF Pages · GitHub Pages (₩0)
            </text>
            <text x="663" y="75" textAnchor="middle" fontSize="10.5" fill="#99F6E4">
              {tr(lang, 'olpark-safepass.pages.dev · 무제한 CDN', 'olpark-safepass.pages.dev · Unlimited CDN', 'olpark-safepass.pages.dev · 無制限CDN')}
            </text>
            <text x="663" y="99" textAnchor="middle" fontSize="10.5" fill="#E2E8F0">
              {tr(lang, '• ML 추론 & 5개관 Draco 3D 브라우저 실행', '• 100% Client-Side ML & 5-Venue Draco 3D', '• ブラウザ完結ML推論＆5会場Draco 3D')}
            </text>
            <text x="663" y="121" textAnchor="middle" fontSize="10.5" fill="#E2E8F0">
              {tr(lang, '• KWCAG 2.2 AA + KO/EN/JA + MIT 이관', '• KWCAG 2.2 AA + KO/EN/JA + MIT Source', '• KWCAG 2.2 AA + 日韓英3言語 + MIT')}
            </text>
            <text x="663" y="146" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FDE047">
              {tr(lang, '총 25개월 (2026.12~2028.12) 목표 가동률 99%+', '25 Months (2026.12–2028.12) · 99%+ Target', '計25か月（2026.12〜2028.12）目標稼働率99%+')}
            </text>
          </svg>
        </div>

        {/* Cost & Target Cards */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Server,
              titleKo: '정적 호스팅 (CF Pages + GH Pages)',
              titleEn: 'CF Pages + GH Pages Mirror',
              titleJa: '静的ホスティング（CF/GH Pages）',
              cost: tr(lang, '인프라 ₩0 목표', '$0 Infra Target', 'インフラ0円目標'),
              detailKo: 'Cloudflare Pages 무제한 대역폭 + GitHub Pages 미러 이중화 · Draco 3D 10.1MB 경량화',
              detailEn: 'Cloudflare Pages unlimited bandwidth + GitHub Pages mirror · 10.1MB Draco 3D assets',
              detailJa: 'Cloudflare Pages無制限帯域＋GitHub Pagesミラー冗長化・Draco 3D計10.1MB軽量化',
            },
            {
              icon: Cpu,
              titleKo: '실시간 프록시 (CF Workers 실가동)',
              titleEn: 'Cloudflare Workers (Live)',
              titleJa: 'リアルタイムプロキシ（稼働中）',
              cost: tr(lang, '5분 엣지 캐시', '5m Edge Cache', '5分エッジキャッシュ'),
              detailKo: '일 100,000요청 무료 티어 · KSPO 주차·서울 도시데이터·송파 공영주차 실시간 통합',
              detailEn: '100k req/day free tier · Live KSPO parking, Seoul CityData & Songpa overflow lots',
              detailJa: '1日10万リクエスト無料枠・KSPO駐車・ソウル都市データ・松坡公営をリアルタイム統合',
            },
            {
              icon: CheckCircle2,
              titleKo: '자동 갱신 (GitHub Actions)',
              titleEn: 'GitHub Actions Cron',
              titleJa: '自動更新（GitHub Actions）',
              cost: tr(lang, '일 4회 자동', '4x Daily Auto', '1日4回自動'),
              detailKo: '매일 06/12/18/00시 KST(일 4회) 스냅샷 갱신 · 총 25개월(2026.12~2028.12) 무인 운영',
              detailEn: 'Refreshes at 06/12/18/00 KST (4x daily) across 25 months (Dec 2026–Dec 2028)',
              detailJa: '毎日06/12/18/00時KST（1日4回）自動更新・計25か月（2026.12〜2028.12）無人運用',
            },
            {
              icon: AlertTriangle,
              titleKo: '장애 폴백 & 기관 이관',
              titleEn: 'Failover & MIT Handover',
              titleJa: '障害フォールバック・MIT移管',
              cost: tr(lang, '목표 가동률 99%+', '99%+ Target', '目標稼働率99%+'),
              detailKo: '외부 API 502 장애 시 정적 스냅샷 즉시 전환 + MIT 원천소스 기관 이관 대응',
              detailEn: 'Instant static snapshot failover on upstream 502 + MIT open-source repository',
              detailJa: '外部API 502障害時に静的スナップショットへ自動切替＋MITオープンソース提供',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.titleKo} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-extrabold text-emerald-900">
                    {item.cost}
                  </span>
                </div>
                <div className="mt-2 text-xs font-bold text-[#0F2C59]">
                  {tr(lang, item.titleKo, item.titleEn, item.titleJa)}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  {tr(lang, item.detailKo, item.detailEn, item.detailJa)}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
