import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crown,
  Loader2,
  LogOut,
  Search,
  Shield,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { compressImageFile, generateUuid } from '@/src/lib/mediaUtils';
import { supabase } from '@/src/lib/supabase';
import {
  type Conversation,
  type ConversationMember,
  type Profile,
} from '@/src/types/database';
import { GlassCard } from './GlassCard';

const DEPARTMENTS = [
  'Choir',
  'Ushers',
  'Pathfinders',
  'Evangelism',
  'Personal Ministries',
  'Welfare',
  'Music & Praise',
  'Media & Tech',
];

async function uploadGroupAvatarWithFallback(
  userId: string,
  conversationId: string,
  file: File
): Promise<{ publicUrl: string | null; error: string | null }> {
  const compressed = await compressImageFile(file, 720);
  const contentType = compressed.type || 'image/jpeg';
  const primaryPath = `${userId}/group-${conversationId}-${generateUuid()}.jpg`;

  let { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(primaryPath, compressed, { upsert: true, contentType });

  if (!upErr) {
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(primaryPath);
    return { publicUrl: `${urlData.publicUrl}?t=${Date.now()}`, error: null };
  }

  // Fallback path if bucket policy expects groups/{conversationId}/...
  const fallbackPath = `groups/${conversationId}/${generateUuid()}.jpg`;
  const fallbackRes = await supabase.storage
    .from('avatars')
    .upload(fallbackPath, compressed, { upsert: true, contentType });

  if (!fallbackRes.error) {
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fallbackPath);
    return { publicUrl: `${urlData.publicUrl}?t=${Date.now()}`, error: null };
  }

  return { publicUrl: null, error: upErr.message || fallbackRes.error.message };
}

