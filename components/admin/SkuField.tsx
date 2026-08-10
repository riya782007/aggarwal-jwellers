"use client";
import { useEffect, useRef, useState } from "react";
import { checkSkuAvailable } from "@/app/actions/catalog";

/**
 * SKU input that guarantees the code stays UNIQUE, with instant feedback.
 *
 * As the owner types (debounced) and on blur, it asks the server whether the code is already used
 * by another product or variant. If it is, we do two things:
 *   1) show an inline red note under the field, and
 *   2) call setCustomValidity() so the browser BLOCKS the form's submit and pops its native
 *      "this SKU is already taken — enter a different one" bubble right on the field.
 * This means a duplicate can never be saved from the form, and the owner is told immediately.
 *
 * Drop-in for a plain <input name="…">: it renders the same input (so the surrounding
 * <form action={…}> keeps working) plus the validation note.
 */
export function SkuField({
  name,
  defaultValue = "",
  productId,
  className = "",
  placeholder,
  onStatusChange,
}: {
  name: string;
  defaultValue?: string;
  productId?: string;
  className?: string;
  placeholder?: string;
  onStatusChange?: (taken: boolean) => void;
}) {
  const [value, setValue] = useState((defaultValue ?? "").toUpperCase());
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [takenBy, setTakenBy] = useState<"product" | "variant">("product");
  const ref = useRef<HTMLInputElement>(null);
  const initial = useRef((defaultValue ?? "").trim().toUpperCase());

  useEffect(() => {
    const sku = value.trim();
    // Empty, or unchanged from what this product already has → nothing to warn about.
    if (!sku || sku === initial.current) {
      setStatus("idle");
      ref.current?.setCustomValidity("");
      onStatusChange?.(false);
      return;
    }
    setStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await checkSkuAvailable(sku, productId);
        if (res.available) {
          setStatus("ok");
          ref.current?.setCustomValidity("");
          onStatusChange?.(false);
        } else {
          setTakenBy(res.takenBy ?? "product");
          setStatus("taken");
          ref.current?.setCustomValidity(`SKU “${sku}” is already used by another ${res.takenBy ?? "product"}. Please enter a different code.`);
          onStatusChange?.(true);
        }
      } catch {
        // Never hard-block on a check failure — the server save actions still enforce uniqueness.
        setStatus("idle");
        ref.current?.setCustomValidity("");
        onStatusChange?.(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [value, productId, onStatusChange]);

  return (
    <>
      <input
        ref={ref}
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        aria-invalid={status === "taken"}
        className={`${className} ${status === "taken" ? "!border-rose" : ""}`}
      />
      {status === "taken" && (
        <p className="text-[11px] text-rose mt-0.5">This SKU is already taken by another {takenBy} — please enter a different one.</p>
      )}
      {status === "ok" && (
        <p className="text-[11px] text-emerald-dark mt-0.5">SKU is available.</p>
      )}
    </>
  );
}
