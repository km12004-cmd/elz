import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useProgress } from '../../contexts/useProgress';
import { xpFillPercent } from '../../utils/xpLevels';
import styles from './profilePage.module.css';

function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseDate(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatDate(value, options) {
  const date = parseDate(value);
  if (!date) return 'Not provided';

  return new Intl.DateTimeFormat('en-US', options).format(date);
}

function formatGender(value) {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return 'Not provided';

  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';

  return normalized[0].toUpperCase() + normalized.slice(1);
}

function getSafeValue(value) {
  return normalizeString(value) ?? 'Not provided';
}

function ProfilePage() {
  const { isAuthenticated, user, signOut } = useAuth();
  const { progress } = useProgress();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const nickname = getSafeValue(user?.nickname ?? 'User');
  const fullName = getSafeValue([user?.firstName, user?.lastName].filter(Boolean).join(' '));
  const email = getSafeValue(user?.email);
  const gender = formatGender(user?.gender);
  const birthDate = formatDate(user?.birthDate, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const memberSince = formatDate(user?.registeredAt, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const avatarLetter = (normalizeString(user?.nickname) ?? normalizeString(user?.firstName) ?? 'U')
    .slice(0, 1)
    .toUpperCase();

  const profileItems = [
    { label: 'Full name', value: fullName },
    { label: 'Email', value: email },
    { label: 'Gender', value: gender },
    { label: 'Birth date', value: birthDate },
    { label: 'Member since', value: memberSince },
  ];

  const onLogout = () => {
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.identity}>
          <div className={styles.avatarWrapper}>
            {user?.avatarUrl ? (
              <img className={styles.avatar} src={user.avatarUrl} alt={`${nickname} avatar`} />
            ) : (
              <span className={styles.avatarFallback}>{avatarLetter}</span>
            )}
          </div>

          <div className={styles.userInfo}>
            <p className={styles.eyebrow}>Profile</p>
            <h2 className={styles.nickname}>{nickname}</h2>
            <p className={styles.email}>{email}</p>
            <span className={styles.memberPill}>Member since {memberSince}</span>
          </div>
        </div>

        <button type="button" className={styles.logoutButton} onClick={onLogout} title="Sign out">
          Logout
        </button>
      </div>

      <div className={styles.progressBlock}>
        {(() => {
          const { level, xpTotal, nextLevelThreshold, xpToNextLevel } = progress;
          const fillPercent = xpFillPercent(level, xpTotal);
          const isMaxLevel = xpToNextLevel === 0;
          return (
            <>
              <div className={styles.progressHeader}>
                <span className={styles.progressLevel}>Level {level}</span>
                {!isMaxLevel && (
                  <span className={styles.progressXpMeta}>
                    {xpToNextLevel} XP to Lv. {level + 1}
                  </span>
                )}
                {isMaxLevel && (
                  <span className={styles.progressXpMeta}>Max level</span>
                )}
              </div>
              <div
                className={styles.progressBarWrap}
                role="progressbar"
                aria-valuenow={fillPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Level ${level}, ${xpToNextLevel} XP to next level`}
              >
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
              <div className={styles.progressStats}>
                <div className={styles.progressStat}>
                  <span className={styles.progressStatLabel}>Total XP</span>
                  <span className={styles.progressStatValue}>{xpTotal}</span>
                </div>
                <div className={styles.progressStat}>
                  <span className={styles.progressStatLabel}>Next level at</span>
                  <span className={styles.progressStatValue}>{nextLevelThreshold} XP</span>
                </div>
                {!isMaxLevel && (
                  <div className={styles.progressStat}>
                    <span className={styles.progressStatLabel}>Remaining</span>
                    <span className={styles.progressStatValue}>{xpToNextLevel} XP</span>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      <div className={styles.content}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Account Details</h3>
          <p className={styles.subtitle}>Your registration data and profile metadata.</p>
        </div>

        <div className={styles.infoGrid}>
          {profileItems.map((item) => (
            <article key={item.label} className={styles.infoCard}>
              <p className={styles.infoLabel}>{item.label}</p>
              <span className={styles.separator} />
              <p className={styles.infoValue}>{item.value}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProfilePage;
