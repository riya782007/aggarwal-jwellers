import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-24 text-center">
      <p className="text-gold-dark tracking-[0.35em] text-xs uppercase mb-4">Est. Sadar Bazar · Delhi</p>
      <h1 className="font-display text-6xl text-ink mb-3">Aggarwal Jewellers</h1>
      <div className="mx-auto mb-6 h-[3px] w-24 bg-gradient-to-r from-wine via-gold to-wine rounded-full" />
      <p className="text-ink/70 text-lg mb-12">
        Artificial jewellery — Kundan, Meenakari, Temple &amp; more.<br className="hidden sm:block" />
        Retail &amp; wholesale from the heart of Sadar Bazar.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link href="/shop" className="btn-primary px-8 py-4 text-lg font-medium">Dukaan Dekhein · Shop</Link>
        <Link href="/wholesale" className="btn-gold px-8 py-4 text-lg font-medium">Wholesale / थोक</Link>
        <Link href="/admin/dashboard" className="px-8 py-4 rounded-[14px] border-2 border-wine/25 text-wine text-lg font-medium hover:bg-wine hover:text-white transition-colors">Malik ka Console</Link>
      </div>
    </main>
  );
}
