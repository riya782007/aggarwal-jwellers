"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { deleteProductAction } from "@/app/actions/catalog";

export function DeleteProductButton({ sku, className = "", label }: { sku: string; className?: string; label?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm(`Delete ${sku}? This permanently removes the product (or hides it if it has past orders).`)) return;
    setBusy(true);
    const fd = new FormData(); fd.set("sku", sku);
    const r = await deleteProductAction(fd);
    setBusy(false);
    toast(r.message, r.ok ? "success" : "error");
    router.refresh();
  }
  return (
    <button onClick={del} disabled={busy} title="Delete product"
      className={className || "text-muted hover:text-rose text-xs"}>{label ?? "🗑 Delete"}</button>
  );
}
