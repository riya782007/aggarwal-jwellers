export function OrderTimeline() {
  const steps = ["Confirmed", "Packed", "Shipped", "Delivered"];
  return (
    <div>
      <div className="flex items-center">
        {steps.map((step, i) => (
          <div key={step} className="flex-1 flex items-center">
            <div className="flex flex-col items-center">
              <div className={`h-8 w-8 rounded-full grid place-items-center text-sm ${i === 0 ? "bg-emerald text-white" : "bg-cream text-muted border border-sand"}`}>{i === 0 ? "✓" : i + 1}</div>
              <span className={`text-[11px] mt-1 ${i === 0 ? "text-emerald" : "text-muted"}`}>{step}</span>
            </div>
            {i < 3 && <div className={`flex-1 h-0.5 mx-1 ${i === 0 ? "bg-emerald/40" : "bg-sand"}`} />}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-4 text-center">We&apos;ll send tracking on WhatsApp the moment your order ships.</p>
    </div>
  );
}
