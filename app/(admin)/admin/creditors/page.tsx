export const dynamic = "force-dynamic";
import Link from "next/link";
import { getCreditors } from "@/lib/supabase/queries";
import { formatPaise } from "@/lib/pricing";
import { getSession, can, getLang } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { recordPartyPaymentAction } from "@/app/actions/payments";
import { SubmitOnce } from "@/components/admin/SubmitOnce";
import { TableSearch } from "@/components/admin/TableSearch";

export const metadata = { title: "Owner Console · Udhaar / Receivables" };

export default async function Creditors() {
  const rows = await getCreditors();
  const totalDue = rows.reduce((s, r) => s + r.outstanding, 0);
  const canReceive = can(getSession(), "billing.sell");
  const lang = getLang();
  const fld = "rounded-lg border border-sand bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald";

  return (
    <main className="p-4 sm:p-6 bg-cream/40 min-h-screen">
      <h1 className="font-display text-4xl text-ink mb-1">{t(lang, "udhaarTitle")}</h1>
      <p className="text-sm text-muted mb-4">{t(lang, "udhaarSubtitle")}</p>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="rounded-2xl border border-sand bg-white px-4 py-3 shadow-card">
          <p className="text-xs text-muted">{t(lang, "totalReceivable")}</p>
          <p className="text-2xl font-semibold text-rose">{formatPaise(totalDue)}</p>
        </div>
        <div className="rounded-2xl border border-sand bg-white px-4 py-3 shadow-card">
          <p className="text-xs text-muted">{t(lang, "parties")}</p>
          <p className="text-2xl font-semibold text-ink">{rows.length}</p>
        </div>
      </div>

      {rows.length > 8 && <div className="mb-3"><TableSearch targetId="udhaar-table" placeholder="Search a party by name or phone…" /></div>}
      <div className="overflow-x-auto rounded-2xl border border-sand bg-white shadow-card">
        <table id="udhaar-table" className="w-full text-sm">
          <thead className="bg-cream text-muted text-left">
            <tr>
              <th className="p-3">{t(lang, "party")}</th>
              <th className="p-3 text-right">{t(lang, "openBills")}</th>
              <th className="p-3 text-right">{t(lang, "outstanding")}</th>
              {canReceive && <th className="p-3">{t(lang, "receiveCol")}</th>}
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={canReceive ? 5 : 4} className="p-4 text-muted">{t(lang, "noDues")}</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-sand/60 hover:bg-cream/40">
                <td className="p-3 text-ink">{r.name}{r.phone && <span className="block text-xs text-muted">{r.phone}</span>}</td>
                <td className="p-3 text-right text-muted">{r.bills}</td>
                <td className="p-3 text-right font-semibold text-rose">{formatPaise(r.outstanding)}</td>
                {canReceive && (
                  <td className="p-3">
                    {r.id ? (
                      <form action={recordPartyPaymentAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="customer_id" value={r.id} />
                        <input name="amount" type="number" min="1" step="1" placeholder="₹" required className={`${fld} w-20 text-right`} />
                        <select name="mode" className={fld} defaultValue="cash">
                          <option value="cash">{t(lang, "cashWord")}</option>
                          <option value="upi">{t(lang, "upiWord")}</option>
                          <option value="bank">{t(lang, "bankWord")}</option>
                        </select>
                        <SubmitOnce className="px-2.5 py-1.5 rounded-lg bg-emerald text-white text-xs font-medium hover:bg-emerald-dark">{t(lang, "receivedBtn")}</SubmitOnce>
                      </form>
                    ) : (
                      <span className="text-[11px] text-muted">{t(lang, "walkInNote")}</span>
                    )}
                  </td>
                )}
                <td className="p-3 text-right">{r.id && <Link href={`/admin/customer/${r.id}`} className="text-emerald nav-link text-xs">{t(lang, "ledgerLink")}</Link>}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-sand bg-cream/40">
                <td className="p-3 text-right text-muted" colSpan={2}>{t(lang, "totalWord")}</td>
                <td className="p-3 text-right font-semibold text-ink">{formatPaise(totalDue)}</td>
                <td className="p-3" colSpan={canReceive ? 2 : 1}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-muted mt-3">{t(lang, "udhaarFootnote")}</p>
    </main>
  );
}
