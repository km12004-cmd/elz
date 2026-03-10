import logo from '@/shared/assets/images/logo.svg';
import AuthModal from '@/features/auth/ui/AuthModal';
import SignInForm from '@/features/auth/ui/SignInForm';
import SignUpForm from '@/features/auth/ui/SignUpForm';
import Toast from '@/shared/ui/Toast';
import styles from '../../pages/dashboard/dashboardPage.module.css';

const GUEST_SIGNAL_LABELS = Object.freeze(['Songs', 'My Flashcards', 'Profile & progress']);

function GuestScreen({ authView, setAuthView, toastType, toastMessage, setToastMessage }) {
  const closeAuth = () => setAuthView(null);

  return (
    <>
      <section className={styles.guestScreen}>
        <div className={styles.guestScene}>
          <div className={styles.guestMainPanel}>
            <div className={styles.guestArtwork} aria-hidden="true" data-i18n-skip="true">
              <div className={styles.guestArtworkGlow} />
              <div className={`${styles.guestArtworkCard} ${styles.guestArtworkCardTop}`}>
                <span className={styles.guestArtworkBadge}>KG</span>
                <span className={styles.guestArtworkLineLong} />
                <span className={styles.guestArtworkLineShort} />
              </div>
              <div className={`${styles.guestArtworkCard} ${styles.guestArtworkCardBottom}`}>
                <span className={styles.guestArtworkBadgeAlt}>RU</span>
                <span className={styles.guestArtworkWave} />
              </div>
              <div className={styles.guestArtworkOrb}>
                <span className={styles.guestArtworkOrbRing} />
                <span className={styles.guestArtworkOrbCore}>
                  <img src={logo} alt="" className={styles.guestArtworkLogo} />
                </span>
              </div>
              <div className={styles.guestArtworkNote} />
              <div className={styles.guestArtworkPillTop}>SONG</div>
              <div className={styles.guestArtworkPillBottom}>CARD</div>
            </div>

            <div className={styles.guestCopy}>
              <span className={styles.guestEyebrow}>A calm place to begin</span>
              <h2 className={styles.guestTitle}>
                Preserve Kyrgyz through songs that stay with you.
              </h2>

              <div className={styles.guestActionRow}>
                <button
                  type="button"
                  className={styles.guestPrimaryCta}
                  onClick={() => setAuthView('signUp')}>
                  Sign up
                </button>
                <button
                  type="button"
                  className={styles.guestSecondaryCta}
                  onClick={() => setAuthView('signIn')}>
                  Sign in
                </button>
              </div>

              <div className={styles.guestSignalRow}>
                {GUEST_SIGNAL_LABELS.map((label) => (
                  <span key={label} className={styles.guestSignalPill}>
                    {label}
                  </span>
                ))}
              </div>

              <p className={styles.guestSupportText}>
                Sign in to save playlists, flashcards, streak, and account progress.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Toast type={toastType} message={toastMessage} onClose={() => setToastMessage('')} />

      <AuthModal isOpen={authView === 'signIn'} title="Sign in" onClose={closeAuth}>
        <SignInForm onSuccess={closeAuth} onSwitchToSignUp={() => setAuthView('signUp')} />
      </AuthModal>

      <AuthModal isOpen={authView === 'signUp'} title="Sign up" onClose={closeAuth}>
        <SignUpForm onSuccess={closeAuth} onSwitchToSignIn={() => setAuthView('signIn')} />
      </AuthModal>
    </>
  );
}

export default GuestScreen;
