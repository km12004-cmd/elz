import { useCallback, useEffect, useRef, useState } from 'react';
import introVideo from '@/shared/assets/animation/animlogo.mp4';
import styles from './siteIntro.module.css';

const INTRO_FALLBACK_MS = 3600;
const INTRO_EXIT_MS = 700;
const REDUCED_MOTION_MS = 450;

function SiteIntro({ onFinish }) {
  const [isClosing, setIsClosing] = useState(false);
  const [prefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const hasFinishedRef = useRef(false);
  const exitTimeoutRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);

  const finishIntro = useCallback(() => {
    if (hasFinishedRef.current) return;

    hasFinishedRef.current = true;
    setIsClosing(true);
    exitTimeoutRef.current = window.setTimeout(() => {
      onFinish();
    }, INTRO_EXIT_MS);
  }, [onFinish]);

  useEffect(() => {
    const fallbackDuration = prefersReducedMotion ? REDUCED_MOTION_MS : INTRO_FALLBACK_MS;
    fallbackTimeoutRef.current = window.setTimeout(finishIntro, fallbackDuration);

    return () => {
      if (fallbackTimeoutRef.current) {
        window.clearTimeout(fallbackTimeoutRef.current);
      }
      if (exitTimeoutRef.current) {
        window.clearTimeout(exitTimeoutRef.current);
      }
    };
  }, [finishIntro, prefersReducedMotion]);

  return (
    <div className={`${styles.intro} ${isClosing ? styles.introClosing : ''}`}>
      <div className={styles.mediaLayer} aria-hidden="true">
        {prefersReducedMotion ? null : (
          <video
            className={styles.video}
            src={introVideo}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={finishIntro}
            onError={finishIntro}
          />
        )}
        <div className={styles.backdrop} />
      </div>
    </div>
  );
}

export default SiteIntro;
