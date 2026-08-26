"use client";
import { Icon } from "@/components/ui/Icon";
import { useState } from "react";
import Link from "next/link";
import { CatalogueRowActions } from "@/components/admin/CatalogueRowActions";
import { GeneratePhotoButton } from "@/components/admin/GeneratePhotoButton";
import { DeleteProductButton } from "@/components/admin/DeleteProductButton";
import { ProductTags } from "@/components/admin/ProductTags";

type V = { sku: string; color: string | null; qty: number };
export type CatalogueRowProduct = {
  id: string; sku: string; name: string; status: string;
  image: string | null; categoryName: string; categorySlug: string;
  qty: number; priceLabel: string; offerPct: number; hasOffer: boolean;
  hasAi: boolean; variants: V[]; adminTags: string[]; wholesaleLabel: string;
};

function stockTone(qty: number) {
  if (qty <= 0) return { text: "text-rose", badge: "bg-rose/15 text-rose", label: "Out of stock" };
  if (qty <= 2) return { text: "text-gold-dark", badge: "bg-gold/20 text-gold-dark", label: `Low · ${qty}` };
  return { text: "text-ink", badge: "bg-emerald-mist text-emerald-dark", label: `${qty} pcs` };
}

/** One catalogue row: summary + expand for stock-by-variant, publish, edit, AI. */
export function CatalogueRow({
  p, canEdit, canAi, canDelete, canPublish, genContent,
}: {
  p: CatalogueRowProduct;
  canEdit: boolean; canAi: boolean; canDelete: boolean; canPublish: boolean;
  genContent: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [showWholesale, setShowWholesale] = useState(false);
  const published = p.status === "published";
  const st = stockTone(p.qty);
  const lowVariants = p.variants.filter((v) => v.qty <= 2);
  const oosVariants = p.variants.filter((v) => v.qty <= 0);

  return (
    <>
      <tr className="border-t border-sand/60 hover:bg-cream/40 transition-colors cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <td className="p-2">
          <div className="w-11 h-14 rounded-lg overflow-hidden border border-sand bg-cream">
            {p.image
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.image} alt={p.sku} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-center text-[8px] leading-tight text-muted px-0.5">No image</div>}
          </div>
        </td>
        <td className="p-3 font-medium text-ink">
          {p.name}
          {!published && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gold-dark">· {p.status}</span>}
          <p className="text-[11px] font-mono text-muted font-normal mt-0.5">{p.sku}</p>
        </td>
        <td className="p-3 text-muted whitespace-nowrap">{p.categoryName || "—"}</td>
        <td className="p-3">
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${st.text}`}>{st.label}</span>
          {p.variants.length > 0 && (
            <p className="text-[10px] text-muted mt-0.5">
              {p.variants.length} colour{p.variants.length === 1 ? "" : "s"}
              {oosVariants.length > 0 ? ` · ${oosVariants.length} OOS` : ""}
              {lowVariants.length > 0 && oosVariants.length === 0 ? ` · ${lowVariants.length} low` : ""}
            </p>
          )}
        </td>
        <td className="p-3"><span className="font-semibold">{p.priceLabel}</span>{p.hasOffer && <span className="text-xs text-rose ml-1">{p.offerPct}% off</span>}</td>
        <td className="p-2" onClick={(e) => e.stopPropagation()}>
          <ProductTags sku={p.sku} initial={p.adminTags} canEdit={canEdit} compact stopClick />
        </td>
        <td className="p-3 text-right text-muted text-xs whitespace-nowrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-ink hover:bg-ink/10">
            {open ? "Hide details ▴" : "View stock ▾"}
          </span>
        </td>
      </tr>

      {open && (
        <tr className="bg-cream/30">
          <td colSpan={7} className="px-4 py-4">
            <div className="flex flex-wrap gap-x-10 gap-y-5">
              <div className="min-w-[220px] flex-1 max-w-md">
                <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">
                  Stock details · <span className="font-mono normal-case tracking-normal">{p.sku}</span>
                </p>
                <div className={`rounded-xl border border-sand bg-white p-3 ${p.qty <= 0 ? "ring-1 ring-rose/30" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted">Total available</span>
                    <span className={`text-lg font-semibold ${st.text}`}>{p.qty} pcs</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>

                  {p.variants.length === 0 ? (
                    <p className="text-xs text-muted mt-3">No colour variants — single stock pool.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-sand/50">
                      {p.variants.map((v) => {
                        const vt = stockTone(v.qty);
                        return (
                          <li key={v.sku} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                            <div className="min-w-0">
                              <p className="text-ink truncate">{v.color ?? "—"}</p>
                              <p className="text-[11px] font-mono text-muted">{v.sku}</p>
                            </div>
                            <span className={`font-semibold shrink-0 ${vt.text}`}>{v.qty}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/admin/catalogue/${p.sku}`} className="text-xs px-3 py-1.5 rounded-full bg-ink text-white hover:bg-ink/90" onClick={(e) => e.stopPropagation()}>
                      Full product details
                    </Link>
                    <Link href={`/admin/inventory?q=${encodeURIComponent(p.sku)}`} className="text-xs px-3 py-1.5 rounded-full border border-sand text-ink hover:border-emerald" onClick={(e) => e.stopPropagation()}>
                      Inventory health
                    </Link>
                  </div>
                </div>
              </div>

              <div className="min-w-[150px]">
                <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Pricing</p>
                <p className="text-sm text-ink">Retail <span className="font-semibold">{p.priceLabel}</span></p>
                <button type="button" onClick={() => setShowWholesale((s) => !s)} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-sand px-2.5 py-1 text-sm hover:border-emerald" title={showWholesale ? "Hide wholesale price" : "Tap to reveal wholesale price"}>
                  <span className="text-muted text-[11px]">Wholesale</span>
                  {showWholesale ? <span className="font-semibold text-emerald-dark">{p.wholesaleLabel}</span> : <span className="font-mono tracking-widest text-muted">••••</span>}
                  <span className="text-[10px] text-muted">{showWholesale ? "" : " tap"}</span>
                </button>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Image & publish</p>
                <CatalogueRowActions sku={p.sku} status={p.status} image={p.image} canEdit={canEdit} canPublish={canPublish} />
              </div>

              <div className="flex flex-wrap items-start gap-2">
                {canEdit && <Link href={`/admin/catalogue/${p.sku}`} className="px-3 py-1.5 rounded-full bg-ink/5 text-ink text-xs font-medium hover:bg-ink/10 inline-flex items-center gap-1"><Icon g="✎" className="w-3 h-3" />Edit</Link>}
                <Link href={`/admin/product/${p.sku}`} className="px-3 py-1.5 rounded-full bg-ink/5 text-ink text-xs hover:bg-ink/10">360°</Link>
                <Link href={`/shop/${p.categorySlug}/${p.sku}`} target="_blank" className="px-3 py-1.5 rounded-full bg-emerald-mist text-emerald-dark text-xs hover:bg-emerald-mist/70">View store <Icon g="↗" className="inline-block align-middle w-[1em] h-[1em]" /></Link>
                {canAi && (
                  <form action={genContent}>
                    <input type="hidden" name="sku" value={p.sku} />
                    <button className="px-3 py-1.5 rounded-full bg-emerald/10 text-emerald text-xs font-medium hover:bg-emerald/20">{p.hasAi ? "Regenerate AI page" : "Generate AI page"}</button>
                  </form>
                )}
                {canAi && <GeneratePhotoButton sku={p.sku} category={p.categoryName || p.name} />}
                {canDelete && <DeleteProductButton sku={p.sku} className="px-3 py-1.5 rounded-full bg-rose/10 text-rose text-xs hover:bg-rose/20" label=" Delete" />}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
