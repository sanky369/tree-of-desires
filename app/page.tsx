"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import PromptBar from "@/components/PromptBar";
import AnalysisPanel from "@/components/AnalysisPanel";
import type { GraphHighlight } from "@/components/DesireGraph";
import type { TraceResult } from "@/lib/desires";

// three.js must never render on the server.
const DesireGraph = dynamic(() => import("@/components/DesireGraph"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-emerald-200/40">
      Growing the tree…
    </div>
  ),
});

/** A single stylised frond: a stem with mirrored tapering leaflets. */
function Frond({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <g fill="#03130b">
        <path d="M100 200 C96 130 96 70 100 10 C104 70 104 130 100 200Z" />
        {Array.from({ length: 7 }, (_, i) => {
          const y = 25 + i * 24;
          const len = 78 - i * 8;
          return (
            <g key={i}>
              <path d={`M100 ${y + 12} Q${100 - len * 0.6} ${y - 6} ${100 - len} ${y - 22} Q${100 - len * 0.45} ${y + 8} 100 ${y + 16}Z`} />
              <path d={`M100 ${y + 12} Q${100 + len * 0.6} ${y - 6} ${100 + len} ${y - 22} Q${100 + len * 0.45} ${y + 8} 100 ${y + 16}Z`} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** Jungle dressing above the canvas: corner foliage silhouettes + vignette. */
function JungleFrame() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      <Frond className="absolute -left-16 -top-20 h-[380px] w-[380px] -rotate-[38deg] opacity-90 blur-[2px]" />
      <Frond className="absolute -left-24 top-16 h-[300px] w-[300px] -rotate-[74deg] opacity-70 blur-[3px]" />
      <Frond className="absolute -right-20 -bottom-24 h-[420px] w-[420px] rotate-[142deg] opacity-90 blur-[2px]" />
      <Frond className="absolute -right-28 bottom-10 h-[300px] w-[300px] rotate-[108deg] opacity-70 blur-[3px]" />
      <Frond className="absolute -top-24 right-24 h-[280px] w-[280px] rotate-[172deg] opacity-60 blur-[3px]" />
      {/* Vignette: clear center, deepening jungle darkness at the edges. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 58% at 50% 46%, transparent 55%, rgba(2,10,6,0.62) 100%)",
        }}
      />
    </div>
  );
}

export default function Home() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const highlight = useMemo<GraphHighlight | null>(
    () =>
      result
        ? {
            path: result.path,
            tempLabel: result.matchedBehaviorId ? null : result.newBehaviorLabel,
          }
        : null,
    [result],
  );

  async function trace(nextIdea: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: nextIdea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setIdea(nextIdea);
      setResult(data as TraceResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setIdea("");
    setError(null);
  }

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#04120b] text-slate-100">
      <DesireGraph highlight={highlight} />
      <JungleFrame />

      {/* Top overlay: title + prompt bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-3 pt-5">
        <h1 className="text-xs font-semibold uppercase tracking-[0.45em] text-emerald-100/50">
          Tree <span className="text-amber-300">of</span> Desires
        </h1>
        <PromptBar loading={loading} onSubmit={trace} />
        {error && (
          <p className="pointer-events-auto rounded-full border border-rose-500/30 bg-rose-950/80 px-4 py-1.5 text-xs text-rose-300">
            {error}
          </p>
        )}
      </div>

      {/* Reset button */}
      {result && (
        <button
          onClick={reset}
          className="absolute bottom-5 left-5 z-10 rounded-full border border-white/10 bg-[#06170e]/90 px-4 py-2 text-xs text-emerald-100/70 backdrop-blur transition hover:border-white/25 hover:text-white"
        >
          ↺ Reset view
        </button>
      )}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-5 right-5 z-10 hidden gap-3 text-[10px] text-emerald-100/40 sm:flex">
        {[
          ["#ffa14f", "Primal roots"],
          ["#c77dff", "Basic desires"],
          ["#2fd4b0", "Jobs"],
          ["#7ce38b", "Behaviors (leaves)"],
        ].map(([c, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            {label}
          </span>
        ))}
      </div>

      {/* Analysis panel */}
      {result && (
        <div className="absolute inset-y-0 right-0 z-20">
          <AnalysisPanel idea={idea} result={result} onClose={reset} />
        </div>
      )}
    </main>
  );
}
