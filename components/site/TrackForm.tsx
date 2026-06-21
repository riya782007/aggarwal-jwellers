"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrackForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); const v = id.trim(); if (v) router.push(`/account?order=${encodeURIComponent(v)}`); }} className="bg-white rounded-2xl shadow-card p-6">
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Order ID from your confirmation"
        className="w-full rounded-xl border border-sand px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald" />
      <button className="btn-primary w-full mt-3 py-3 text-sm font-medium">Track order</button>
    </form>
  );
}
