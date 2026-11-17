import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { DateTimeProvider } from './lib/DateTimeProvider';
import { FontProvider } from './lib/FontProvider';
import { I18nProvider } from './lib/I18nProvider';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <FontProvider>
        <DateTimeProvider>
          <App />
        </DateTimeProvider>
      </FontProvider>
    </I18nProvider>
  </StrictMode>,
);
