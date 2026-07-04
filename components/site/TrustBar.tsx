const ITEMS = [
  { icon: "✦", t: "Anti-Tarnish Finish", s: "Premium plating" },
  { icon: "⇆", t: "7-Day Easy Returns", s: "No questions asked" },
  { icon: "❤", t: "50,000+ Customers", s: "Across India" },
  { icon: "₹", t: "COD Available", s: "Pay on delivery" },
];
export function TrustBar() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-sand/50 bg-white border border-sand/60 rounded-2xl shadow-card">
      {ITEMS.map((i) => (
        <div key={i.t} className="px-4 py-4 flex items-center justify-center gap-3">
          <span className="text-gold-dark text-xl">{i.icon}</span>
          <span className="text-left">
            <span className="block text-[13px] font-semibold text-ink leading-tight">{i.t}</span>
            <span className="block text-[11px] text-muted">{i.s}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
