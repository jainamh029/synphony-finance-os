import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import Link from "next/link";

const baseField =
  "block w-full rounded-lg border border-[var(--color-graphite-300)] bg-white px-3 py-2 text-sm text-[var(--color-graphite-900)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-[var(--color-graphite-100)] disabled:text-[var(--color-graphite-500)]";

export function Field({ label, htmlFor, hint, required, children }: { label: string; htmlFor: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">
        {label}
        {required && <span className="text-[var(--color-bad-text)]"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-[var(--color-graphite-500)]">{hint}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseField} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${baseField} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseField} ${props.className ?? ""}`} />;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const variants: Record<string, string> = {
    primary: "bg-[var(--color-navy-800)] text-white hover:bg-[var(--color-navy-900)]",
    secondary: "bg-white text-[var(--color-graphite-900)] border border-[var(--color-graphite-300)] hover:bg-[var(--color-graphite-100)]",
    danger: "bg-[var(--color-bad-text)] text-white hover:opacity-90",
    ghost: "text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const variants: Record<string, string> = {
    primary: "bg-[var(--color-navy-800)] text-white hover:bg-[var(--color-navy-900)]",
    secondary: "bg-white text-[var(--color-graphite-900)] border border-[var(--color-graphite-300)] hover:bg-[var(--color-graphite-100)]",
  };
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${variants[variant]}`}>
      {children}
    </Link>
  );
}
