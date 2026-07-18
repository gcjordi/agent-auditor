import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

interface FieldChromeProps {
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly id: string;
  readonly label: string;
  readonly required?: boolean | undefined;
}

function FieldChrome({
  children,
  error,
  hint,
  id,
  label,
  required,
}: FieldChromeProps & { readonly children: ReactNode }) {
  const descriptionId = `${id}-description`;
  return (
    <div className="grid gap-2">
      <label className="text-sm font-bold" htmlFor={id}>
        {label}{" "}
        {required === true ? <span className="text-[var(--danger)]">(required)</span> : null}
      </label>
      {children}
      {error !== undefined ? (
        <p className="text-sm text-[var(--danger)]" id={descriptionId} role="alert">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="text-sm text-[var(--text-muted)]" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "required"> &
  FieldChromeProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, hint, id, label, required, ...props },
  ref,
) {
  const descriptionId = error !== undefined || hint !== undefined ? `${id}-description` : undefined;
  return (
    <FieldChrome error={error} hint={hint} id={id} label={label} required={required}>
      <input
        aria-describedby={descriptionId}
        aria-invalid={error !== undefined}
        className="control"
        id={id}
        ref={ref}
        required={required}
        {...props}
      />
    </FieldChrome>
  );
});

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "required"> &
  FieldChromeProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error, hint, id, label, required, ...props },
  ref,
) {
  const descriptionId = error !== undefined || hint !== undefined ? `${id}-description` : undefined;
  return (
    <FieldChrome error={error} hint={hint} id={id} label={label} required={required}>
      <textarea
        aria-describedby={descriptionId}
        aria-invalid={error !== undefined}
        className="control min-h-28 resize-y font-mono text-sm"
        id={id}
        ref={ref}
        required={required}
        {...props}
      />
    </FieldChrome>
  );
});

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "required"> &
  FieldChromeProps;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, error, hint, id, label, required, ...props },
  ref,
) {
  const descriptionId = error !== undefined || hint !== undefined ? `${id}-description` : undefined;
  return (
    <FieldChrome error={error} hint={hint} id={id} label={label} required={required}>
      <select
        aria-describedby={descriptionId}
        aria-invalid={error !== undefined}
        className="control"
        id={id}
        ref={ref}
        required={required}
        {...props}
      >
        {children}
      </select>
    </FieldChrome>
  );
});
