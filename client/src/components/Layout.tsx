import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useToast } from '../contexts/useToast';
import { useHistoryBackedOverlay } from '../lib/historyOverlay';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { BackToTop } from './BackToTop';
import { Sidebar } from './Sidebar';
import { Toast } from './Toast';

export function Layout() {
  const { t } = useI18n();
  const { toasts, removeToast } = useToast();
  const pageTopRef = useRef<HTMLDivElement | null>(null);
  const [theme, setTheme] = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      // The saved value is the desktop preference; the mobile drawer always starts closed
      if (window.innerWidth < 1024) {
        return false;
      }
      return localStorage.getItem('menuOpen') !== 'false';
    }
    return true;
  });

  useEffect(() => {
    if (window.innerWidth >= 1024) {
      localStorage.setItem('menuOpen', String(isMenuOpen));
    }
  }, [isMenuOpen]);

  // On mobile the sidebar is a drawer backed by a history entry, so the
  // browser Back button closes it instead of leaving the page.
  const menuHistory = useHistoryBackedOverlay('menuOpen', () => setIsMenuOpen(false));

  // A reload or restored tab brings the drawer's history entry back without the drawer.
  const hasStaleMenuEntry = menuHistory.isActive && !isMenuOpen;
  const closeMenuHistory = menuHistory.close;
  useEffect(() => {
    if (hasStaleMenuEntry) {
      closeMenuHistory();
    }
  }, [hasStaleMenuEntry, closeMenuHistory]);

  const closeMenu = () => {
    setIsMenuOpen(false);
    menuHistory.close();
  };

  const toggleMenu = () => {
    if (isMenuOpen) {
      closeMenu();
      return;
    }
    setIsMenuOpen(true);
    if (window.innerWidth < 1024) {
      menuHistory.open();
    }
  };

  const location = useLocation();

  const getPageTitle = (): string => {
    switch (location.pathname) {
      case '/':
        return t('pages.dashboard.title');
      case '/statistics':
        return t('pages.statistics.title');
      case '/alerts':
        return t('pages.alerts.title');
      case '/decisions':
        return t('pages.decisions.title');
      case '/allowlists':
        return t('pages.allowlists.title');
      case '/metrics':
        return t('pages.metrics.title');
      case '/notifications':
        return t('pages.notifications.title');
      case '/settings':
        return t('pages.settings.title');
      default:
        return t('pages.dashboard.title');
    }
  };

  return (
    <div className="flex h-[100dvh] font-sans text-gray-900 dark:text-gray-100">
      {/* Mobile Sidebar Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out lg:hidden ${isMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeMenu}
      />

      <Sidebar
        isOpen={isMenuOpen}
        onClose={closeMenu}
        onToggle={toggleMenu}
        replaceOnNavigate={menuHistory.isActive}
        theme={theme}
        setTheme={setTheme}
      />

      <main
        data-scroll-container
        className={`relative isolate z-0 w-full flex-1 overflow-auto transition-[padding] duration-300 ease-in-out ${isMenuOpen ? 'lg:pl-[360px] lg:max-2xl:pl-[272px]' : 'lg:pl-16'} ${isMenuOpen ? 'touch-none overflow-hidden lg:touch-auto lg:overflow-auto' : ''}`}
      >
        <div
          ref={pageTopRef}
          className="pointer-events-none absolute top-80 left-0 h-px w-px"
          aria-hidden="true"
        />
        <div className="acrylic sticky top-0 z-30 border-b">
          <div className="px-4 lg:px-8">
            <div className="flex h-16 items-center gap-4">
              {/* Mobile hamburger button */}
              <button
                onClick={toggleMenu}
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:bg-gray-100 lg:hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label={t('components.layout.openMenu')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="4" x2="20" y1="12" y2="12" />
                  <line x1="4" x2="20" y1="6" y2="6" />
                  <line x1="4" x2="20" y1="18" y2="18" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{getPageTitle()}</h1>
            </div>
          </div>
        </div>

        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
        <BackToTop visibilityTargetRef={pageTopRef} />
      </main>
      <div className="fixed right-4 bottom-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
}
