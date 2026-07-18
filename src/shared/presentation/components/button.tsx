import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "danger" | "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  danger: "bg-[var(--danger)] text-white hover:brightness-110",
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-strong)]",
};

export function Button({
  className = "",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${variantClasses[variant]} ${className}`}
      type={type}
      {...props}
    />
  );
}
