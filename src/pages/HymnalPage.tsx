import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, Music, Search, Type } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useToast } from '@/src/context/ToastContext';
import { cacheHymns, getCachedHymns } from '@/src/lib/offlineDb';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Hymn, type HymnFavorite } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const HymnalPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [hymns, setHymns] = useState<Hymn[]>([]);
  const [favorites, setFavorites] = useState<HymnFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedHymnal, setSelectedHymnal] = useState<string>('all');
  const [langFilter, setLangFilter] = useState<'all' | 'en' | 'sw'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [activeHymn, setActiveHymn] = useState<Hymn | null>(null);
  const [fontSize, setFontSize] = useState(19);

  const loadHymns = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Load offline cached hymns immediately
    const cached = await getCachedHymns();
    if (cached.length > 0) {
      setHymns(cached.sort((a, b) => a.number - b.number));
    }

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      const PAGE_SIZE = 1000;
      const allRawHymns: Array<Record<string, unknown>> = [];
      let hymnErr: string | null = null;
      let offset = 0;

      while (true) {
        const { data, error: err } = await supabase
          .from('hymns')
          .select('*')
          .order('number', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (err) {
          hymnErr = err.message;
          break;
        }
        const chunk = (data as Array<Record<string, unknown>>) || [];
        allRawHymns.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      const favRes = user
        ? await supabase.from('hymn_favorites').select('*').eq('user_id', user.id)
        : { data: [], error: null };

      if (hymnErr && allRawHymns.length === 0) {
        if (cached.length === 0) setError(hymnErr);
      } else if (allRawHymns.length > 0) {
        const list = allRawHymns.map((row) => {
          const rawLyrics = row.lyrics;
          const lyricsStr = Array.isArray(rawLyrics)
            ? rawLyrics.join('\n\n')
            : String(rawLyrics ?? '');
          const rawLang = String(row.language ?? 'en').toLowerCase();
          return {
            id: String(row.id),
            hymnal: String(row.hymnal ?? 'SDA Hymnal'),
            language: rawLang.startsWith('sw') ? 'sw' : 'en',
            number: Number(row.number ?? 0),
            title: String(row.title ?? ''),
            lyrics: lyricsStr,
          } satisfies Hymn;
        });
        setHymns(list);
        await cacheHymns(list);
      }

      if (!favRes.error && favRes.data) {
        setFavorites(favRes.data as HymnFavorite[]);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadHymns();
  }, [loadHymns]);

  const hymnalNames = useMemo(() => {
    const set = new Set<string>();
    for (const h of hymns) {
      if (h.hymnal) set.add(h.hymnal);
    }
    return Array.from(set);
  }, [hymns]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.hymn_id)), [favorites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hymns.filter((h) => {
      if (selectedHymnal !== 'all' && h.hymnal !== selectedHymnal) return false;
      if (langFilter !== 'all' && h.language !== langFilter) return false;
      if (favoritesOnly && !favoriteIds.has(h.id)) return false;
      if (!q) return true;
      return (
        String(h.number).includes(q) ||
        h.title.toLowerCase().includes(q) ||
        h.lyrics.toLowerCase().includes(q)
      );
    });
  }, [hymns, selectedHymnal, langFilter, favoritesOnly, favoriteIds, search]);

  const toggleFavorite = async (hymnId: string) => {
    if (!user) return;
    const existing = favorites.find((f) => f.hymn_id === hymnId);
    if (existing) {
      const { error: err } = await supabase.from('hymn_favorites').delete().eq('id', existing.id);
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
    } else {
      const { data, error: err } = await supabase
        .from('hymn_favorites')
        .insert({ user_id: user.id, hymn_id: hymnId })
        .select()
        .single();
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      if (data) setFavorites((prev) => [...prev, data as HymnFavorite]);
    }
  };

  if (activeHymn) {
    const isFav = favoriteIds.has(activeHymn.id);
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveHymn(null)}
            className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-slate-800 dark:text-[#F5D88A]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Hymns</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 rounded-xl royal-glass min-h-[44px]">
              <Type className="w-4 h-4 text-[#D4AF37]" />
              <input
                type="range"
                min={16}
                max={28}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                aria-label="Hymn font size"
                className="w-24 accent-[#8B24FF]"
              />
            </div>

            <button
              type="button"
              onClick={() => toggleFavorite(activeHymn.id)}
              className={`min-w-[44px] min-h-[44px] rounded-xl royal-glass flex items-center justify-center transition ${
                isFav ? 'text-rose-400 border-rose-400/50' : 'text-slate-500 dark:text-[#C7A4FF]'
              }`}
              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {/* Hymn Lyrics in Inter font for sharp readability */}
        <GlassCard elevated padding="lg" className="font-royal-body">
          <div className="border-b border-[#D4AF37]/25 pb-4 mb-5">
            <div className="flex items-center gap-2 text-xs font-royal-ui text-slate-500 dark:text-[#F5D88A]">
              <span>{activeHymn.hymnal}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">#{activeHymn.number}</span>
              <span aria-hidden="true">·</span>
              <span>{activeHymn.language === 'sw' ? 'Kiswahili' : 'English'}</span>
            </div>
            <h1 className="mt-1 font-royal-serif text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#F5F1FF]">
              {activeHymn.title}
            </h1>
          </div>

          <div
            style={{ fontSize: `${fontSize}px` }}
            className="font-royal-body leading-relaxed text-slate-900 dark:text-[#F5F1FF] whitespace-pre-line"
          >
            {activeHymn.lyrics}
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.hymnal}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            SDA Hymnal & Nyimbo za Kristo · Cached for offline worship
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, title, or lyrics..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl royal-glass text-base text-slate-900 dark:text-[#F5F1FF]"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {hymnalNames.length > 0 && (
          <select
            value={selectedHymnal}
            onChange={(e) => setSelectedHymnal(e.target.value)}
            className="min-h-[44px] px-3.5 rounded-xl royal-glass text-sm font-royal-ui font-semibold text-slate-800 dark:text-[#F5F1FF]"
          >
            <option value="all">All Hymnals</option>
            {hymnalNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}

        {(['all', 'en', 'sw'] as const).map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => setLangFilter(lng)}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold transition ${
              langFilter === lng
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
            }`}
          >
            {lng === 'all' ? 'All Languages' : lng === 'en' ? 'English' : 'Kiswahili'}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setFavoritesOnly((f) => !f)}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold inline-flex items-center gap-1.5 transition ${
            favoritesOnly
              ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60'
              : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
          }`}
        >
          <Heart className={`w-4 h-4 ${favoritesOnly ? 'fill-current text-rose-400' : ''}`} />
          <span>Favorites ({favorites.length})</span>
        </button>
      </div>

      {loading && hymns.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadHymns} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No hymns found"
          description="No hymns are in the hymns table yet (or none match your filter). Super Admins can upload a hymns JSON file from More → Data Import, or run scripts/import-hymns.ts."
          icon={<Music className="w-6 h-6" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((hymn) => {
            const isFav = favoriteIds.has(hymn.id);
            return (
              <GlassCard
                key={hymn.id}
                padding="sm"
                className="flex items-center justify-between gap-3 hover:border-[#D4AF37]/60 transition"
              >
                <button
                  type="button"
                  onClick={() => setActiveHymn(hymn)}
                  className="flex items-center gap-3.5 flex-1 min-w-0 text-left min-h-[52px]"
                >
                  <span className="w-12 h-12 rounded-xl bg-[#31005F]/65 border border-[#D4AF37]/40 flex items-center justify-center font-royal-ui text-sm font-bold text-[#F5D88A] tabular-nums shrink-0">
                    {hymn.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                      {hymn.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/80 truncate">
                      {hymn.hymnal} · {hymn.language === 'sw' ? 'Kiswahili' : 'English'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavorite(hymn.id)}
                  className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 ${
                    isFav ? 'text-rose-400' : 'text-slate-400 dark:text-[#C7A4FF]/60'
                  }`}
                  aria-label="Toggle favorite"
                >
                  <Heart className={`w-4.5 h-4.5 ${isFav ? 'fill-current' : ''}`} />
                </button>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
