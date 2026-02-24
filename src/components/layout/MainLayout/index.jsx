import { useLocation } from 'react-router-dom';
import Header from '../Header';
import styles from './mainLayout.module.css';

function MainLayout({ children }) {
  const location = useLocation();

  return (
    <div className={styles.appShell}>
      <Header />

      <main className={styles.pageFrame}>
        <div key={location.pathname} className={styles.pageTransition}>
          {children}
        </div>
      </main>
    </div>
  );
}

export default MainLayout;
