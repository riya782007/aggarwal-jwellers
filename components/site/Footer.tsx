import Link from "next/link";

export function Footer({ categories }: { categories: { name: string; slug: string }[] }) {
  return (
    <footer className="bg-ink text-cream/80 mt-20">
      <div className="max-w-7xl mx-auto px-5 py-14 grid md:grid-cols-4 gap-10">
        <div>
          <p className="font-display text-3xl text-ivory">Blythe Diva</p>
          <p className="text-sm mt-3 text-cream/60 leading-relaxed">Where elegance meets empowerment. Handcrafted artificial jewellery from Sadar Bazar, Delhi — for retail &amp; wholesale.</p>
          <div className="flex gap-3 mt-5 text-lg">
            <span className="hover:text-gold transition-colors cursor-pointer">⌾</span>
            <span className="hover:text-gold transition-colors cursor-pointer">▶</span>
            <span className="hover:text-gold transition-colors cursor-pointer">✦</span>
          </div>
        </div>
        <div>
          <p className="text-gold-light text-xs uppercase tracking-widest mb-4">Shop</p>
          <ul className="space-y-2 text-sm">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}><Link href={`/shop/c/${c.slug}`} className="hover:text-gold transition-colors">{c.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-gold-light text-xs uppercase tracking-widest mb-4">Information</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/wholesale" className="hover:text-gold transition-colors">Wholesale Signup</Link></li>
            <li><Link href="/shipping" className="hover:text-gold transition-colors">Shipping Policy</Link></li>
            <li><Link href="/returns" className="hover:text-gold transition-colors">Returns &amp; Cancellation</Link></li>
            <li><Link href="/about" className="hover:text-gold transition-colors">About Us</Link></li>
            <li><Link href="/contact" className="hover:text-gold transition-colors">Contact</Link></li>
            <li><Link href="/faq" className="hover:text-gold transition-colors">FAQ</Link></li>
            <li><Link href="/size-guide" className="hover:text-gold transition-colors">Size &amp; Length Guide</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-gold-light text-xs uppercase tracking-widest mb-4">Stay in touch</p>
          <p className="text-sm text-cream/60 mb-3">Subscribe for new drops &amp; exclusive offers.</p>
          <form className="flex">
            <input placeholder="Your email" className="flex-1 rounded-l-full px-4 py-2 text-sm text-ink outline-none" />
            <button className="btn-gold rounded-l-none px-4 text-sm font-medium">Join</button>
          </form>
          <p className="text-xs text-cream/50 mt-4">WhatsApp orders: +91 98731 51767</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-cream/50">
          <span>© 2026 Blythe Diva · Yogendra Industries. All rights reserved.</span>
          <span className="flex gap-2 text-cream/40">Visa · Mastercard · UPI · Paytm · COD</span>
        </div>
      </div>
    </footer>
  );
}
