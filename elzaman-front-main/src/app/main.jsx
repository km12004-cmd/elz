import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/index.css';
import App from './App.jsx';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { ProgressProvider } from '@/app/providers/ProgressProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { I18nProvider } from '@/app/providers/I18nProvider';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ProgressProvider>
              <App />
            </ProgressProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)
