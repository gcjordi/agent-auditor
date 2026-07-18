import { AppLink, EmptyState } from "@/shared/presentation/components";

export default function NotFound() {
  return (
    <div className="grid gap-5">
      <EmptyState
        description="The requested local resource does not exist or is no longer available."
        title="Page not found"
      />
      <div>
        <AppLink href="/" variant="secondary">
          Return home
        </AppLink>
      </div>
    </div>
  );
}
