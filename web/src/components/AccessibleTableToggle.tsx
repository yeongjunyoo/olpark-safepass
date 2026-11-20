import { useState } from 'react';
import { Table2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Lang } from '../types/data';
import { UI_LABELS } from '../lib/i18n';

interface AccessibleTableToggleProps {
  lang: Lang;
  caption: string;
  headers: string[];
  rows: (string | number)[][];
  defaultOpen?: boolean;
}

export function AccessibleTableToggle({
  lang,
  caption,
  headers,
  rows,
  defaultOpen = false,
}: AccessibleTableToggleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const labels = UI_LABELS[lang];

  return (
    <div className="mt-3 border-t border-slate-200 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
      >
        <Table2 className="h-3.5 w-3.5 text-[#0F2C59]" aria-hidden="true" />
        <span>{open ? labels.hideDataTable : labels.showDataTable}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="mt-2.5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <caption className="bg-slate-100 px-3 py-1.5 text-left font-semibold text-slate-700">
              {caption}
            </caption>
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  {r.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 whitespace-nowrap text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
