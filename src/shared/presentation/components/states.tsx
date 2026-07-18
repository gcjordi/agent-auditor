import { AppLink } from "./app-link";

export function EmptyState({
  actionHref,
  actionLabel,
  description,
  title,
}: {
  readonly actionHref?: string;
  readonly actionLabel?: string;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <div className="surface-card grid justify-items-start gap-3 border-dashed p-7">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="max-w-2xl text-[var(--text-muted)]">{description}</p>
      {actionHref !== undefined && actionLabel !== undefined ? (
        <AppLink href={actionHref}>{actionLabel}</AppLink>
      ) : null}
    </div>
  );
}

export function ErrorState({
  description = "The requested data could not be loaded safely.",
}: {
  readonly description?: string;
}) {
  return (
    <div className="surface-card border-l-4 border-l-[var(--danger)] p-6" role="alert">
      <h2 className="font-bold">Unable to load this view</h2>
      <p className="mt-2 text-[var(--text-muted)]">{description}</p>
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { readonly label?: string }) {
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-3 text-[var(--text-muted)]"
      role="status"
    >
      <span aria-hidden="true" className="size-4 animate-pulse rounded-full bg-[var(--accent)]" />
      {label}…
    </div>
  );
}
