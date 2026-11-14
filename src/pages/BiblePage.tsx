import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  NotebookPen,
  Search,
  Share2,
  Type,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useToast } from '@/src/context/ToastContext';
import { BIBLE_BOOKS, DAILY_VERSES_FALLBACK, getDayOfYearIndex } from '@/src/lib/bibleBooks';
import { cacheBibleChapter, getCachedBibleChapter } from '@/src/lib/offlineDb';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import {
  type BibleBookmark,
  type BibleVerse,
  type BibleVersion,
  type HighlightColor,
} from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

interface BiblePageProps {
  initialBook?: string;
  initialChapter?: number;
  onAddNoteForVerse: (verseRef: string) => void;
}

const HIGHLIGHT_STYLES: Record<HighlightColor, string> = {
  none: '',
  gold: 'bg-[#D4AF37]/25 border-[#D4AF37]/50',
  violet: 'bg-[#8B24FF]/25 border-[#C7A4FF]/50',
  emerald: 'bg-emerald-500/20 border-emerald-400/50',
  rose: 'bg-rose-500/20 border-rose-400/50',
};

export const BiblePage: React.FC<BiblePageProps> = ({
  initialBook,
  initialChapter,
  onAddNoteForVerse,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [book, setBook] = useState(initialBook || 'John');
  const [chapter, setChapter] = useState(initialChapter || 3);
  const [version, setVersion] = useState<BibleVersion>('KJV');
  const [parallelMode, setParallelMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);

  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [swahiliVerses, setSwahiliVerses] = useState<BibleVerse[]>([]);
  const [bookmarks, setBookmarks] = useState<BibleBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BibleVerse[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [selectedVerse, setSelectedVerse] = useState<BibleVerse | null>(null);
  const [showBookmarksDrawer, setShowBookmarksDrawer] = useState(false);

  useEffect(() => {
    if (initialBook) setBook(initialBook);
    if (initialChapter) setChapter(initialChapter);
  }, [initialBook, initialChapter]);

  const currentBookIndex = useMemo(() => {
    const idx = BIBLE_BOOKS.findIndex((b) => b.name === book);
    return idx >= 0 ? idx : 42;
  }, [book]);

  const currentBookMeta = BIBLE_BOOKS[currentBookIndex];
  const currentBookNumber = currentBookIndex + 1;

  const fetchChapter = useCallback(
    async (targetVersion: BibleVersion, targetBookNumber: number, targetBookName: string, targetChapter: number) => {
      // Check IndexedDB cache first for instant/offline support
      const cached = await getCachedBibleChapter(targetVersion, targetBookName, targetChapter);
      if (cached && cached.length > 0) {
        return cached;
      }

      if (!isSupabaseConfigured) return [];

      const { data, error: err } = await supabase
        .from('bible_verses')
        .select('id, version, book_number, book_name, chapter, verse, text')
        .eq('version', targetVersion)
        .eq('book_number', targetBookNumber)
        .eq('chapter', targetChapter)
        .order('verse', { ascending: true });

      if (err) throw err;
      const rows = (data as BibleVerse[]) || [];
      if (rows.length > 0) {
        await cacheBibleChapter(targetVersion, targetBookName, targetChapter, rows);
      }
      return rows;
    },
    []
  );

  const loadChapterData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const primary = await fetchChapter(
        parallelMode ? 'KJV' : version,
        currentBookNumber,
        book,
        chapter
      );
      setVerses(primary);

      if (parallelMode) {
        const sw = await fetchChapter('SWAHILI', currentBookNumber, book, chapter);
        setSwahiliVerses(sw);
      } else {
        setSwahiliVerses([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chapter.');
    } finally {
      setLoading(false);
    }
  }, [fetchChapter, parallelMode, version, currentBookNumber, book, chapter]);

  useEffect(() => {
    loadChapterData();
  }, [loadChapterData]);

  const loadBookmarks = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;
    const { data, error: err } = await supabase
      .from('bible_bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!err && data) {
      setBookmarks(data as BibleBookmark[]);
    }
  }, [user]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    if (!isSupabaseConfigured) {
      showToast('Connect Supabase to search full Scripture.', 'info');
      return;
    }

    setSearching(true);
    // Use fts column with websearch textSearch, fallback to ilike if needed
    const { data, error: ftsErr } = await supabase
      .from('bible_verses')
      .select('id, version, book_number, book_name, chapter, verse, text')
      .eq('version', version)
      .textSearch('fts', q, { type: 'websearch' })
      .limit(40);

    if (!ftsErr && data && data.length > 0) {
      setSearchResults(data as BibleVerse[]);
      setSearching(false);
      return;
    }

    const { data: ilikeData, error: ilikeErr } = await supabase
      .from('bible_verses')
      .select('id, version, book_number, book_name, chapter, verse, text')
      .eq('version', version)
      .ilike('text', `%${q}%`)
      .limit(40);

    setSearching(false);
    if (ilikeErr) {
      showToast(ilikeErr.message, 'error');
    } else {
      setSearchResults((ilikeData as BibleVerse[]) || []);
    }
  };

  const applyHighlight = async (v: BibleVerse, color: HighlightColor) => {
    if (!user) return;
    const verseBookName = v.book_name || v.book || book;
    const existing = bookmarks.find(
      (b) => b.book === verseBookName && b.chapter === v.chapter && b.verse === v.verse
    );

    if (color === 'none') {
      if (existing) {
        const { error: err } = await supabase.from('bible_bookmarks').delete().eq('id', existing.id);
        if (!err) {
          setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
          showToast('Highlight removed.', 'info');
        }
      }
      setSelectedVerse(null);
      return;
    }

    if (existing) {
      const { error: err } = await supabase
        .from('bible_bookmarks')
        .update({ color })
        .eq('id', existing.id);
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      setBookmarks((prev) => prev.map((b) => (b.id === existing.id ? { ...b, color } : b)));
    } else {
      const { data, error: err } = await supabase
        .from('bible_bookmarks')
        .insert({
          user_id: user.id,
          verse_id: v.id,
          version: v.version,
          book: verseBookName,
          chapter: v.chapter,
          verse: v.verse,
          color,
        })
        .select()
        .single();
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      if (data) setBookmarks((prev) => [data as BibleBookmark, ...prev]);
    }
    showToast('Verse highlighted & bookmarked.', 'success');
    setSelectedVerse(null);
  };

  const shareVerse = async (v: BibleVerse) => {
    const verseBookName = v.book_name || v.book || book;
    const ref = `${verseBookName} ${v.chapter}:${v.verse} (${v.version})`;
    const text = `"${v.text}" — ${ref}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: ref, text });
        return;
      } catch {
        // Fallback
      }
    }
    await navigator.clipboard.writeText(text);
    showToast('Verse copied to clipboard.', 'success');
  };

  const dailyVerse = DAILY_VERSES_FALLBACK[getDayOfYearIndex(DAILY_VERSES_FALLBACK.length)];

  const swahiliByVerse = useMemo(() => {
    const map = new Map<number, BibleVerse>();
    for (const v of swahiliVerses) map.set(v.verse, v);
    return map;
  }, [swahiliVerses]);

  const bookmarkMap = useMemo(() => {
    const map = new Map<string, BibleBookmark>();
    for (const b of bookmarks) {
      map.set(`${b.book}:${b.chapter}:${b.verse}`, b);
    }
    return map;
  }, [bookmarks]);

  const goPrevChapter = () => {
    if (chapter > 1) {
      setChapter((c) => c - 1);
    } else {
      const idx = BIBLE_BOOKS.findIndex((b) => b.name === book);
      if (idx > 0) {
        const prevBook = BIBLE_BOOKS[idx - 1];
        setBook(prevBook.name);
        setChapter(prevBook.chapters);
      }
    }
  };

  const goNextChapter = () => {
    if (chapter < currentBookMeta.chapters) {
      setChapter((c) => c + 1);
    } else {
      const idx = BIBLE_BOOKS.findIndex((b) => b.name === book);
      if (idx >= 0 && idx < BIBLE_BOOKS.length - 1) {
        setBook(BIBLE_BOOKS[idx + 1].name);
        setChapter(1);
      }
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Verse of the Day Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.bible}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            {dailyVerse.reference} · KJV & Kiswahili · Offline Cached
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowBookmarksDrawer(true)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-slate-800 dark:text-[#F5D88A]"
          >
            <Bookmark className="w-4 h-4" />
            <span className="tabular-nums">Bookmarks ({bookmarks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setParallelMode((p) => !p)}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl inline-flex items-center gap-2 font-royal-ui text-xs font-semibold transition ${
              parallelMode
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
            }`}
          >
            <Columns2 className="w-4 h-4" />
            <span>EN / SW Side-by-Side</span>
          </button>
        </div>
      </div>

      {/* Controls Bar: Book, Chapter, Version, Font Size, Search */}
      <GlassCard padding="sm" className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <select
            aria-label="Select Bible book"
            value={book}
            onChange={(e) => {
              setBook(e.target.value);
              setChapter(1);
              setSearchResults(null);
            }}
            className="min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
          >
            {BIBLE_BOOKS.map((b) => (
              <option key={b.name} value={b.name}>
                {version === 'SWAHILI' ? `${b.swahiliName} (${b.name})` : b.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={goPrevChapter}
              className="min-w-[44px] min-h-[44px] rounded-xl border border-[#D4AF37]/30 flex items-center justify-center text-slate-700 dark:text-[#F5D88A]"
              aria-label="Previous chapter"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              aria-label="Select chapter"
              value={chapter}
              onChange={(e) => {
                setChapter(Number(e.target.value));
                setSearchResults(null);
              }}
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base tabular-nums text-slate-900 dark:text-[#F5F1FF]"
            >
              {Array.from({ length: currentBookMeta.chapters }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  Chapter {num}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={goNextChapter}
              className="min-w-[44px] min-h-[44px] rounded-xl border border-[#D4AF37]/30 flex items-center justify-center text-slate-700 dark:text-[#F5D88A]"
              aria-label="Next chapter"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!parallelMode && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/10 dark:bg-[#080610]/65 border border-[#D4AF37]/25">
              {(['KJV', 'SWAHILI'] as BibleVersion[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVersion(v)}
                  className={`min-h-[38px] rounded-lg font-royal-ui text-xs font-semibold transition ${
                    version === v
                      ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/45'
                      : 'text-slate-600 dark:text-[#C7A4FF]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* Font Size Control */}
          <div className="flex items-center justify-between gap-2 px-3 rounded-xl border border-[#D4AF37]/25 min-h-[44px]">
            <Type className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <input
              type="range"
              min={16}
              max={26}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              aria-label="Bible font size"
              className="flex-1 accent-[#8B24FF]"
            />
            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-[#C7A4FF]">
              {fontSize}px
            </span>
          </div>
        </div>

        {/* Full-text search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Scripture (e.g. faith, shepherd, upendo)..."
              className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="min-h-[44px] px-4 rounded-xl bg-[#8B24FF] text-white font-royal-ui text-xs font-semibold whitespace-nowrap"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
          {searchResults && (
            <button
              type="button"
              onClick={() => {
                setSearchResults(null);
                setSearchQuery('');
              }}
              className="min-h-[44px] px-3 rounded-xl border border-[#D4AF37]/30 text-xs font-royal-ui text-slate-700 dark:text-[#C7A4FF]"
            >
              Clear
            </button>
          )}
        </form>
      </GlassCard>

      {/* Search Results Mode */}
      {searchResults ? (
        <GlassCard>
          <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5D88A] mb-3">
            Search Results ({searchResults.length})
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-base text-slate-600 dark:text-[#C7A4FF]">
              No matching verses found for “{searchQuery}”.
            </p>
          ) : (
            <div className="divide-y divide-[#D4AF37]/15">
              {searchResults.map((v) => {
                const canonicalBook =
                  BIBLE_BOOKS[(v.book_number ?? 1) - 1]?.name || v.book_name || v.book || book;
                const displayBook = v.book_name || v.book || canonicalBook;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setBook(canonicalBook);
                      setChapter(v.chapter);
                      setVersion(v.version);
                      setSearchResults(null);
                    }}
                    className="w-full py-3 text-left hover:bg-[#31005F]/20 rounded-xl px-2 transition"
                  >
                    <p className="font-royal-ui text-xs font-semibold text-[#8B24FF] dark:text-[#F5D88A]">
                      {displayBook} {v.chapter}:{v.verse} · {v.version}
                    </p>
                    <p className="mt-1 font-royal-body text-base text-slate-800 dark:text-[#F5F1FF]">
                      {v.text}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </GlassCard>
      ) : loading ? (
        <SkeletonCard lines={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadChapterData} />
      ) : verses.length === 0 ? (
        <EmptyState
          title={`${book} ${chapter} not yet available`}
          description="No verses found for this chapter and version. Try another chapter or run Data Import as Super Admin."
          icon={<BookOpen className="w-6 h-6" />}
        />
      ) : (
        /* Chapter Reading Surface — Strictly Inter font per design specification */
        <GlassCard padding="lg" className="font-royal-body">
          <div className="flex items-center justify-between border-b border-[#D4AF37]/25 pb-3 mb-4">
            <h2 className="font-royal-serif text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#F5D88A]">
              {verses[0]?.book_name || book} {chapter}
            </h2>
            <span className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">
              {parallelMode ? 'KJV · SWAHILI' : version} · Tap any verse for actions
            </span>
          </div>

          <div className="space-y-2.5">
            {verses.map((v) => {
              const vBook = v.book_name || v.book || book;
              const bm = bookmarkMap.get(`${vBook}:${v.chapter}:${v.verse}`);
              const highlightCls = bm ? HIGHLIGHT_STYLES[bm.color] : '';
              const swVerse = parallelMode ? swahiliByVerse.get(v.verse) : undefined;

              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVerse(v)}
                  style={{ fontSize: `${fontSize}px` }}
                  className={`w-full text-left rounded-xl p-2.5 border transition hover:border-[#D4AF37]/45 ${
                    highlightCls || 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <div className={parallelMode ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''}>
                    <p className="leading-relaxed text-slate-900 dark:text-[#F5F1FF]">
                      <sup className="font-royal-ui text-xs font-bold text-[#8B24FF] dark:text-[#F5D88A] mr-1.5 tabular-nums">
                        {v.verse}
                      </sup>
                      {v.text}
                    </p>
                    {parallelMode && (
                      <p className="leading-relaxed text-slate-700 dark:text-[#C7A4FF] md:border-l md:border-[#D4AF37]/20 md:pl-4">
                        <sup className="font-royal-ui text-xs font-bold text-[#D4AF37] mr-1.5 tabular-nums">
                          {v.verse}
                        </sup>
                        {swVerse?.text || '—'}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Verse Action Sheet */}
      {selectedVerse && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-royal-serif text-lg font-bold text-[#F5D88A]">
                {selectedVerse.book_name || selectedVerse.book || book} {selectedVerse.chapter}:{selectedVerse.verse}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedVerse(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="font-royal-body text-base text-slate-800 dark:text-[#F5F1FF]">
              “{selectedVerse.text}”
            </p>

            <div>
              <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF] mb-2">
                Highlight & Bookmark
              </p>
              <div className="grid grid-cols-5 gap-2">
                {(['gold', 'violet', 'emerald', 'rose', 'none'] as HighlightColor[]).map((clr) => (
                  <button
                    key={clr}
                    type="button"
                    onClick={() => applyHighlight(selectedVerse, clr)}
                    className={`min-h-[44px] rounded-xl border text-xs font-royal-ui font-semibold capitalize ${
                      clr === 'gold'
                        ? 'bg-[#D4AF37]/30 border-[#D4AF37] text-[#F5D88A]'
                        : clr === 'violet'
                        ? 'bg-[#8B24FF]/30 border-[#C7A4FF] text-[#F5F1FF]'
                        : clr === 'emerald'
                        ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200'
                        : clr === 'rose'
                        ? 'bg-rose-500/30 border-rose-400 text-rose-200'
                        : 'border-white/20 text-slate-600 dark:text-[#C7A4FF]'
                    }`}
                  >
                    {clr === 'none' ? 'Clear' : clr}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const vBook = selectedVerse.book_name || selectedVerse.book || book;
                  const ref = `${vBook} ${selectedVerse.chapter}:${selectedVerse.verse}`;
                  setSelectedVerse(null);
                  onAddNoteForVerse(ref);
                }}
                className="min-h-[46px] rounded-xl bg-[#8B24FF] text-white font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <NotebookPen className="w-4 h-4" />
                <span>Add note</span>
              </button>
              <button
                type="button"
                onClick={() => shareVerse(selectedVerse)}
                className="min-h-[46px] rounded-xl border border-[#D4AF37]/45 text-slate-800 dark:text-[#F5D88A] font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Bookmarks Drawer */}
      {showBookmarksDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-lg max-h-[80dvh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-royal-serif text-xl font-bold text-[#F5D88A]">
                Saved Bible Bookmarks
              </h3>
              <button
                type="button"
                onClick={() => setShowBookmarksDrawer(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-[#D4AF37]/20 flex-1">
              {bookmarks.length === 0 ? (
                <p className="text-base text-slate-500 dark:text-[#C7A4FF] py-6 text-center">
                  Tap any verse while reading to highlight and bookmark it here.
                </p>
              ) : (
                bookmarks.map((bm) => (
                  <button
                    key={bm.id}
                    type="button"
                    onClick={() => {
                      setBook(bm.book);
                      setChapter(bm.chapter);
                      if (bm.version) setVersion(bm.version);
                      setShowBookmarksDrawer(false);
                    }}
                    className="w-full py-3 px-2 text-left hover:bg-[#31005F]/25 rounded-xl flex items-center justify-between"
                  >
                    <span className="font-royal-ui text-sm font-semibold text-slate-900 dark:text-[#F5F1FF]">
                      {bm.book} {bm.chapter}:{bm.verse}
                    </span>
                    <span className="text-xs capitalize text-[#D4AF37]">{bm.color}</span>
                  </button>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
