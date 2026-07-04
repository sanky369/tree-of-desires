"use client";

import { nodeById, type TraceResult } from "@/lib/desires";

interface Props {
  idea: string;
  result: TraceResult;
  onClose: () => void;
}

const SCORE_LABELS: Array<{ key: keyof TraceResult["scores"]; label: string }> = [
  { key: "rootDepth", label: "Root depth" },
  { key: "directness", label: "Directness" },
  { key: "rootStrength", label: "Root strength" },
  { key: "frequency", label: "Frequency" },
];

function scoreColor(total: number): string {
  if (total >= 70) return "text-emerald-300";
  if (total >= 45) return "text-amber-300";
  return "text-rose-400";
}

export default function AnalysisPanel({ idea, result, onClose }: Props) {
  const crumbs = [
    ...(result.newBehaviorLabel ? [result.newBehaviorLabel] : []),
    ...result.path.map((id) => nodeById.get(id)?.label ?? id),
  ];

  return (
    <aside className="pointer-events-auto flex h-full w-[min(380px,90vw)] animate-[slidein_.35s_ease] flex-col gap-5 overflow-y-auto border-l border-white/10 bg-[#0a0f17]/95 p-6 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Idea</p>
          <p className="mt-1 text-sm leading-snug text-slate-200">{idea}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {!result.reachedRoot && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">
            ⚠ No root desire anchor
          </p>
          <p className="mt-1 text-xs leading-relaxed text-rose-200/80">
            The trace never reached a primal desire. Ideas without a root anchor tend to be
            vitamins, not painkillers — consider reframing the problem.
          </p>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Traced path</p>
        {crumbs.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs">
            {crumbs.map((label, i) => (
              <span key={`${label}-${i}`} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full border px-2.5 py-1 ${
                    i === crumbs.length - 1 && result.reachedRoot
                      ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                >
                  {label}
                </span>
                {i < crumbs.length - 1 && <span className="text-slate-600">→</span>}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">No traceable path was found.</p>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Verdict</p>
        <p className="mt-1 text-sm font-medium leading-snug text-slate-100">{result.verdict}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{result.rationale}</p>
      </div>

      <div className="flex items-center gap-5">
        <div>
          <p className={`text-5xl font-bold tabular-nums ${scoreColor(result.totalScore)}`}>
            {result.totalScore}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">/ 100</p>
        </div>
        <div className="flex-1 space-y-2.5">
          {SCORE_LABELS.map(({ key, label }) => (
            <div key={key}>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{label}</span>
                <span className="tabular-nums">{result.scores[key]}/25</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-700"
                  style={{ width: `${(result.scores[key] / 25) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
