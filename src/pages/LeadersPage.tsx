import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Crown,
  Edit3,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useToast } from '@/src/context/ToastContext';
import { compressImageFile } from '@/src/lib/mediaUtils';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Leader } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

function formatWhatsAppUrl(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `254${digits.slice(1)}`;
  }
  return `https://wa.me/${digits}`;
}

export const LeadersPage: React.FC = () => {
  const { user, profile, churches, isAdmin, isDistrictAdmin } = useAuth();
  const { showToast } = useToast();

  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingLeader, setEditingLeader] = useState<Leader | null>(null);
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [churchId, setChurchId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [sortOrder, setSortOrder] = useState('1');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const loadLeaders = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('leaders')
      .select('id, church_id, full_name, position, phone, email, bio, photo_url, sort_order, created_at, churches(id, name)')
      .order('sort_order', { ascending: true })
      .order('full_name', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setLeaders((data as unknown as Leader[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLeaders();
  }, [loadLeaders]);

  const canManageLeader = (leader: Leader) => {
    if (isDistrictAdmin) return true;
    if (isAdmin && profile?.church_id && leader.church_id === profile.church_id) return true;
    return false;
  };

  const openCreateModal = () => {
    setEditingLeader(null);
    setFullName('');
    setPosition('');
    setChurchId(isDistrictAdmin ? '' : profile?.church_id || '');
    setPhone('');
    setEmail('');
    setBio('');
    setSortOrder(String(leaders.length + 1));
    setPhotoUrl('');
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
    setShowForm(true);
  };

  const openEditModal = (leader: Leader) => {
    setEditingLeader(leader);
    setFullName(leader.full_name || '');
    setPosition(leader.position || '');
    setChurchId(leader.church_id || '');
    setPhone(leader.phone || '');
    setEmail(leader.email || '');
    setBio(leader.bio || '');
    setSortOrder(String(leader.sort_order ?? 1));
    setPhotoUrl(leader.photo_url || '');
    setPhotoFile(null);
    setPhotoPreview(leader.photo_url || null);
    if (photoInputRef.current) photoInputRef.current.value = '';
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !position.trim()) return;
    setSaving(true);

    try {
      let finalPhotoUrl = photoUrl || null;
      if (photoFile) {
        const compressed = await compressImageFile(photoFile, 720);
        const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
        const fileKey = `leader-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const primaryPath = user?.id ? `${user.id}/${fileKey}` : `leaders/${fileKey}`;
        const contentType = compressed.type || 'image/jpeg';

        let uploadedPath: string | null = null;
        const primaryRes = await supabase.storage
          .from('avatars')
          .upload(primaryPath, compressed, { upsert: true, contentType });

        if (!primaryRes.error) {
          uploadedPath = primaryPath;
        } else {
          const fallbackPath = `leaders/${fileKey}`;
          const fallbackRes = await supabase.storage
            .from('avatars')
            .upload(fallbackPath, compressed, { upsert: true, contentType });
          if (!fallbackRes.error) {
            uploadedPath = fallbackPath;
          } else {
            showToast(primaryRes.error.message || fallbackRes.error.message, 'error');
            setSaving(false);
            return;
          }
        }

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadedPath);
        finalPhotoUrl = urlData.publicUrl;
      }

      const targetChurch = isDistrictAdmin ? churchId || null : profile?.church_id || null;
      const payload = {
        full_name: fullName.trim(),
        position: position.trim(),
        church_id: targetChurch,
        phone: phone.trim() || null,
        email: email.trim() || null,
        bio: bio.trim() || null,
        photo_url: finalPhotoUrl,
        sort_order: Number(sortOrder) || 1,
      };

      const { error: dbErr } = editingLeader
        ? await supabase.from('leaders').update(payload).eq('id', editingLeader.id)
        : await supabase.from('leaders').insert(payload);

      if (dbErr) {
        showToast(dbErr.message, 'error');
        setSaving(false);
        return;
      }

      showToast(editingLeader ? 'Leader updated.' : 'Leader added.', 'success');
      setShowForm(false);
      loadLeaders();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (leader: Leader) => {
    const { error: err } = await supabase.from('leaders').delete().eq('id', leader.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setLeaders((prev) => prev.filter((l) => l.id !== leader.id));
    showToast('Leader removed.', 'info');
  };

  const districtLeaders = useMemo(() => leaders.filter((l) => !l.church_id), [leaders]);

  const churchSections = useMemo(() => {
    return churches
      .map((c) => ({
        church: c,
        items: leaders.filter((l) => l.church_id === c.id),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [churches, leaders]);

  const renderLeaderCard = (leader: Leader) => {
    const editable = canManageLeader(leader);
    return (
      <GlassCard key={leader.id} className="flex flex-col justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-[#F5D88A] via-[#D4AF37] to-[#8B24FF] shadow-[0_0_20px_rgba(212,175,55,0.35)] shrink-0">
            {leader.photo_url ? (
              <img
                src={leader.photo_url}
                alt={leader.full_name}
                referrerPolicy="no-referrer"
                className="w-full h-full rounded-full object-cover bg-[#080610]"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-[#1C0738] flex items-center justify-center font-royal-display text-xl font-bold text-[#F5D88A]">
                {(leader.full_name?.[0] || 'L').toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF] truncate">
                  {leader.full_name}
                </h3>
                <p className="font-royal-ui text-xs font-semibold text-[#B8891B] dark:text-[#F5D88A] truncate">
                  {leader.position}
                </p>
              </div>

              {editable && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(leader)}
                    className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[#C7A4FF] hover:bg-[#31005F]/40"
                    aria-label="Edit leader"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(leader)}
                    className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/15"
                    aria-label="Delete leader"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {leader.bio && (
              <p className="mt-1.5 font-royal-body text-sm text-slate-600 dark:text-[#F5F1FF]/80 line-clamp-2">
                {leader.bio}
              </p>
            )}
          </div>
        </div>

        {(leader.phone || leader.email) && (
          <div className="pt-2 border-t border-[#D4AF37]/20 flex flex-wrap gap-2">
            {leader.phone && (
              <>
                <a
                  href={`tel:${leader.phone}`}
                  className="min-h-[44px] flex-1 px-3 rounded-xl bg-[#8B24FF] hover:bg-[#7A18EB] text-white font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call</span>
                </a>
                <a
                  href={formatWhatsAppUrl(leader.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] flex-1 px-3 rounded-xl border border-[#D4AF37]/45 text-slate-800 dark:text-[#F5D88A] hover:bg-[#31005F]/35 font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </a>
              </>
            )}
            {leader.email && (
              <a
                href={`mailto:${leader.email}`}
                className="min-h-[44px] flex-1 px-3 rounded-xl border border-slate-300 dark:border-white/15 text-slate-700 dark:text-[#C7A4FF] hover:bg-white/10 font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
              >
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </a>
            )}
          </div>
        )}
      </GlassCard>
    );
  };

  return (
    <div className="space-y-6">
      <div className="pt-4 pb-2 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="text-center sm:text-left">
          <div className="inline-flex items-center gap-2 text-[#D4AF37]">
            <Crown className="w-6 h-6" />
            <span className="font-royal-ui text-xs font-semibold uppercase tracking-[0.2em]">
              Kiomwobo District
            </span>
          </div>
          <h1 className="mt-1 font-royal-display text-2xl sm:text-3xl font-bold text-gold-gradient">
            Youth Leaders
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            District executive committee and local church youth leaders
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-1.5 self-center sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Leader</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadLeaders} />
      ) : leaders.length === 0 ? (
        <EmptyState
          title="No leaders listed yet"
          description="District and local church leaders will appear here once added by an administrator."
          actionLabel={isAdmin ? 'Add First Leader' : undefined}
          onAction={isAdmin ? openCreateModal : undefined}
          icon={<Users className="w-6 h-6" />}
        />
      ) : (
        <div className="space-y-7">
          {districtLeaders.length > 0 && (
            <section className="space-y-3">
              <GlassCard elevated padding="md" className="border-[#D4AF37]/50">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-[#D4AF37]" />
                  <h2 className="font-royal-display text-lg font-bold text-gold-gradient">
                    District Leaders
                  </h2>
                </div>
              </GlassCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {districtLeaders.map(renderLeaderCard)}
              </div>
            </section>
          )}

          {churchSections.map(({ church, items }) => (
            <section key={church.id} className="space-y-3">
              <h2 className="font-royal-serif text-xl font-bold text-[#B8891B] dark:text-[#F5D88A]">
                {church.name}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map(renderLeaderCard)}
              </div>
            </section>
          ))}
        </div>
      )}

      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-lg relative max-h-[90dvh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              {editingLeader ? 'Edit Leader' : 'Add Leader'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-[#F5D88A] to-[#8B24FF] shrink-0">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-[#1C0738] flex items-center justify-center text-[#F5D88A] font-bold">
                      {(fullName?.[0] || 'L').toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setPhotoFile(f);
                        setPhotoPreview(URL.createObjectURL(f));
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="min-h-[44px] px-4 rounded-xl border border-[#D4AF37]/40 text-xs font-royal-ui font-semibold text-[#F5D88A] inline-flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Upload Photo</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Position
                  </label>
                  <input
                    type="text"
                    required
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g. District Youth Leader"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>

                {isDistrictAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                      Church / District
                    </label>
                    <select
                      value={churchId}
                      onChange={(e) => setChurchId(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                    >
                      <option value="">District Leader (All Churches)</option>
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
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Phone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+2547..."
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Short Bio (optional)
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-3 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {saving ? 'Saving...' : editingLeader ? 'Update Leader' : 'Save Leader'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
