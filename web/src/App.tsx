import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  Activity,
  BarChart3,
  MapPin,
  Box,
  Database,
  ShieldCheck,
  Contrast,
  Type,
  Globe,
  RefreshCw,
} from 'lucide-react';
import type { AppBundle, FontScale, Lang, TabId } from './types/data';
import { BASELINE_BUNDLE } from './lib/baselineData';
import { loadAppBundle } from './lib/dataLoader';
import { UI_LABELS } from './lib/i18n';
import { LivePulseTab } from './components/tabs/LivePulseTab';
import { ForecastTab } from './components/tabs/ForecastTab';
import { SafeMapTab } from './components/tabs/SafeMapTab';
import { Venue3DTab } from './components/tabs/Venue3DTab';
import { OpenDataTab } from './components/tabs/OpenDataTab';

const TAB_ORDER: TabId[] = ['pulse', 'forecast', 'map', 'venue3d', 'opendata'];

const TAB_ICONS: Record<TabId, typeof Activity> = {
  pulse: Activity,
  forecast: BarChart3,
  map: MapPin,
  venue3d: Box,
  opendata: Database,
};

export function App() {
  const [bundle, setBundle] = useState<AppBundle>(BASELINE_BUNDLE);
  const [activeTab, setActiveTab] = useState<TabId>('pulse');
  const [lang, setLang] = useState<Lang>('ko');
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [fontScale, setFontScale] = useState<FontScale>('100');
  const [loading, setLoading] = useState<boolean>(false);

  const labels = UI_LABELS[lang];

  // Sync KWCAG accessibility attributes to <html>
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
    document.documentElement.dataset.fontScale = fontScale;
  }, [lang, highContrast, fontScale]);

  // Initial load of B1 data/models + optional live Worker overlay
  const refreshData = async () => {
    setLoading(true);
    try {
      const next = await loadAppBundle();
      setBundle(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
  }, []);

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (idx + 1) % TAB_ORDER.length;
      setActiveTab(TAB_ORDER[nextIdx]);
      document.getElementById(`tab-${TAB_ORDER[nextIdx]}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      setActiveTab(TAB_ORDER[prevIdx]);
      document.getElementById(`tab-${TAB_ORDER[prevIdx]}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveTab(TAB_ORDER[0]);
      document.getElementById(`tab-${TAB_ORDER[0]}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveTab(TAB_ORDER[TAB_ORDER.length - 1]);
      document.getElementById(`tab-${TAB_ORDER[TAB_ORDER.length - 1]}`)?.focus();
    }
  };

  const cycleFontScale = () => {
    setFontScale((prev) => (prev === '100' ? '115' : prev === '115' ? '130' : '100'));
  };

  const sourceLabel =
    bundle.live.sourceMode === 'live-worker'
      ? lang === 'ko'
        ? '실시간 Worker 연동'
        : 'Live Worker API'
      : bundle.live.sourceMode === 'static-snapshot'
        ? lang === 'ko'
          ? '실측 JSON 스냅샷 연동'
          : 'Verified JSON Snapshot'
        : lang === 'ko'
          ? '실측 검증 데이터셋'
          : 'Verified Empirical Dataset';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* KWCAG 2.2 Skip Navigation */}
      <a href="#main-content" className="skip-link">
        {labels.skipToMain}
      </a>

      {/* Top Accessibility & Utility Bar */}
      <div className="border-b border-slate-200 bg-[#091D3C] text-slate-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-[#0F766E] px-2 py-0.5 text-[11px] font-bold text-white">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              KWCAG 2.2 AA
            </span>
            <span className="hidden text-slate-200 sm:inline">{labels.contestBadge}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHighContrast((v) => !v)}
              aria-pressed={highContrast}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold transition ${
                highContrast
                  ? 'border-yellow-400 bg-yellow-400 text-black'
                  : 'border-white/30 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Contrast className="h-3.5 w-3.5" aria-hidden="true" />
              {labels.highContrast}
            </button>

            <button
              type="button"
              onClick={cycleFontScale}
              aria-label={`${labels.fontSize}: ${fontScale}%`}
              className="inline-flex items-center gap-1 rounded border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-white/20"
            >
              <Type className="h-3.5 w-3.5" aria-hidden="true" />
              {labels.fontSize} {fontScale}%
            </button>

            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'ko' ? 'en' : 'ko'))}
              aria-label={lang === 'ko' ? 'Switch language to English' : '한국어로 전환'}
              className="inline-flex items-center gap-1 rounded border border-teal-300/60 bg-[#0F766E] px-2.5 py-0.5 text-[11px] font-bold text-white transition hover:bg-[#115E59]"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              {labels.langToggle}
            </button>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="border-b border-slate-200 bg-white shadow-2xs">
        <div className="mx-auto max-w-7xl px-4 pt-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F2C59] text-white shadow-sm"
                aria-hidden="true"
              >
                <ShieldCheck className="h-6 w-6 text-teal-300" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-[#0F2C59] sm:text-2xl">
                  {labels.appTitle}
                  <span className="ml-2 text-xs font-bold text-[#0F766E] align-middle">
                    Olpark SafePass
                  </span>
                </h1>
                <p className="text-xs text-slate-600 sm:text-sm">{labels.appSubtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-[#0F766E]"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
                {sourceLabel}
              </span>
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={loading}
                aria-label={lang === 'ko' ? '실시간 데이터 새로고침' : 'Refresh live data'}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">{lang === 'ko' ? '갱신' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Primary Navigation Tablist */}
          <nav
            aria-label={lang === 'ko' ? '주요 서비스 메뉴' : 'Primary service navigation'}
            className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1"
          >
            <div role="tablist" aria-label={labels.appTitle} className="flex min-w-max gap-1.5">
              {TAB_ORDER.map((tabId, idx) => {
                const Icon = TAB_ICONS[tabId];
                const isSelected = activeTab === tabId;
                return (
                  <button
                    key={tabId}
                    id={`tab-${tabId}`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={`panel-${tabId}`}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setActiveTab(tabId)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={`inline-flex items-center gap-2 rounded-t-xl border-b-3 px-3.5 py-2.5 text-xs font-bold transition whitespace-nowrap sm:text-sm ${
                      isSelected
                        ? 'border-[#0F766E] bg-[#0F2C59] text-white'
                        : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-[#0F2C59]'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{labels.tabs[tabId].short}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none">
        <div
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'pulse' && (
            <LivePulseTab bundle={bundle} lang={lang} onNavigateTab={setActiveTab} />
          )}
          {activeTab === 'forecast' && <ForecastTab bundle={bundle} lang={lang} />}
          {activeTab === 'map' && <SafeMapTab bundle={bundle} lang={lang} />}
          {activeTab === 'venue3d' && <Venue3DTab bundle={bundle} lang={lang} />}
          {activeTab === 'opendata' && <OpenDataTab bundle={bundle} lang={lang} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-4 py-5 text-xs text-slate-600 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-slate-800">{labels.footerNotice}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {labels.footerZeroCost}
              {bundle.b1LoadedFiles.length > 0 && (
                <span> · Linked assets: {bundle.b1LoadedFiles.join(', ')}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] font-bold text-[#0F2C59]">
            <span className="rounded bg-slate-100 px-2 py-1">MIT License</span>
            <span className="rounded bg-teal-50 px-2 py-1 text-[#0F766E]">2026–2028 SLA ₩0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
