import React from 'react';
import { Home, Briefcase, CreditCard, Receipt, User } from 'lucide-react';

export type TabType = 'home' | 'operations' | 'wallets' | 'expenses' | 'account';

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange }) => {
  const navItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'operations', icon: Briefcase, label: 'Ops' },
    { id: 'wallets', icon: CreditCard, label: 'Wallets' },
    { id: 'expenses', icon: Receipt, label: 'Expenses' },
    { id: 'account', icon: User, label: 'Account' },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#09090c]/90 backdrop-blur-xl border-t border-white/[0.08] px-2 sm:px-6 pb-6 pt-3">
      <div className="flex justify-between items-center max-w-lg mx-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id as TabType)}
              className={`flex flex-col items-center p-2 min-w-[64px] transition-all duration-300 ${isActive ? 'text-emerald-400 scale-105' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Icon size={isActive ? 22 : 20} className={`mb-1 transition-all ${isActive ? 'drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : ''}`} />
              <span className={`text-[9px] font-semibold tracking-wider uppercase transition-opacity ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
