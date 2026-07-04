export function PromoBar() {
  return (
    <div className="bg-wine text-white text-[13px] text-center py-2 px-4 tracking-wide">
      <span className="font-medium">Flat 20% OFF sitewide</span>
      <span className="mx-2 opacity-50">|</span> Free shipping over ₹999
      <span className="mx-2 opacity-50 hidden sm:inline">|</span>
      <span className="hidden sm:inline">Cash on Delivery available</span>
    </div>
  );
}
