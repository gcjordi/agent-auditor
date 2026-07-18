import type { ReactNode } from "react";

export function Alert({
  children,
  tone = "info",
}: {
  readonly children: ReactNode;
  readonly tone?: "danger" | "info" | "warning";
}) {
  const color =
    tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--accent)";
  return (
    <div
      className="rounded-lg border-l-4 bg-[var(--surface-strong)] p-4 text-sm"
      role={tone === "danger" ? "alert" : "status"}
      style={{ borderLeftColor: color }}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "danger" | "neutral" | "success" | "warning";
}) {
  const styles = {
    danger: "text-[var(--danger)]",
    neutral: "text-[var(--text-muted)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
  } as const;
  return (
    <span
      className={`inline-flex rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusIndicator({
  label,
  tone = "neutral",
}: {
  readonly label: string;
  readonly tone?: "danger" | "neutral" | "success" | "warning";
}) {
  const colors = {
    danger: "bg-[var(--danger)]",
    neutral: "bg-[var(--text-muted)]",
    success: "bg-[var(--success)]",
    warning: "bg-[var(--warning)]",
  } as const;
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden="true" className={`size-2.5 rounded-full ${colors[tone]}`} />
      {label}
    </span>
  );
}
