import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import styles from './authForm.module.css';

function SignUpForm({ onSuccess, onSwitchToSignIn }) {
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signUp({
        first_name: firstName,
        last_name: lastName,
        nickname,
        email,
        password,
        gender,
        birth_date: birthDate,
      });
      onSuccess?.();
    } catch (error) {
      setError(extractErrorMessage(error, { context: 'signUp' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="signup-first-name">
            First name
          </label>
          <input
            id="signup-first-name"
            className={styles.input}
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="John"
            required
            autoComplete="given-name"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="signup-last-name">
            Last name
          </label>
          <input
            id="signup-last-name"
            className={styles.input}
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            required
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-nickname">
          Nickname
        </label>
        <input
          id="signup-nickname"
          className={styles.input}
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="ed999"
          required
          autoComplete="nickname"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-email">
          Email
        </label>
        <input
          id="signup-email"
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
        <label className={styles.label} htmlFor="signup-password">
          Password
        </label>
        <input
          id="signup-password"
          className={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create a password"
          required
          autoComplete="new-password"
        />
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="signup-gender">
            Gender
          </label>
          <select
            id="signup-gender"
            className={styles.select}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            required>
            <option value="" disabled>
              Select
            </option>
            <option value="male">male</option>
            <option value="female">female</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="signup-birth-date">
            Birth date
          </label>
          <input
            id="signup-birth-date"
            className={styles.input}
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
        </div>
      </div>

      <button className={styles.submitButton} type="submit" disabled={isLoading}>
        {isLoading ? 'Creating account...' : 'Sign up'}
      </button>

      <div className={styles.switchRow}>
        Already have an account?
        <button type="button" className={styles.linkButton} onClick={onSwitchToSignIn}>
          Sign in
        </button>
      </div>
    </form>
  );
}

export default SignUpForm;
