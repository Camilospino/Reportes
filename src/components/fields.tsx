import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Campos de formulario con etiqueta y error accesibles (aria-invalid / aria-describedby). */
type Common = { label: string; name: string; errors?: string[]; hint?: ReactNode };

function Wrapper({ label, name, errors, hint, children }: Common & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {hint && !errors?.length ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      {errors?.length ? (
        <p id={`${name}-error`} className="field-error" role="alert">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

const aria = (name: string, errors?: string[]) =>
  errors?.length ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};

export function TextField({ label, name, errors, hint, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrapper label={label} name={name} errors={errors} hint={hint}>
      <input id={name} name={name} className="input" {...aria(name, errors)} {...props} />
    </Wrapper>
  );
}

export function TextAreaField({ label, name, errors, hint, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrapper label={label} name={name} errors={errors} hint={hint}>
      <textarea id={name} name={name} className="input min-h-28" rows={4} {...aria(name, errors)} {...props} />
    </Wrapper>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  options,
  placeholder,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Wrapper label={label} name={name} errors={errors} hint={hint}>
      <select id={name} name={name} className="input" {...aria(name, errors)} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}
