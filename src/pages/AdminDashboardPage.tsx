import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  Eye,
  EyeOff,
  Flag,
  MapPin,
  Megaphone,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import {
  type AppRoute,
  type ChatMessage,
  type MediaItem,
  type Prayer,
  type Profile,
  REPORT_REASONS,
  type ReportRecord,
  ROLE_LABELS,
  type UserRole,
} from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

interface AdminDashboardPageProps {
  onNavigate: (route: AppRoute) => void;
}

type AdminTab = 'overview' | 'roles' | 'moderation' | 'reports';
type ReportFilter = 'open' | 'reviewing' | 'resolved';

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onNavigate }) => {
  const { user, churches, isSuperAdmin, isDistrictAdmin } = useAuth();
  const { sabbathLocation, refreshSabbathLocation, rescheduleSabbathReminder, openProfile, openPost } =
    useSocial();
  const { showToast } = useToast();

  const canManageReports = isSuperAdmin || isDistrictAdmin;

  const [tab, setTab] = useState<AdminTab>('overview');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [reportFilter, setReportFilter] = useState<ReportFilter>('open');
  const [reportPreviews, setReportPreviews] = useState<Record<string, string>>({});
  const [suspendDays, setSuspendDays] = useState<number>(7);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const [locName, setLocName] = useState(sabbathLocation.name);
  const [locLat, setLocLat] = useState(String(sabbathLocation.lat));
  const [locLng, setLocLng] = useState(String(sabbathLocation.lng));
  const [locTz, setLocTz] = useState(sabbathLocation.timezone);
  const [savingLoc, setSavingLoc] = useState(false);

  useEffect(() => {
    setLocName(sabbathLocation.name);
    setLocLat(String(sabbathLocation.lat));
    setLocLng(String(sabbathLocation.lng));
    setLocTz(sabbathLocation.timezone);
  }, [sabbathLocation]);

  const loadReports = useCallback(async () => {
    if (!canManageReports || !isSupabaseConfigured) return;
    const { data, error: rErr } = await supabase
      .from('reports')
      .select(
        '*, reporter:profiles!reporter_id(id, full_name, avatar_url), target_user:profiles!target_user_id(id, full_name, avatar_url, status)'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (rErr || !data) return;
    const rows = data as unknown as ReportRecord[];
    setReports(rows);

    // Fetch content previews for post / comment / story / message targets
    const postIds = rows.filter((r) => r.target_type === 'post').map((r) => r.target_id);
    const commentIds = rows.filter((r) => r.target_type === 'comment').map((r) => r.target_id);
    const storyIds = rows.filter((r) => r.target_type === 'story').map((r) => r.target_id);
    const msgIds = rows.filter((r) => r.target_type === 'message').map((r) => r.target_id);

    const previewMap: Record<string, string> = {};

    const [pRes, cRes, sRes, mRes] = await Promise.all([
      postIds.length > 0
        ? supabase.from('posts').select('id, content, image_url').in('id', postIds)
        : Promise.resolve({ data: [] }),
      commentIds.length > 0
        ? supabase.from('post_comments').select('id, content').in('id', commentIds)
        : Promise.resolve({ data: [] }),
      storyIds.length > 0
        ? supabase.from('stories').select('id, caption, media_type').in('id', storyIds)
        : Promise.resolve({ data: [] }),
      msgIds.length > 0
        ? supabase.from('dm_messages').select('id, content, kind').in('id', msgIds)
        : Promise.resolve({ data: [] }),
    ]);

    for (const p of (pRes.data as { id: string; content?: string; image_url?: string }[]) || []) {
      previewMap[p.id] = p.content || (p.image_url ? '[Image post]' : '[Post]');
    }
    for (const c of (cRes.data as { id: string; content?: string }[]) || []) {
      previewMap[c.id] = c.content || '[Comment]';
    }
    for (const s of (sRes.data as { id: string; caption?: string; media_type?: string }[]) || []) {
      previewMap[s.id] = s.caption || `[${s.media_type || 'Story'}]`;
    }
    for (const m of (mRes.data as { id: string; content?: string; kind?: string }[]) || []) {
      previewMap[m.id] = m.content || `[${m.kind || 'Message'}]`;
    }

    setReportPreviews(previewMap);
  }, [canManageReports]);

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [profRes, prayRes, medRes, msgRes] = await Promise.all([
      supabase.from('profiles').select('*, churches(id, name)').order('full_name'),
      supabase
        .from('prayers')
        .select('*, profiles!user_id(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('media')
        .select('*, churches(id, name), profiles(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('messages')
        .select('*, profiles!sender_id(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (profRes.error) {
      setError(profRes.error.message);
    } else {
      setProfiles((profRes.data as Profile[]) || []);
    }

    if (!prayRes.error && prayRes.data) setPrayers(prayRes.data as Prayer[]);
    if (!medRes.error && medRes.data) setMedia(medRes.data as MediaItem[]);
    if (!msgRes.error && msgRes.data) setRecentMessages(msgRes.data as ChatMessage[]);

    await loadReports();
    setLoading(false);
  }, [loadReports]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const leaders = useMemo(() => {
    const rankWeight: Record<UserRole, number> = {
      super_admin: 0,
      district_admin: 1,
      church_admin: 2,
      member: 3,
    };
    return profiles
      .filter((p) => p.role !== 'member')
      .sort((a, b) => rankWeight[a.role] - rankWeight[b.role])
      .slice(0, 6);
  }, [profiles]);

  const churchStats = useMemo(() => {
    return churches.map((church) => ({
      church,
      count: profiles.filter((p) => p.church_id === church.id).length,
    }));
  }, [churches, profiles]);

  const filteredProfiles = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.churches?.name?.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q)
    );
  }, [profiles, memberSearch]);

  const filteredReports = useMemo(
    () => reports.filter((r) => (r.status || 'open') === reportFilter),
    [reports, reportFilter]
  );

  const openReportsCount = useMemo(
    () => reports.filter((r) => (r.status || 'open') === 'open').length,
    [reports]
  );

  const updateUserRole = async (memberId: string, nextRole: UserRole) => {
    if (!isSuperAdmin) return;
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', memberId);

    if (err) {
      showToast(err.message, 'error');
      return;
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === memberId ? { ...p, role: nextRole } : p))
    );
    showToast(`Role updated to ${ROLE_LABELS[nextRole]}.`, 'success');
  };

  const toggleHidePrayer = async (p: Prayer) => {
    const nextHidden = !(p.hidden ?? p.is_hidden);
    const { error: err } = await supabase
      .from('prayers')
      .update({ hidden: nextHidden })
      .eq('id', p.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setPrayers((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, hidden: nextHidden, is_hidden: nextHidden } : x))
    );
    showToast(nextHidden ? 'Prayer hidden.' : 'Prayer visible.', 'info');
  };

  const deleteMediaItem = async (item: MediaItem) => {
    if (item.file_path) {
      await supabase.storage.from('gallery').remove([item.file_path]);
    }
    const { error: err } = await supabase.from('media').delete().eq('id', item.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setMedia((prev) => prev.filter((m) => m.id !== item.id));
    showToast('Media removed.', 'info');
  };

  const deleteChatMessage = async (id: string) => {
    const { error: err } = await supabase.from('messages').delete().eq('id', id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setRecentMessages((prev) => prev.filter((m) => m.id !== id));
    showToast('Chat message removed.', 'info');
  };

  const updateReportStatus = async (
    report: ReportRecord,
    status: 'reviewing' | 'resolved',
    adminNote: string
  ) => {
    if (!user?.id) return;
    const { error: err } = await supabase
      .from('reports')
      .update({
        status,
        admin_note: adminNote,
        handled_by: user.id,
        handled_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    if (err) {
      showToast(err.message, 'error');
      return false;
    }
    setReports((prev) =>
      prev.map((r) =>
        r.id === report.id
          ? {
              ...r,
              status,
              admin_note: adminNote,
              handled_by: user.id,
              handled_at: new Date().toISOString(),
            }
          : r
      )
    );
    return true;
  };

  const handleReportHideContent = async (report: ReportRecord) => {
    setBusyReportId(report.id);
    try {
      let table: 'posts' | 'post_comments' | 'stories' | null = null;
      if (report.target_type === 'post') table = 'posts';
      else if (report.target_type === 'comment') table = 'post_comments';
      else if (report.target_type === 'story') table = 'stories';

      if (table) {
        const { error: hideErr } = await supabase
          .from(table)
          .update({ hidden: true })
          .eq('id', report.target_id);
        if (hideErr) {
          showToast(hideErr.message, 'error');
          return;
        }
      } else if (report.target_type === 'message') {
        const { error: delErr } = await supabase
          .from('dm_messages')
          .update({ deleted: true, content: null })
          .eq('id', report.target_id);
        if (delErr) {
          showToast(delErr.message, 'error');
          return;
        }
      }

      await updateReportStatus(report, 'resolved', 'Content hidden by admin');
      showToast('Reported content hidden and report resolved.', 'success');
    } finally {
      setBusyReportId(null);
    }
  };

  const handleReportWarnUser = async (report: ReportRecord) => {
    setBusyReportId(report.id);
    try {
      if (report.target_user_id && user?.id) {
        try {
          await supabase.from('notifications').insert({
            user_id: report.target_user_id,
            actor_id: user.id,
            kind: 'mention',
            meta: { warning: true },
            read: false,
          });
        } catch {
          // Optional notification
        }
      }
      await updateReportStatus(report, 'resolved', 'Warning issued to user');
      showToast('User warned and report resolved.', 'info');
    } finally {
      setBusyReportId(null);
    }
  };

  const handleSetUserStatus = async (
    report: ReportRecord,
    nextStatus: 'suspended' | 'active'
  ) => {
    if (!report.target_user_id) {
      showToast('No target user attached to this report.', 'error');
      return;
    }
    setBusyReportId(report.id);
    try {
      const { error: rpcErr } = await supabase.rpc('set_user_status', {
        p_user: report.target_user_id,
        p_status: nextStatus,
        p_days: nextStatus === 'suspended' ? suspendDays : null,
      });

      if (rpcErr) {
        showToast(rpcErr.message, 'error');
        return;
      }

      setReports((prev) =>
        prev.map((r) =>
          r.target_user_id === report.target_user_id && r.target_user
            ? { ...r, target_user: { ...r.target_user, status: nextStatus } }
            : r
        )
      );

      await updateReportStatus(
        report,
        'resolved',
        nextStatus === 'suspended'
          ? `User suspended for ${suspendDays} day(s)`
          : 'User account restored'
      );

      showToast(
        nextStatus === 'suspended'
          ? `User suspended for ${suspendDays} day(s).`
          : 'User account restored to active.',
        'success'
      );
    } finally {
      setBusyReportId(null);
    }
  };

  const handleSaveSabbathLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    const latNum = Number(locLat);
    const lngNum = Number(locLng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      showToast('Please enter valid latitude and longitude numbers.', 'error');
      return;
    }

    setSavingLoc(true);
    const value = {
      name: locName.trim() || 'Kiomwobo, Kisii',
      lat: latNum,
      lng: lngNum,
      timezone: locTz.trim() || 'Africa/Nairobi',
    };

    const { error: err } = await supabase
      .from('app_settings')
      .upsert({ key: 'sabbath_location', value }, { onConflict: 'key' });

    setSavingLoc(false);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    await Promise.all([refreshSabbathLocation(), rescheduleSabbathReminder()]);
    showToast('Sabbath sunset location saved.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            Admin Command
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            Kiomwobo District Youth Leadership & Moderation
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              { id: 'overview', label: 'Overview' },
              ...(isSuperAdmin ? [{ id: 'roles', label: 'Roles' }] : []),
              { id: 'moderation', label: 'Moderation' },
              ...(canManageReports
                ? [
                    {
                      id: 'reports',
                      label: openReportsCount > 0 ? `Reports (${openReportsCount})` : 'Reports',
                    },
                  ]
                : []),
            ] as { id: AdminTab; label: string }[]
          ).map((tItem) => (
            <button
              key={tItem.id}
              type="button"
              onClick={() => setTab(tItem.id)}
              className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold transition ${
                tab === tItem.id
                  ? 'bg-[#8B24FF] text-white violet-glow'
                  : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
              }`}
            >
              {tItem.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Admin Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('announcements')}
          className="royal-glass rounded-2xl p-4 flex items-center gap-3 hover:border-[#D4AF37]/60 text-left min-h-[68px]"
        >
          <Megaphone className="w-5 h-5 text-[#F5D88A] shrink-0" />
          <div>
            <p className="font-royal-ui text-sm font-semibold text-slate-900 dark:text-[#F5F1FF]">
              Post Announcement
            </p>
            <p className="text-xs text-slate-500 dark:text-[#C7A4FF]">District or church notice</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('events')}
          className="royal-glass rounded-2xl p-4 flex items-center gap-3 hover:border-[#D4AF37]/60 text-left min-h-[68px]"
        >
          <Calendar className="w-5 h-5 text-[#F5D88A] shrink-0" />
          <div>
            <p className="font-royal-ui text-sm font-semibold text-slate-900 dark:text-[#F5F1FF]">
              Schedule Event
            </p>
            <p className="text-xs text-slate-500 dark:text-[#C7A4FF]">Rallies & Sabbath programs</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('attendance')}
          className="royal-glass rounded-2xl p-4 flex items-center gap-3 hover:border-[#D4AF37]/60 text-left min-h-[68px]"
        >
          <ClipboardCheck className="w-5 h-5 text-[#F5D88A] shrink-0" />
          <div>
            <p className="font-royal-ui text-sm font-semibold text-slate-900 dark:text-[#F5F1FF]">
              Attendance Reports
            </p>
            <p className="text-xs text-slate-500 dark:text-[#C7A4FF]">Roll call & CSV export</p>
          </div>
        </button>
      </div>

      {loading ? (
        <SkeletonCard lines={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadDashboard} />
      ) : (
        <>
          {tab === 'overview' && (
            <div className="space-y-6">
              <GlassCard elevated padding="lg">
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="w-5 h-5 text-[#D4AF37]" />
                  <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5D88A]">
                    District & Church Leaders Podium
                  </h2>
                </div>

                {leaders.length === 0 ? (
                  <p className="text-base text-slate-600 dark:text-[#C7A4FF]">
                    No leadership roles assigned yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leaders.map((leader) => (
                      <button
                        key={leader.id}
                        type="button"
                        onClick={() => openProfile(leader.id)}
                        className="rounded-2xl p-4 bg-[#31005F]/35 border border-[#D4AF37]/40 hover:border-[#F5D88A] transition flex items-center gap-3.5 text-left"
                      >
                        {leader.avatar_url ? (
                          <img
                            src={leader.avatar_url}
                            alt={leader.full_name}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full object-cover border-2 border-[#F5D88A] shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#140624] border-2 border-[#F5D88A] flex items-center justify-center font-royal-ui font-bold text-[#F5D88A] shrink-0">
                            {(leader.full_name?.[0] ?? 'L').toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                            {leader.full_name}
                          </p>
                          <p className="text-xs text-[#B8891B] dark:text-[#F5D88A] truncate">
                            {ROLE_LABELS[leader.role]}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/80 truncate">
                            {leader.churches?.name || 'District'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                    Membership by Church
                  </h2>
                  <span className="font-royal-ui text-sm font-bold text-[#B8891B] dark:text-[#F5D88A] tabular-nums">
                    Total: {profiles.length}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#D4AF37]/25 text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">
                        <th className="py-2.5 pr-4">Church</th>
                        <th className="py-2.5 px-3 text-right">Youth Members</th>
                        <th className="py-2.5 pl-4 w-40 hidden sm:table-cell">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4AF37]/15 text-sm">
                      {churchStats.map(({ church, count }) => {
                        const pct = profiles.length > 0 ? Math.round((count / profiles.length) * 100) : 0;
                        return (
                          <tr key={church.id}>
                            <td className="py-3 pr-4 font-medium text-slate-900 dark:text-[#F5F1FF]">
                              {church.name}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#B8891B] dark:text-[#F5D88A]">
                              {count}
                            </td>
                            <td className="py-3 pl-4 hidden sm:table-cell">
                              <div className="h-2 rounded-full bg-black/20 dark:bg-white/10 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-[#8B24FF] to-[#F5D88A]"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              {isSuperAdmin && (
                <GlassCard>
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-5 h-5 text-[#D4AF37]" />
                    <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                      Sabbath Sunset Location (Super Admin)
                    </h2>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-[#C7A4FF]/85 mb-4">
                    Coordinates used to calculate Friday and Saturday sunset times across the app.
                  </p>
                  <form onSubmit={handleSaveSabbathLocation} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                          Location Name
                        </label>
                        <input
                          type="text"
                          required
                          value={locName}
                          onChange={(e) => setLocName(e.target.value)}
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                          Timezone (IANA)
                        </label>
                        <input
                          type="text"
                          required
                          value={locTz}
                          onChange={(e) => setLocTz(e.target.value)}
                          placeholder="Africa/Nairobi"
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                          Latitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={locLat}
                          onChange={(e) => setLocLat(e.target.value)}
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                          Longitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={locLng}
                          onChange={(e) => setLocLng(e.target.value)}
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingLoc}
                      className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>{savingLoc ? 'Saving...' : 'Save Location'}</span>
                    </button>
                  </form>
                </GlassCard>
              )}
            </div>
          )}

          {tab === 'roles' && isSuperAdmin && (
            <GlassCard>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#F5D88A]" />
                  <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                    Role Management (Super Admin)
                  </h2>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Filter members..."
                    className="w-full min-h-[42px] pl-9 pr-3 rounded-xl bg-white/80 dark:bg-[#080610]/75 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>
              </div>

              <div className="divide-y divide-[#D4AF37]/15">
                {filteredProfiles.map((member) => (
                  <div
                    key={member.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                        {member.full_name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/80">
                        {member.churches?.name || 'Kiomwobo District'}
                      </p>
                    </div>

                    <select
                      value={member.role}
                      onChange={(e) => updateUserRole(member.id, e.target.value as UserRole)}
                      aria-label={`Change role for ${member.full_name}`}
                      className="min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/35 text-sm font-royal-ui font-semibold text-slate-900 dark:text-[#F5D88A]"
                    >
                      <option value="member">Youth Member</option>
                      <option value="church_admin">Church Admin</option>
                      <option value="district_admin">District Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {tab === 'moderation' && (
            <div className="space-y-6">
              <GlassCard>
                <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF] mb-3">
                  Prayer Wall Moderation
                </h2>
                <div className="divide-y divide-[#D4AF37]/15">
                  {prayers.map((p) => {
                    const isAnon = Boolean(p.anonymous ?? p.is_anonymous);
                    const isHidden = Boolean(p.hidden ?? p.is_hidden);
                    const kindLabel = p.kind ?? p.type ?? 'request';
                    return (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-[#B8891B] dark:text-[#F5D88A]">
                            {isAnon ? 'Anonymous' : p.profiles?.full_name || 'Member'} ·{' '}
                            {kindLabel}
                          </p>
                          <p className="text-sm text-slate-800 dark:text-[#F5F1FF] truncate">
                            {p.content || p.body}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleHidePrayer(p)}
                          className="min-h-[40px] px-3 rounded-xl border border-[#D4AF37]/30 text-xs font-royal-ui inline-flex items-center gap-1.5 shrink-0 text-slate-700 dark:text-[#C7A4FF]"
                        >
                          {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          <span>{isHidden ? 'Show' : 'Hide'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              <GlassCard>
                <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF] mb-3">
                  Gallery Moderation
                </h2>
                <div className="divide-y divide-[#D4AF37]/15">
                  {media.map((m) => (
                    <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={m.url}
                          alt={m.caption || 'Media'}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-[#F5F1FF] truncate">
                            {m.caption || 'Untitled Photo'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-[#C7A4FF]">
                            {m.churches?.name || 'District'} · {m.profiles?.full_name || 'Member'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMediaItem(m)}
                        className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/15 shrink-0"
                        aria-label="Delete media"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard>
                <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF] mb-3">
                  Recent Chat Moderation
                </h2>
                <div className="divide-y divide-[#D4AF37]/15">
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[#B8891B] dark:text-[#F5D88A]">
                          {msg.profiles?.full_name || 'Member'} ·{' '}
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                        <p className="text-sm text-slate-800 dark:text-[#F5F1FF] truncate">
                          {msg.content || msg.body || '[Image]'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteChatMessage(msg.id)}
                        className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/15 shrink-0"
                        aria-label="Delete chat message"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          )}

          {/* Reports Tab (District & Super Admin) */}
          {tab === 'reports' && canManageReports && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'open', label: 'Open' },
                      { id: 'reviewing', label: 'Reviewing' },
                      { id: 'resolved', label: 'Resolved' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setReportFilter(f.id)}
                      className={`min-h-[42px] px-4 rounded-xl font-royal-ui text-xs font-semibold transition ${
                        reportFilter === f.id
                          ? 'bg-[#8B24FF] text-white violet-glow'
                          : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs font-royal-ui text-slate-600 dark:text-[#C7A4FF]">
                  <span>Suspension duration:</span>
                  <select
                    value={suspendDays}
                    onChange={(e) => setSuspendDays(Number(e.target.value))}
                    className="min-h-[38px] px-2.5 rounded-lg bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/35 text-slate-900 dark:text-[#F5D88A]"
                  >
                    <option value={1}>1 day</option>
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </div>
              </div>

              {filteredReports.length === 0 ? (
                <EmptyState
                  title={`No ${reportFilter} reports`}
                  description="Community reports filed by members will appear here for review."
                  icon={<Flag className="w-6 h-6" />}
                />
              ) : (
                <div className="space-y-3">
                  {filteredReports.map((rep) => {
                    const reasonLabel =
                      REPORT_REASONS.find((r) => r.id === rep.reason)?.label || rep.reason;
                    const preview = reportPreviews[rep.target_id];
                    const isTargetSuspended = rep.target_user?.status === 'suspended';
                    const isBusy = busyReportId === rep.id;

                    return (
                      <GlassCard key={rep.id} className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-xs font-royal-ui font-bold text-amber-300 uppercase">
                                {rep.target_type}
                              </span>
                              <span className="font-royal-ui text-sm font-bold text-[#F5D88A]">
                                {reasonLabel}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/80">
                              Reported by{' '}
                              <button
                                type="button"
                                onClick={() => openProfile(rep.reporter_id)}
                                className="font-semibold hover:underline text-[#F5F1FF]"
                              >
                                {rep.reporter?.full_name || 'Member'}
                              </button>
                              {rep.target_user && (
                                <>
                                  {' · '}Against{' '}
                                  <button
                                    type="button"
                                    onClick={() => openProfile(rep.target_user!.id)}
                                    className="font-semibold hover:underline text-red-300"
                                  >
                                    {rep.target_user.full_name}
                                  </button>
                                  {isTargetSuspended && (
                                    <span className="ml-1.5 text-red-400 font-bold">(Suspended)</span>
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-[#C7A4FF]/70 tabular-nums">
                            {new Date(rep.created_at).toLocaleString()}
                          </span>
                        </div>

                        {preview && (
                          <div className="rounded-xl p-3 bg-black/15 dark:bg-[#080610]/65 border border-[#D4AF37]/20 text-sm text-slate-800 dark:text-[#F5F1FF]/90">
                            <span className="block text-[11px] font-royal-ui uppercase tracking-wider text-[#C7A4FF]/70 mb-0.5">
                              Reported Content
                            </span>
                            {preview}
                          </div>
                        )}

                        {rep.details && (
                          <p className="text-sm text-slate-700 dark:text-[#C7A4FF] italic">
                            &ldquo;{rep.details}&rdquo;
                          </p>
                        )}

                        {rep.admin_note && (
                          <p className="text-xs text-emerald-400 font-royal-ui">
                            Admin note: {rep.admin_note}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {rep.target_type === 'post' && (
                            <button
                              type="button"
                              onClick={() => openPost(rep.target_id)}
                              className="min-h-[38px] px-3 rounded-xl border border-[#D4AF37]/30 text-xs font-royal-ui font-semibold text-[#F5D88A]"
                            >
                              View Post
                            </button>
                          )}

                          {rep.status === 'open' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setBusyReportId(rep.id);
                                await updateReportStatus(rep, 'reviewing', 'Under review');
                                setBusyReportId(null);
                              }}
                              className="min-h-[38px] px-3 rounded-xl border border-[#8B24FF]/50 bg-[#8B24FF]/20 text-xs font-royal-ui font-semibold text-[#C7A4FF]"
                            >
                              Mark Reviewing
                            </button>
                          )}

                          {rep.target_type !== 'user' && rep.status !== 'resolved' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleReportHideContent(rep)}
                              className="min-h-[38px] px-3 rounded-xl border border-amber-400/40 bg-amber-500/15 text-xs font-royal-ui font-semibold text-amber-300 inline-flex items-center gap-1"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Hide content</span>
                            </button>
                          )}

                          {rep.status !== 'resolved' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleReportWarnUser(rep)}
                                className="min-h-[38px] px-3 rounded-xl border border-orange-400/40 text-xs font-royal-ui font-semibold text-orange-300 inline-flex items-center gap-1"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Warn</span>
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={async () => {
                                  setBusyReportId(rep.id);
                                  await updateReportStatus(rep, 'resolved', 'Dismissed by admin');
                                  setBusyReportId(null);
                                  showToast('Report dismissed.', 'info');
                                }}
                                className="min-h-[38px] px-3 rounded-xl border border-slate-400/30 text-xs font-royal-ui font-semibold text-slate-300 inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Dismiss</span>
                              </button>
                            </>
                          )}

                          {rep.target_user_id && !isTargetSuspended && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSetUserStatus(rep, 'suspended')}
                              className="min-h-[38px] px-3 rounded-xl bg-red-600/80 hover:bg-red-600 text-xs font-royal-ui font-bold text-white inline-flex items-center gap-1"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Suspend ({suspendDays}d)</span>
                            </button>
                          )}

                          {rep.target_user_id && isTargetSuspended && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSetUserStatus(rep, 'active')}
                              className="min-h-[38px] px-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-xs font-royal-ui font-bold text-white inline-flex items-center gap-1"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Restore User</span>
                            </button>
                          )}
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
