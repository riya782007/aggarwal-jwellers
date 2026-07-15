"use client";
import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/CartContext";

/** Streams the live cart to /api/cart/track (debounced 8s) so unfinished bags surface on
 *  the Abandoned Carts page. The key lives in localStorage; checkout marks it recovered. */
export function cartKey(): string {
  try {
    let k = localStorage.getItem("aj_cart_key");
    if (!k) { k = `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem("aj_cart_key", k); }
    return k;
  } catch { return ""; }
}

export function CartTracker() {
  const { items } = useCart();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const key = cartKey();
      if (!key) return;
      fetch("/api/cart/track", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ cartKey: key, items: items.map((i) => ({ sku: i.sku, name: i.name, color: i.color, qty: i.qty, price: i.price })) }),
      }).catch(() => {});
    }, 8000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [items]);
  return null;
}
