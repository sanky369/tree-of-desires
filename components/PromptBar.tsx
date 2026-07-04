"use client";

import { useState, type FormEvent } from "react";

interface Props {
  loading: boolean;
  onSubmit: (idea: string) => void;
}

export default function PromptBar({ loading, onSubmit }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const idea = value.trim();
    if (idea && !loading) onSubmit(idea);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="pointer-events-auto flex w-[min(640px,calc(100vw-2rem))] items-center gap-3 rounded-full border border-white/10 bg-[#0b1018]/90 px-5 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-md transition focus-within:border-amber-300/40"
    >
      {loading ? (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-300/80 border-t-transparent" />
      ) : (
        <svg
          className="h-4 w-4 shrink-0 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter an idea to trace to its root desire…"
        disabled={loading}
        className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none disabled:opacity-60"
        maxLength={500}
        autoFocus
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="shrink-0 rounded-full bg-amber-300/90 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {loading ? "Tracing…" : "Trace"}
      </button>
    </form>
  );
}
