import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Edit3, NotebookPen, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Note } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

interface NotebookPageProps {
  pendingVerseRef?: string | null;
  onClearPendingVerseRef?: () => void;
}

function normalizeTags(raw: string[] | string | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeNote(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    verse_ref: row.verse_ref ? String(row.verse_ref) : null,
    tags: normalizeTags(row.tags as string[] | string | null | undefined),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export const NotebookPage: React.FC<NotebookPageProps> = ({
  pendingVerseRef,
  onClearPendingVerseRef,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [verseRef, setVerseRef] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const cacheKey = user?.id ? `kiomwobo_notes_${user.id}` : null;

  const loadNotes = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, unknown>[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNotes(parsed.map(normalizeNote));
          }
        }
      } catch {
        // ignore local cache read failure
      }
    }

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      const normalized = ((data as Record<string, unknown>[]) || []).map(normalizeNote);
      setNotes(normalized);
      if (cacheKey) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(normalized));
        } catch {
          // ignore storage quota errors
        }
      }
    }
    setLoading(false);
  }, [user, cacheKey]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (pendingVerseRef) {
      setEditingNote(null);
      setTitle(`Reflection on ${pendingVerseRef}`);
      setBody('');
      setVerseRef(pendingVerseRef);
      setTagsInput('Bible Study');
      setShowEditor(true);
      onClearPendingVerseRef?.();
    }
  }, [pendingVerseRef, onClearPendingVerseRef]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      for (const tg of normalizeTags(n.tags)) {
        set.add(tg);
      }
    }
    return Array.from(set).sort();
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      const noteTags = normalizeTags(n.tags);
      if (selectedTag !== 'all' && !noteTags.includes(selectedTag)) return false;
      if (!q) return true;
      return (
        (n.title || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q) ||
        (n.verse_ref || '').toLowerCase().includes(q)
      );
    });
  }, [notes, selectedTag, search]);

  const openNewEditor = () => {
    setEditingNote(null);
    setTitle('');
    setBody('');
    setVerseRef('');
    setTagsInput('');
    setShowEditor(true);
  };

  const openEditEditor = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title || '');
    setBody(note.body || '');
    setVerseRef(note.verse_ref || '');
    setTagsInput(normalizeTags(note.tags).join(', '));
    setShowEditor(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !body.trim()) return;
    setSaving(true);

    const parsedTags = normalizeTags(tagsInput);
    const nowIso = new Date().toISOString();

    if (editingNote) {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        verse_ref: verseRef.trim() || null,
        tags: parsedTags,
        updated_at: nowIso,
      };
      let { error: err } = await supabase
        .from('notes')
        .update(payload)
        .eq('id', editingNote.id)
        .eq('user_id', user.id);

      if (err && /malformed array|tags|type/i.test(err.message)) {
        const retry = await supabase
          .from('notes')
          .update({ ...payload, tags: parsedTags.join(', ') })
          .eq('id', editingNote.id)
          .eq('user_id', user.id);
        err = retry.error;
      }

      setSaving(false);
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      showToast('Note updated.', 'success');
    } else {
      const payload = {
        user_id: user.id,
        title: title.trim(),
        body: body.trim(),
        verse_ref: verseRef.trim() || null,
        tags: parsedTags,
        updated_at: nowIso,
      };
      let { error: err } = await supabase.from('notes').insert(payload);

      if (err && /malformed array|tags|type/i.test(err.message)) {
        const retry = await supabase
          .from('notes')
          .insert({ ...payload, tags: parsedTags.join(', ') });
        err = retry.error;
      }

      setSaving(false);
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      showToast('Note saved to your private notebook.', 'success');
    }

    setShowEditor(false);
    loadNotes();
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const { error: err } = await supabase.from('notes').delete().eq('id', id).eq('user_id', user.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    const nextNotes = notes.filter((n) => n.id !== id);
    setNotes(nextNotes);
    if (cacheKey) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(nextNotes));
      } catch {
        // ignore
      }
    }
    showToast('Note deleted.', 'info');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.notebook}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            Private sermon notes, Sabbath reflections, and verse studies
          </p>
        </div>

        <button
          type="button"
          onClick={openNewEditor}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Note</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes or Scripture references..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl royal-glass text-base text-slate-900 dark:text-[#F5F1FF]"
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedTag('all')}
            className={`min-h-[40px] px-3.5 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap ${
              selectedTag === 'all'
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
            }`}
          >
            All Notes
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`min-h-[40px] px-3.5 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap ${
                selectedTag === tag
                  ? 'bg-[#8B24FF] text-white violet-glow'
                  : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {loading && notes.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : error && notes.length === 0 ? (
        <ErrorState message={error} onRetry={loadNotes} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Your notebook is empty"
          description="Save sermon insights or tap 'Add note' on any Bible verse to start building your personal study journal."
          actionLabel="Write First Note"
          onAction={openNewEditor}
          icon={<NotebookPen className="w-6 h-6" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((note) => {
            const noteTags = normalizeTags(note.tags);
            return (
              <GlassCard key={note.id} className="flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {note.verse_ref && (
                        <p className="inline-flex items-center gap-1.5 text-xs font-royal-ui font-semibold text-[#8B24FF] dark:text-[#F5D88A] mb-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{note.verse_ref}</span>
                        </p>
                      )}
                      <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
                        {note.title}
                      </h2>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditEditor(note)}
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-600 dark:text-[#C7A4FF] hover:bg-[#31005F]/30"
                        aria-label="Edit note"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(note.id)}
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/15"
                        aria-label="Delete note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-base text-slate-700 dark:text-[#F5F1FF]/90 whitespace-pre-line">
                    {note.body}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#D4AF37]/20 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[#C7A4FF]/75">
                  <span className="tabular-nums">
                    {new Date(note.updated_at || note.created_at).toLocaleDateString()}
                  </span>
                  {noteTags.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{noteTags.join(' / ')}</span>
                    </>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Note Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-lg relative">
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              {editingNote ? 'Edit Study Note' : 'New Study Note'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Sabbath Lesson Insight"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Verse Reference (optional)
                  </label>
                  <input
                    type="text"
                    value={verseRef}
                    onChange={(e) => setVerseRef(e.target.value)}
                    placeholder="John 3:16"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Sermon, Prophecy, AY"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Note Body
                </label>
                <textarea
                  rows={5}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your reflections..."
                  className="w-full p-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {saving ? 'Saving...' : 'Save Note'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
