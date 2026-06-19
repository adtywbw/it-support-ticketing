import { useState, type FormEvent } from 'react';
import { useLogin } from '@/hooks/use-auth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PasswordInput from '@/components/ui/PasswordInput';

interface FormErrors {
  email?: string;
  password?: string;
}

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const loginMutation = useLogin();

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    loginMutation.mutate({ email: email.trim(), password });
  };

  const errorMessage = loginMutation.error
    ? (loginMutation.error as { response?: { data?: { message?: string } } }).response?.data
        ?.message || 'Login failed. Please try again.'
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`input ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
          placeholder="you@example.com"
          autoComplete="email"
        />
        {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={!!errors.password}
          placeholder="Enter your password"
          autoComplete="current-password"
        />
        {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password}</p>}
      </div>

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={loginMutation.isPending}
      >
        {loginMutation.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner size="sm" /> Signing in...
          </span>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  );
}
