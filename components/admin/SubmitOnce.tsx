"use client";
import { useFormStatus } from "react-dom";

/** Submit button that disables itself while its server-action form is pending —
 *  a double-click can otherwise record a payment (or any mutation) twice. */
export function SubmitOnce({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className} disabled:opacity-50 disabled:pointer-events-none`}>
      {pending ? "…" : children}
    </button>
  );
}
