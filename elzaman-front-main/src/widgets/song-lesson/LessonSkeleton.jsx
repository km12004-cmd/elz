import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import Skeleton from '@/shared/ui/Skeleton';
import styles from './songLesson.module.css';

function LessonSkeleton() {
  return (
    <>
      <div className={styles.loadingRow}>
        <LoadingSpinner size="sm" />
        <span>Загрузка песни...</span>
      </div>
      <div className={styles.layout}>
        <section className={styles.lyricsPane}>
          <Skeleton className={styles.skeletonLyricsStatus} />
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={`lyrics-skeleton-${index}`} className={styles.skeletonLyricsLine} />
          ))}
        </section>
        <aside className={styles.infoSidebar}>
          <div className={styles.trackCard}>
            <Skeleton className={styles.skeletonCoverArt} />
            <Skeleton className={styles.skeletonTrackTitle} />
            <Skeleton className={styles.skeletonTrackMeta} />
          </div>
          <div className={styles.infoPanel}>
            <Skeleton className={styles.skeletonInfoTitle} />
            <Skeleton className={styles.skeletonInfoRow} />
            <Skeleton className={styles.skeletonInfoRow} />
            <Skeleton className={styles.skeletonInfoRow} />
            <Skeleton className={styles.skeletonInfoRow} />
          </div>
        </aside>
      </div>
    </>
  );
}

export default LessonSkeleton;
