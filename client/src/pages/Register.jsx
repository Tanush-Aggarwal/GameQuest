import { registerSchema } from '@gamequest/shared';
import { useAuth } from '@/hooks/useAuth.js';
import { GoogleButton } from '@/components/auth/GoogleButton.jsx';
import { AuthForm, AuthLink } from '@/features/auth/AuthForm.jsx';

const FIELDS = [
  { name: 'username', label: 'Username', autoComplete: 'username', hint: '3–24 letters, numbers or underscores' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', hint: 'At least 8 characters' },
];

export default function Register() {
  const { register } = useAuth();
  return (
    <AuthForm
      title="Create your account"
      oauth={<GoogleButton />}
      submitLabel="Create account"
      fields={FIELDS}
      schema={registerSchema}
      termsCheckbox={true}
      onSubmit={register}
      footer={
        <>
          Already have an account? <AuthLink to="/login">Log in</AuthLink>
        </>
      }
    />
  );
}
