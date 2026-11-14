import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Flame, Plus, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Prayer } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const PrayerWallPage: React.FC = () => {
  const { user, profile, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { openProfile } = useSocial();
  const { showToast } = useToast();

  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'request' | 'testimony'>('all');

  const [showCompose, setShowCompose] = useState(false);
  const [type, setType] = useState<'request' | 'testimony'>('request');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadPrayers = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('prayers')
      .select('*, profiles!user_id(id, full_name, avatar_url, church_id), prayer_amens(prayer_id, user_id)')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setPrayers((data as Prayer[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPrayers();
  }, [loadPrayers]);

  const visiblePrayers = useMemo(() => {
    return prayers.filter((p) => {
      const isHidden = Boolean(p.hidden ?? p.is_hidden);
      const prayerKind = p.kind ?? p.type ?? 'request';
      if (isHidden && !isAdmin) return false;
      if (filter !== 'all' && prayerKind !== filter) return false;
      return true;
    });
  }, [prayers, filter, isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !content.trim()) return;
    setSubmitting(true);
    const { error: err } = await supabase.from('prayers').insert({
      user_id: user.id,
      kind: type,
      content: content.trim(),
      anonymous: isAnonymous,
      church_id: profile?.church_id || null,
    });
    setSubmitting(false);

    if (err) {
      showToast(err.message, 'error');
      return;
    }
    showToast(type === 'request' ? 'Prayer request shared.' : 'Testimony shared.', 'success');
    setContent('');
    setIsAnonymous(false);
    setShowCompose(false);
    loadPrayers();
  };

  const toggleAmen = async (prayer: Prayer) => {
    if (!user) return;
    const myAmen = prayer.prayer_amens?.find((a) => a.user_id === user.id);
    if (myAmen) {
      const { error: err } = await supabase
        .from('prayer_amens')
        .delete()
        .eq('prayer_id', prayer.id)
        .eq('user_id', user.id);
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      setPrayers((prev) =>
        prev.map((p) =>
          p.id === prayer.id
            ? { ...p, prayer_amens: p.prayer_amens?.filter((a) => a.user_id !== user.id) }
            : p
        )
      );
    } else {
      const { data, error: err } = await supabase
        .from('prayer_amens')
        .upsert({ prayer_id: prayer.id, user_id: user.id }, { onConflict: 'prayer_id,user_id' })
        .select('prayer_id, user_id')
        .single();
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      if (data) {
        setPrayers((prev) =>
          prev.map((p) =>
            p.id === prayer.id
              ? {
                  ...p,
                  prayer_amens: [
                    ...(p.prayer_amens || []),
                    data as { prayer_id: string; user_id: string },
                  ],
                }
              : p
          )
        );
      }
    }
  };

  const toggleHide = async (prayer: Prayer) => {
    const nextHidden = !(prayer.hidden ?? prayer.is_hidden);
    const { error: err } = await supabase
      .from('prayers')
      .update({ hidden: nextHidden })
      .eq('id', prayer.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setPrayers((prev) =>
      prev.map((p) => (p.id === prayer.id ? { ...p, hidden: nextHidden, is_hidden: nextHidden } : p))
    );
    showToast(nextHidden ? 'Prayer hidden.' : 'Prayer restored.', 'info');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.prayer}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            Lift one another in prayer and rejoice in answered testimonies
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCompose(true)}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Share Prayer / Testimony</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {[
          { id: 'all', label: 'All' },
          { id: 'request', label: 'Prayer Requests' },
          { id: 'testimony', label: 'Testimonies' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as 'all' | 'request' | 'testimony')}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold transition ${
              filter === tab.id
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
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
        <ErrorState message={error} onRetry={loadPrayers} />
      ) : visiblePrayers.length === 0 ? (
        <EmptyState
          title="The prayer wall is quiet"
          description="Share a prayer request or a praise testimony for Kiomwobo Youths to pray with you."
          actionLabel="Share First Prayer"
          onAction={() => setShowCompose(true)}
          icon={<Flame className="w-6 h-6" />}
        />
      ) : (
        <div className="space-y-4">
          {visiblePrayers.map((prayer) => {
            const amens = prayer.prayer_amens || [];
            const hasAmened = amens.some((a) => a.user_id === user?.id);
            const isAnon = Boolean(prayer.anonymous ?? prayer.is_anonymous);
            const isHidden = Boolean(prayer.hidden ?? prayer.is_hidden);
            const prayerKind = prayer.kind ?? prayer.type ?? 'request';
            const authorName = isAnon
              ? 'Anonymous Youth'
              : prayer.profiles?.full_name || 'Youth Member';
            const text = prayer.content || prayer.body || '';

            return (
              <GlassCard
                key={prayer.id}
                className={isHidden ? 'opacity-60 border-red-400/40' : ''}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#F5D88A] flex-wrap">
                    {isAnon ? (
                      <span className="font-semibold">{authorName}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openProfile(prayer.user_id)}
                        className="font-semibold hover:underline text-left"
                      >
                        {authorName}
                      </button>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">
                      {prayerKind === 'testimony' ? 'Testimony' : 'Prayer Request'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {new Date(prayer.created_at).toLocaleDateString()}
                    </span>
                    {isHidden && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-red-400">Hidden</span>
                      </>
                    )}
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => toggleHide(prayer)}
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-[#C7A4FF] hover:bg-[#31005F]/30"
                      aria-label={isHidden ? 'Unhide prayer' : 'Hide prayer'}
                    >
                      {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                <p className="mt-3 text-base leading-relaxed text-slate-800 dark:text-[#F5F1FF] whitespace-pre-line">
                  {text}
                </p>

                <div className="mt-4 pt-3 border-t border-[#D4AF37]/20 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => toggleAmen(prayer)}
                    className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold inline-flex items-center gap-2 transition ${
                      hasAmened
                        ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60 violet-glow'
                        : 'border border-[#D4AF37]/30 text-slate-700 dark:text-[#C7A4FF] hover:bg-[#31005F]/25'
                    }`}
                  >
                    <Flame className="w-4 h-4 text-[#D4AF37]" />
                    <span className="tabular-nums">Amen ({amens.length})</span>
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Compose Prayer Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-lg relative">
            <button
              type="button"
              onClick={() => setShowCompose(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              Share on the Prayer Wall
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/15 dark:bg-[#080610]/70 border border-[#D4AF37]/25">
                {(['request', 'testimony'] as const).map((tOpt) => (
                  <button
                    key={tOpt}
                    type="button"
                    onClick={() => setType(tOpt)}
                    className={`min-h-[44px] rounded-lg font-royal-ui text-xs font-semibold capitalize ${
                      type === tOpt
                        ? 'bg-[#8B24FF] text-white'
                        : 'text-slate-600 dark:text-[#C7A4FF]'
                    }`}
                  >
                    {tOpt === 'request' ? 'Prayer Request' : 'Testimony'}
                  </button>
                ))}
              </div>

              <div>
                <textarea
                  rows={5}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    type === 'request'
                      ? 'How can the youth family pray with you?'
                      : 'Share how God has answered prayer...'
                  }
                  className="w-full p-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-5 h-5 accent-[#8B24FF]"
                />
                <span className="text-base text-slate-800 dark:text-[#F5F1FF]">
                  Post anonymously
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {submitting ? 'Sharing...' : 'Post to Prayer Wall'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
