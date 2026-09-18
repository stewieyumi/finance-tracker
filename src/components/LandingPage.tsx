import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { ShieldCheck, Cloud, Sparkles, UserMinus } from 'lucide-react';

interface LandingPageProps {
  onGoogleSuccess: (res: any) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGoogleSuccess }) => {
  const [lastProfile, setLastProfile] = useState<any>(null);

  // Load the last logged-in user profile to create the Meta-style Welcome Back screen
  useEffect(() => {
    const saved = localStorage.getItem('ft_last_profile');
    if (saved) {
      try { setLastProfile(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const handleSwitchAccount = () => {
    localStorage.removeItem('ft_last_profile');
    setLastProfile(null);
  };

  return (
    <div className="min-h-screen bg-shell flex flex-col items-center justify-center p-6 text-text-secondary font-sans relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="z-10 w-full max-w-sm flex flex-col items-center">
        {lastProfile ? (
          // META-STYLE "WELCOME BACK" UI
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-5">
              <img src={lastProfile.picture} alt="Profile" className="w-24 h-24 rounded-full border border-inverse/[0.1] shadow-2xl shadow-blue-900/30 object-cover bg-fill" />
              <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-[2.5px] border-shell rounded-full shadow-sm"></div>
            </div>
            <h1 className="text-2xl font-bold text-strong mb-1 tracking-tight">Welcome back,</h1>
            <h2 className="text-xl font-semibold text-primary mb-8">{lastProfile.name.split(' ')[0]}</h2>

            <div className="w-full bg-surface-elevated/80 backdrop-blur-xl border border-inverse/[0.08] p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-5">
              <GoogleLogin onSuccess={onGoogleSuccess} onError={() => alert('Google Sign-In Failed')} theme="filled_black" shape="pill" size="large" text="continue_with" />
              
              <div className="w-full h-[1px] bg-inverse/[0.05]" />
              
              <button onClick={handleSwitchAccount} className="flex items-center gap-2 text-xs text-faint hover:text-strong transition font-medium py-1">
                <UserMinus size={14} /> Log into another account
              </button>
            </div>
          </div>
        ) : (
          // GENERIC NEW USER UI
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-emerald-500 p-[1px] mb-6 shadow-2xl shadow-blue-900/20">
              <div className="w-full h-full bg-surface-sunken rounded-2xl flex items-center justify-center">
                <img src="/icon-192.png" alt="Finance Tracker Logo" className="w-9 h-9 object-contain drop-shadow-lg" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-strong mb-2 tracking-tight">Finance Tracker</h1>
            <p className="text-muted text-sm text-center mb-10">Sign in to sync your data securely across all devices.</p>

            <div className="w-full bg-surface-elevated/80 backdrop-blur-xl border border-inverse/[0.08] p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-6">
              <GoogleLogin onSuccess={onGoogleSuccess} onError={() => alert('Google Sign-In Failed')} theme="filled_black" shape="pill" size="large" text="continue_with" />

              <div className="w-full h-[1px] bg-inverse/[0.05]" />

              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center gap-3 text-xs text-muted"><Cloud size={16} className="text-blue-400 shrink-0" /><span>Real-time cross-device sync</span></div>
                <div className="flex items-center gap-3 text-xs text-muted"><ShieldCheck size={16} className="text-emerald-400 shrink-0" /><span>Secure isolated cloud storage</span></div>
              </div>
            </div>
            
            
          </div>
        )}
      </div>
    </div>
  );
};
