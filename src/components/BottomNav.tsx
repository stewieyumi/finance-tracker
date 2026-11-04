import React from "react";
import { Home, Briefcase, CreditCard, Receipt, User } from "lucide-react";

export type TabType = "home" | "operations" | "wallets" | "expenses" | "account";

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const tabs = [
    { id: "operations", label: "Operations", icon: Briefcase, accent: "chip-purple" },
    { id: "wallets", label: "Wallets", icon: CreditCard, accent: "chip-emerald" },
    { id: "home", label: "Dashboard", icon: Home, accent: "chip-blue" },
    { id: "expenses", label: "Expenses", icon: Receipt, accent: "chip-amber" },
    { id: "account", label: "Account", icon: User, accent: "chip-rose" },
  ] as const;

  return (
    <nav aria-label="Main navigation" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="navigation-glass pointer-events-auto mx-auto grid w-full max-w-lg grid-cols-5 gap-1 rounded-3xl p-1.5 sm:gap-2">
        {tabs.map(({ id, label, icon: Icon, accent }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-0.5 py-1 transition-colors motion-reduce:transition-none ${isActive
                ? `${accent} nav-current`
                : "border-transparent text-muted hover:bg-fill hover:text-primary"
              }`}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon aria-hidden="true" size={21} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className={`max-w-full truncate text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
