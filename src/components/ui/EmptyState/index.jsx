import styles from './emptyState.module.css';

function EmptyStateIcon({ kind }) {
  if (kind === 'folder') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 8.5C3 7.39543 3.89543 6.5 5 6.5H9L11 8.5H19C20.1046 8.5 21 9.39543 21 10.5V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V8.5Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === 'playlist') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 6.5H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 11.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 16.5H11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="17.5" cy="15.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3L14.7 8.3L20.5 9.1L16.2 13.2L17.2 19L12 16.2L6.8 19L7.8 13.2L3.5 9.1L9.3 8.3L12 3Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EmptyState({
  kind = 'default',
  title,
  description,
  actionLabel,
  onAction,
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.iconWrap} aria-hidden="true">
        <EmptyStateIcon kind={kind} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actionLabel ? (
        <button type="button" className={styles.actionButton} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default EmptyState;
