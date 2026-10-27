import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorInfo } from '@/services/api.js';
import { Button } from '@/components/ui/button.jsx';
import { FormField } from '@/components/ui/form-field.jsx';
import { CoverCollage } from '@/components/auth/CoverCollage.jsx';

function fieldErrorsFromZod(issues) {
  const out = {};
  for (const i of issues) out[i.path.join('.')] ??= i.message;
  return out;
}

// Shared by the login and register pages: Zod validation (same schemas as the API), field
// errors, a pending state and a form-level error for failures that aren't about one field.
export function AuthForm({ title, submitLabel, fields, schema, onSubmit, footer, termsCheckbox, oauth = null, initialError = '' }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, ''])));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(initialError);
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
      <CoverCollage />
      <div className="flex items-center gap-2 font-heading text-2xl font-bold">
        <Gamepad2 className="h-7 w-7 text-accent" aria-hidden="true" />
        GameQuest
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-card border border-border bg-surface/95 p-6 shadow-2xl supports-[backdrop-filter]:bg-surface/70 supports-[backdrop-filter]:backdrop-blur-md">
        <h1 className="text-xl font-semibold">{title}</h1>
        {oauth && (
          <>
            {oauth}
            <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              or use your email
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
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
        {termsCheckbox && (
          <div className="flex flex-col gap-1 py-1">
            <label className="flex items-start gap-2.5 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                name="acceptTerms"
                checked={Boolean(values.acceptTerms)}
                onChange={(e) => setValues((v) => ({ ...v, acceptTerms: e.target.checked ? true : undefined }))}
                className="mt-0.5 h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
              />
              <span>
                I agree to the{' '}
                <Link to="/terms" target="_blank" className="text-accent underline underline-offset-2">
                  Terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy" target="_blank" className="text-accent underline underline-offset-2">
                  Privacy Policy
                </Link>
              </span>
            </label>
            {errors.acceptTerms && (
              <p role="alert" className="text-xs text-danger">
                {errors.acceptTerms}
              </p>
            )}
          </div>
        )}
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Please wait…' : submitLabel}
        </Button>
      </form>
      <p className="rounded-card bg-bg/70 px-3 py-2 text-center text-sm text-text-muted">{footer}</p>
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
