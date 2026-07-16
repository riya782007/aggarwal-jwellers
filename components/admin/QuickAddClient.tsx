"use client";
import { useRef, useState } from "react";
import { quickAddProductAction } from "@/app/actions/catalog";
import { t, type Lang } from "@/lib/i18n";
import { useSpeech } from "@/components/useSpeech";
import { extractQuantity, extractPriceRupees } from "@/lib/diva/nlu";

type Cat = { id: string; name: string };
type Done = { sku: string; name: string };

/** Photo-first stock entry — the 20-second flow: photo → category → cost → qty → done.
 *  Big targets, four steps, zero typing beyond two numbers. The server action drafts the
 *  rest (AI name/description from the photo, auto SKU, formula pricing) as a DRAFT. */
export function QuickAddClient({ categories, lang = "en" }: { categories: Cat[]; lang?: Lang }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [voiceNote, setVoiceNote] = useState("");
  const [voiceLang, setVoiceLang] = useState<"hi-IN" | "en-IN">("hi-IN");

  /** Q20-b: "photo AND speak the details" — parse the spoken line and fill the form.
   *  Reuses DIVA's offline extractors (qty near pcs-words, ₹ near cost-words), matches the
   *  category by name, catches pair/set/dozen and an item code; the full transcript also
   *  rides along so the AI writes the listing from what the owner SAID + the photo. */
  function applyVoice(text: string) {
    setVoiceNote((v) => (v ? v + " · " : "") + text);
    const form = formRef.current;
    if (!form) return;
    const lower = text.toLowerCase();
    const qty = extractQuantity(text);
    const price = extractPriceRupees(text);
    if (price && (form.elements.namedItem("price") as HTMLInputElement)) (form.elements.namedItem("price") as HTMLInputElement).value = String(price);
    if (qty && qty !== price && (form.elements.namedItem("qty") as HTMLInputElement)) (form.elements.namedItem("qty") as HTMLInputElement).value = String(qty);
    // unit words (English + Hindi/Hinglish)
    const unitSel = form.elements.namedItem("unit") as HTMLSelectElement | null;
    if (unitSel) {
      if (/(pair|jodi|जोड़ी)/.test(lower)) unitSel.value = "pair";
      else if (/(dozen|darjan|दर्जन)/.test(lower)) unitSel.value = "dozen";
      else if (/\b(set|सेट)\b/.test(lower)) unitSel.value = "set";
    }
    // category by name match (either direction, so "jhumka earrings" hits "Earrings")
    const catSel = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
    if (catSel) {
      const hit = categories.find((c) => lower.includes(c.name.toLowerCase()) || c.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && lower.includes(w)));
      if (hit) catSel.value = hit.id;
    }
    // an item code like AJ1004 / KN-2210 spoken or spelled
    const code = /\b([A-Z]{2,4}-?\d{2,5}[A-Z0-9-]*)\b/i.exec(text.replace(/\s+/g, ""));
    const skuInp = form.elements.namedItem("sku") as HTMLInputElement | null;
    if (code && skuInp && !skuInp.value) skuInp.value = code[1].toUpperCase();
  }
  const speech = useSpeech(applyVoice, voiceLang);

  const onFile = (f: File | null) => {
    setError(null);
    if (!f) { setPreview(null); return; }
    const url = URL.createObjectURL(f);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return url; });
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await quickAddProductAction(fd);
      if (res.ok && res.sku) setDone({ sku: res.sku, name: (res as any).name ?? res.sku });
      else setError(res.error ?? "Something went wrong — try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDone(null); setError(null); setPreview(null); setVoiceNote("");
    formRef.current?.reset();
  }

  const fld = "w-full rounded-xl border border-sand bg-white px-4 py-3 text-base outline-none focus:border-emerald";

  if (done) {
    return (
      <div className="max-w-xl bg-white rounded-2xl p-8 shadow-card text-center">
        <p className="text-4xl mb-2">🎉</p>
        <h2 className="font-display text-2xl text-ink">{t(lang, "qaDone")}</h2>
        <p className="text-ink font-medium mt-2">{done.name} <span className="font-mono text-muted">· {done.sku}</span></p>
        <p className="text-sm text-muted mt-2">{t(lang, "qaDoneNote")}</p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={reset} className="btn-primary px-6 py-3 text-base font-medium">{t(lang, "qaNext")}</button>
          <a href={`/admin/product/${done.sku}`} className="px-5 py-3 rounded-xl bg-ink/5 text-ink text-sm hover:bg-ink/10">{t(lang, "qaOpen")}</a>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="max-w-xl bg-white rounded-2xl p-6 shadow-card space-y-5">
      <p className="text-sm text-muted">{t(lang, "qaIntro")}</p>
      <input type="hidden" name="voice_note" value={voiceNote} />

      {/* 🎤 Speak the details (Q20-b) — fills cost/qty/category/unit/code; hidden if unsupported */}
      {speech.supported && (
        <div className={`rounded-2xl border ${speech.listening ? "border-rose bg-rose/5" : "border-emerald/30 bg-emerald-mist/20"} p-3`}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => (speech.listening ? speech.stop() : speech.start(voiceLang))}
              className={`h-11 w-11 rounded-full text-xl shrink-0 ${speech.listening ? "bg-rose text-white animate-pulse" : "bg-emerald text-white"}`}>
              {speech.listening ? "◼" : "🎤"}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink font-medium">{speech.listening ? t(lang, "qaVoiceListening") : t(lang, "qaVoiceTitle")}</p>
              <p className="text-[11px] text-muted truncate">{speech.interim || voiceNote || t(lang, "qaVoiceHint")}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {(["hi-IN", "en-IN"] as const).map((l) => (
                <button key={l} type="button" onClick={() => setVoiceLang(l)}
                  className={`text-[11px] px-2 py-1 rounded-full ${voiceLang === l ? "bg-ink text-white" : "bg-white border border-sand text-muted"}`}>{l === "hi-IN" ? "हिं" : "EN"}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 1 · Photo — the camera opens directly on phones */}
      <div>
        <p className="text-sm font-medium text-ink mb-2">{t(lang, "qaPhoto")}</p>
        <button type="button" onClick={() => fileRef.current?.click()}
          className={`w-full rounded-2xl border-2 border-dashed ${preview ? "border-emerald" : "border-sand"} bg-cream/40 hover:bg-cream transition-colors overflow-hidden`}>
          {preview
            ? <img src={preview} alt="" className="w-full max-h-72 object-contain" />
            : <span className="flex flex-col items-center gap-2 py-10 text-muted"><span className="text-4xl">📷</span><span className="text-sm">{t(lang, "qaTakePhoto")}</span></span>}
        </button>
        <input ref={fileRef} type="file" name="image" accept="image/*" capture="environment" required
          className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </div>

      {/* 2 · Category */}
      <div>
        <p className="text-sm font-medium text-ink mb-2">{t(lang, "qaCategory")}</p>
        <select name="categoryId" required defaultValue="" className={fld}>
          <option value="" disabled>{t(lang, "qaSelectCategory")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* 3 · Cost + 4 · Qty side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-ink mb-2">{t(lang, "qaCost")}</p>
          <input name="price" type="number" min="1" step="1" inputMode="numeric" placeholder="₹" required className={fld} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink mb-2">{t(lang, "qaQty")}</p>
          <input name="qty" type="number" min="0" step="1" inputMode="numeric" defaultValue={1} required className={fld} />
        </div>
      </div>

      {/* Your code + unit — the owner keeps their own codes (Q21); bangles sell in sets (Q22) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-ink mb-2">{t(lang, "qaSku")}</p>
          <input name="sku" placeholder={t(lang, "qaSkuHint")} className={`${fld} font-mono uppercase`} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink mb-2">{t(lang, "qaUnit")}</p>
          <select name="unit" defaultValue="pc" className={fld}>
            <option value="pc">{t(lang, "unitPc")}</option>
            <option value="pair">{t(lang, "unitPair")}</option>
            <option value="set">{t(lang, "unitSet")}</option>
            <option value="dozen">{t(lang, "unitDozen")}</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-rose bg-rose/10 rounded-xl px-4 py-2.5">{error}</p>}

      <button disabled={busy} className="btn-primary w-full py-4 text-lg font-medium disabled:opacity-60">
        {busy ? t(lang, "qaSaving") : t(lang, "qaSave")}
      </button>
    </form>
  );
}
