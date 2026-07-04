"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "./Icons";

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <>
      {/* Desktop: prominent search field (search-first storefront) */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}
        className="hidden md:flex flex-1 max-w-xl items-center bg-ivory border border-sand rounded-full px-4 py-2.5 focus-within:border-gold transition-colors">
        <IconSearch className="w-4 h-4 text-ink/40 shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search "Jhumka", "Kundan Set", "Kada"…'
          className="bg-transparent outline-none text-sm px-3 w-full placeholder:text-ink/40" />
      </form>
      {/* Mobile: search icon button → search page */}
      <button onClick={() => router.push("/search")} aria-label="Search" title="Search"
        className="md:hidden p-2 rounded-full hover:bg-ivory transition-colors"><IconSearch /></button>
    </>
  );
}
