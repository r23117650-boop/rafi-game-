import React, { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const mobile = ios || /android|mobile/.test(ua);
    setIsIOS(ios);
    setIsMobile(mobile);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isMobile,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  if (!isInstallable && !isIOS && !isMobile) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex h-10 items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-2 focus-visible:outline-emerald-400"
      >
        {isInstallable ? (
          <Download className="h-3.5 w-3.5" />
        ) : (
          <Smartphone className="h-3.5 w-3.5" />
        )}
        Install Phone App
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-2xl font-bold text-white">
                {isIOS ? 'Install on iPhone / iPad' : 'Install on Android'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                <li>1. Open this page in Safari on your iPhone or iPad.</li>
                <li>2. Tap the Share icon in the Safari toolbar.</li>
                <li>
                  3. Scroll down and tap{' '}
                  <strong className="text-white">Add to Home Screen</strong>.
                </li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                <li>1. Open this app link directly in Google Chrome on Android.</li>
                <li>2. Tap the three-dot menu (⋮) in the top-right corner.</li>
                <li>
                  3. Tap{' '}
                  <strong className="text-white">Add to Home screen</strong> or{' '}
                  <strong className="text-white">Install app</strong> to launch
                  full-screen like a native app.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-md bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-amber-400/40 bg-slate-950/95 px-3 py-1.5 text-xs font-medium text-amber-300 shadow-lg">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline Mode — Playing cached game</span>
    </div>
  );
};