interface NewGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { user, churches, isAdmin } = useAuth();
  const { blockedUserIds } = useSocial();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [churchId, setChurchId] = useState('');
  const [isOfficial, setIsOfficial] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !user?.id) return;
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, title, church_id, role, churches(id, name)')
      .neq('id', user.id)
      .order('full_name')
      .limit(300)
      .then(({ data }) => {
        const list = ((data as unknown as Profile[]) || []).filter(
          (p) => !blockedUserIds.has(p.id)
        );
        setMembers(list);
      });
  }, [open, user?.id, blockedUserIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.churches?.name?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q)
    );
  }, [members, search]);

  if (!open) return null;

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Enter a group name.', 'error');
      return;
    }
    if (selectedIds.size === 0) {
      showToast('Select at least one member.', 'error');
      return;
    }

    setCreating(true);
    try {
      const memberIds = Array.from(selectedIds);

      const { data: convId, error } = await supabase.rpc('create_group', {
        p_name: name.trim(),
        p_member_ids: memberIds,
        p_church_id: churchId || null,
        p_department: department.trim() || null,
        p_official: isAdmin ? isOfficial : false,
      });

      if (error || !convId) {
        showToast(error?.message || 'Failed to create group.', 'error');
        return;
      }

      const newId = String(convId);

      if (photoFile && user?.id) {
        const { publicUrl, error: upErr } = await uploadGroupAvatarWithFallback(
          user.id,
          newId,
          photoFile
        );
        if (upErr || !publicUrl) {
          showToast(`Group created, but photo upload failed: ${upErr || 'Storage error'}`, 'info');
        } else {
          const { error: updErr } = await supabase
            .from('conversations')
            .update({ avatar_url: publicUrl })
            .eq('id', newId);
          if (updErr) {
            showToast(`Group created, but could not save DP: ${updErr.message}`, 'info');
          }
        }
      }

      if (user?.id) {
        for (const mid of memberIds) {
          try {
            await supabase.from('notifications').insert({
              user_id: mid,
              actor_id: user.id,
              kind: 'group_add',
              conversation_id: newId,
              meta: { conversation_id: newId, group_name: name.trim() },
              read: false,
            });
          } catch {
            // Ignore if RLS handles
          }
        }
      }

      setName('');
      setDepartment('');
      setChurchId('');
      setIsOfficial(false);
      setSelectedIds(new Set());
      clearPhoto();
      showToast('Group created!', 'success');
      onCreated(newId);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <GlassCard
        elevated
        padding="lg"
        className="w-full max-w-lg relative max-h-[90dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-3 pr-10">
          New Group Chat
        </h2>

        <form onSubmit={handleCreate} className="space-y-3 flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handleSelectPhoto}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-14 h-14 rounded-full bg-[#31005F] border-2 border-[#D4AF37]/70 flex items-center justify-center overflow-hidden text-[#F5D88A] hover:border-[#F5D88A] transition"
                aria-label="Choose group display photo"
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Group preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Camera className="w-5 h-5" />
                )}
              </button>
              {photoPreview && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center border border-white/25"
                  aria-label="Remove group photo"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name (e.g. Kiomwobo Youth Choir)"
              className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-white/85 dark:bg-[#080610]/75 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
            >
              <option value="">Department (optional)</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={churchId}
              onChange={(e) => setChurchId(e.target.value)}
              className="min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
            >
              <option value="">Whole District</option>
              {churches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <label className="flex items-center gap-2.5 text-sm font-royal-ui text-[#F5D88A] cursor-pointer">
              <input
                type="checkbox"
                checked={isOfficial}
                onChange={(e) => setIsOfficial(e.target.checked)}
                className="w-4 h-4 accent-[#8B24FF]"
              />
              <Shield className="w-4 h-4 text-[#D4AF37]" />
              <span>Official group (admin badge)</span>
            </label>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search members (${selectedIds.size} selected)...`}
              className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-white/85 dark:bg-[#080610]/75 border border-[#D4AF37]/25 text-sm text-slate-900 dark:text-[#F5F1FF]"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[160px] max-h-60 pr-1">
            {filtered.map((m) => {
              const checked = selectedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className={`w-full min-h-[48px] px-3 py-2 rounded-xl flex items-center gap-3 text-left border transition ${
                    checked
                      ? 'bg-[#8B24FF]/30 border-[#F5D88A]'
                      : 'bg-black/10 dark:bg-[#080610]/50 border-[#D4AF37]/15'
                  }`}
                >
                  {m.avatar_url ? (
                    <img
                      src={m.avatar_url}
                      alt={m.full_name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#31005F] flex items-center justify-center text-xs font-bold text-[#F5D88A] shrink-0">
                      {(m.full_name?.[0] || 'Y').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-[#F5F1FF] truncate">
                      {m.full_name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#C7A4FF]/75 truncate">
                      {m.churches?.name || 'Kiomwobo District'}
                    </p>
                  </div>
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 ${
                      checked
                        ? 'bg-[#D4AF37] border-[#F5D88A] text-[#080610]'
                        : 'border-[#D4AF37]/40'
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold disabled:opacity-50"
          >
            {creating ? 'Creating Group...' : `Create Group (${selectedIds.size})`}
          </button>
        </form>
      </GlassCard>
    </div>
  );
};

interface GroupInfoModalProps {
  open: boolean;
  conversation: Conversation;
  members: ConversationMember[];
  isMuted: boolean;
  onClose: () => void;
  onToggleMute: () => void;
  onRefresh: () => Promise<void>;
  onLeftGroup: () => void;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  open,
  conversation,
  members,
  isMuted,
  onClose,
  onToggleMute,
  onRefresh,
  onLeftGroup,
}) => {
  const { user, isAdmin: isAppAdmin } = useAuth();
  const { openProfile, blockedUserIds } = useSocial();
  const { showToast } = useToast();

  const myMembership = members.find((m) => m.user_id === user?.id);
  const hasExplicitAdmin = members.some((m) => m.role === 'admin');
  const isGroupAdmin =
    myMembership?.role === 'admin' ||
    conversation.created_by === user?.id ||
    isAppAdmin ||
    (!hasExplicitAdmin && Boolean(myMembership));

  const [editingName, setEditingName] = useState(conversation.name || '');
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingName(conversation.name || '');
  }, [conversation.name]);

  useEffect(() => {
    if (!showAddMember) return;
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, title, church_id, role, churches(id, name)')
      .order('full_name')
      .limit(300)
      .then(({ data }) => {
        setAllProfiles((data as unknown as Profile[]) || []);
      });
  }, [showAddMember]);

  if (!open) return null;

  const existingMemberIds = new Set(members.map((m) => m.user_id));
  const addableProfiles = allProfiles.filter((p) => {
    if (existingMemberIds.has(p.id) || blockedUserIds.has(p.id)) return false;
    const q = addSearch.trim().toLowerCase();
    if (!q) return true;
    return p.full_name?.toLowerCase().includes(q);
  });

  const handleSaveGroupName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGroupAdmin || !editingName.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from('conversations')
      .update({ name: editingName.trim() })
      .eq('id', conversation.id);
    setSavingEdit(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    await onRefresh();
    showToast('Group updated.', 'success');
  };

  const handleGroupPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id || !isGroupAdmin || uploadingPhoto) {
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    setUploadingPhoto(true);
    try {
      const { publicUrl, error: upErr } = await uploadGroupAvatarWithFallback(
        user.id,
        conversation.id,
        file
      );
      if (upErr || !publicUrl) {
        showToast(upErr || 'Failed to upload group photo.', 'error');
        return;
      }

      const { error: updErr } = await supabase
        .from('conversations')
        .update({ avatar_url: publicUrl })
        .eq('id', conversation.id);
      if (updErr) {
        showToast(updErr.message, 'error');
        return;
      }
      await onRefresh();
      showToast('Group photo updated.', 'success');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleAddMember = async (memberId: string) => {
    setBusyId(memberId);
    const { error } = await supabase.rpc('add_group_member', {
      p_conversation: conversation.id,
      p_member: memberId,
    });
    setBusyId(null);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    if (user?.id) {
      try {
        await supabase.from('notifications').insert({
          user_id: memberId,
          actor_id: user.id,
          kind: 'group_add',
          conversation_id: conversation.id,
          meta: { conversation_id: conversation.id, group_name: conversation.name },
          read: false,
        });
      } catch {
        // Trigger or RLS
      }
    }
    await onRefresh();
    showToast('Member added to group.', 'success');
  };

  const handleRemoveMember = async (memberId: string) => {
    setBusyId(memberId);
    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', memberId);
    setBusyId(null);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    await onRefresh();
    showToast('Member removed.', 'info');
  };

  const handleLeaveGroup = async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('You left the group.', 'info');
    onClose();
    onLeftGroup();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <GlassCard
        elevated
        padding="lg"
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl relative max-h-[88dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
          aria-label="Close group info"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 pr-10">
          <div className="relative shrink-0">
            {conversation.avatar_url ? (
              <img
                src={conversation.avatar_url}
                alt={conversation.name || 'Group'}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border-2 border-[#D4AF37]"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#31005F] border-2 border-[#D4AF37] flex items-center justify-center text-[#F5D88A]">
                <Users className="w-6 h-6" />
              </div>
            )}
            {isGroupAdmin && (
              <label
                className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#8B24FF] border border-[#F5D88A] flex items-center justify-center text-white ${
                  uploadingPhoto ? 'opacity-70 cursor-wait' : 'cursor-pointer'
                }`}
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  disabled={uploadingPhoto}
                  onChange={handleGroupPhotoUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] truncate">
                {conversation.name || 'Group Chat'}
              </h2>
              {conversation.is_official && (
                <Crown className="w-4 h-4 text-[#F5D88A] shrink-0" />
              )}
            </div>
            <p className="text-xs text-[#C7A4FF]">
              {members.length} members
              {conversation.department ? ` · ${conversation.department}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
          {isGroupAdmin && (
            <form onSubmit={handleSaveGroupName} className="flex items-center gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="flex-1 min-w-0 min-h-[42px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/75 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
              />
              <button
                type="submit"
                disabled={savingEdit}
                className="min-h-[42px] px-4 rounded-xl bg-[#D4AF37] text-[#080610] font-royal-ui text-xs font-bold shrink-0"
              >
                {savingEdit ? '...' : 'Save'}
              </button>
            </form>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#D4AF37]/35 text-xs font-royal-ui font-semibold text-[#F5D88A]"
            >
              {isMuted ? 'Unmute notifications' : 'Mute notifications'}
            </button>

            <button
              type="button"
              onClick={() => setShowAddMember((v) => !v)}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#8B24FF] text-white text-xs font-royal-ui font-semibold inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{showAddMember ? 'Hide Add' : 'Add Member'}</span>
            </button>
          </div>

          {showAddMember && (
            <div className="rounded-xl p-3 bg-black/20 border border-[#D4AF37]/25 space-y-2">
              <input
                type="search"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search member to add..."
                className="w-full min-h-[38px] px-3 rounded-lg bg-[#080610]/80 border border-[#D4AF37]/30 text-xs text-white"
              />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {addableProfiles.slice(0, 12).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5"
                  >
                    <span className="text-xs text-white truncate">{p.full_name}</span>
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => handleAddMember(p.id)}
                      className="px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#080610] text-[11px] font-bold shrink-0"
                    >
                      {busyId === p.id ? '...' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-royal-ui font-bold uppercase tracking-wider text-[#C7A4FF]">
              Members ({members.length})
            </p>
            {members.map((m) => {
              const memberName = m.profiles?.full_name || 'Youth Member';
              const isSelf = m.user_id === user?.id;
              return (
                <div
                  key={m.user_id}
                  className="p-2 rounded-xl bg-black/15 border border-[#D4AF37]/15 flex items-center gap-3"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openProfile(m.user_id);
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    {m.profiles?.avatar_url ? (
                      <img
                        src={m.profiles.avatar_url}
                        alt={memberName}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#31005F] flex items-center justify-center text-xs font-bold text-[#F5D88A] shrink-0">
                        {memberName[0]?.toUpperCase() || 'Y'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {memberName} {isSelf ? '(You)' : ''}
                      </p>
                      <p className="text-[11px] text-[#C7A4FF]/80">
                        {m.role === 'admin' ? 'Group Admin' : m.profiles?.title || 'Member'}
                      </p>
                    </div>
                  </button>

                  {isGroupAdmin && !isSelf && (
                    <button
                      type="button"
                      disabled={busyId === m.user_id}
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="min-w-[36px] min-h-[36px] rounded-lg text-red-400 hover:bg-red-500/15 flex items-center justify-center shrink-0"
                      title="Remove member"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 mt-3 border-t border-[#D4AF37]/20">
          <button
            type="button"
            onClick={handleLeaveGroup}
            className="w-full min-h-[44px] rounded-xl border border-red-400/50 text-red-300 font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-2 hover:bg-red-500/15"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Group</span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
