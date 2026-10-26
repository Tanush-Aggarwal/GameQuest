import { loginSchema } from '@gamequest/shared';
import { useAuth } from '@/hooks/useAuth.js';
import { AuthForm, AuthLink } from '@/features/auth/AuthForm.jsx';

const FIELDS = [
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
];

export default function Login() {
  const { login } = useAuth();
  return (
    <AuthForm
      title="Log in"
      submitLabel="Log in"
      fields={FIELDS}
      schema={loginSchema}
      onSubmit={login}
      footer={
        <>
          New here? <AuthLink to="/register">Create an account</AuthLink>
        </>
      }
    />
  );
}
