import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (Capacitor.isNativePlatform() || isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui font-semibold shadow-lg hover:brightness-105 active:scale-[0.98] transition whitespace-nowrap shrink-0 ${
          compact ? 'px-3.5 py-2 text-xs min-h-[44px]' : 'px-5 py-3 text-sm min-h-[48px] w-full sm:w-auto'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/45 bg-[#31005F]/50 text-[#F5D88A] font-royal-ui font-semibold hover:bg-[#31005F]/80 transition whitespace-nowrap shrink-0 ${
            compact ? 'px-3.5 py-2 text-xs min-h-[44px]' : 'px-5 py-3 text-sm min-h-[48px]'
          }`}
        >
          <Share className="w-4 h-4 shrink-0" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm royal-glass-elevated rounded-2xl p-6 text-left">
              <div className="flex items-center justify-between">
                <h3 className="font-royal-serif text-xl font-bold text-[#F5D88A]">
                  Add to Home Screen
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#C7A4FF] hover:text-white"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-base text-slate-800 dark:text-[#F5F1FF]/90">
                <li>1. Tap the <strong>Share</strong> icon in your Safari toolbar.</li>
                <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                <li>3. Tap <strong>Add</strong> to install Kiomwobo Youths.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-[#8B24FF] text-white font-royal-ui text-sm font-semibold hover:bg-[#7A18EB] transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
