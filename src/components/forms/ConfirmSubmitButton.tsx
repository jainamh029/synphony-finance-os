"use client";

/**
 * A submit button that shows a native confirmation prompt before its form actually submits.
 * Used for irreversible/sensitive actions (issue invoice, regenerate schedule, archive
 * contract, reject deployment, approve with override) per the UX requirement that these
 * need a confirmation step — a plain window.confirm() rather than a custom modal component,
 * to keep this lightweight and consistent everywhere it's used.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
  variant = "secondary",
}: {
  confirmMessage: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const variants: Record<string, string> = {
    primary: "bg-[var(--color-navy-800)] text-white hover:bg-[var(--color-navy-900)]",
    secondary: "bg-white text-[var(--color-graphite-900)] border border-[var(--color-graphite-300)] hover:bg-[var(--color-graphite-100)]",
    danger: "bg-[var(--color-bad-text)] text-white hover:opacity-90",
  };
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${variants[variant]} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
