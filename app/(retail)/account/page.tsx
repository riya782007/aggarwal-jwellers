"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Back } from "@/components/site/Back";

export default function Account() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <div className="max-w-md mx-auto px-5 py-12">
      <div className="mb-5"><Back label="Back" /></div>
      <h1 className="font-display text-4xl text-ink mb-1">Track your order</h1>
      <p className="text-muted mb-6">Enter your order ID (from your confirmation) to see its status.</p>
      <form onSubmit={(e) => { e.preventDefault(); const v = id.trim(); if (v) router.push(`/order/${v.toLowerCase()}`); }} className="bg-white rounded-2xl shadow-card p-6">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Order ID, e.g. 630bc234"
          className="w-full rounded-xl border border-sand px-4 py-2.5 text-sm bg-white outline-none focus:border-emerald" />
        <button className="btn-primary w-full mt-3 py-3 text-sm font-medium">Track order</button>
      </form>
      <p className="text-xs text-muted mt-5 text-center">
        Prefer a human? <a href="https://wa.me/919873151767" className="text-emerald nav-link">WhatsApp us</a> with your order ID and we'll help instantly.
        <br />New here? <Link href="/shop" className="text-emerald nav-link">Browse the collection →</Link>
      </p>
    </div>
  );
}
