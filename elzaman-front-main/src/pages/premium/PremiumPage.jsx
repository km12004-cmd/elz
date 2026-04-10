import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createTelegramCheckoutLink } from '@/entities/subscription/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/shared/api/client';
import styles from './premiumPage.module.css';

const FREE_FEATURES = [
  'Access to core lessons and flashcards',
  'Daily progress tracking and streaks',
  'Limited number of songs and practice sets',
  'Standard learning pace without extra tools',
];

const PREMIUM_FEATURES = [
  'Full access to all lessons, songs, and exercises',
  'Advanced flashcards and curated study collections',
  'Priority access to new learning content',
  'Faster progress with expanded practice options',
];

function PremiumPage() {
  const { token, isAuthenticated, user } = useAuth();
  const [isRedirectingToTelegram, setIsRedirectingToTelegram] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const isPremiumUser = Boolean(user?.isPremium ?? user?.is_premium);

  async function handleTelegramCheckout() {
    if (!isAuthenticated || !token || isRedirectingToTelegram || isPremiumUser) return;

    setCheckoutError('');
    setIsRedirectingToTelegram(true);

    try {
      const payload = await createTelegramCheckoutLink({ token });
      const checkoutUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
      if (!checkoutUrl) {
        throw new Error('Telegram checkout link is missing.');
      }
      window.location.assign(checkoutUrl);
    } catch (error) {
      if (error instanceof ApiError) {
        setCheckoutError(error.message || 'Unable to open Telegram checkout right now.');
      } else if (error instanceof Error) {
        setCheckoutError(error.message);
      } else {
        setCheckoutError('Unable to open Telegram checkout right now.');
      }
      setIsRedirectingToTelegram(false);
    }
  }

  const premiumButtonLabel = isPremiumUser
    ? 'Premium already active'
    : isRedirectingToTelegram
      ? 'Opening Telegram...'
      : 'Buy in Telegram / Купить в Telegram';

  const premiumActionHint = isPremiumUser
    ? 'Your premium subscription is already active.'
    : isAuthenticated
      ? 'Оплата проходит в Telegram по QR-коду, активация может занять до 24 часов.'
      : 'Sign in on the website first, then open Telegram checkout.';

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.heroBadge}>el zaman premium</p>
        <h2 className={styles.heroTitle}>Choose the plan that matches your learning goals</h2>
        <p className={styles.heroText}>
          Premium checkout is handled in Telegram with a QR payment flow and manual review.
        </p>
        <div className={styles.heroActions}>
          <Link to="/" className={styles.backButton}>
            Back to Home
          </Link>
          <a
            href="https://www.instagram.com/elzaman.kg"
            target="_blank"
            rel="noreferrer"
            className={styles.supportLink}
          >
            Support / Поддержка
          </a>
        </div>
      </div>

      <div className={styles.plansGrid}>
        <article className={styles.planCard}>
          <p className={styles.planLabel}>Free Plan</p>
          <h3 className={styles.planTitle}>Free</h3>
          <p className={styles.planPrice}>0 KGS / month</p>
          <p className={styles.planDescription}>
            A solid starting point for building daily language habits and exploring the platform.
          </p>
          <ul className={styles.featureList}>
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                {feature}
              </li>
            ))}
          </ul>
          <p className={styles.planNote}>Best for new learners who want to start at no cost.</p>
        </article>

        <article className={`${styles.planCard} ${styles.planCardPremium}`}>
          <p className={styles.planLabel}>Premium Plan</p>
          <h3 className={styles.planTitle}>Premium</h3>
          <p className={styles.planPrice}>149 KGS / month</p>
          <p className={styles.planDescription}>
            Designed for consistent learners who want maximum content access and faster results.
          </p>
          <ul className={styles.featureList}>
            {PREMIUM_FEATURES.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                {feature}
              </li>
            ))}
          </ul>

          <div className={styles.purchasePanel}>
            <p className={styles.purchaseLead}>
              After opening the bot, the user confirms the rules, receives the QR code, sends the
              website email, and uploads the payment screenshot.
            </p>
            <button
              type="button"
              className={styles.purchaseButton}
              onClick={handleTelegramCheckout}
              disabled={!isAuthenticated || isRedirectingToTelegram || isPremiumUser}
            >
              {premiumButtonLabel}
            </button>
            <p className={styles.purchaseHint}>{premiumActionHint}</p>
            <p className={styles.purchaseHint}>
              Warning / Предупреждение: payment verification and premium activation can take up to
              24 hours.
            </p>
            {checkoutError ? <p className={styles.errorMessage}>{checkoutError}</p> : null}
          </div>

          <p className={styles.planNote}>
            Best for focused learners who want full access and depth.
          </p>
        </article>
      </div>
    </section>
  );
}

export default PremiumPage;
