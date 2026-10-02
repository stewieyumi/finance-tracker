import React, { useEffect } from "react";

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
  className = "",
}) => {
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
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[100] bg-black/80 backdrop-blur-md animate-in fade-in duration-200 ${variantClasses} ${className}`.trim()}
    >
      {children}
    </div>
  );
};
