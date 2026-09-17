import { useState, useEffect } from 'react';

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let currentScript: string | null = null;
    
    // Find the currently running JS bundle hash
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      if (scripts[i].src.includes('/assets/index-')) {
        currentScript = scripts[i].src.split('/').pop() || null;
        break;
      }
    }

    const checkForUpdate = async () => {
      // Skip in local development or if update is already detected
      if (!currentScript || updateAvailable) return;
      
      try {
        // Fetch the latest index.html from Vercel, bypassing the browser cache
        const res = await fetch(`/?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        
        // Extract the latest JS bundle hash
        const match = html.match(/\/assets\/index-[a-zA-Z0-9_-]+\.js/);
        if (match) {
          const latestScript = match[0].split('/').pop();
          if (latestScript && latestScript !== currentScript) {
            setUpdateAvailable(true);
          }
        }
      } catch (err) {
        // Silent fail on network errors (e.g., user is offline)
      }
    };

    // Check for updates every time the user focuses the window/app
    window.addEventListener('focus', checkForUpdate);
    // Also check silently in the background every 5 minutes
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000);
    
    return () => {
      window.removeEventListener('focus', checkForUpdate);
      clearInterval(interval);
    };
  }, [updateAvailable]);

  return { updateAvailable };
}
