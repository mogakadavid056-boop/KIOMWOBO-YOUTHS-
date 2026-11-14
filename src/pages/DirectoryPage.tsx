import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserCheck } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Profile, ROLE_LABELS } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const DirectoryPage: React.FC = () => {
  const { churches } = useAuth();
  const { t } = useLanguage();
  const { openProfile, isUserOnline } = useSocial();

  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedChurch, setSelectedChurch] = useState<string>('all');
  const [onlyOnline, setOnlyOnline] = useState(false);

  const loadDirectory = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*, churches(id, name)')
      .order('full_name', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setMembers((data as Profile[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const onlineCount = useMemo(
    () => members.filter((m) => isUserOnline(m.id)).length,
    [members, isUserOnline]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const matchesChurch = selectedChurch === 'all' || m.church_id === selectedChurch;
      const matchesOnline = !onlyOnline || isUserOnline(m.id);
      const matchesQuery =
        !q ||
        m.full_name?.toLowerCase().includes(q) ||
        m.phone?.toLowerCase().includes(q) ||
        m.churches?.name?.toLowerCase().includes(q);
      return matchesChurch && matchesOnline && matchesQuery;
    });
  }, [members, selectedChurch, onlyOnline, isUserOnline, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.directory}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF] tabular-nums">
            {filtered.length} youth members ·{' '}
            <span className="text-emerald-500 dark:text-emerald-400 font-semibold">
              {onlineCount} online now
            </span>
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl royal-glass text-base text-slate-900 dark:text-[#F5F1FF] placeholder:text-slate-400 dark:placeholder:text-[#C7A4FF]/50 focus:outline-none focus:border-[#8B24FF]"
          />
        </div>
      </div>

      {/* Church Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setOnlyOnline((v) => !v)}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition ${
            onlyOnline
              ? 'bg-emerald-600 text-white shadow'
              : 'royal-glass text-emerald-600 dark:text-emerald-400 hover:border-emerald-400/50'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          <span>Online Now ({onlineCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedChurch('all')}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 transition ${
            selectedChurch === 'all'
              ? 'bg-[#8B24FF] text-white violet-glow'
              : 'royal-glass text-slate-700 dark:text-[#C7A4FF] hover:border-[#D4AF37]/50'
          }`}
        >
          {t.common.allChurches}
        </button>
        {churches.map((church) => (
          <button
            key={church.id}
            type="button"
            onClick={() => setSelectedChurch(church.id)}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 transition ${
              selectedChurch === church.id
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF] hover:border-[#D4AF37]/50'
            }`}
          >
            {church.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadDirectory} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No members found"
          description="Try adjusting your search or selecting another church in Kiomwobo District."
          icon={<UserCheck className="w-6 h-6" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((member) => {
            const online = isUserOnline(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => openProfile(member.id)}
                className="text-left"
              >
                <GlassCard className="flex items-center gap-4 hover:border-[#D4AF37]/60 active:scale-[0.99] transition min-h-[84px]">
                  <div className="relative shrink-0">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.full_name}
                        referrerPolicy="no-referrer"
                        className="w-13 h-13 rounded-full object-cover border border-[#D4AF37]/60"
                      />
                    ) : (
                      <div className="w-13 h-13 rounded-full bg-[#31005F] border border-[#D4AF37]/60 flex items-center justify-center font-royal-ui text-lg font-bold text-[#F5D88A]">
                        {(member.full_name?.[0] ?? 'Y').toUpperCase()}
                      </div>
                    )}
                    {online && (
                      <span
                        className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-[#120822]"
                        title="Online"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                        {member.full_name}
                      </p>
                      {online && (
                        <span className="shrink-0 text-[10px] font-royal-ui font-bold text-emerald-500 dark:text-emerald-400">
                          Online
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600 dark:text-[#C7A4FF] truncate">
                      <span className="truncate">{member.churches?.name || 'Kiomwobo District'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{ROLE_LABELS[member.role]}</span>
                    </div>
                  </div>
                </GlassCard>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
