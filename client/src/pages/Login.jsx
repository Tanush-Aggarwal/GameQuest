import { useSearchParams } from 'react-router-dom';
import { loginSchema } from '@gamequest/shared';
import { GoogleButton } from '@/components/auth/GoogleButton.jsx';
import { oauthErrorMessage } from '@/features/auth/oauthErrors.js';
import { useAuth } from '@/hooks/useAuth.js';
import { AuthForm, AuthLink } from '@/features/auth/AuthForm.jsx';

const FIELDS = [
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
];

export default function Login() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  return (
    <AuthForm
      title="Log in"
      oauth={<GoogleButton />}
      initialError={oauthErrorMessage(params.get('error'))}
      submitLabel="Log in"
      fields={FIELDS}
      schema={loginSchema}
      onSubmit={login}
      forgotPasswordHref="/forgot-password"
      footer={
        <>
          New here? <AuthLink to="/register">Create an account</AuthLink>
        </>
      }
    />
  );
}
