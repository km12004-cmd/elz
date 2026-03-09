import { createElement } from 'react';
import styles from './skeleton.module.css';

function Skeleton({ className = '', as = 'span', style }) {
  return createElement(as, {
    className: `${styles.skeleton} ${className}`.trim(),
    style,
    'aria-hidden': 'true',
  });
}

export default Skeleton;
