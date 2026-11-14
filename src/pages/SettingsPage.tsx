import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Ban,
  Bell,
  Clock,
  Database,
  Download,
  Eye,
  Globe,
  LogOut,
  Moon,
  Smartphone,
  Sun,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { useTheme } from '@/src/context/ThemeContext';
import { useToast } from '@/src/context/ToastContext';
import { clearOfflineCache, getOfflineCacheStats } from '@/src/lib/offlineDb';
import {
  getPushStatus,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/src/lib/pushNotifications';
import { fetchUserSettings, getUpcomingSabbathWindows } from '@/src/lib/sabbath';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Profile } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';

export const SettingsPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const {
    sabbathLocation,
    rescheduleSabbathReminder,
    showOnline,
    setShowOnlineState,
    refreshBlockedUsers,
  } = useSocial();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [cacheStats, setCacheStats] = useState({ chapters: 0, hymns: 0 });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [apkAvailable, setApkAvailable] = useState(false);
  const [sabbathReminder, setSabbathReminder] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState<30 | 60 | 120 | 180>(60);
  const [savingSettings, setSavingSettings] = useState(false);
  const [blockedProfiles, setBlockedProfiles] = useState<
    Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'title'>[]
  >([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const isNative = Capacitor.isNativePlatform();

  const loadBlockedList = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) return;
    setLoadingBlocked(true);
    const { data: rows } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', user.id);

    const ids = ((rows as { blocked_id: string }[]) || []).map((r) => r.blocked_id);
    if (ids.length === 0) {
      setBlockedProfiles([]);
      setLoadingBlocked(false);
      return;
    }

    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, title')
      .in('id', ids)
      .order('full_name');

    setBlockedProfiles(
      (profs as Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'title'>[]) || []
    );
    setLoadingBlocked(false);
  }, [user?.id]);

  useEffect(() => {
    getOfflineCacheStats().then(setCacheStats);
    getPushStatus(user?.id).then((status) => {
      setPushEnabled(status.subscribed || status.permission === 'granted');
    });
    if (user?.id) {
      fetchUserSettings(user.id).then((s) => {
        setSabbathReminder(s.sabbath_reminder);
        setReminderMinutes(s.reminder_minutes);
        setShowOnlineState(s.show_online);
      });
      loadBlockedList();
    }
    if (!isNative) {
      fetch('/downloads/kiomwobo-youths.apk', { method: 'HEAD' })
        .then((res) => {
          const ct = res.headers.get('content-type') || '';
          if (res.ok && !ct.includes('text/html')) {
            setApkAvailable(true);
          }
        })
        .catch(() => {});
    }
  }, [isNative, user?.id, setShowOnlineState, loadBlockedList]);

  const handleTogglePush = async () => {
    if (!user) return;
    setPushBusy(true);
    if (pushEnabled) {
      const res = await unsubscribeFromPushNotifications(user.id);
      if (res.ok) setPushEnabled(false);
      showToast(res.message, res.ok ? 'info' : 'error');
    } else {
      const res = await subscribeToPushNotifications(user.id);
      if (res.ok) setPushEnabled(true);
      showToast(res.message, res.ok ? 'success' : 'error');
    }
    setPushBusy(false);
  };

  const handleClearCache = async () => {
    await clearOfflineCache();
    setCacheStats({ chapters: 0, hymns: 0 });
    showToast('Offline Scripture and Hymn cache cleared.', 'info');
  };

  const persistUserSettings = async (
    nextLang: 'en' | 'sw',
    nextReminder: boolean,
    nextMinutes: 30 | 60 | 120 | 180,
    nextShowOnline: boolean
  ) => {
    if (!user?.id || !isSupabaseConfigured) return;
    setSavingSettings(true);
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        language: nextLang,
        sabbath_reminder: nextReminder,
        reminder_minutes: nextMinutes,
        show_online: nextShowOnline,
      },
      { onConflict: 'user_id' }
    );
    setSavingSettings(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    await rescheduleSabbathReminder();
  };

  const handleLanguageChange = async (code: 'en' | 'sw') => {
    setLanguage(code);
    await persistUserSettings(code, sabbathReminder, reminderMinutes, showOnline);
  };

  const handleToggleSabbathReminder = async () => {
    const next = !sabbathReminder;
    if (
      next &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      try {
        await Notification.requestPermission();
      } catch {
        // Fallback to in-app banner if denied or unsupported
      }
    }
    setSabbathReminder(next);
    await persistUserSettings(language, next, reminderMinutes, showOnline);
    showToast(next ? 'Sabbath reminder enabled.' : 'Sabbath reminder turned off.', 'info');
  };

  const handleReminderMinutesChange = async (mins: 30 | 60 | 120 | 180) => {
    setReminderMinutes(mins);
    await persistUserSettings(language, sabbathReminder, mins, showOnline);
    showToast(
      `Reminder set for ${mins === 30 ? '30 minutes' : `${mins / 60} hour${mins > 60 ? 's' : ''}`} before Friday sunset.`,
      'success'
    );
  };

  const handleToggleShowOnline = async () => {
    const next = !showOnline;
    setShowOnlineState(next);
    await persistUserSettings(language, sabbathReminder, reminderMinutes, next);
    showToast(
      next ? 'Online status is visible to others.' : 'Your online status is now hidden.',
      'info'
    );
  };

  const handleUnblock = async (blockedId: string) => {
    if (!user?.id) return;
    setUnblockingId(blockedId);
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId);
    setUnblockingId(null);

    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setBlockedProfiles((prev) => prev.filter((p) => p.id !== blockedId));
    await refreshBlockedUsers();
    showToast('User unblocked.', 'success');
  };

  const nextSabbath = getUpcomingSabbathWindows(sabbathLocation, 1)[0];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
          {t.settings.title}
        </h1>
        <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
          Customize your Kiomwobo Youths experience
        </p>
      </div>

      {/* Language */}
      <GlassCard>
        <div className="flex items-center gap-2.5 mb-3">
          <Globe className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
            {t.settings.language}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { code: 'en' as const, label: 'English' },
            { code: 'sw' as const, label: 'Kiswahili' },
          ].map((opt) => (
            <button
              key={opt.code}
              type="button"
              onClick={() => handleLanguageChange(opt.code)}
              className={`min-h-[46px] rounded-xl font-royal-ui text-sm font-semibold transition ${
                language === opt.code
                  ? 'bg-[#8B24FF] text-white violet-glow border border-[#F5D88A]/50'
                  : 'border border-[#D4AF37]/30 text-slate-700 dark:text-[#C7A4FF]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Online Status Privacy */}
      <GlassCard className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Eye className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
          <div>
            <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
              Show my online status
            </h2>
            <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/85">
              Let other members see when you are online or when you were last seen
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={savingSettings}
          onClick={handleToggleShowOnline}
          className={`min-h-[44px] px-4 rounded-xl font-royal-ui text-xs font-semibold shrink-0 transition ${
            showOnline
              ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60'
              : 'bg-black/20 border border-[#D4AF37]/30 text-slate-400'
          }`}
        >
          {showOnline ? 'On' : 'Off'}
        </button>
      </GlassCard>

      {/* Sabbath Reminder */}
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
            <div>
              <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
                Sabbath Sunset Reminder
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/85">
                {nextSabbath
                  ? `Next Sabbath begins Friday at ${nextSabbath.startFormatted} (${sabbathLocation.name})`
                  : 'Get reminded before Friday sunset to prepare for Sabbath'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={savingSettings}
            onClick={handleToggleSabbathReminder}
            className={`min-h-[44px] px-4 rounded-xl font-royal-ui text-xs font-semibold shrink-0 transition ${
              sabbathReminder
                ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60'
                : 'bg-[#8B24FF] text-white'
            }`}
          >
            {sabbathReminder ? 'On' : 'Off'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              { value: 30, label: '30 min' },
              { value: 60, label: '1 hour' },
              { value: 120, label: '2 hours' },
              { value: 180, label: '3 hours' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={savingSettings}
              onClick={() => handleReminderMinutesChange(opt.value)}
              className={`min-h-[44px] rounded-xl font-royal-ui text-xs font-semibold transition ${
                reminderMinutes === opt.value
                  ? 'bg-[#8B24FF] text-white violet-glow border border-[#F5D88A]/50'
                  : 'border border-[#D4AF37]/30 text-slate-700 dark:text-[#C7A4FF]'
              }`}
            >
              {opt.label} before
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Theme */}
      <GlassCard>
        <div className="flex items-center gap-2.5 mb-3">
          {theme === 'dark' ? (
            <Moon className="w-5 h-5 text-[#D4AF37]" />
          ) : (
            <Sun className="w-5 h-5 text-[#D4AF37]" />
          )}
          <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
            {t.settings.appearance}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`min-h-[46px] rounded-xl font-royal-ui text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition ${
              theme === 'dark'
                ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60 violet-glow'
                : 'border border-[#D4AF37]/30 text-slate-700 dark:text-[#C7A4FF]'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>{t.settings.darkMode}</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`min-h-[46px] rounded-xl font-royal-ui text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition ${
              theme === 'light'
                ? 'bg-[#8B24FF] text-white border border-[#D4AF37]/60 violet-glow'
                : 'border border-[#D4AF37]/30 text-slate-700 dark:text-[#C7A4FF]'
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>{t.settings.lightMode}</span>
          </button>
        </div>
      </GlassCard>

      {/* Push Notifications */}
      <GlassCard className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
          <div>
            <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
              {t.settings.notifications}
            </h2>
            <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/85">
              Receive announcements, event reminders, and prayer updates
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={pushBusy}
          onClick={handleTogglePush}
          className={`min-h-[44px] px-4 rounded-xl font-royal-ui text-xs font-semibold shrink-0 transition ${
            pushEnabled
              ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60'
              : 'bg-[#8B24FF] text-white'
          }`}
        >
          {pushBusy ? '...' : pushEnabled ? 'Enabled' : 'Enable'}
        </button>
      </GlassCard>

      {/* Blocked Users */}
      <GlassCard className="space-y-3">
        <div className="flex items-center gap-2.5">
          <Ban className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
            Blocked users
          </h2>
        </div>

        {loadingBlocked ? (
          <p className="text-sm text-slate-500 dark:text-[#C7A4FF]">Loading blocked users...</p>
        ) : blockedProfiles.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/80">
            You have not blocked anyone.
          </p>
        ) : (
          <div className="divide-y divide-[#D4AF37]/15">
            {blockedProfiles.map((bp) => (
              <div key={bp.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {bp.avatar_url ? (
                    <img
                      src={bp.avatar_url}
                      alt={bp.full_name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-[#D4AF37]/40 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#31005F] border border-[#D4AF37]/40 flex items-center justify-center text-xs font-bold text-[#F5D88A] shrink-0">
                      {(bp.full_name?.[0] || 'Y').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-[#F5F1FF] truncate">
                      {bp.full_name}
                    </p>
                    {bp.title && (
                      <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/75 truncate">
                        {bp.title}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={unblockingId === bp.id}
                  onClick={() => handleUnblock(bp.id)}
                  className="min-h-[38px] px-3.5 rounded-xl border border-[#D4AF37]/40 text-xs font-royal-ui font-semibold text-[#F5D88A] hover:bg-[#31005F]/40 inline-flex items-center gap-1.5 shrink-0"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{unblockingId === bp.id ? '...' : 'Unblock'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Offline Cache */}
      <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
          <div>
            <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
              {t.settings.offlineCache}
            </h2>
            <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/85 tabular-nums">
              {cacheStats.chapters} Bible chapters · {cacheStats.hymns} hymns saved locally
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClearCache}
          className="min-h-[44px] px-4 rounded-xl border border-[#D4AF37]/40 text-xs font-royal-ui font-semibold text-slate-800 dark:text-[#F5D88A] inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Trash2 className="w-4 h-4" />
          <span>{t.settings.clearCache}</span>
        </button>
      </GlassCard>

      {/* Android APK Download */}
      {!isNative && apkAvailable && (
        <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
            <div>
              <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
                Android App (APK)
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/85">
                Download and install KIOMWOBO YOUTHS directly on your Android phone
              </p>
            </div>
          </div>

          <a
            href="/downloads/kiomwobo-youths.apk"
            download="KIOMWOBO-YOUTHS.apk"
            className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] text-xs font-royal-ui font-bold inline-flex items-center justify-center gap-2 hover:brightness-105 transition self-start sm:self-auto shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Download APK</span>
          </a>
        </GlassCard>
      )}

      {/* PWA Install & Logout */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <PWAInstallButton />

        <button
          type="button"
          onClick={signOut}
          className="min-h-[48px] px-6 py-3 rounded-xl border border-red-400/50 text-red-600 dark:text-red-300 font-royal-ui text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-red-500/15 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>{t.common.logout}</span>
        </button>
      </div>
    </div>
  );
};
