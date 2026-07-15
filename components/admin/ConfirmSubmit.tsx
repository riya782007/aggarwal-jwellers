"use client";
import { useFormStatus } from "react-dom";

/** Submit button for destructive server-action forms: asks for confirmation first and
 *  disables itself while pending (no double-fire). */
export function ConfirmSubmit({ children, className = "", message = "Are you sure?" }:
  { children: React.ReactNode; className?: string; message?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}
      className={`${className} disabled:opacity-50 disabled:pointer-events-none`}>
      {pending ? "…" : children}
    </button>
  );
}
