"use client";

import type { ReactNode } from "react";
import { useRef } from "react";

import { Button } from "./button";

export function ConfirmationDialog({
  children,
  confirmLabel,
  onConfirm,
  title,
  triggerLabel,
}: {
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly triggerLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button onClick={() => dialogRef.current?.showModal()} variant="danger">
        {triggerLabel}
      </Button>
      <dialog
        className="m-auto max-w-md rounded-xl border bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/60"
        ref={dialogRef}
      >
        <div className="grid gap-5 p-6">
          <h2 className="text-lg font-bold">{title}</h2>
          <div className="text-sm text-[var(--text-muted)]">{children}</div>
          <div className="flex justify-end gap-3">
            <Button onClick={() => dialogRef.current?.close()} variant="secondary">
              Cancel
            </Button>
            <Button
              onClick={() => {
                onConfirm();
                dialogRef.current?.close();
              }}
              variant="danger"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
