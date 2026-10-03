import React from "react";
import { Modal } from "./ui/Modal";
import { AppNotification } from "../types/finance";
import {
  Bell,
  X,
  AlertCircle,
  Clock,
  ArrowDownLeft,
  Receipt,
  CheckCircle2,
  ChevronRight,
  Trash2,
} from "lucide-react";

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onNavigate: (route: "operations/bills" | "operations/inflows" | "expenses") => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onDismiss,
  onClearAll,
  onNavigate,
}) => {
  if (!isOpen) return null;

  const getNotificationIcon = (type: AppNotification["type"]) => {
    switch (type) {
      case "overdue_commitment":
        return {
          icon: <AlertCircle size={16} className="text-rose-400" />,
          wrapper: "bg-rose-500/10 border-rose-500/20",
          border: "border-rose-500/30 hover:border-rose-500/50",
        };
      case "upcoming_commitment":
        return {
          icon: <Clock size={16} className="text-amber-400" />,
          wrapper: "bg-amber-500/10 border-amber-500/20",
          border: "border-amber-500/30 hover:border-amber-500/50",
        };
      case "pending_receivable":
        return {
          icon: <ArrowDownLeft size={16} className="text-emerald-400" />,
          wrapper: "bg-emerald-500/10 border-emerald-500/20",
          border: "border-emerald-500/30 hover:border-emerald-500/50",
        };
      case "log_reminder":
        return {
          icon: <Receipt size={16} className="text-blue-400" />,
          wrapper: "bg-blue-500/10 border-blue-500/20",
          border: "border-blue-500/30 hover:border-blue-500/50",
        };
      default:
        return {
          icon: <Bell size={16} className="text-secondary" />,
          wrapper: "bg-surface-elevated border-inverse/[0.1]",
          border: "border-inverse/[0.08] hover:border-inverse/[0.15]",
        };
    }
  };

  const getActionLabel = (route?: string) => {
    switch (route) {
      case "operations/bills":
        return "View Bills";
      case "operations/inflows":
        return "View Inflows";
      case "expenses":
        return "Log Expenses";
      default:
        return "View Details";
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="sheet"
      ariaLabel="Notification Center"
    >
      <div className="bg-surface-elevated border border-inverse/[0.08] rounded-t-3xl sm:rounded-3xl w-full max-w-lg mx-auto shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Bell size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-strong uppercase tracking-wider">
                  Notifications
                </h2>
                {notifications.length > 0 && (
                  <span className="bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {notifications.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted">
                {notifications.length === 0
                  ? "No active alerts or reminders"
                  : `${notifications.length} pending alert${notifications.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-rose-400 px-2.5 py-1.5 rounded-xl border border-inverse/[0.08] hover:border-rose-500/30 bg-fill/50 transition font-medium"
                title="Clear all notifications"
              >
                <Trash2 size={12} />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notification center"
              className="text-faint hover:text-strong p-1.5 rounded-xl hover:bg-fill transition"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-sm font-semibold text-strong mb-1">All caught up!</h3>
              <p className="text-xs text-muted max-w-xs">
                No pending reminders, upcoming bills, or overdue payments right now.
              </p>
            </div>
          ) : (
            notifications.map(n => {
              const style = getNotificationIcon(n.type);

              return (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-2xl bg-surface-modal border ${style.border} transition shadow-sm flex items-start gap-3 group`}
                >
                  <div className={`p-2 rounded-xl border ${style.wrapper} shrink-0 mt-0.5`}>
                    {style.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-semibold text-strong leading-tight">
                        {n.title}
                      </h4>
                      <button
                        type="button"
                        onClick={() => onDismiss(n.id)}
                        aria-label={`Dismiss ${n.title}`}
                        className="text-faint hover:text-strong p-1 rounded-lg hover:bg-fill transition -mr-1 -mt-1"
                        title="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <p className="text-xs text-secondary mt-1 leading-relaxed">
                      {n.message}
                    </p>

                    {n.actionRoute && (
                      <button
                        type="button"
                        onClick={() => onNavigate(n.actionRoute!)}
                        className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition"
                      >
                        <span>{getActionLabel(n.actionRoute)}</span>
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
