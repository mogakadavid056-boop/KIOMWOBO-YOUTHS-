import React from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Calendar,
  ClipboardCheck,
  Crown,
  Flame,
  Home,
  Image as ImageIcon,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquareText,
  Moon,
  Music,
  NotebookPen,
  Settings,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { type AppRoute, ROLE_LABELS } from '@/src/types/database';
import { RoyalShieldLogo } from './RoyalEmblem';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';

interface AppShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}

const PROFILE_BG_ROUTES: AppRoute[] = ['profile', 'leaders', 'announcements', 'admin'];

export const AppShell: React.FC<AppShellProps> = ({ currentRoute, onNavigate, children }) => {
  const { profile, isAdmin, isSuspended, role } = useAuth();
  const { t } = useLanguage();
  const {
    unreadNotifications,
    unreadChatsCount,
    setViewingProfileId,
    setFocusedPostId,
    sabbathBanner,
    dismissSabbathBanner,
  } = useSocial();

  const usesProfileBg = PROFILE_BG_ROUTES.includes(currentRoute);

  const handleNav = (route: AppRoute) => {
    if (route === 'profile') setViewingProfileId(null);
    if (route === 'community') setFocusedPostId(null);
    onNavigate(route);
  };

  const sidebarItems: {
    id: AppRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
    badge?: number;
  }[] = [
    { id: 'home', label: t.nav.home, icon: Home },
    { id: 'community', label: t.nav.community, icon: MessageSquareText },
    { id: 'notifications', label: t.nav.notifications, icon: Bell, badge: unreadNotifications },
    { id: 'chat', label: t.nav.chat, icon: MessageCircle, badge: unreadChatsCount },
    { id: 'leaders', label: t.nav.leaders, icon: Award },
    { id: 'sabbath', label: t.nav.sabbath, icon: Moon },
    { id: 'announcements', label: t.nav.announcements, icon: Megaphone },
    { id: 'events', label: t.nav.events, icon: Calendar },
    { id: 'bible', label: t.nav.bible, icon: BookOpen },
    { id: 'hymnal', label: t.nav.hymnal, icon: Music },
    { id: 'notebook', label: t.nav.notebook, icon: NotebookPen },
    { id: 'prayer', label: t.nav.prayer, icon: Flame },
    { id: 'directory', label: t.nav.directory, icon: Users },
    { id: 'gallery', label: t.nav.gallery, icon: ImageIcon },
    { id: 'attendance', label: t.nav.attendance, icon: ClipboardCheck },
    { id: 'admin', label: t.nav.admin, icon: Crown, adminOnly: true },
    { id: 'profile', label: t.nav.profile, icon: User },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const visibleSidebarItems = sidebarItems.filter((item) => !item.adminOnly || isAdmin);

  const mobileTabs: {
    id: AppRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'home', label: t.nav.home, icon: Home },
    { id: 'community', label: t.nav.community, icon: MessageSquareText },
    { id: 'chat', label: t.nav.chat, icon: MessageCircle, badge: unreadChatsCount },
    { id: 'bible', label: t.nav.bible, icon: BookOpen },
    { id: 'more', label: t.nav.more, icon: Menu },
  ];

  const activeTitle =
    sidebarItems.find((i) => i.id === currentRoute)?.label ??
    (currentRoute === 'data-import'
      ? 'Data Import'
      : currentRoute === 'more'
      ? t.nav.more
      : currentRoute === 'hymnal'
      ? t.nav.hymnal
      : t.appName);

  return (
    <div
      className={`min-h-dvh w-full relative flex ${
        usesProfileBg ? 'bg-canvas-profile' : 'bg-canvas-home'
      }`}
    >
      {/* Readability overlay */}
      <div
        className={`fixed inset-0 pointer-events-none transition-colors duration-300 ${
          usesProfileBg
            ? 'bg-white/80 dark:bg-[#080610]/40'
            : 'bg-[#F6F3FC]/85 dark:bg-[#080610]/55'
        }`}
      />

      {/* Soft ambient violet particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden dark:block" aria-hidden="true">
        <span
          className="absolute top-[18%] left-[14%] w-2 h-2 rounded-full bg-[#8B24FF]/40 blur-[1px] animate-particle"
          style={{ animationDelay: '0s' }}
        />
        <span
          className="absolute top-[42%] right-[18%] w-2.5 h-2.5 rounded-full bg-[#C7A4FF]/30 blur-[1px] animate-particle"
          style={{ animationDelay: '2.1s' }}
        />
        <span
          className="absolute bottom-[24%] left-[32%] w-1.5 h-1.5 rounded-full bg-[#F5D88A]/35 blur-[1px] animate-particle"
          style={{ animationDelay: '4.2s' }}
        />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 z-30 royal-glass border-y-0 border-l-0 rounded-none">
        <div className="p-5 flex items-center gap-3">
          <RoyalShieldLogo size="md" className="shrink-0" />
          <div className="min-w-0">
            <p className="font-royal-display text-sm font-bold tracking-wider text-gold-gradient truncate">
              KIOMWOBO
            </p>
            <p className="font-royal-ui text-[11px] tracking-[0.18em] uppercase text-slate-600 dark:text-[#C7A4FF] truncate">
              YOUTHS
            </p>
          </div>
        </div>

        <div className="gold-divider mx-4" />

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Primary Navigation">
          {visibleSidebarItems.map((item) => {
            const Icon = item.icon;
            const active = currentRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 font-royal-ui text-sm font-semibold transition-all text-left whitespace-nowrap ${
                  active
                    ? 'bg-[#31005F]/85 text-[#F5D88A] border border-[#D4AF37]/45 violet-glow'
                    : 'text-slate-700 dark:text-[#F5F1FF]/80 hover:bg-[#31005F]/20 dark:hover:bg-[#31005F]/45 hover:text-slate-900 dark:hover:text-[#F5F1FF] border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4.5 h-4.5 shrink-0 ${
                    active ? 'text-[#F5D88A]' : 'text-slate-500 dark:text-[#C7A4FF]'
                  }`}
                />
                <span className="truncate flex-1">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#D4AF37] text-[#080610] text-[11px] font-bold tabular-nums">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 space-y-3 border-t border-[#D4AF37]/20">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={() => handleNav('profile')}
            className="w-full min-h-[48px] p-2 rounded-xl flex items-center gap-3 hover:bg-[#31005F]/25 transition text-left"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border border-[#D4AF37]/60 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#31005F] border border-[#D4AF37]/60 flex items-center justify-center text-sm font-royal-ui font-bold text-[#F5D88A] shrink-0">
                {(profile?.full_name?.[0] ?? 'K').toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-[#F5F1FF] truncate">
                {profile?.full_name || 'Youth Member'}
              </p>
              <p className="text-xs text-slate-500 dark:text-[#C7A4FF] truncate">
                {ROLE_LABELS[role]}
              </p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 relative z-10 flex flex-col min-w-0 min-h-dvh">
        {/* Compact Mobile Top App Bar (52px) */}
        <header className="lg:hidden sticky top-0 z-30 h-[52px] px-4 flex items-center justify-between gap-2 royal-glass rounded-none border-x-0 border-t-0">
          <button
            type="button"
            onClick={() => handleNav('home')}
            className="flex items-center gap-2.5 min-w-0 min-h-[44px]"
          >
            <RoyalShieldLogo size="sm" className="shrink-0" />
            <span className="font-royal-display text-sm font-bold text-gold-gradient truncate">
              {activeTitle}
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => handleNav('notifications')}
              className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-700 dark:text-[#F5D88A] hover:bg-[#31005F]/30"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4AF37] text-[#080610] font-royal-ui text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleNav('profile')}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Open profile"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]/65"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#31005F] border border-[#D4AF37]/65 flex items-center justify-center text-xs font-royal-ui font-bold text-[#F5D88A]">
                  {(profile?.full_name?.[0] ?? 'K').toUpperCase()}
                </div>
              )}
            </button>
          </div>
        </header>

        {/* Desktop Header Bell Bar */}
        <div className="hidden lg:flex items-center justify-end gap-3 px-8 pt-4">
          <button
            type="button"
            onClick={() => handleNav('notifications')}
            className="relative min-h-[44px] px-3.5 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-slate-800 dark:text-[#F5D88A] hover:border-[#D4AF37]/60"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-[#D4AF37]" />
            <span>{t.nav.notifications}</span>
            {unreadNotifications > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#D4AF37] text-[#080610] text-[11px] font-bold flex items-center justify-center tabular-nums">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Workspace */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-24 lg:pb-10">
          {isSuspended && (
            <div className="mb-5 rounded-2xl border border-red-400/60 bg-red-950/75 px-4 py-3 flex items-center gap-3 text-red-100">
              <AlertTriangle className="w-5 h-5 text-red-300 shrink-0" />
              <p className="font-royal-body text-sm">
                Your account is suspended. You can read but not post or message.
              </p>
            </div>
          )}

          {sabbathBanner && (
            <div className="mb-5 rounded-2xl royal-glass-elevated border border-[#D4AF37]/60 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Moon className="w-5 h-5 text-[#F5D88A] shrink-0" />
                <div className="min-w-0">
                  <p className="font-royal-ui text-xs font-bold text-[#F5D88A]">
                    {sabbathBanner.title}
                  </p>
                  <p className="font-royal-body text-sm text-slate-900 dark:text-[#F5F1FF]">
                    {sabbathBanner.body}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissSabbathBanner}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[#C7A4FF] hover:text-white shrink-0"
                aria-label="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 royal-glass-elevated rounded-none border-x-0 border-b-0 px-1 pt-1 pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-14">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const active =
              currentRoute === tab.id ||
              (tab.id === 'more' &&
                !['home', 'community', 'chat', 'bible'].includes(currentRoute));
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleNav(tab.id)}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                  active
                    ? 'text-[#D4AF37] dark:text-[#F5D88A]'
                    : 'text-slate-600 dark:text-[#C7A4FF]/75'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#D4AF37] text-[#080610] text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </div>
                <span className="font-royal-ui text-[11px] font-semibold leading-none whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
};
