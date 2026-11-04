import React, { useEffect, useRef } from "react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: "floating" | "sheet";
  ariaLabel?: string;
  ariaLabelledBy?: string;
  role?: string;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  manageFocus?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  variant = "floating",
  ariaLabel,
  ariaLabelledBy,
  role = "dialog",
  closeOnBackdropClick = true,
  closeOnEscape = true,
  manageFocus = false,
  className = "",
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !manageFocus || !dialog) return;

    const previousFocus = document.activeElement;
    dialog.focus();

    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isOpen, manageFocus]);

  const handleTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!manageFocus || event.key !== "Tab") return;

    const dialog = event.currentTarget;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]'
    )).filter(element =>
      element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Body scroll lock with exact previous overflow restoration
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Escape key handling
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const variantClasses =
    variant === "sheet"
      ? "flex flex-col justify-end sm:justify-center p-0 sm:p-4 overflow-y-auto"
      : "flex items-center justify-center p-4 sm:p-6 overflow-y-auto";

  return (
    <div
      ref={dialogRef}
      tabIndex={manageFocus ? -1 : undefined}
      onKeyDown={handleTab}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={handleBackdropClick}
      className={`fixed inset-0 !m-0 z-[100] bg-[var(--bg-modal-scrim)] backdrop-blur-md animate-in fade-in duration-200 ${variantClasses} ${className}`.trim()}
    >
      {children}
    </div>
  );
};
