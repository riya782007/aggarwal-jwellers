import { Star } from "lucide-react";

export function Stars({ rating, count, size = "sm" }: { rating: number; count?: number; size?: "sm" | "md" }) {
  const full = Math.round(rating);
  const s = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`${s} ${i < full ? "text-gold" : "text-sand"}`} strokeWidth={1.5} style={{ fill: i < full ? "currentColor" : "none" }} />
        ))}
      </span>
      <span className="text-muted text-xs">{rating.toFixed(1)}{count != null ? ` (${count})` : ""}</span>
    </span>
  );
}
