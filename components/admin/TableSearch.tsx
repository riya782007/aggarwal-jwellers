"use client";
import { useRef, useState } from "react";

/**
 * Instant, reusable table search for already-loaded server-rendered tables.
 * Drop it above any <table id={targetId}> — as the owner types, non-matching rows hide
 * live (no reload, no button). Built for fast bulk wholesaler work and 60+ users:
 * large field, clear "×" button, plain-language placeholder, shows a live match count.
 *
 * It matches against each row's full visible text (name, phone, amount, etc.), so one box
 * covers everything on the row. Rows are hidden with `hidden`, so totals/footers are untouched.
 */
export function TableSearch({
  targetId,
  placeholder = "Search…",
  className = "",
}: { targetId: string; placeholder?: string; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState<number | null>(null);

  function apply(qRaw: string) {
    const q = qRaw.trim().toLowerCase();
    const tbody = document.querySelector<HTMLElement>(`#${targetId} tbody`);
    if (!tbody) return;
    let shown = 0;
    tbody.querySelectorAll<HTMLElement>(":scope > tr").forEach((tr) => {
      const match = !q || (tr.textContent ?? "").toLowerCase().includes(q);
      tr.classList.toggle("hidden", !match);
      if (match) shown++;
    });
    setCount(q ? shown : null);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    apply("");
    inputRef.current?.focus();
  }

  return (
    <div className={`relative w-full sm:max-w-md ${className}`}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">🔍</span>
      <input
        ref={inputRef}
        type="search"
        onInput={(e) => apply((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full h-11 rounded-xl border border-sand bg-white pl-10 pr-24 text-[15px] outline-none focus:border-emerald"
      />
      {count !== null && (
        <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-muted tabular-nums">{count} found</span>
      )}
      <button
        type="button"
        onClick={clear}
        aria-label="Clear search"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-lg text-muted hover:bg-cream hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
