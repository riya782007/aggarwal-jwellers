"use client";
import { useState } from "react";
import { isRealImage } from "@/components/Placeholder";

const GRADS = [
  "linear-gradient(135deg,#EFC9C6,#F7EEDC,#E9CF8B)",
  "linear-gradient(135deg,#4C8A58,#EAF2E8,#C79A2D)",
  "linear-gradient(135deg,#E9CF8B,#FCF8EF,#4C8A58)",
  "linear-gradient(135deg,#F7EEDC,#EFC9C6,#C79A2D)",
];
const KINDS = ["Model", "Flat lay", "Close-up", "Angle"];

export function Gallery({ name, images }: { name: string; images: { path: string; kind?: string | null }[] }) {
  const tiles = (images.length ? images : KINDS.map((k) => ({ path: "", kind: k }))).slice(0, 4);
  const [active, setActive] = useState(0);
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const Tile = ({ i, big }: { i: number; big?: boolean }) => {
    const img = tiles[i];
    if (img && isRealImage(img.path)) return <img src={img.path} alt={name} className="object-cover w-full h-full" />;
    return (
      <div className="w-full h-full grid place-items-center" style={{ background: GRADS[i % 4] }}>
        <span className={`font-display ${big ? "text-6xl" : "text-xl"} text-ink/30`}>{initials}</span>
        {big && <span className="absolute bottom-3 right-4 text-[10px] uppercase tracking-widest text-ink/40">{KINDS[i % 4]}</span>}
      </div>
    );
  };
  return (
    <div>
      <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-cream shadow-luxe group">
        <div className="card-img h-full w-full"><Tile i={active} big /></div>
      </div>
      <div className="grid grid-cols-4 gap-2.5 mt-3">
        {tiles.map((_, i) => (
          <button key={i} onClick={() => setActive(i)}
            className={`relative aspect-square rounded-xl overflow-hidden transition-all ${active === i ? "ring-2 ring-emerald" : "ring-1 ring-sand hover:ring-gold"}`}>
            <Tile i={i} />
          </button>
        ))}
      </div>
    </div>
  );
}
