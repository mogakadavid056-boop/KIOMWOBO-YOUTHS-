import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Pin, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Announcement } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const AnnouncementsPage: React.FC = () => {
  const { user, profile, churches, isAdmin, isDistrictAdmin } = useAuth();
  const { t } = useLanguage();
  const { openProfile } = useSocial();
  const { showToast } = useToast();

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'district' | 'church'>('all');

  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetChurchId, setTargetChurchId] = useState<string>('');
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('announcements')
      .select('*, churches(id, name), profiles(id, full_name, avatar_url, role)')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setItems((data as Announcement[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (scope === 'district') return item.church_id === null;
      if (scope === 'church') return item.church_id === profile?.church_id;
      return item.church_id === null || item.church_id === profile?.church_id || isDistrictAdmin;
    });
  }, [items, scope, profile?.church_id, isDistrictAdmin]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !body.trim()) return;
    setSubmitting(true);

    const chosenChurch =
      isDistrictAdmin ? (targetChurchId || null) : (profile?.church_id || null);

    const { error: err } = await supabase.from('announcements').insert({
      title: title.trim(),
      body: body.trim(),
      church_id: chosenChurch,
      pinned: isPinned,
      author_id: user.id,
    });

    setSubmitting(false);
    if (err) {
      showToast(err.message, 'error');
      return;
    }

    showToast('Announcement published.', 'success');
    setTitle('');
    setBody('');
    setIsPinned(false);
    setShowCompose(false);
    loadAnnouncements();
  };

  const handleTogglePin = async (item: Announcement) => {
    const nextPinned = !(item.pinned ?? item.is_pinned);
    const { error: err } = await supabase
      .from('announcements')
      .update({ pinned: nextPinned })
      .eq('id', item.id);

    if (err) {
      showToast(err.message, 'error');
      return;
    }
    showToast(nextPinned ? 'Announcement pinned.' : 'Announcement unpinned.', 'info');
    loadAnnouncements();
  };

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase.from('announcements').delete().eq('id', id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    showToast('Announcement deleted.', 'success');
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.announcements}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            Official notices from Kiomwobo District and your local church
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setTargetChurchId(isDistrictAdmin ? '' : profile?.church_id || '');
              setShowCompose(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold inline-flex items-center gap-2 hover:brightness-105 transition whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Post Announcement</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all', label: 'All Notices' },
          { id: 'district', label: t.common.districtWide },
          { id: 'church', label: 'My Church' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setScope(tab.id as 'all' | 'district' | 'church')}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap transition ${
              scope === tab.id
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF] hover:border-[#D4AF37]/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadAnnouncements} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No announcements yet"
          description="District and church announcements will appear here as leaders share updates."
          icon={<Megaphone className="w-6 h-6" />}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const pinned = Boolean(item.is_pinned ?? item.pinned);
            const content = item.body || item.content || '';
            return (
              <GlassCard
                key={item.id}
                elevated={pinned}
                className={pinned ? 'border-[#D4AF37]/65' : ''}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#F5D88A] mb-1">
                      {pinned && <Pin className="w-3.5 h-3.5 text-[#D4AF37]" />}
                      <span>{item.churches?.name || t.common.districtWide}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      {item.profiles?.full_name && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => item.profiles?.id && openProfile(item.profiles.id)}
                            className="hover:underline font-medium"
                          >
                            {item.profiles.full_name}
                          </button>
                        </>
                      )}
                    </div>
                    <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                      {item.title}
                    </h2>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTogglePin(item)}
                        className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition ${
                          pinned
                            ? 'text-[#D4AF37] bg-[#31005F]/50'
                            : 'text-slate-500 dark:text-[#C7A4FF] hover:bg-[#31005F]/30'
                        }`}
                        aria-label={pinned ? 'Unpin announcement' : 'Pin announcement'}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/15 transition"
                        aria-label="Delete announcement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-base leading-relaxed text-slate-700 dark:text-[#F5F1FF]/90 whitespace-pre-line">
                  {content}
                </p>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-lg relative">
            <button
              type="button"
              onClick={() => setShowCompose(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              Post Announcement
            </h2>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Sabbath Youth Rally Update"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              {isDistrictAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Audience
                  </label>
                  <select
                    value={targetChurchId}
                    onChange={(e) => setTargetChurchId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  >
                    <option value="">District-Wide (All 7 Churches)</option>
                    {churches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Message
                </label>
                <textarea
                  rows={5}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write the full announcement..."
                  className="w-full p-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-5 h-5 accent-[#8B24FF]"
                />
                <span className="text-base text-slate-800 dark:text-[#F5F1FF]">
                  Pin announcement to top
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {submitting ? 'Publishing...' : 'Publish Announcement'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
