import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  ChevronRight,
  ClipboardCheck,
  Crown,
  Flame,
  Image as ImageIcon,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Moon,
  Music,
  NotebookPen,
  Pin,
  Settings,
  Share2,
  User,
  Users,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { DAILY_VERSES_FALLBACK, getDayOfYearIndex } from '@/src/lib/bibleBooks';
import { formatCountdownDuration, getUpcomingSabbathWindows } from '@/src/lib/sabbath';
import { GlassCard } from '@/src/components/GlassCard';
import { RoyalCrownIcon } from '@/src/components/RoyalEmblem';
import { StoriesBar } from '@/src/components/StoriesBar';
import { SkeletonCard } from '@/src/components/StateViews';
import {
  type Announcement,
  type AppRoute,
  type EventItem,
  ROLE_LABELS,
} from '@/src/types/database';

interface HomePageProps {
  onNavigate: (route: AppRoute) => void;
  onAddNoteForVerse: (verseRef: string) => void;
  onOpenBibleRef: (book: string, chapter: number) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onAddNoteForVerse,
  onOpenBibleRef,
}) => {
  const { profile, churches, isAdmin, role } = useAuth();
  const { t, language } = useLanguage();
  const { sabbathLocation, setViewingProfileId } = useSocial();
  const { showToast } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const dailyFallback = DAILY_VERSES_FALLBACK[getDayOfYearIndex(DAILY_VERSES_FALLBACK.length)];
  const [verseRef, setVerseRef] = useState(dailyFallback.reference);
  const [verseText, setVerseText] = useState(
    language === 'sw' ? dailyFallback.swahili : dailyFallback.kjv
  );

  const myChurchName =
    profile?.churches?.name ||
    churches.find((c) => c.id === profile?.church_id)?.name ||
    'Kiomwobo District';

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setVerseText(language === 'sw' ? dailyFallback.swahili : dailyFallback.kjv);
  }, [language, dailyFallback]);

  useEffect(() => {
    let active = true;

    async function loadHomeData() {
      if (!isSupabaseConfigured) {
        if (active) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const annQuery = supabase
          .from('announcements')
          .select('*, churches(id, name), profiles(id, full_name, avatar_url, role)')
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5);

        const nowIso = new Date().toISOString();
        const evtQuery = supabase
          .from('events')
          .select('*, churches(id, name)')
          .gte('starts_at', nowIso)
          .order('starts_at', { ascending: true })
          .limit(3);

        const [annRes, evtRes] = await Promise.all([annQuery, evtQuery]);

        if (!active) return;

        if (!annRes.error && annRes.data) {
          const filtered = (annRes.data as Announcement[]).filter(
            (a) => a.church_id === null || a.church_id === profile?.church_id
          );
          setAnnouncements(filtered.slice(0, 3));
        }

        if (!evtRes.error && evtRes.data) {
          setEvents(evtRes.data as EventItem[]);
        }

        // Try loading daily verse from bible_verses if seeded
        const version = language === 'sw' ? 'SWAHILI' : 'KJV';
        const { data: verseData } = await supabase
          .from('bible_verses')
          .select('book_number, book_name, chapter, verse, text')
          .eq('version', version)
          .eq('book_number', 54)
          .eq('chapter', 4)
          .eq('verse', 12)
          .maybeSingle();

        if (active && verseData) {
          setVerseRef(`${verseData.book_name} ${verseData.chapter}:${verseData.verse}`);
          setVerseText(verseData.text);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHomeData();
    return () => {
      active = false;
    };
  }, [profile?.church_id, language]);

  const handleShareVerse = async () => {
    const shareText = `"${verseText}" — ${verseRef} (KIOMWOBO YOUTHS)`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Verse of the Day', text: shareText });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Verse copied to clipboard.', 'success');
    } catch {
      showToast('Unable to copy verse.', 'error');
    }
  };

  const quickModules: {
    id: AppRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'community', label: t.nav.community, icon: MessageSquareText },
    { id: 'leaders', label: t.nav.leaders, icon: Award },
    { id: 'sabbath', label: t.nav.sabbath, icon: Moon },
    { id: 'bible', label: t.nav.bible, icon: BookOpen },
    { id: 'hymnal', label: t.nav.hymnal, icon: Music },
    { id: 'chat', label: t.nav.chat, icon: MessageCircle },
    { id: 'announcements', label: t.nav.announcements, icon: Megaphone },
    { id: 'events', label: t.nav.events, icon: Calendar },
    { id: 'prayer', label: t.nav.prayer, icon: Flame },
    { id: 'notebook', label: t.nav.notebook, icon: NotebookPen },
    { id: 'directory', label: t.nav.directory, icon: Users },
    { id: 'gallery', label: t.nav.gallery, icon: ImageIcon },
    { id: 'attendance', label: t.nav.attendance, icon: ClipboardCheck },
    { id: 'profile', label: t.nav.profile, icon: User },
    { id: 'settings', label: t.nav.settings, icon: Settings },
    ...(isAdmin ? [{ id: 'admin' as AppRoute, label: t.nav.admin, icon: Crown }] : []),
  ];

  const firstName = profile?.full_name?.split(' ')[0] || 'Beloved';
  const nextSabbath = getUpcomingSabbathWindows(sabbathLocation, 1, now)[0];
  const inSabbath = nextSabbath
    ? now.getTime() >= nextSabbath.start.getTime() && now.getTime() < nextSabbath.end.getTime()
    : false;
  const sabbathCountdown = nextSabbath
    ? inSabbath
      ? `Sabbath ends in ${formatCountdownDuration(nextSabbath.end.getTime() - now.getTime())}`
      : `Sabbath begins in ${formatCountdownDuration(nextSabbath.start.getTime() - now.getTime())}`
    : '';

  return (
    <div className="space-y-6">
      {/* Royal Greeting Header */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-royal-script text-3xl sm:text-4xl text-[#D4AF37] dark:text-[#F5D88A] leading-none">
            {t.greeting}
          </p>
          <h1 className="mt-1 font-royal-display text-2xl sm:text-3xl font-bold text-gold-gradient text-balance">
            {firstName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-[#C7A4FF]">
            <span>{myChurchName}</span>
            <span aria-hidden="true">·</span>
            <span>{ROLE_LABELS[role]}</span>
          </div>
        </div>
      </section>

      <div className="gold-divider" />

      {/* Sabbath Countdown Card */}
      {nextSabbath && (
        <button
          type="button"
          onClick={() => onNavigate('sabbath')}
          className="w-full text-left"
        >
          <GlassCard padding="md" className="hover:border-[#D4AF37]/60 transition">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#31005F]/60 border border-[#D4AF37]/45 flex items-center justify-center shrink-0">
                  <Moon className="w-5 h-5 text-[#F5D88A]" />
                </div>
                <div>
                  <p className="font-royal-ui text-xs font-semibold text-[#B8891B] dark:text-[#F5D88A]">
                    {sabbathLocation.name}
                  </p>
                  <p className="font-royal-display text-lg font-bold text-slate-900 dark:text-[#F5F1FF] tabular-nums">
                    {sabbathCountdown}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-royal-ui tabular-nums text-slate-600 dark:text-[#C7A4FF]">
                <div>
                  <span className="block text-[11px] opacity-75">Fri Sunset</span>
                  <span className="font-bold text-slate-900 dark:text-[#F5D88A]">
                    {nextSabbath.startFormatted}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] opacity-75">Sat Sunset</span>
                  <span className="font-bold text-slate-900 dark:text-[#F5D88A]">
                    {nextSabbath.endFormatted}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#D4AF37] shrink-0" />
              </div>
            </div>
          </GlassCard>
        </button>
      )}

      {/* 24h Youth Stories */}
      <StoriesBar />

      {/* Verse of the Day Focal Anchor */}
      <GlassCard elevated padding="lg" className="relative overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <RoyalCrownIcon className="w-5 h-5 shrink-0" />
            <h2 className="font-royal-ui text-sm font-semibold tracking-wide text-[#B8891B] dark:text-[#F5D88A]">
              {t.home.verseOfTheDay}
            </h2>
          </div>
          <span className="font-royal-ui text-xs font-semibold text-slate-600 dark:text-[#C7A4FF]">
            {verseRef}
          </span>
        </div>

        <blockquote className="mt-4 font-royal-body text-lg sm:text-xl leading-relaxed text-slate-900 dark:text-[#F5F1FF]">
          “{verseText}”
        </blockquote>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenBibleRef('1 Timothy', 4)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#8B24FF] hover:bg-[#7A18EB] text-white font-royal-ui text-xs font-semibold transition whitespace-nowrap"
          >
            {t.home.readChapter}
          </button>
          <button
            type="button"
            onClick={() => onAddNoteForVerse(verseRef)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D4AF37]/40 hover:bg-[#31005F]/30 text-slate-800 dark:text-[#F5D88A] font-royal-ui text-xs font-semibold transition whitespace-nowrap"
          >
            {t.home.addNote}
          </button>
          <button
            type="button"
            onClick={handleShareVerse}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-[#C7A4FF] inline-flex items-center gap-1.5 font-royal-ui text-xs font-semibold transition whitespace-nowrap"
          >
            <Share2 className="w-4 h-4" />
            <span>{t.home.share}</span>
          </button>
        </div>
      </GlassCard>

      {/* Two-column Updates: Announcements & Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Latest Announcements */}
        <GlassCard className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                {t.home.latestAnnouncements}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('announcements')}
                className="min-h-[44px] px-2 inline-flex items-center gap-1 text-xs font-royal-ui font-semibold text-[#8B24FF] dark:text-[#F5D88A] hover:underline whitespace-nowrap"
              >
                <span>{t.home.viewAll}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <SkeletonCard lines={2} className="border-none bg-transparent shadow-none p-0" />
            ) : announcements.length === 0 ? (
              <p className="text-base text-slate-600 dark:text-[#C7A4FF]/80 py-4">
                {t.home.noAnnouncements}
              </p>
            ) : (
              <div className="divide-y divide-[#D4AF37]/20">
                {announcements.map((item) => {
                  const text = item.body || item.content || '';
                  const isPinned = item.is_pinned ?? item.pinned;
                  return (
                    <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                          {item.title}
                        </h3>
                        {isPinned && (
                          <Pin className="w-4 h-4 text-[#D4AF37] shrink-0" aria-label="Pinned" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-[#C7A4FF]/85 line-clamp-2">
                        {text}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-[#C7A4FF]/65">
                        <span>{item.churches?.name || t.common.districtWide}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Upcoming Events */}
        <GlassCard className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                {t.home.upcomingEvents}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('events')}
                className="min-h-[44px] px-2 inline-flex items-center gap-1 text-xs font-royal-ui font-semibold text-[#8B24FF] dark:text-[#F5D88A] hover:underline whitespace-nowrap"
              >
                <span>{t.home.viewAll}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <SkeletonCard lines={2} className="border-none bg-transparent shadow-none p-0" />
            ) : events.length === 0 ? (
              <p className="text-base text-slate-600 dark:text-[#C7A4FF]/80 py-4">
                {t.home.noEvents}
              </p>
            ) : (
              <div className="divide-y divide-[#D4AF37]/20">
                {events.map((evt) => {
                  const dt = evt.starts_at || evt.start_time || evt.event_date || evt.created_at;
                  return (
                    <div key={evt.id} className="py-3 first:pt-0 last:pb-0">
                      <h3 className="font-semibold text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                        {evt.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[#C7A4FF]/75">
                        {dt && (
                          <span className="tabular-nums">
                            {new Date(dt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                        {evt.location && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{evt.location}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{evt.churches?.name || t.common.districtWide}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Quick Module Launcher */}
      <section>
        <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF] mb-3">
          {t.home.quickAccess}
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {quickModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  if (mod.id === 'profile') setViewingProfileId(null);
                  onNavigate(mod.id);
                }}
                className="royal-glass rounded-2xl p-4 min-h-[88px] flex flex-col items-center justify-center gap-2 hover:border-[#D4AF37]/60 hover:bg-[#31005F]/20 dark:hover:bg-[#31005F]/50 active:scale-[0.98] transition text-center"
              >
                <Icon className="w-6 h-6 text-[#8B24FF] dark:text-[#F5D88A]" />
                <span className="font-royal-ui text-xs font-semibold text-slate-800 dark:text-[#F5F1FF] truncate max-w-full">
                  {mod.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
