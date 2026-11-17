import { X } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps extends PropsWithChildren {
  isOpen: boolean;
  onClose: () => void;
  title?: string | null;
  maxWidth?: string;
  showCloseButton?: boolean;
}

// Open modals in opening order, so Escape only closes the topmost one.
const openModals: object[] = [];

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
  showCloseButton = true,
}: ModalProps) {
  // Pressing inside the dialog and releasing over the backdrop (for example
  // while selecting text in an input) dispatches the click on the backdrop,
  // so the backdrop click only closes when the press also started on it.
  const pressStartedOnBackdrop = useRef<boolean | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const modal = {};
    openModals.push(modal);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      if (openModals[openModals.length - 1] !== modal) return;
      event.preventDefault();
      onCloseRef.current();
    };
    // Listening on window runs after document listeners, so popovers inside
    // the dialog can handle Escape first by calling preventDefault.
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      openModals.splice(openModals.indexOf(modal), 1);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="acrylic-overlay fixed inset-0 z-[10000] flex items-center justify-center p-4"
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={() => {
        const pressStartedInsideDialog = pressStartedOnBackdrop.current === false;
        pressStartedOnBackdrop.current = null;
        if (!pressStartedInsideDialog) onClose();
      }}
    >
      <div
        className={`acrylic w-full rounded-xl border ${maxWidth} flex max-h-[90vh] flex-col`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-6 dark:border-gray-700">
            {title && <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="ml-auto rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="[scrollbar-gutter:stable] overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
