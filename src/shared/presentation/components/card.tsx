import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <section className={`surface-card p-6 ${className}`}>{children}</section>;
}
