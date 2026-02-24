import { useState } from 'react';
import { useAuth } from '../../../auth/useAuth';
import { extractErrorMessage } from '../extractErrorMessage';
import styles from '../authForm.module.css';

function SignInForm({ onSuccess, onSwitchToSignUp }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signIn({ email, password });
      onSuccess?.();
    } catch (error) {
      setError(extractErrorMessage(error, { context: 'signIn' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="signin-email">
          Email
        </label>
        <input
          id="signin-email"
          className={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="signin-password">
          Password
        </label>
        <input
          id="signin-password"
          className={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      <button className={styles.submitButton} type="submit" disabled={isLoading}>
        {isLoading ? 'Signing in...' : 'Sign in'}
      </button>

      <div className={styles.switchRow}>
        Don’t have an account?
        <button type="button" className={styles.linkButton} onClick={onSwitchToSignUp}>
          Sign up
        </button>
      </div>
    </form>
  );
}

export default SignInForm;
