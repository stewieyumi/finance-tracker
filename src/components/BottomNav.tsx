import React from 'react';
import { Home, Briefcase, CreditCard, Receipt, User } from 'lucide-react';

export type TabType = 'home' | 'operations' | 'wallets' | 'expenses' | 'account';

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange }) => {
  // Reordered to put Home perfectly in the center
  const navItems = [
    { id: 'operations', icon: Briefcase, label: 'Ops' },
    { id: 'wallets', icon: CreditCard, label: 'Wallets' },
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'expenses', icon: Receipt, label: 'Expenses' },
    { id: 'account', icon: User, label: 'Account' },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#070709]/75 backdrop-blur-2xl border-t border-white/[0.08] px-2 sm:px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2.5 supports-[backdrop-filter]:bg-[#070709]/60">
      <div className="flex justify-between items-center max-w-lg mx-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id as TabType)}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              className="relative flex flex-col items-center justify-center w-full h-12 active:scale-90 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <div className={`relative flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isActive ? '-translate-y-1.5 text-blue-500' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'drop-shadow-[0_4px_12px_rgba(59,130,246,0.5)]' : ''} />
              </div>
              <span className={`absolute bottom-0 text-[10px] font-medium tracking-wide transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isActive ? 'opacity-100 text-blue-500 translate-y-0.5' : 'opacity-0 text-zinc-500 translate-y-2'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
