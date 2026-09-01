"use client";
import { Icon } from "@/components/ui/Icon";
import { useRef, useState } from "react";
import { quickAddEmployeeAction } from "@/app/actions/employees";

type Emp = { id: string; name: string };

/** Shared "Sold by" control used on POS and estimates so every bill can be attributed. */
export function SoldByPicker({
  employees,
  value,
  onChange,
  required = true,
  compact = false,
}: {
  employees: Emp[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  compact?: boolean;
}) {
  const [emps, setEmps] = useState<Emp[]>(employees);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const selRef = useRef<HTMLSelectElement>(null);

  async function addEmp() {
    const n = newName.trim();
    if (!n) return;
    setBusy(true); setErr("");
    const r = await quickAddEmployeeAction(n);
    setBusy(false);
    if (r.ok && r.id) {
      setEmps((prev) => (prev.some((e) => e.id === r.id) ? prev : [...prev, { id: r.id!, name: r.name || n }]));
      onChange(r.id); setNewName(""); setAdding(false);
    } else setErr(r.error ?? "Could not add employee");
  }

  return (
    <div className="shrink-0">
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${value ? "border-emerald" : required ? "border-gold" : "border-sand"}`}>
        <span className="text-muted text-xs whitespace-nowrap inline-flex items-center gap-1">
          <Icon g="☺" className="w-3.5 h-3.5" />Sold by
          {required && <span className="text-rose" title="Required">*</span>}
        </span>
        <select ref={selRef} value={value} onChange={(e) => onChange(e.target.value)}
          className={`bg-transparent outline-none text-ink ${compact ? "max-w-[110px]" : "max-w-[130px]"}`}>
          <option value="">— select —</option>
          {emps.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        <button type="button" onClick={() => setAdding((v) => !v)} className="text-emerald-dark text-xs hover:underline whitespace-nowrap" title="Add a new salesperson">
          <Icon g="＋" className="inline-block align-middle w-[1em] h-[1em]" />New
        </button>
      </div>
      {adding && (
        <div className="mt-1 flex items-center gap-1">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmp(); } }}
            placeholder="Type your name" autoFocus
            className="rounded-lg border border-sand px-2 py-1 text-xs w-32 outline-none focus:border-emerald" />
          <button type="button" onClick={addEmp} disabled={busy || !newName.trim()}
            className="text-xs px-2 py-1 rounded-lg bg-ink text-white disabled:opacity-50">{busy ? "…" : "Add"}</button>
        </div>
      )}
      {err && <p className="text-[11px] text-rose mt-0.5">{err}</p>}
    </div>
  );
}
