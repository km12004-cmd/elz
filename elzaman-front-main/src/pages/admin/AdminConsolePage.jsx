import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  fetchAdminUserById,
  fetchAdminUsers,
  grantAdminUserPremium,
  revokeAdminUserPremium,
  updateAdminUserExperience,
  updateAdminUserRole,
} from '@/entities/user/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import Toast from '@/shared/ui/Toast';
import { normalizeRole } from '@/shared/lib/roles';
import { normalizeId } from '@/shared/lib/normalizeId';
import ContentManagementPanel from '@/widgets/admin/ContentManagementPanel';
import {
  normalizeString,
  formatRole,
  buildDisplayName,
  formatDateTime,
  parseIntegerInput,
} from './lib/adminHelpers';
import styles from './adminConsolePage.module.css';

const LIMIT_OPTIONS = [10, 20, 50, 100];
const ROLE_OPTIONS = ['user', 'admin'];

function AdminConsolePage() {
  const { token, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(null);
  const [usersError, setUsersError] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetailError, setUserDetailError] = useState('');
  const [isLoadingUserDetail, setIsLoadingUserDetail] = useState(false);

  const [roleInput, setRoleInput] = useState('user');
  const [premiumDaysInput, setPremiumDaysInput] = useState('30');
  const [experienceInput, setExperienceInput] = useState('');
  const [actionError, setActionError] = useState('');

  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isGrantingPremium, setIsGrantingPremium] = useState(false);
  const [isRevokingPremium, setIsRevokingPremium] = useState(false);
  const [isUpdatingExperience, setIsUpdatingExperience] = useState(false);

  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const canGoPrev = offset > 0;
  const hasKnownTotal = Number.isInteger(usersTotal) && usersTotal >= 0;
  const canGoNext = hasKnownTotal ? offset + limit < usersTotal : users.length >= limit;
  const currentPage = Math.floor(offset / limit) + 1;
  const selectedRole = normalizeRole(selectedUser?.role) ?? 'user';
  const selectedDisplayName = buildDisplayName(selectedUser);
  const isMutating = isUpdatingRole || isGrantingPremium || isRevokingPremium || isUpdatingExperience;

  const showToast = useCallback((message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
  }, []);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timer = window.setTimeout(() => {
      setToastMessage('');
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toastMessage]);

  useEffect(() => {
    setActionError('');
  }, [selectedUserId]);

  const handleUnauthorizedError = useCallback(
    (error) => {
      if (error?.status !== 401) return false;
      signOut();
      navigate('/', { replace: true });
      return true;
    },
    [navigate, signOut],
  );

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setUsersError('');

    try {
      const data = await fetchAdminUsers({ token, query, limit, offset });
      const items = Array.isArray(data?.items) ? data.items : [];

      setUsers(items);
      setUsersTotal(Number.isInteger(data?.total) ? data.total : null);
      setSelectedUserId((previousUserId) => {
        if (previousUserId && items.some((item) => normalizeId(item.id) === previousUserId)) {
          return previousUserId;
        }

        const firstWithId = items.find((item) => normalizeId(item.id));
        return firstWithId ? normalizeId(firstWithId.id) : null;
      });
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setUsers([]);
      setUsersTotal(null);
      setUsersError(extractErrorMessage(error, { context: 'admin' }));
      setSelectedUserId(null);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [handleUnauthorizedError, limit, offset, query, token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadUserDetail = useCallback(
    async (nextUserId) => {
      const normalizedUserId = normalizeId(nextUserId);
      if (!normalizedUserId) {
        setSelectedUser(null);
        setUserDetailError('');
        setRoleInput('user');
        setExperienceInput('');
        return null;
      }

      setIsLoadingUserDetail(true);
      setUserDetailError('');

      try {
        const detail = await fetchAdminUserById({ token, userId: normalizedUserId });
        setSelectedUser(detail);
        setRoleInput(normalizeRole(detail?.role) ?? 'user');
        setExperienceInput(Number.isInteger(detail?.experience) ? String(detail.experience) : '');
        return detail;
      } catch (error) {
        if (handleUnauthorizedError(error)) return null;
        setSelectedUser(null);
        setUserDetailError(extractErrorMessage(error, { context: 'admin' }));
        return null;
      } finally {
        setIsLoadingUserDetail(false);
      }
    },
    [handleUnauthorizedError, token],
  );

  useEffect(() => {
    loadUserDetail(selectedUserId);
  }, [loadUserDetail, selectedUserId]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    setOffset(0);
    setQuery(normalizeString(searchInput) ?? '');
  };

  const onClearSearch = () => {
    setSearchInput('');
    setOffset(0);
    setQuery('');
  };

  const onLimitChange = (event) => {
    const parsed = Number.parseInt(event.target.value, 10);
    setLimit(LIMIT_OPTIONS.includes(parsed) ? parsed : 20);
    setOffset(0);
  };

  const onSelectUser = (id) => {
    const normalizedUserId = normalizeId(id);
    if (!normalizedUserId) return;
    setSelectedUserId(normalizedUserId);
  };

  const detailMeta = useMemo(
    () => [
      { label: 'User ID', value: selectedUser?.id ?? 'Not set' },
      { label: 'Role', value: formatRole(selectedUser?.role) },
      { label: 'XP', value: Number.isInteger(selectedUser?.experience) ? String(selectedUser.experience) : 'Not set' },
      { label: 'Level', value: Number.isInteger(selectedUser?.level) ? String(selectedUser.level) : 'Not set' },
      { label: 'Premium', value: selectedUser?.isPremium ? 'Active' : 'Inactive' },
      { label: 'Premium until', value: formatDateTime(selectedUser?.premiumUntil) },
    ],
    [selectedUser],
  );

  const refreshCurrentUser = useCallback(async () => {
    const normalizedUserId = normalizeId(selectedUserId);
    if (!normalizedUserId) return;
    await Promise.all([loadUserDetail(normalizedUserId), loadUsers()]);
  }, [loadUserDetail, loadUsers, selectedUserId]);

  const onSubmitRole = async (event) => {
    event.preventDefault();

    const normalizedUserId = normalizeId(selectedUserId);
    const normalizedNextRole = normalizeRole(roleInput);
    if (!normalizedUserId) return;
    if (!normalizedNextRole) {
      setActionError('Role is required.');
      return;
    }

    setIsUpdatingRole(true);
    setActionError('');

    try {
      await updateAdminUserRole({
        token,
        userId: normalizedUserId,
        role: normalizedNextRole,
      });
      await refreshCurrentUser();
      showToast(`Role updated to ${normalizedNextRole}.`);
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const onSubmitPremiumGrant = async (event) => {
    event.preventDefault();

    const normalizedUserId = normalizeId(selectedUserId);
    const days = parseIntegerInput(premiumDaysInput);
    if (!normalizedUserId) return;
    if (!Number.isInteger(days) || days < 1) {
      setActionError('Days must be a positive integer.');
      return;
    }

    setIsGrantingPremium(true);
    setActionError('');

    try {
      await grantAdminUserPremium({
        token,
        userId: normalizedUserId,
        days,
      });
      await refreshCurrentUser();
      showToast('Premium access granted.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsGrantingPremium(false);
    }
  };

  const onRevokePremium = async () => {
    const normalizedUserId = normalizeId(selectedUserId);
    if (!normalizedUserId) return;

    setIsRevokingPremium(true);
    setActionError('');

    try {
      await revokeAdminUserPremium({
        token,
        userId: normalizedUserId,
      });
      await refreshCurrentUser();
      showToast('Premium access revoked.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsRevokingPremium(false);
    }
  };

  const onSubmitExperience = async (event) => {
    event.preventDefault();

    const normalizedUserId = normalizeId(selectedUserId);
    const experience = parseIntegerInput(experienceInput);
    if (!normalizedUserId) return;
    if (!Number.isInteger(experience) || experience < 0) {
      setActionError('Experience must be a non-negative integer.');
      return;
    }

    setIsUpdatingExperience(true);
    setActionError('');

    try {
      await updateAdminUserExperience({
        token,
        userId: normalizedUserId,
        experience,
      });
      await refreshCurrentUser();
      showToast('Experience updated.');
    } catch (error) {
      if (handleUnauthorizedError(error)) return;
      setActionError(extractErrorMessage(error, { context: 'admin' }));
    } finally {
      setIsUpdatingExperience(false);
    }
  };

  if (!isAuthenticated || normalizeRole(user?.role) !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div>
          <p className={styles.heroBadge}>Admin area</p>
          <h2 className={styles.heroTitle}>Admin console</h2>
          <p className={styles.heroSubtitle}>
            Manage users, roles, premium subscriptions, and experience values.
          </p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/profile')}>
            Back to profile
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Users</h3>
            <p className={styles.panelSubtitle}>Search by email, nickname, or ID.</p>
          </div>

          <form className={styles.searchForm} onSubmit={onSearchSubmit}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search users..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit" className={styles.actionButton}>
              Search
            </button>
            <button type="button" className={styles.mutedButton} onClick={onClearSearch}>
              Reset
            </button>
          </form>

          <div className={styles.filtersRow}>
            <label className={styles.limitLabel}>
              Limit
              <select className={styles.select} value={limit} onChange={onLimitChange}>
                {LIMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.counterText}>
              {hasKnownTotal ? `${usersTotal} total` : `${users.length} loaded`}
            </p>
          </div>

          {usersError ? <p className={styles.errorText}>{usersError}</p> : null}

          {isLoadingUsers ? (
            <div className={styles.loadingRow}>
              <LoadingSpinner size="sm" />
              <span>Loading users...</span>
            </div>
          ) : null}

          {!isLoadingUsers && users.length === 0 ? (
            <p className={styles.emptyState}>No users found for current filters.</p>
          ) : null}

          {!isLoadingUsers && users.length > 0 ? (
            <ul className={styles.userList}>
              {users.map((item, index) => {
                const itemId = normalizeId(item.id);
                const isSelected = Boolean(itemId && itemId === selectedUserId);
                const role = normalizeRole(item.role) ?? 'user';

                return (
                  <li key={itemId ?? `admin-user-${index}`}>
                    <button
                      type="button"
                      className={`${styles.userRow} ${isSelected ? styles.userRowActive : ''}`}
                      onClick={() => onSelectUser(itemId)}
                      disabled={!itemId}
                    >
                      <div className={styles.userRowMain}>
                        <p className={styles.userRowName}>{buildDisplayName(item)}</p>
                        <p className={styles.userRowEmail}>{item.email ?? 'No email'}</p>
                      </div>
                      <div className={styles.userRowMeta}>
                        <span
                          className={`${styles.roleBadge} ${
                            role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeUser
                          }`}
                        >
                          {formatRole(role)}
                        </span>
                        <span className={styles.userRowId}>#{item.id ?? 'n/a'}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className={styles.paginationRow}>
            <button
              type="button"
              className={styles.mutedButton}
              disabled={!canGoPrev || isLoadingUsers}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            >
              Previous
            </button>
            <span className={styles.pageText}>Page {currentPage}</span>
            <button
              type="button"
              className={styles.mutedButton}
              disabled={!canGoNext || isLoadingUsers}
              onClick={() => setOffset((prev) => prev + limit)}
            >
              Next
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>User controls</h3>
            <p className={styles.panelSubtitle}>Apply role, premium, and XP changes.</p>
          </div>

          {!selectedUserId && !isLoadingUserDetail ? (
            <p className={styles.emptyState}>Select a user from the left panel to continue.</p>
          ) : null}

          {isLoadingUserDetail ? (
            <div className={styles.loadingRow}>
              <LoadingSpinner size="sm" />
              <span>Loading user details...</span>
            </div>
          ) : null}

          {userDetailError ? <p className={styles.errorText}>{userDetailError}</p> : null}

          {selectedUser && !isLoadingUserDetail ? (
            <div className={styles.detailContent}>
              <div className={styles.userSummary}>
                <div>
                  <h4 className={styles.userSummaryTitle}>{selectedDisplayName}</h4>
                  <p className={styles.userSummaryEmail}>{selectedUser.email ?? 'No email'}</p>
                </div>
                <div className={styles.userSummaryTags}>
                  <span
                    className={`${styles.roleBadge} ${
                      selectedRole === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeUser
                    }`}
                  >
                    {formatRole(selectedRole)}
                  </span>
                  <span className={styles.statusBadge}>
                    Premium: {selectedUser.isPremium ? 'On' : 'Off'}
                  </span>
                </div>
              </div>

              <div className={styles.metaGrid}>
                {detailMeta.map((meta) => (
                  <article key={meta.label} className={styles.metaCard}>
                    <p className={styles.metaLabel}>{meta.label}</p>
                    <p className={styles.metaValue}>{meta.value}</p>
                  </article>
                ))}
              </div>

              {actionError ? <p className={styles.errorText}>{actionError}</p> : null}

              <div className={styles.actionsGrid}>
                <article className={styles.actionCard}>
                  <h5 className={styles.actionTitle}>Assign role</h5>
                  <p className={styles.actionDescription}>Set role for the selected user.</p>
                  <form className={styles.formRow} onSubmit={onSubmitRole}>
                    <select
                      className={styles.select}
                      value={roleInput}
                      onChange={(event) => setRoleInput(event.target.value)}
                      disabled={isMutating}
                    >
                      {ROLE_OPTIONS.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {formatRole(roleOption)}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={styles.actionButton} disabled={isMutating}>
                      {isUpdatingRole ? 'Saving...' : 'Save role'}
                    </button>
                  </form>
                </article>

                <article className={styles.actionCard}>
                  <h5 className={styles.actionTitle}>Premium access</h5>
                  <p className={styles.actionDescription}>Grant or revoke premium subscription.</p>
                  <form className={styles.formRow} onSubmit={onSubmitPremiumGrant}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={styles.numberInput}
                      value={premiumDaysInput}
                      onChange={(event) => setPremiumDaysInput(event.target.value)}
                      placeholder="Days"
                      disabled={isMutating}
                    />
                    <button type="submit" className={styles.actionButton} disabled={isMutating}>
                      {isGrantingPremium ? 'Granting...' : 'Grant premium'}
                    </button>
                  </form>
                  <button
                    type="button"
                    className={`${styles.mutedButton} ${styles.dangerButton}`}
                    onClick={onRevokePremium}
                    disabled={isMutating}
                  >
                    {isRevokingPremium ? 'Revoking...' : 'Revoke premium'}
                  </button>
                </article>

                <article className={styles.actionCard}>
                  <h5 className={styles.actionTitle}>Experience override</h5>
                  <p className={styles.actionDescription}>
                    Set a specific XP value and let backend recalculate level.
                  </p>
                  <form className={styles.formRow} onSubmit={onSubmitExperience}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={styles.numberInput}
                      value={experienceInput}
                      onChange={(event) => setExperienceInput(event.target.value)}
                      placeholder="Experience"
                      disabled={isMutating}
                    />
                    <button type="submit" className={styles.actionButton} disabled={isMutating}>
                      {isUpdatingExperience ? 'Updating...' : 'Update XP'}
                    </button>
                  </form>
                </article>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <ContentManagementPanel token={token} showToast={showToast} onUnauthorizedError={handleUnauthorizedError} />

      <Toast type={toastType} message={toastMessage} onClose={() => setToastMessage('')} />
    </section>
  );
}

export default AdminConsolePage;
