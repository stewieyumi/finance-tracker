import React from "react";
import ReactDOM from "react-dom/client";


const SyncIndicator = () => {
  const [isSyncing, setIsSyncing] = React.useState(false);
  
  React.useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url;
      
      // Only trigger the animation for our backend API routes
      if (url && (url.includes("/api/sync") || url.includes("/api/scan"))) {
        setIsSyncing(true);
        try {
          return await originalFetch(...args);
        } finally {
          // Add a small 600ms grace period so the animation doesn't flash violently on fast connections
          setTimeout(() => setIsSyncing(false), 600);
        }
      }
      return originalFetch(...args);
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  return (
    <div 
      className={`fixed z-[9999] left-1/2 -translate-x-1/2 transition-all duration-500 ease-out flex justify-center pointer-events-none ${
        isSyncing ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8"
      }`} 
      style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      <div className="bg-[#1c1c1e]/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-full px-4 py-2 flex items-center gap-2.5">
        <svg className="animate-spin h-3.5 w-3.5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-xs font-medium text-zinc-200 tracking-wide">Syncing</span>
      </div>
    </div>
  );
};

import App from "./App";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ""}>
    <SyncIndicator />
    <App />
  </GoogleOAuthProvider>
  </React.StrictMode>
);
