import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, ClipboardCheck, Download, Plus, Square, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type AttendanceRecord, type AttendanceSession, type Profile } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const AttendancePage: React.FC = () => {
  const { user, profile, churches, isAdmin, isDistrictAdmin } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New session modal
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessionChurchId, setSessionChurchId] = useState('');
  const [creating, setCreating] = useState(false);

  const loadAttendance = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    if (isAdmin) {
      const [sessRes, recRes, memRes] = await Promise.all([
        supabase
          .from('attendance_sessions')
          .select('*, churches(id, name)')
          .order('session_date', { ascending: false }),
        supabase.from('attendance_records').select('*'),
        supabase.from('profiles').select('*, churches(id, name)').order('full_name'),
      ]);

      if (sessRes.error) {
        setError(sessRes.error.message);
      } else {
        const list = (sessRes.data as AttendanceSession[]) || [];
        setSessions(list);
        if (list.length > 0) {
          setSelectedSessionId((prev) => prev || list[0].id);
        }
      }
      if (!recRes.error && recRes.data) setRecords(recRes.data as AttendanceRecord[]);
      if (!memRes.error && memRes.data) setMembers(memRes.data as Profile[]);
    } else {
      // Member view: own attendance history
      const [sessRes, myRecRes] = await Promise.all([
        supabase
          .from('attendance_sessions')
          .select('*, churches(id, name)')
          .order('session_date', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('*, attendance_sessions(*, churches(id, name))')
          .eq('user_id', user.id),
      ]);

      if (sessRes.error) {
        setError(sessRes.error.message);
      } else {
        setSessions((sessRes.data as AttendanceSession[]) || []);
      }
      if (!myRecRes.error && myRecRes.data) {
        setRecords(myRecRes.data as AttendanceRecord[]);
      }
    }

    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const sessionMembers = useMemo(() => {
    if (!activeSession) return [];
    if (!activeSession.church_id) return members;
    return members.filter((m) => m.church_id === activeSession.church_id);
  }, [activeSession, members]);

  const presentSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.session_id === selectedSessionId && r.present) {
        set.add(r.user_id);
      }
    }
    return set;
  }, [records, selectedSessionId]);

  const toggleMemberPresent = async (memberId: string) => {
    if (!activeSession || !user) return;
    const existing = records.find(
      (r) => r.session_id === activeSession.id && r.user_id === memberId
    );
    const nextPresent = !existing?.present;

    if (existing) {
      const { error: err } = await supabase
        .from('attendance_records')
        .update({ present: nextPresent, marked_by: user.id })
        .eq('id', existing.id);
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      setRecords((prev) =>
        prev.map((r) => (r.id === existing.id ? { ...r, present: nextPresent } : r))
      );
    } else {
      const { data, error: err } = await supabase
        .from('attendance_records')
        .insert({
          session_id: activeSession.id,
          user_id: memberId,
          present: true,
          marked_by: user.id,
        })
        .select()
        .single();
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      if (data) setRecords((prev) => [...prev, data as AttendanceRecord]);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !sessionTitle.trim()) return;
    setCreating(true);
    const chosenChurch = isDistrictAdmin
      ? sessionChurchId || null
      : profile?.church_id || null;

    const { data, error: err } = await supabase
      .from('attendance_sessions')
      .insert({
        title: sessionTitle.trim(),
        session_date: sessionDate,
        church_id: chosenChurch,
        created_by: user.id,
      })
      .select('*, churches(id, name)')
      .single();

    setCreating(false);
    if (err) {
      showToast(err.message, 'error');
      return;
    }

    if (data) {
      const created = data as AttendanceSession;
      setSessions((prev) => [created, ...prev]);
      setSelectedSessionId(created.id);
    }
    setSessionTitle('');
    setShowNewSession(false);
    showToast('Attendance session created.', 'success');
  };

  // Per-church report calculations
  const churchReports = useMemo(() => {
    return churches.map((church) => {
      const churchMembers = members.filter((m) => m.church_id === church.id);
      const memberIds = new Set(churchMembers.map((m) => m.id));
      const relevantSessions = sessions.filter(
        (s) => s.church_id === null || s.church_id === church.id
      );
      const totalPossible = churchMembers.length * Math.max(1, relevantSessions.length);
      const presentCount = records.filter(
        (r) =>
          r.present &&
          memberIds.has(r.user_id) &&
          relevantSessions.some((s) => s.id === r.session_id)
      ).length;
      const pct =
        churchMembers.length === 0 || relevantSessions.length === 0
          ? 0
          : Math.round((presentCount / totalPossible) * 100);
      return {
        church,
        memberCount: churchMembers.length,
        presentCount,
        percentage: pct,
      };
    });
  }, [churches, members, sessions, records]);

  const exportCsv = () => {
    const rows = [['Church', 'Registered Youth', 'Total Presences Logged', 'Attendance %']];
    for (const row of churchReports) {
      rows.push([
        row.church.name,
        String(row.memberCount),
        String(row.presentCount),
        `${row.percentage}%`,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kiomwobo-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV report exported.', 'success');
  };

  // Member attendance summary
  const memberAttendedCount = records.filter((r) => r.present).length;
  const memberEligibleSessions = sessions.filter(
    (s) => s.church_id === null || s.church_id === profile?.church_id
  );
  const memberPct =
    memberEligibleSessions.length === 0
      ? 0
      : Math.round((memberAttendedCount / memberEligibleSessions.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.attendance}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            {isAdmin
              ? 'Take Sabbath & programme roll call and export district reports'
              : 'Your personal youth fellowship attendance history'}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={exportCsv}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D4AF37]/45 text-slate-800 dark:text-[#F5D88A] font-royal-ui text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#31005F]/30 transition"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNewSession(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>New Session</span>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonCard lines={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadAttendance} />
      ) : isAdmin ? (
        <div className="space-y-6">
          {/* Session Selector & Roll Call */}
          <GlassCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                  Mark Attendance
                </h2>
                {activeSession && (
                  <p className="text-sm text-slate-600 dark:text-[#C7A4FF] tabular-nums">
                    {presentSet.size} of {sessionMembers.length} present (
                    {sessionMembers.length > 0
                      ? Math.round((presentSet.size / sessionMembers.length) * 100)
                      : 0}
                    %)
                  </p>
                )}
              </div>

              {sessions.length > 0 && (
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/35 text-sm text-slate-900 dark:text-[#F5F1FF]"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.session_date} · {s.title} ({s.churches?.name || 'District'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {sessions.length === 0 ? (
              <EmptyState
                title="No attendance sessions yet"
                description="Create your first Sabbath or youth rally session to begin marking attendance."
                actionLabel="Create Session"
                onAction={() => setShowNewSession(true)}
              />
            ) : (
              <div className="divide-y divide-[#D4AF37]/15 max-h-[420px] overflow-y-auto">
                {sessionMembers.map((member) => {
                  const isPresent = presentSet.has(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMemberPresent(member.id)}
                      className="w-full min-h-[56px] py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-[#31005F]/20 rounded-xl transition text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                          {member.full_name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/75">
                          {member.churches?.name || 'Kiomwobo District'}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-2 font-royal-ui text-xs font-semibold shrink-0 ${
                          isPresent ? 'text-[#D4AF37] dark:text-[#F5D88A]' : 'text-slate-400'
                        }`}
                      >
                        <span>{isPresent ? 'Present' : 'Absent'}</span>
                        {isPresent ? (
                          <CheckSquare className="w-5 h-5 text-[#F5D88A]" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* District & Per-Church Report Table */}
          <GlassCard>
            <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF] mb-4">
              District & Church Attendance Report
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#D4AF37]/30 text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">
                    <th className="py-3 pr-4">Church</th>
                    <th className="py-3 px-3 text-right">Members</th>
                    <th className="py-3 px-3 text-right">Presences</th>
                    <th className="py-3 pl-3 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4AF37]/15 text-sm">
                  {churchReports.map((row) => (
                    <tr key={row.church.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-[#F5F1FF]">
                        {row.church.name}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-[#C7A4FF]">
                        {row.memberCount}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-[#C7A4FF]">
                        {row.presentCount}
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums font-semibold text-[#B8891B] dark:text-[#F5D88A]">
                        {row.percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      ) : (
        /* Member Personal Attendance History */
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <GlassCard>
              <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">
                Sessions Attended
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-[#F5D88A]">
                {memberAttendedCount}
              </p>
            </GlassCard>
            <GlassCard>
              <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">
                Attendance Rate
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-[#8B24FF] dark:text-[#C7A4FF]">
                {memberPct}%
              </p>
            </GlassCard>
          </div>

          {records.length === 0 ? (
            <EmptyState
              title="No attendance records yet"
              description="Your attendance history will appear here once leaders take roll call at youth programmes."
              icon={<ClipboardCheck className="w-6 h-6" />}
            />
          ) : (
            <GlassCard>
              <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF] mb-3">
                History
              </h2>
              <div className="divide-y divide-[#D4AF37]/15">
                {records.map((rec) => (
                  <div key={rec.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-base text-slate-900 dark:text-[#F5F1FF]">
                        {rec.attendance_sessions?.title || 'Youth Session'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-[#C7A4FF] tabular-nums">
                        {rec.attendance_sessions?.session_date} ·{' '}
                        {rec.attendance_sessions?.churches?.name || 'District-Wide'}
                      </p>
                    </div>
                    <span
                      className={`font-royal-ui text-xs font-semibold ${
                        rec.present ? 'text-emerald-500' : 'text-slate-400'
                      }`}
                    >
                      {rec.present ? 'Present' : 'Absent'}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* New Session Modal */}
      {showNewSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-md relative">
            <button
              type="button"
              onClick={() => setShowNewSession(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              Create Attendance Session
            </h2>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Session Title
                </label>
                <input
                  type="text"
                  required
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="Sabbath Afternoon AY"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              {isDistrictAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Church Scope
                  </label>
                  <select
                    value={sessionChurchId}
                    onChange={(e) => setSessionChurchId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  >
                    <option value="">District-Wide</option>
                    {churches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {creating ? 'Creating...' : 'Create Session'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
