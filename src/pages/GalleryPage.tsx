import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { compressImageFile } from '@/src/lib/mediaUtils';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type MediaItem } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const GalleryPage: React.FC = () => {
  const { user, profile, churches, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { openProfile } = useSocial();
  const { showToast } = useToast();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChurch, setSelectedChurch] = useState<string>('all');
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [caption, setCaption] = useState('');
  const [uploadChurchId, setUploadChurchId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const loadGallery = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('media')
      .select('*, churches(id, name), profiles(id, full_name, avatar_url)')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setItems((data as MediaItem[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  const filtered = useMemo(() => {
    if (selectedChurch === 'all') return items;
    return items.filter((i) => i.church_id === selectedChurch);
  }, [items, selectedChurch]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFile) return;

    setUploading(true);
    try {
      const compressed = await compressImageFile(selectedFile, 1600);
      const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from('gallery')
        .upload(filePath, compressed, {
          upsert: false,
          contentType: compressed.type || 'image/jpeg',
        });

      if (storageErr) {
        showToast(storageErr.message, 'error');
        return;
      }

      const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(filePath);
      const { error: dbErr } = await supabase.from('media').insert({
        user_id: user.id,
        church_id: uploadChurchId || profile?.church_id || null,
        url: urlData.publicUrl,
        file_path: filePath,
        caption: caption.trim() || null,
      });

      if (dbErr) {
        showToast(dbErr.message, 'error');
        return;
      }

      showToast('Photo uploaded to gallery.', 'success');
      setCaption('');
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setShowUpload(false);
      loadGallery();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (item.file_path) {
      await supabase.storage.from('gallery').remove([item.file_path]);
    }
    const { error: err } = await supabase.from('media').delete().eq('id', item.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setItems((prev) => prev.filter((m) => m.id !== item.id));
    if (lightboxItem?.id === item.id) setLightboxItem(null);
    showToast('Photo deleted.', 'info');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.gallery}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            Moments of worship, youth rallies, and community service
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setUploadChurchId(profile?.church_id || churches[0]?.id || '');
            setShowUpload(true);
          }}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Photo</span>
        </button>
      </div>

      {/* Church Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedChurch('all')}
          className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 ${
            selectedChurch === 'all'
              ? 'bg-[#8B24FF] text-white violet-glow'
              : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
          }`}
        >
          {t.common.allChurches}
        </button>
        {churches.map((church) => (
          <button
            key={church.id}
            type="button"
            onClick={() => setSelectedChurch(church.id)}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 ${
              selectedChurch === church.id
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
            }`}
          >
            {church.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadGallery} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No gallery photos yet"
          description="Upload photos from youth rallies, choirs, and Sabbath fellowships across Kiomwobo District."
          actionLabel="Upload First Photo"
          onAction={() => setShowUpload(true)}
          icon={<ImageIcon className="w-6 h-6" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <GlassCard key={item.id} padding="none" className="overflow-hidden flex flex-col">
              <button
                type="button"
                onClick={() => setLightboxItem(item)}
                className="relative aspect-[4/3] w-full bg-[#140624] overflow-hidden group"
              >
                <img
                  src={item.url}
                  alt={item.caption || 'Gallery photo'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
              </button>
              <div className="p-3.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {item.caption && (
                    <p className="text-sm font-medium text-slate-900 dark:text-[#F5F1FF] truncate">
                      {item.caption}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/80 truncate">
                    {item.churches?.name || 'Kiomwobo District'} ·{' '}
                    <button
                      type="button"
                      onClick={() => openProfile(item.user_id)}
                      className="text-[#8B24FF] dark:text-[#F5D88A] hover:underline font-medium"
                    >
                      {item.profiles?.full_name || 'Member'}
                    </button>
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/15 shrink-0"
                    aria-label="Delete photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-md relative">
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              Upload Gallery Photo
            </h2>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full min-h-[96px] rounded-xl border-2 border-dashed border-[#D4AF37]/45 flex flex-col items-center justify-center gap-2 text-sm text-slate-700 dark:text-[#C7A4FF] hover:border-[#F5D88A] transition"
                >
                  <Upload className="w-6 h-6 text-[#D4AF37]" />
                  <span>{selectedFile ? selectedFile.name : 'Tap to choose an image'}</span>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Church
                </label>
                <select
                  value={uploadChurchId}
                  onChange={(e) => setUploadChurchId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                >
                  {churches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Caption (optional)
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Youth Choir at Kiomwobo SDA"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <button
                type="submit"
                disabled={uploading || !selectedFile}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Photo'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Lightbox */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="max-w-3xl w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 text-white flex items-center justify-center"
                aria-label="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={lightboxItem.url}
              alt={lightboxItem.caption || 'Gallery preview'}
              referrerPolicy="no-referrer"
              className="w-full max-h-[75dvh] object-contain rounded-2xl border border-[#D4AF37]/40"
            />
            {lightboxItem.caption && (
              <p className="text-center text-base text-[#F5F1FF]">{lightboxItem.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
