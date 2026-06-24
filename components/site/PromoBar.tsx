const MESSAGES = [
  "✦ Wholesale rates for retailers — trade login",
  "✦ Factory-direct from Sadar Bazar, Delhi",
  "✦ Bulk orders · GST billing · pan-India dispatch",
  "✦ Flat 20% OFF for retail shoppers",
  "✦ Free shipping over ₹999 · COD available",
];
export function PromoBar() {
  const strip = [...MESSAGES, ...MESSAGES];
  return (
    <div className="bg-ink text-cream text-xs tracking-wide overflow-hidden py-2">
      <div className="marquee-track">
        {strip.map((m, i) => (
          <span key={i} className="mx-6 inline-block text-gold-light/90">{m}</span>
        ))}
      </div>
    </div>
  );
}
