"use client";
import { useState } from "react";
import { isRealImage } from "@/components/Placeholder";

const GRADS = [
  "linear-gradient(135deg,#E7CCD2,#F2E9D7,#E3C079)",
  "linear-gradient(135deg,#2C8472,#E7F1ED,#B68A34)",
  "linear-gradient(135deg,#E3C079,#FBF8F1,#2C8472)",
  "linear-gradient(135deg,#F2E9D7,#E7CCD2,#B68A34)",
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
