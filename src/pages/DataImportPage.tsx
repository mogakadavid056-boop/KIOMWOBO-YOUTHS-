import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, Database, Download, Music, Upload } from 'lucide-react';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { GlassCard } from '@/src/components/GlassCard';

interface GetBibleVerse {
  chapter?: number;
  verse: number;
  text: string;
}

interface GetBibleChapter {
  chapter: number;
  verses?: GetBibleVerse[];
}

interface GetBibleBook {
  nr: number;
  name: string;
  chapters?: GetBibleChapter[];
}

interface GetBiblePayload {
  books?: GetBibleBook[];
}

interface BibleVerseImportRow {
  version: 'KJV' | 'SWAHILI';
  book_number: number;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

const BATCH_SIZE = 500;
const KJV_URL = 'https://api.getbible.net/v2/kjv.json';
const SWAHILI_URL = 'https://api.getbible.net/v2/swahili.json';

function parseGetBibleVerses(
  payload: GetBiblePayload,
  version: 'KJV' | 'SWAHILI'
): BibleVerseImportRow[] {
  const rows: BibleVerseImportRow[] = [];
  const books = Array.isArray(payload.books) ? payload.books : [];

  for (const book of books) {
    const bookNumber = Number(book.nr);
    const bookName = String(book.name ?? '').trim();
    if (!Number.isFinite(bookNumber) || !bookName) continue;

    const chapters = Array.isArray(book.chapters) ? book.chapters : [];
    for (const ch of chapters) {
      const chNum = Number(ch.chapter);
      const verses = Array.isArray(ch.verses) ? ch.verses : [];
      for (const v of verses) {
        const chapter = Number(v.chapter ?? chNum);
        const verse = Number(v.verse);
        const text = String(v.text ?? '').trim();
        if (Number.isFinite(chapter) && Number.isFinite(verse) && text) {
          rows.push({
            version,
            book_number: bookNumber,
            book_name: bookName,
            chapter,
            verse,
            text,
          });
        }
      }
    }
  }

  return rows;
}

export const DataImportPage: React.FC = () => {
  const { showToast } = useToast();

  const [kjvCount, setKjvCount] = useState<number | null>(null);
  const [swahiliCount, setSwahiliCount] = useState<number | null>(null);
  const [hymnsCount, setHymnsCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [hymnImporting, setHymnImporting] = useState(false);
  const [hymnProgress, setHymnProgress] = useState(0);
  const [hymnStatus, setHymnStatus] = useState('');
  const [hymnMsg, setHymnMsg] = useState<string | null>(null);
  const [hymnError, setHymnError] = useState<string | null>(null);
  const [defaultHymnal, setDefaultHymnal] = useState('SDA Hymnal');
  const [defaultHymnLang, setDefaultHymnLang] = useState<'en' | 'sw'>('en');
  const hymnFileRef = useRef<HTMLInputElement>(null);

  const checkExistingCounts = useCallback(async () => {
    if (!isSupabaseConfigured) return { kjv: 0, swahili: 0, hymns: 0 };

    const [kjvRes, swRes, hymnRes] = await Promise.all([
      supabase
        .from('bible_verses')
        .select('id', { count: 'exact', head: true })
        .eq('version', 'KJV'),
      supabase
        .from('bible_verses')
        .select('id', { count: 'exact', head: true })
        .eq('version', 'SWAHILI'),
      supabase.from('hymns').select('id', { count: 'exact', head: true }),
    ]);

    if (kjvRes.error) throw new Error(kjvRes.error.message);
    if (swRes.error) throw new Error(swRes.error.message);

    const kjv = kjvRes.count ?? 0;
    const swahili = swRes.count ?? 0;
    const hymns = hymnRes.error ? 0 : hymnRes.count ?? 0;
    setKjvCount(kjv);
    setSwahiliCount(swahili);
    setHymnsCount(hymns);
    return { kjv, swahili, hymns };
  }, []);

  useEffect(() => {
    checkExistingCounts().catch((err) => {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to check bible_verses table.');
    });
  }, [checkExistingCounts]);

  const handleImportBible = async () => {
    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase environment variables are not configured.');
      return;
    }

    setImporting(true);
    setProgressPct(0);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      setStatusLabel('Checking existing rows in bible_verses...');
      const existing = await checkExistingCounts();

      const targets: Array<{ version: 'KJV' | 'SWAHILI'; url: string }> = [];
      const skipped: string[] = [];

      if (existing.kjv > 0) {
        skipped.push(`KJV (${existing.kjv.toLocaleString()} rows already present)`);
      } else {
        targets.push({ version: 'KJV', url: KJV_URL });
      }

      if (existing.swahili > 0) {
        skipped.push(`SWAHILI (${existing.swahili.toLocaleString()} rows already present)`);
      } else {
        targets.push({ version: 'SWAHILI', url: SWAHILI_URL });
      }

      if (targets.length === 0) {
        setProgressPct(100);
        setStatusLabel('All versions already exist.');
        const msg = `Skipped import: ${skipped.join(' and ')}.`;
        setSuccessMsg(msg);
        showToast('Bible versions already exist in bible_verses.', 'info');
        setImporting(false);
        return;
      }

      const parsedBatches: Array<{ version: 'KJV' | 'SWAHILI'; rows: BibleVerseImportRow[] }> = [];

      for (const target of targets) {
        setStatusLabel(`Downloading ${target.version} from GetBible...`);
        const response = await fetch(target.url);
        if (!response.ok) {
          throw new Error(`Failed to download ${target.version} (${response.status} ${response.statusText}).`);
        }
        const json = (await response.json()) as GetBiblePayload;
        const rows = parseGetBibleVerses(json, target.version);
        if (rows.length === 0) {
          throw new Error(`Downloaded ${target.version} JSON contained 0 verses.`);
        }
        parsedBatches.push({ version: target.version, rows });
      }

      const totalRows = parsedBatches.reduce((sum, item) => sum + item.rows.length, 0);
      let insertedTotal = 0;

      for (const item of parsedBatches) {
        for (let i = 0; i < item.rows.length; i += BATCH_SIZE) {
          const batch = item.rows.slice(i, i + BATCH_SIZE);
          setStatusLabel(
            `Inserting ${item.version}: ${Math.min(i + batch.length, item.rows.length).toLocaleString()} / ${item.rows.length.toLocaleString()} verses...`
          );

          const { error: insertErr } = await supabase.from('bible_verses').insert(batch);
          if (insertErr) {
            throw new Error(`${item.version} insert failed at row ${i + 1}: ${insertErr.message}`);
          }

          insertedTotal += batch.length;
          const pct = Math.min(100, Math.round((insertedTotal / totalRows) * 100));
          setProgressPct(pct);
        }
      }

      await checkExistingCounts();
      const importedSummary = parsedBatches
        .map((b) => `${b.version} (${b.rows.length.toLocaleString()} verses)`)
        .join(' & ');
      const skipSuffix = skipped.length > 0 ? ` Skipped: ${skipped.join(', ')}.` : '';
      const finalMsg = `Successfully imported ${importedSummary}.${skipSuffix}`;

      setStatusLabel('Import complete.');
      setSuccessMsg(finalMsg);
      showToast('Bible import completed successfully.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred during import.';
      setErrorMsg(message);
      setStatusLabel('Import failed.');
      showToast(message, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
          Data Import
        </h1>
        <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
          Super Admin utility to populate Scripture into Supabase
        </p>
      </div>

      <GlassCard elevated padding="lg" className="space-y-5">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#31005F]/65 border border-[#D4AF37]/40 flex items-center justify-center text-[#F5D88A] shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
              Bible Scripture Importer (KJV & Swahili)
            </h2>
            <p className="mt-1 text-base text-slate-600 dark:text-[#C7A4FF]/90">
              Downloads KJV and Swahili translations from GetBible and inserts verses into{' '}
              <code className="font-mono text-sm text-[#B8891B] dark:text-[#F5D88A]">bible_verses</code>{' '}
              in batches of 500, skipping any version that already has rows.
            </p>
          </div>
        </div>

        {/* Current Row Counts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl p-3.5 bg-black/5 dark:bg-[#080610]/60 border border-[#D4AF37]/25 flex items-center justify-between">
            <span className="font-royal-ui text-xs font-semibold text-slate-600 dark:text-[#C7A4FF]">
              KJV Rows
            </span>
            <span className="font-royal-ui text-base font-bold tabular-nums text-slate-900 dark:text-[#F5D88A]">
              {kjvCount === null ? '—' : kjvCount.toLocaleString()}
            </span>
          </div>

          <div className="rounded-xl p-3.5 bg-black/5 dark:bg-[#080610]/60 border border-[#D4AF37]/25 flex items-center justify-between">
            <span className="font-royal-ui text-xs font-semibold text-slate-600 dark:text-[#C7A4FF]">
              SWAHILI Rows
            </span>
            <span className="font-royal-ui text-base font-bold tabular-nums text-slate-900 dark:text-[#F5D88A]">
              {swahiliCount === null ? '—' : swahiliCount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        {(importing || progressPct > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700 dark:text-[#C7A4FF] truncate">
                {statusLabel || 'Working...'}
              </span>
              <span className="font-royal-ui font-bold tabular-nums text-[#8B24FF] dark:text-[#F5D88A] shrink-0">
                {progressPct}%
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-black/15 dark:bg-white/10 overflow-hidden border border-[#D4AF37]/30">
              <div
                className="h-full bg-gradient-to-r from-[#8B24FF] via-[#D4AF37] to-[#F5D88A] transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Success Message */}
        {successMsg && (
          <div className="rounded-xl border border-[#D4AF37]/55 bg-[#31005F]/40 p-4 flex items-start gap-3 text-base text-slate-900 dark:text-[#F5F1FF]">
            <CheckCircle2 className="w-5 h-5 text-[#F5D88A] shrink-0 mt-0.5" />
            <p>{successMsg}</p>
          </div>
        )}

        {/* Exact Error Message */}
        {errorMsg && (
          <div className="rounded-xl border border-red-400/60 bg-red-950/45 p-4 flex items-start gap-3 text-base text-red-100">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="break-words">{errorMsg}</p>
          </div>
        )}

        <div className="pt-1 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={importing}
            onClick={handleImportBible}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold inline-flex items-center gap-2 hover:brightness-105 active:scale-[0.99] disabled:opacity-60 transition"
          >
            <Download className="w-4 h-4" />
            <span>{importing ? 'Importing Bible...' : 'Import Bible (KJV + Swahili)'}</span>
          </button>

          <button
            type="button"
            disabled={importing}
            onClick={() => checkExistingCounts().catch(() => {})}
            className="min-h-[48px] px-4 py-3 rounded-xl border border-[#D4AF37]/40 text-slate-800 dark:text-[#C7A4FF] font-royal-ui text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#31005F]/30 disabled:opacity-50 transition"
          >
            <Database className="w-4 h-4 text-[#D4AF37]" />
            <span>Refresh Counts</span>
          </button>
        </div>
      </GlassCard>

      {/* Hymnal Importer */}
      <GlassCard elevated padding="lg" className="space-y-5">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#31005F]/65 border border-[#D4AF37]/40 flex items-center justify-center text-[#F5D88A] shrink-0">
            <Music className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
              Hymnal Importer
            </h2>
            <p className="mt-1 text-base text-slate-600 dark:text-[#C7A4FF]/90">
              Import all 3 hymnals from <code className="font-mono text-sm">tazmancoder/ChurchHymns</code>{' '}
              (<code className="font-mono text-sm">hymns-hhc-en.json</code>,{' '}
              <code className="font-mono text-sm">hymns-en.json</code>,{' '}
              <code className="font-mono text-sm">hymns-csb-en.json</code>) or upload your own JSON file in batches of 500.
            </p>
          </div>
        </div>

        <div className="rounded-xl p-3.5 bg-black/5 dark:bg-[#080610]/60 border border-[#D4AF37]/25 flex items-center justify-between">
          <span className="font-royal-ui text-xs font-semibold text-slate-600 dark:text-[#C7A4FF]">
            Total Hymns in Table
          </span>
          <span className="font-royal-ui text-base font-bold tabular-nums text-slate-900 dark:text-[#F5D88A]">
            {hymnsCount === null ? '—' : hymnsCount.toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
              Default Hymnal Name (for JSON upload)
            </label>
            <input
              type="text"
              value={defaultHymnal}
              onChange={(e) => setDefaultHymnal(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
              Default Language (for JSON upload)
            </label>
            <select
              value={defaultHymnLang}
              onChange={(e) => setDefaultHymnLang(e.target.value as 'en' | 'sw')}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
            >
              <option value="en">English (en)</option>
              <option value="sw">Kiswahili (sw)</option>
            </select>
          </div>
        </div>

        {(hymnImporting || hymnProgress > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700 dark:text-[#C7A4FF] truncate">{hymnStatus}</span>
              <span className="font-royal-ui font-bold tabular-nums text-[#8B24FF] dark:text-[#F5D88A]">
                {hymnProgress}%
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-black/15 dark:bg-white/10 overflow-hidden border border-[#D4AF37]/30">
              <div
                className="h-full bg-gradient-to-r from-[#8B24FF] via-[#D4AF37] to-[#F5D88A] transition-all duration-200"
                style={{ width: `${hymnProgress}%` }}
              />
            </div>
          </div>
        )}

        {hymnMsg && (
          <div className="rounded-xl border border-[#D4AF37]/55 bg-[#31005F]/40 p-4 flex items-start gap-3 text-base text-slate-900 dark:text-[#F5F1FF]">
            <CheckCircle2 className="w-5 h-5 text-[#F5D88A] shrink-0 mt-0.5" />
            <p>{hymnMsg}</p>
          </div>
        )}

        {hymnError && (
          <div className="rounded-xl border border-red-400/60 bg-red-950/45 p-4 flex items-start gap-3 text-base text-red-100">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="break-words">{hymnError}</p>
          </div>
        )}

        <input
          ref={hymnFileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setHymnImporting(true);
            setHymnProgress(0);
            setHymnMsg(null);
            setHymnError(null);
            setHymnStatus(`Reading ${file.name}...`);

            try {
              const raw = JSON.parse(await file.text()) as unknown;
              const list = Array.isArray(raw)
                ? raw
                : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).hymns)
                ? ((raw as Record<string, unknown>).hymns as unknown[])
                : [];

              const rows = list
                .map((item) => {
                  if (!item || typeof item !== 'object') return null;
                  const rec = item as Record<string, unknown>;
                  const number = Number(rec.number ?? rec.no ?? rec.id);
                  const title = String(rec.title ?? rec.name ?? '').trim();
                  const metaLines = [
                    rec.category ? `Category: ${String(rec.category)}` : '',
                    rec.author ? `Author: ${String(rec.author)}` : '',
                    rec.composer ? `Composer: ${String(rec.composer)}` : '',
                    rec.voicing ? `Voicing: ${String(rec.voicing)}` : '',
                    rec.sheetMusic ? `Sheet Music: ${String(rec.sheetMusic)}` : '',
                    rec.vocal ? `Vocal Audio: ${String(rec.vocal)}` : '',
                    rec.instrumental ? `Instrumental Audio: ${String(rec.instrumental)}` : '',
                  ].filter(Boolean);
                  const rawLyrics = rec.lyrics ?? rec.verses;
                  const lyrics = Array.isArray(rawLyrics)
                    ? rawLyrics.join('\n\n')
                    : String(rawLyrics ?? '').trim() || metaLines.join('\n') || title;
                  const hymnal = String(rec.hymnal ?? defaultHymnal).trim() || defaultHymnal;
                  const langRaw = String(rec.language ?? defaultHymnLang).toLowerCase();
                  const language = langRaw.startsWith('sw') ? 'sw' : 'en';
                  if (!Number.isFinite(number) || !title || !lyrics) return null;
                  return { hymnal, language, number, title, lyrics };
                })
                .filter((r): r is NonNullable<typeof r> => r !== null);

              if (rows.length === 0) {
                throw new Error('No valid hymns found in JSON.');
              }

              for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                setHymnStatus(`Inserting ${Math.min(i + batch.length, rows.length)} / ${rows.length} hymns...`);
                const { error: insErr } = await supabase.from('hymns').insert(batch);
                if (insErr) throw new Error(insErr.message);
                setHymnProgress(Math.min(100, Math.round(((i + batch.length) / rows.length) * 100)));
              }

              await checkExistingCounts();
              setHymnStatus('Import complete.');
              setHymnMsg(`Successfully imported ${rows.length.toLocaleString()} hymns.`);
              showToast('Hymns imported successfully.', 'success');
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Failed to import hymns JSON.';
              setHymnError(msg);
              setHymnStatus('Import failed.');
              showToast(msg, 'error');
            } finally {
              setHymnImporting(false);
              if (hymnFileRef.current) hymnFileRef.current.value = '';
            }
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={hymnImporting}
            onClick={async () => {
              if (!isSupabaseConfigured) {
                setHymnError('Supabase environment variables are not configured.');
                return;
              }
              setHymnImporting(true);
              setHymnProgress(0);
              setHymnMsg(null);
              setHymnError(null);

              const sources = [
                {
                  hymnal: 'Hymns - For Home and Church',
                  language: 'en' as const,
                  url: 'https://raw.githubusercontent.com/tazmancoder/ChurchHymns/main/hymns-hhc-en.json',
                },
                {
                  hymnal: 'Hymns (English)',
                  language: 'en' as const,
                  url: 'https://raw.githubusercontent.com/tazmancoder/ChurchHymns/main/hymns-en.json',
                },
                {
                  hymnal: "Children's Songbook",
                  language: 'en' as const,
                  url: 'https://raw.githubusercontent.com/tazmancoder/ChurchHymns/main/hymns-csb-en.json',
                },
              ];

              try {
                const toImport: Array<{
                  hymnal: string;
                  rows: Array<{ hymnal: string; language: 'en' | 'sw'; number: number; title: string; lyrics: string }>;
                }> = [];
                const skipped: string[] = [];

                for (const src of sources) {
                  setHymnStatus(`Checking existing rows for ${src.hymnal}...`);
                  const { count, error: countErr } = await supabase
                    .from('hymns')
                    .select('id', { count: 'exact', head: true })
                    .eq('hymnal', src.hymnal);

                  if (countErr) throw new Error(countErr.message);
                  if ((count ?? 0) > 0) {
                    skipped.push(`${src.hymnal} (${count} rows already present)`);
                    continue;
                  }

                  setHymnStatus(`Downloading ${src.hymnal}...`);
                  const res = await fetch(src.url);
                  if (!res.ok) {
                    throw new Error(`Failed to download ${src.hymnal} (${res.status} ${res.statusText}).`);
                  }
                  const list = (await res.json()) as Array<Record<string, unknown>>;
                  const rows = (Array.isArray(list) ? list : [])
                    .map((rec) => {
                      const number = Number(rec.number ?? rec.no ?? rec.sortOrder);
                      const title = String(rec.name ?? rec.title ?? '').trim();
                      const metaLines = [
                        rec.category ? `Category: ${String(rec.category)}` : '',
                        rec.author ? `Author: ${String(rec.author)}` : '',
                        rec.composer ? `Composer: ${String(rec.composer)}` : '',
                        rec.voicing ? `Voicing: ${String(rec.voicing)}` : '',
                        rec.instrumentation ? `Instrumentation: ${String(rec.instrumentation)}` : '',
                        rec.sheetMusic ? `Sheet Music: ${String(rec.sheetMusic)}` : '',
                        rec.vocal ? `Vocal Audio: ${String(rec.vocal)}` : '',
                        rec.instrumental ? `Instrumental Audio: ${String(rec.instrumental)}` : '',
                      ].filter(Boolean);
                      const lyrics =
                        String(rec.lyrics ?? '').trim() ||
                        metaLines.join('\n') ||
                        title;
                      if (!Number.isFinite(number) || !title) return null;
                      return {
                        hymnal: src.hymnal,
                        language: src.language,
                        number,
                        title,
                        lyrics,
                      };
                    })
                    .filter((r): r is NonNullable<typeof r> => r !== null);

                  if (rows.length > 0) {
                    toImport.push({ hymnal: src.hymnal, rows });
                  }
                }

                if (toImport.length === 0) {
                  setHymnProgress(100);
                  setHymnStatus('All hymnals already exist.');
                  setHymnMsg(`Skipped import: ${skipped.join(', ')}.`);
                  showToast('All hymnals are already imported.', 'info');
                  setHymnImporting(false);
                  return;
                }

                const totalRows = toImport.reduce((acc, item) => acc + item.rows.length, 0);
                let insertedTotal = 0;

                for (const item of toImport) {
                  for (let i = 0; i < item.rows.length; i += BATCH_SIZE) {
                    const batch = item.rows.slice(i, i + BATCH_SIZE);
                    setHymnStatus(
                      `Inserting ${item.hymnal}: ${Math.min(i + batch.length, item.rows.length)} / ${item.rows.length}...`
                    );
                    const { error: insErr } = await supabase.from('hymns').insert(batch);
                    if (insErr) throw new Error(`${item.hymnal}: ${insErr.message}`);
                    insertedTotal += batch.length;
                    setHymnProgress(Math.min(100, Math.round((insertedTotal / totalRows) * 100)));
                  }
                }

                await checkExistingCounts();
                const summary = toImport
                  .map((t) => `${t.hymnal} (${t.rows.length})`)
                  .join(', ');
                const skipText = skipped.length > 0 ? ` Skipped: ${skipped.join(', ')}.` : '';
                setHymnStatus('Import complete.');
                setHymnMsg(`Successfully imported ${summary}.${skipText}`);
                showToast('All hymnals imported successfully.', 'success');
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to import hymnals.';
                setHymnError(msg);
                setHymnStatus('Import failed.');
                showToast(msg, 'error');
              } finally {
                setHymnImporting(false);
              }
            }}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold inline-flex items-center gap-2 hover:brightness-105 disabled:opacity-60 transition"
          >
            <Download className="w-4 h-4" />
            <span>{hymnImporting ? 'Importing Hymnals...' : 'Import All Hymnals (ChurchHymns Repo)'}</span>
          </button>

          <button
            type="button"
            disabled={hymnImporting}
            onClick={() => hymnFileRef.current?.click()}
            className="min-h-[48px] px-5 py-3 rounded-xl bg-[#8B24FF] hover:bg-[#7A18EB] text-white font-royal-ui text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60 transition"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Hymns JSON</span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
