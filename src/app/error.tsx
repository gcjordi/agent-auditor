"use client";

import { Button, ErrorState } from "@/shared/presentation/components";

export default function GlobalError({ reset }: { readonly reset: () => void }) {
  return (
    <div className="grid gap-4">
      <ErrorState />
      <div>
        <Button onClick={reset} variant="secondary">
          Try again
        </Button>
      </div>
    </div>
  );
}
