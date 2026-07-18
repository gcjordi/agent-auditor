import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type AppLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    readonly children: ReactNode;
    readonly variant?: "primary" | "secondary";
  };

export function AppLink({ children, className = "", variant = "primary", ...props }: AppLinkProps) {
  const variantClass =
    variant === "primary"
      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
      : "border bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-strong)]";
  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold no-underline transition-colors ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}
