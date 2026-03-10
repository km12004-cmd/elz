import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { fetchAchievements } from '@/entities/achievements/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useProgress } from '@/features/xp/hooks/useProgress';
import { useI18n } from '@/features/i18n/hooks/useI18n';
import { normalizeRole } from '@/shared/lib/roles';
import { xpFillPercent } from '@/shared/lib/xpLevels';
import styles from './profilePage.module.css';

const PLACEHOLDER_STRINGS = new Set([
  'not provided',
  'not-provided',
  'not_provided',
  'n/a',
  'null',
  'undefined',
]);

function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_STRINGS.has(trimmed.toLowerCase())) return null;
  return trimmed;
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

function formatDate(value, options, { locale, t }) {
  const date = parseDate(value);
  if (!date) return t('Not provided');

  return new Intl.DateTimeFormat(locale, options).format(date);
}

function formatGender(value, t) {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return t('Not provided');

  if (normalized === 'male') return t('Male');
  if (normalized === 'female') return t('Female');

  return normalized[0].toUpperCase() + normalized.slice(1);
}

function getSafeValue(value, t) {
  return normalizeString(value) ?? t('Not provided');
}

function normalizeStreak(value, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function pluralRu(value, one, few, many) {
  const count = Math.abs(Number(value) || 0);
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatStreakDays(value, language) {
  const safeValue = normalizeStreak(value);
  if (language === 'ru') {
    return `${safeValue} ${pluralRu(safeValue, 'день', 'дня', 'дней')}`;
  }

  return `${safeValue} day${safeValue === 1 ? '' : 's'}`;
}

const CATEGORY_ORDER = ['starter', 'streak', 'vocabulary', 'xp', 'songs', 'perfect'];

const CATEGORY_ICONS = {
  starter: '\u{1F31F}',
  streak: '\u{1F525}',
  vocabulary: '\u{1F4DA}',
  xp: '\u{26A1}',
  songs: '\u{1F3B5}',
  perfect: '\u{1F48E}',
};

function ProfilePage() {
  const { isAuthenticated, user, token, signOut } = useAuth();
  const { progress } = useProgress();
  const { language, locale, setLanguage, t } = useI18n();
  const navigate = useNavigate();

  const [achievements, setAchievements] = useState([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setAchievementsLoading(true);
    fetchAchievements({ token })
      .then((items) => setAchievements(items))
      .catch(() => setAchievements([]))
      .finally(() => setAchievementsLoading(false));
  }, [token]);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const nickname = getSafeValue(user?.nickname ?? t('User'), t);
  const fullName = getSafeValue([user?.firstName, user?.lastName].filter(Boolean).join(' '), t);
  const email = getSafeValue(user?.email, t);
  const gender = formatGender(user?.gender, t);
  const birthDate = formatDate(user?.birthDate, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }, { locale, t });
  const memberSince = formatDate(user?.registeredAt, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }, { locale, t });
  const currentStreak = normalizeStreak(user?.streakCurrent ?? user?.streak_current);
  const bestStreak = normalizeStreak(user?.streakBest ?? user?.streak_best, currentStreak);
  const canAccessAdminConsole = normalizeRole(user?.role) === 'admin';

  const avatarLetter = (normalizeString(user?.nickname) ?? normalizeString(user?.firstName) ?? 'U')
    .slice(0, 1)
    .toUpperCase();

  const profileItems = [
    { label: t('Full name'), value: fullName },
    { label: t('Email'), value: email },
    { label: t('Gender'), value: gender },
    { label: t('Birth date'), value: birthDate },
    { label: t('Member since'), value: memberSince },
  ];

  const onLogout = () => {
    signOut();
    navigate('/', { replace: true });
  };

  const onBackToHome = () => {
    navigate('/');
  };

  const onOpenAdminConsole = () => {
    navigate('/admin');
  };

  const onLanguageChange = (event) => {
    setLanguage(event.target.value);
  };

  const groupedAchievements = CATEGORY_ORDER.reduce((groups, category) => {
    const items = achievements.filter((a) => a.category === category);
    if (items.length > 0) {
      groups.push({ category, items });
    }
    return groups;
  }, []);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.identity}>
          <div className={styles.avatarWrapper}>
            {user?.avatarUrl ? (
              <img
                className={styles.avatar}
                src={user.avatarUrl}
                alt={language === 'ru' ? `\u0410\u0432\u0430\u0442\u0430\u0440 ${nickname}` : `${nickname} avatar`}
              />
            ) : (
              <span className={styles.avatarFallback}>{avatarLetter}</span>
            )}
          </div>

          <div className={styles.userInfo}>
            <p className={styles.eyebrow}>{t('Profile')}</p>
            <h2 className={styles.nickname}>{nickname}</h2>
            <p className={styles.email}>{email}</p>
            <span className={styles.memberPill}>
              {t('Member since')} {memberSince}
            </span>
            <div className={styles.streakRow}>
              <span className={styles.streakPill}>
                <span className={styles.streakIcon} aria-hidden="true" />
                <span className={styles.streakLabel}>{t('Current streak')}</span>
                <span className={styles.streakValue}>{formatStreakDays(currentStreak, language)}</span>
              </span>
              <span className={`${styles.streakPill} ${styles.streakPillMuted}`}>
                <span className={styles.streakLabel}>{t('Best')}</span>
                <span className={styles.streakValue}>{formatStreakDays(bestStreak, language)}</span>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          {canAccessAdminConsole ? (
            <button type="button" className={styles.adminButton} onClick={onOpenAdminConsole}>
              {t('Admin console')}
            </button>
          ) : null}
          <button type="button" className={styles.homeButton} onClick={onBackToHome}>
            {t('Back to Home')}
          </button>
          <button type="button" className={styles.logoutButton} onClick={onLogout} title={t('Sign out')}>
            {t('Logout')}
          </button>
        </div>
      </div>

      <div className={styles.progressBlock}>
        {(() => {
          const { level, xpTotal, nextLevelThreshold, xpToNextLevel } = progress;
          const fillPercent = xpFillPercent(level, xpTotal);
          const isMaxLevel = xpToNextLevel === 0;
          const progressAriaLabel =
            language === 'ru'
              ? `\u0423\u0440\u043E\u0432\u0435\u043D\u044C ${level}, ${xpToNextLevel} XP \u0434\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F`
              : `Level ${level}, ${xpToNextLevel} XP to next level`;
          return (
            <>
              <div className={styles.progressHeader}>
                <span className={styles.progressLevel}>{`${t('Level')} ${level}`}</span>
                {!isMaxLevel && (
                  <span className={styles.progressXpMeta}>
                    {language === 'ru'
                      ? `${xpToNextLevel} XP \u0434\u043E \u0443\u0440. ${level + 1}`
                      : `${xpToNextLevel} XP to Lv. ${level + 1}`}
                  </span>
                )}
                {isMaxLevel && (
                  <span className={styles.progressXpMeta}>{t('Max level')}</span>
                )}
              </div>
              <div
                className={styles.progressBarWrap}
                role="progressbar"
                aria-valuenow={fillPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={progressAriaLabel}
              >
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
              <div className={styles.progressStats}>
                <div className={styles.progressStat}>
                  <span className={styles.progressStatLabel}>{t('Total XP')}</span>
                  <span className={styles.progressStatValue}>{xpTotal}</span>
                </div>
                <div className={styles.progressStat}>
                  <span className={styles.progressStatLabel}>{t('Next level at')}</span>
                  <span className={styles.progressStatValue}>{nextLevelThreshold} XP</span>
                </div>
                {!isMaxLevel && (
                  <div className={styles.progressStat}>
                    <span className={styles.progressStatLabel}>{t('Remaining')}</span>
                    <span className={styles.progressStatValue}>{xpToNextLevel} XP</span>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      <div className={styles.achievementsSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{t('Achievements')}</h3>
          <p className={styles.subtitle}>
            {t('Your progress and milestones.')}
            {totalCount > 0 && (
              <span className={styles.achievementsCount}>
                {' '}{unlockedCount}/{totalCount}
              </span>
            )}
          </p>
        </div>

        {achievementsLoading && (
          <p className={styles.achievementsLoading}>...</p>
        )}

        {!achievementsLoading && groupedAchievements.length > 0 && (
          <div className={styles.achievementCategories}>
            {groupedAchievements.map(({ category, items }) => (
              <div key={category} className={styles.achievementCategoryBlock}>
                <h4 className={styles.achievementCategoryTitle}>
                  <span className={styles.achievementCategoryIcon} aria-hidden="true">
                    {CATEGORY_ICONS[category] ?? ''}
                  </span>
                  {t(category)}
                </h4>
                <div className={styles.achievementGrid}>
                  {items.map((achievement) => {
                    const title = language === 'ru' && achievement.titleRu
                      ? achievement.titleRu
                      : achievement.title;
                    const description = language === 'ru' && achievement.descriptionRu
                      ? achievement.descriptionRu
                      : achievement.description;

                    return (
                      <article
                        key={achievement.code}
                        className={`${styles.achievementCard} ${achievement.unlocked ? styles.achievementUnlocked : styles.achievementLocked}`}
                      >
                        <div className={styles.achievementHeader}>
                          <span className={styles.achievementTitle}>{title}</span>
                          {achievement.unlocked && (
                            <span className={styles.achievementCheckmark} aria-label={t('Unlocked')}>
                              &#x2713;
                            </span>
                          )}
                        </div>
                        <p className={styles.achievementDescription}>{description}</p>
                        <span className={styles.achievementXp}>+{achievement.xpReward} XP</span>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{t('Account Details')}</h3>
          <p className={styles.subtitle}>{t('Your registration data and profile metadata.')}</p>
        </div>

        <div className={styles.languageControl}>
          <label className={styles.languageLabel} htmlFor="profile-language-select">
            {t('Interface language')}
          </label>
          <select
            id="profile-language-select"
            className={styles.languageSelect}
            value={language}
            onChange={onLanguageChange}
          >
            <option value="ru">{t('Russian')}</option>
            <option value="en">{t('English')}</option>
          </select>
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
