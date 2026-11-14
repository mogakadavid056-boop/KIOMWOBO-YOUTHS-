import React from 'react';
import {
  Award,
  Bell,
  Calendar,
  ClipboardCheck,
  Crown,
  Database,
  Flame,
  Image as ImageIcon,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Moon,
  Music,
  NotebookPen,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { type AppRoute } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';

interface MorePageProps {
  onNavigate: (route: AppRoute) => void;
}

export const MorePage: React.FC<MorePageProps> = ({ onNavigate }) => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { t } = useLanguage();
  const { setViewingProfileId, unreadNotifications, unreadChatsCount } = useSocial();

  const items: {
    id: AppRoute;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
    superAdminOnly?: boolean;
    badge?: number;
  }[] = [
    { id: 'leaders', label: t.nav.leaders, subtitle: 'District & local church youth leaders', icon: Award },
    { id: 'sabbath', label: t.nav.sabbath, subtitle: 'Sunset times & next 4 weeks', icon: Moon },
    {
      id: 'notifications',
      label: t.nav.notifications,
      subtitle: unreadNotifications > 0 ? `${unreadNotifications} unread notifications` : 'Reactions, mentions & followers',
      icon: Bell,
      badge: unreadNotifications,
    },
    { id: 'community', label: t.nav.community, subtitle: 'District & church social feed', icon: MessageSquareText },
    {
      id: 'chat',
      label: t.nav.chat,
      subtitle: unreadChatsCount > 0 ? `${unreadChatsCount} unread private messages` : 'Private chats, groups, rooms & calls',
      icon: MessageCircle,
      badge: unreadChatsCount,
    },
    { id: 'hymnal', label: t.nav.hymnal, subtitle: 'Christ In Song & Nyimbo Za Kristo', icon: Music },
    { id: 'announcements', label: t.nav.announcements, subtitle: 'District & church notices', icon: Megaphone },
    { id: 'events', label: t.nav.events, subtitle: 'Calendar, schedule & RSVPs', icon: Calendar },
    { id: 'directory', label: t.nav.directory, subtitle: 'Youth members across 7 churches', icon: Users },
    { id: 'prayer', label: t.nav.prayer, subtitle: 'Prayer requests & testimonies', icon: Flame },
    { id: 'notebook', label: t.nav.notebook, subtitle: 'Private study notes & tags', icon: NotebookPen },
    { id: 'gallery', label: t.nav.gallery, subtitle: 'Fellowship photos & memories', icon: ImageIcon },
    { id: 'attendance', label: t.nav.attendance, subtitle: 'Session roll & reports', icon: ClipboardCheck },
    { id: 'admin', label: t.nav.admin, subtitle: 'District & church administration', icon: Crown, adminOnly: true },
    { id: 'data-import', label: 'Data Import', subtitle: 'Import KJV & Swahili Bible verses', icon: Database, superAdminOnly: true },
    { id: 'profile', label: t.nav.profile, subtitle: 'Cover, avatar & personal details', icon: User },
    { id: 'settings', label: t.nav.settings, subtitle: 'Language, privacy, blocked users', icon: Settings },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
          {t.nav.more}
        </h1>
        <PWAInstallButton compact />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items
          .filter((item) => (!item.adminOnly || isAdmin) && (!item.superAdminOnly || isSuperAdmin))
          .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'profile') setViewingProfileId(null);
                  onNavigate(item.id);
                }}
                className="text-left"
              >
                <GlassCard className="flex items-center gap-4 min-h-[72px] hover:border-[#D4AF37]/60 active:scale-[0.99] transition">
                  <div className="w-11 h-11 rounded-xl bg-[#31005F]/50 border border-[#D4AF37]/35 flex items-center justify-center text-[#F5D88A] shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-royal-ui text-sm font-semibold text-slate-900 dark:text-[#F5F1FF] truncate">
                      {item.label}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/80 truncate">
                      {item.subtitle}
                    </p>
                  </div>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#D4AF37] text-[#080610] text-xs font-bold tabular-nums shrink-0">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </GlassCard>
              </button>
            );
          })}
      </div>
    </div>
  );
};
