import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useLanguage } from '@/src/context/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useLanguage();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 lg:bottom-5 left-4 right-4 sm:right-auto sm:max-w-sm z-40 royal-glass-elevated rounded-xl px-4 py-2.5 flex items-center gap-3 border border-[#F5D88A]/50 text-sm text-[#F5D88A]"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span className="font-medium truncate">{t.common.offlineMode}</span>
    </div>
  );
};
