import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorInfo } from '@/services/api.js';
import { Button } from '@/components/ui/button.jsx';
import { FormField } from '@/components/ui/form-field.jsx';

function fieldErrorsFromZod(issues) {
  const out = {};
  for (const i of issues) out[i.path.join('.')] ??= i.message;
  return out;
}

// Shared by the login and register pages: Zod validation (same schemas as the API), field
// errors, a pending state and a form-level error for failures that aren't about one field.
export function AuthForm({ title, submitLabel, fields, schema, onSubmit, footer }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, ''])));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      const info = getErrorInfo(err);
      if (Array.isArray(info.details)) {
        setErrors(Object.fromEntries(info.details.map((d) => [d.path, d.message])));
      } else if (info.details?.field) {
        setErrors({ [info.details.field]: info.message });
      } else if (info.code === 'RATE_LIMITED') {
        toast.error(info.message);
        setFormError(info.message);
      } else {
        setFormError(info.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2 font-heading text-2xl font-bold">
        <Gamepad2 className="h-7 w-7 text-accent" aria-hidden="true" />
        GameQuest
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        {fields.map((f) => (
          <FormField
            key={f.name}
            label={f.label}
            name={f.name}
            type={f.type ?? 'text'}
            autoComplete={f.autoComplete}
            hint={f.hint}
            value={values[f.name]}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            error={errors[f.name]}
          />
        ))}
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Please wait…' : submitLabel}
        </Button>
      </form>
      <p className="text-center text-sm text-text-muted">{footer}</p>
    </div>
  );
}

export function AuthLink({ to, children }) {
  return (
    <Link to={to} className="font-medium text-accent underline underline-offset-4">
      {children}
    </Link>
  );
}
