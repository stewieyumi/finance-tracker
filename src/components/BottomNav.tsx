import React from "react";
import { LayoutDashboard, Briefcase, Wallet, Camera, User } from "lucide-react";

export type TabType = "home" | "operations" | "wallets" | "expenses" | "account";

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const tabs = [
    { 
      id: "home", 
      label: "Dashboard", 
      icon: LayoutDashboard, 
      activeColor: "text-blue-500", 
      activeBg: "bg-blue-500/10" 
    },
    { 
      id: "operations", 
      label: "Operations", 
      icon: Briefcase, 
      activeColor: "text-violet-500", 
      activeBg: "bg-violet-500/10" 
    },
    { 
      id: "wallets", 
      label: "Wallets", 
      icon: Wallet, 
      activeColor: "text-emerald-500", 
      activeBg: "bg-emerald-500/10" 
    },
    { 
      id: "expenses", 
      label: "Scanner", 
      icon: Camera, 
      activeColor: "text-amber-500", 
      activeBg: "bg-amber-500/10" 
    },
    { 
      id: "account", 
      label: "Account", 
      icon: User, 
      activeColor: "text-rose-500", 
      activeBg: "bg-rose-500/10" 
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/75 backdrop-blur-2xl border-t border-white/[0.05] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id as TabType)}
              className={`flex flex-col items-center justify-center w-[72px] py-1.5 rounded-xl transition-all duration-300 ${
                isActive ? tab.activeBg : "hover:bg-white/[0.02]"
              }`}
            >
              <div 
                className={`transition-all duration-300 ${
                  isActive ? "scale-110 " + tab.activeColor : "text-zinc-500 scale-100"
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span 
                className={`text-[10px] mt-1 font-medium transition-colors duration-300 ${
                  isActive ? tab.activeColor : "text-zinc-500"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
