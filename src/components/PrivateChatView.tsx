import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  Crown,
  Flag,
  ImagePlus,
  MoreVertical,
  Phone,
  Reply,
  Search,
  Send,
  Trash2,
  User,
  Users,
  Video,
  Volume2,
  VolumeX,
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
  type DmMessage,
  type Profile,
} from '@/src/types/database';
import { GlassCard } from './GlassCard';
import { GroupInfoModal } from './GroupInfoModal';
import { ErrorState, SkeletonCard } from './StateViews';
import {
  getChatMediaSignedUrl,
  VoiceNotePlayer,
  VoiceNoteRecorder,
} from './VoiceNotePlayer';

interface ChatImageBubbleProps {
  mediaPath?: string | null;
  onOpenLightbox: (url: string) => void;
}

const ChatImageBubble: React.FC<ChatImageBubbleProps> = ({ mediaPath, onOpenLightbox }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getChatMediaSignedUrl(mediaPath).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [mediaPath]);

  if (!url) {
    return (
      <div className="w-48 h-36 rounded-xl bg-black/25 animate-pulse flex items-center justify-center text-xs text-[#C7A4FF]/70">
        Loading photo...
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenLightbox(url)}
      className="block rounded-xl overflow-hidden border border-[#D4AF37]/30 max-w-full"
    >
      <img
        src={url}
        alt="Chat photo"
        className="max-h-64 w-auto object-cover"
      />
    </button>
  );
};

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (dt: Date) =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSnippet(msg?: DmMessage | null): string {
  if (!msg) return 'Message';
  if (msg.deleted) return 'This message was deleted';
  if (msg.kind === 'voice') return '🎤 Voice note';
  if (msg.kind === 'image') return '📷 Photo';
  return msg.content || 'Message';
}

interface PrivateChatViewProps {
  conversationId: string;
  onBack: () => void;
  onConversationUpdated?: () => void;
}

export const PrivateChatView: React.FC<PrivateChatViewProps> = ({
  conversationId,
  onBack,
  onConversationUpdated,
}) => {
  const { user, profile, isSuspended } = useAuth();
  const {
    openProfile,
    openReportModal,
    openBlockModal,
    isUserOnline,
    getPresenceLabel,
    refreshUnreadChatsCount,
  } = useSocial();
  const { showToast } = useToast();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DmMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [showMenu, setShowMenu] = useState(false);
  const [activeMsgMenuId, setActiveMsgMenuId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showCallsComingSoon, setShowCallsComingSoon] = useState<'audio' | 'video' | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const lastTypingSentRef = useRef(0);
  const stopTypingTimeoutRef = useRef<number | null>(null);
  const remoteTypingTimeoutsRef = useRef<Record<string, number>>({});
  const touchStartMapRef = useRef<Record<string, number>>({});
  const profileMapRef = useRef<Record<string, Profile>>({});

  useEffect(() => {
    profileMapRef.current = profileMap;
  }, [profileMap]);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const markConversationRead = useCallback(async () => {
    if (!user?.id || !conversationId) return;
    const nowIso = new Date().toISOString();
    await supabase
      .from('conversation_members')
      .update({ last_read_at: nowIso, last_delivered_at: nowIso })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
    refreshUnreadChatsCount();
  }, [conversationId, user?.id, refreshUnreadChatsCount]);

  const loadConversationData = useCallback(async () => {
    if (!conversationId || !user?.id) return;
    setLoading(true);
    setError(null);

    try {
      const [convRes, memRes, msgRes] = await Promise.all([
        supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
        supabase
          .from('conversation_members')
          .select('*, profiles(id, full_name, avatar_url, role, title, last_seen_at)')
          .eq('conversation_id', conversationId),
        supabase
          .from('dm_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);

      if (convRes.error) {
        setError(convRes.error.message);
        setLoading(false);
        return;
      }

      const memberList = (memRes.data as unknown as ConversationMember[]) || [];
      const msgList = (msgRes.data as DmMessage[]) || [];

      const map: Record<string, Profile> = {};
      for (const m of memberList) {
        if (m.profiles) {
          map[m.user_id] = m.profiles as Profile;
        }
      }

      const missingIds = Array.from(
        new Set(msgList.map((m) => m.sender_id).filter((id) => id && !map[id]))
      );
      if (missingIds.length > 0) {
        const { data: extraProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role, title, last_seen_at')
          .in('id', missingIds);
        for (const p of (extraProfiles as Profile[]) || []) {
          map[p.id] = p;
        }
      }

      setConversation((convRes.data as Conversation) || null);
      setMembers(memberList);
      setProfileMap(map);
      setMessages(msgList);
      setLoading(false);

      await markConversationRead();
      setTimeout(() => scrollToBottom(false), 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load conversation.');
      setLoading(false);
    }
  }, [conversationId, user?.id, markConversationRead, scrollToBottom]);

  useEffect(() => {
    loadConversationData();
  }, [loadConversationData]);

  // Close top dropdown on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Realtime: messages, member read/delivered updates, typing broadcast
  useEffect(() => {
    if (!conversationId || !user?.id) return;

    const channel = supabase
      .channel(`dm-conv-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dm_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as DmMessage;
            setMessages((prev) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
            );

            if (incoming.sender_id && incoming.sender_id !== user.id) {
              setTypingUsers((prev) => {
                if (!prev[incoming.sender_id]) return prev;
                const next = { ...prev };
                delete next[incoming.sender_id];
                return next;
              });
              markConversationRead();
            }

            if (!profileMapRef.current[incoming.sender_id]) {
              const { data: sp } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, role, title, last_seen_at')
                .eq('id', incoming.sender_id)
                .maybeSingle();
              if (sp) {
                setProfileMap((prev) => ({ ...prev, [incoming.sender_id]: sp as Profile }));
              }
            }

            setTimeout(() => scrollToBottom(true), 60);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as DmMessage;
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
            );
          } else if (payload.eventType === 'DELETE') {
            const removedId = (payload.old as { id: string }).id;
            setMessages((prev) => prev.filter((m) => m.id !== removedId));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMember = payload.new as ConversationMember;
          setMembers((prev) =>
            prev.map((m) =>
              m.user_id === updatedMember.user_id ? { ...m, ...updatedMember } : m
            )
          );
        }
      )
      .on(
        'broadcast',
        { event: 'typing' },
        ({ payload }: { payload: { user_id?: string; full_name?: string; is_typing?: boolean } }) => {
          const uid = payload?.user_id;
          if (!uid || uid === user.id) return;

          if (remoteTypingTimeoutsRef.current[uid]) {
            window.clearTimeout(remoteTypingTimeoutsRef.current[uid]);
            delete remoteTypingTimeoutsRef.current[uid];
          }

          if (payload.is_typing) {
            const firstName = payload.full_name?.split(' ')[0] || 'Someone';
            setTypingUsers((prev) => ({ ...prev, [uid]: firstName }));
            remoteTypingTimeoutsRef.current[uid] = window.setTimeout(() => {
              setTypingUsers((prev) => {
                const next = { ...prev };
                delete next[uid];
                return next;
              });
            }, 3500);
          } else {
            setTypingUsers((prev) => {
              if (!prev[uid]) return prev;
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      if (stopTypingTimeoutRef.current) {
        window.clearTimeout(stopTypingTimeoutRef.current);
      }
      Object.values(remoteTypingTimeoutsRef.current).forEach((id) => window.clearTimeout(id));
      remoteTypingTimeoutsRef.current = {};
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, markConversationRead, scrollToBottom]);

  const isGroup = Boolean(
    conversation?.is_group ||
      conversation?.type === 'group' ||
      members.length > 2 ||
      conversation?.name
  );

  const otherMember = useMemo(
    () => (!isGroup ? members.find((m) => m.user_id !== user?.id) ?? null : null),
    [isGroup, members, user?.id]
  );

  const myMembership = useMemo(
    () => members.find((m) => m.user_id === user?.id) ?? null,
    [members, user?.id]
  );

  const otherMembers = useMemo(
    () => members.filter((m) => m.user_id !== user?.id),
    [members, user?.id]
  );

  const messageById = useMemo(() => {
    const map: Record<string, DmMessage> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (m.content || '').toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const broadcastTyping = (isTyping: boolean) => {
    if (!channelRef.current || !user?.id) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: user.id,
        full_name: profile?.full_name || 'Youth Member',
        is_typing: isTyping,
      },
    });
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!user?.id) return;
    const now = Date.now();
    if (value.trim().length > 0 && now - lastTypingSentRef.current > 1400) {
      lastTypingSentRef.current = now;
      broadcastTyping(true);
    }
    if (stopTypingTimeoutRef.current) {
      window.clearTimeout(stopTypingTimeoutRef.current);
    }
    if (value.trim().length === 0) {
      broadcastTyping(false);
    } else {
      stopTypingTimeoutRef.current = window.setTimeout(() => {
        broadcastTyping(false);
      }, 2800);
    }
  };

  const updateConversationPreview = async (preview: string, kind: 'text' | 'image' | 'voice') => {
    try {
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: preview.slice(0, 120),
          last_message_kind: kind,
        })
        .eq('id', conversationId);
    } catch {
      // Trigger may already handle this
    } finally {
      onConversationUpdated?.();
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !draft.trim() || isSuspended) return;

    const text = draft.trim();
    const replyId = replyingTo?.id || null;
    setDraft('');
    setReplyingTo(null);
    broadcastTyping(false);
    setSending(true);

    const { data, error: err } = await supabase
      .from('dm_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        kind: 'text',
        content: text,
        reply_to: replyId,
      })
      .select('*')
      .single();

    setSending(false);
    if (err) {
      showToast(err.message, 'error');
      setDraft(text);
      return;
    }

    if (data) {
      const inserted = data as DmMessage;
      setMessages((prev) => (prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]));
      setTimeout(() => scrollToBottom(true), 50);
    }
    updateConversationPreview(text, 'text');
  };

  const uploadChatMedia = async (
    fileOrBlob: Blob,
    ext: string,
    contentType: string
  ): Promise<{ path: string | null; error: string | null }> => {
    if (!user?.id) return { path: null, error: 'Not signed in.' };
    const filename = `${generateUuid()}.${ext}`;
    const primaryPath = `${conversationId}/${filename}`;
    const primaryRes = await supabase.storage
      .from('chat-media')
      .upload(primaryPath, fileOrBlob, { upsert: false, contentType });

    if (!primaryRes.error) {
      return { path: primaryPath, error: null };
    }

    const fallbackPath = `${user.id}/${conversationId}-${filename}`;
    const fallbackRes = await supabase.storage
      .from('chat-media')
      .upload(fallbackPath, fileOrBlob, { upsert: false, contentType });

    if (!fallbackRes.error) {
      return { path: fallbackPath, error: null };
    }

    return {
      path: null,
      error: primaryRes.error.message || fallbackRes.error.message || 'Upload failed.',
    };
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id || isSuspended) return;

    setUploadingMedia(true);
    try {
      const compressed = await compressImageFile(file, 1280);
      const { path, error: upErr } = await uploadChatMedia(
        compressed,
        'jpg',
        compressed.type || 'image/jpeg'
      );

      if (upErr || !path) {
        showToast(upErr || 'Failed to upload image.', 'error');
        return;
      }

      const { data, error: msgErr } = await supabase
        .from('dm_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          kind: 'image',
          media_url: path,
          reply_to: replyingTo?.id || null,
        })
        .select('*')
        .single();

      if (msgErr) {
        showToast(msgErr.message, 'error');
        return;
      }

      setReplyingTo(null);
      if (data) {
        const inserted = data as DmMessage;
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        setTimeout(() => scrollToBottom(true), 50);
      }
      updateConversationPreview('📷 Photo', 'image');
    } finally {
      setUploadingMedia(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleVoiceRecorded = async (blob: Blob, durationSeconds: number) => {
    if (!user?.id || isSuspended) return;
    setUploadingMedia(true);
    try {
      const { path, error: upErr } = await uploadChatMedia(
        blob,
        'webm',
        blob.type || 'audio/webm'
      );

      if (upErr || !path) {
        showToast(upErr || 'Failed to upload voice note.', 'error');
        return;
      }

      const { data, error: msgErr } = await supabase
        .from('dm_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          kind: 'voice',
          media_url: path,
          duration_seconds: durationSeconds,
          reply_to: replyingTo?.id || null,
        })
        .select('*')
        .single();

      if (msgErr) {
        showToast(msgErr.message, 'error');
        return;
      }

      setReplyingTo(null);
      if (data) {
        const inserted = data as DmMessage;
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        setTimeout(() => scrollToBottom(true), 50);
      }
      updateConversationPreview('🎤 Voice note', 'voice');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    setActiveMsgMenuId(null);
    const { error: err } = await supabase
      .from('dm_messages')
      .update({ deleted: true, content: null, media_url: null })
      .eq('id', msgId)
      .eq('sender_id', user?.id || '');

    if (err) {
      showToast(err.message, 'error');
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, deleted: true, content: null, media_url: null } : m
      )
    );
  };

  const handleToggleMute = async () => {
    if (!user?.id) return;
    const nextMuted = !myMembership?.muted;
    const { error: err } = await supabase
      .from('conversation_members')
      .update({ muted: nextMuted })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.user_id === user.id ? { ...m, muted: nextMuted } : m))
    );
    showToast(nextMuted ? 'Notifications muted.' : 'Notifications unmuted.', 'info');
    onConversationUpdated?.();
  };

  const jumpToMessage = (targetId: string) => {
    const el = messageRefs.current[targetId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(targetId);
    window.setTimeout(() => setHighlightedId(null), 1600);
  };

  const headerTitle = isGroup
    ? conversation?.name || 'Group Chat'
    : otherMember?.profiles?.full_name || 'Private Chat';

  const headerAvatar = isGroup ? conversation?.avatar_url : otherMember?.profiles?.avatar_url;
  const otherOnline = !isGroup
    ? isUserOnline(otherMember?.user_id, otherMember?.profiles?.last_seen_at)
    : false;
  const typingNames = Object.values(typingUsers);
  const typingText =
    typingNames.length === 1
      ? `${typingNames[0]} is typing...`
      : typingNames.length > 1
      ? `${typingNames.length} people typing...`
      : null;

  const headerSubtitle = typingText
    ? typingText
    : isGroup
    ? `${members.length} members${conversation?.department ? ` · ${conversation.department}` : ''}`
    : getPresenceLabel(otherMember?.user_id, otherMember?.profiles?.last_seen_at) || 'Youth Member';

  return (
    <GlassCard padding="none" className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#D4AF37]/25 flex items-center justify-between gap-2 bg-[#120424]/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#F5D88A] hover:bg-[#31005F]/50 shrink-0"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isGroup) setShowGroupInfo(true);
              else if (otherMember?.user_id) openProfile(otherMember.user_id);
            }}
            className="flex items-center gap-2.5 min-w-0 text-left flex-1"
          >
            <div className="relative shrink-0">
              {headerAvatar ? (
                <img
                  src={headerAvatar}
                  alt={headerTitle}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/60"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#31005F] border border-[#D4AF37]/60 flex items-center justify-center text-sm font-bold text-[#F5D88A]">
                  {isGroup ? <Users className="w-4 h-4" /> : headerTitle[0]?.toUpperCase() || 'Y'}
                </div>
              )}
              {otherOnline && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#120424]" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-royal-ui text-sm font-bold text-[#F5F1FF] truncate">
                  {headerTitle}
                </span>
                {conversation?.is_official && (
                  <Crown className="w-3.5 h-3.5 text-[#F5D88A] shrink-0" />
                )}
                {myMembership?.muted && (
                  <VolumeX className="w-3.5 h-3.5 text-[#C7A4FF]/70 shrink-0" />
                )}
              </div>
              <p
                className={`text-xs truncate ${
                  typingText || otherOnline ? 'text-emerald-400 font-medium' : 'text-[#C7A4FF]/80'
                }`}
              >
                {headerSubtitle}
              </p>
            </div>
          </button>
        </div>

        {/* Call Buttons + Menu */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowCallsComingSoon('audio')}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#F5D88A] hover:bg-[#31005F]/50"
            aria-label="Audio call"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowCallsComingSoon('video')}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#F5D88A] hover:bg-[#31005F]/50"
            aria-label="Video call"
          >
            <Video className="w-4 h-4" />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((v) => !v)}
              className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#C7A4FF] hover:bg-[#31005F]/50"
              aria-label="Conversation options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 w-48 rounded-xl royal-glass-elevated border border-[#D4AF37]/40 py-1.5 z-50 shadow-2xl">
                {!isGroup && otherMember?.user_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      openProfile(otherMember.user_id);
                    }}
                    className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-[#F5F1FF] hover:bg-[#31005F]/45 flex items-center gap-2"
                  >
                    <User className="w-4 h-4 text-[#F5D88A]" />
                    <span>View profile</span>
                  </button>
                )}
                {isGroup && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setShowGroupInfo(true);
                    }}
                    className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-[#F5F1FF] hover:bg-[#31005F]/45 flex items-center gap-2"
                  >
                    <Users className="w-4 h-4 text-[#F5D88A]" />
                    <span>Group info</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setShowSearch((v) => !v);
                  }}
                  className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-[#F5F1FF] hover:bg-[#31005F]/45 flex items-center gap-2"
                >
                  <Search className="w-4 h-4 text-[#F5D88A]" />
                  <span>Search in chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    handleToggleMute();
                  }}
                  className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-[#F5F1FF] hover:bg-[#31005F]/45 flex items-center gap-2"
                >
                  {myMembership?.muted ? (
                    <Volume2 className="w-4 h-4 text-[#F5D88A]" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[#F5D88A]" />
                  )}
                  <span>{myMembership?.muted ? 'Unmute notifications' : 'Mute notifications'}</span>
                </button>
                {!isGroup && otherMember?.user_id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        openReportModal({
                          targetType: 'user',
                          targetId: otherMember.user_id,
                          targetUserId: otherMember.user_id,
                          label: headerTitle,
                        });
                      }}
                      className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-amber-400 hover:bg-amber-500/10 flex items-center gap-2"
                    >
                      <Flag className="w-4 h-4" />
                      <span>Report user</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        openBlockModal({
                          userId: otherMember.user_id,
                          userName: headerTitle,
                          onBlocked: onBack,
                        });
                      }}
                      className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-red-400 hover:bg-red-500/15 flex items-center gap-2"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Block user</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline Search Bar */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-[#D4AF37]/20 bg-[#080610]/70 flex items-center gap-2 shrink-0">
          <Search className="w-4 h-4 text-[#D4AF37] shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages in this chat..."
            autoFocus
            className="flex-1 min-w-0 bg-transparent text-sm text-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setShowSearch(false);
            }}
            className="min-w-[32px] min-h-[32px] flex items-center justify-center text-[#C7A4FF]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 font-royal-body min-h-0"
        onClick={() => setActiveMsgMenuId(null)}
      >
        {loading ? (
          <SkeletonCard lines={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadConversationData} />
        ) : visibleMessages.length === 0 ? (
          <div className="text-center py-12 space-y-1">
            <p className="text-sm text-[#C7A4FF]">
              {searchQuery ? 'No matching messages.' : 'No messages yet. Say hello!'}
            </p>
          </div>
        ) : (
          visibleMessages.map((msg, idx) => {
            const isMine = msg.sender_id === user?.id;
            const sender = profileMap[msg.sender_id];
            const senderName = sender?.full_name || 'Youth Member';
            const repliedMsg = msg.reply_to ? messageById[msg.reply_to] : undefined;
            const repliedSender = repliedMsg ? profileMap[repliedMsg.sender_id] : undefined;

            const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
            const showDateSep =
              !prevMsg ||
              new Date(prevMsg.created_at).toDateString() !==
                new Date(msg.created_at).toDateString();

            const msgTs = new Date(msg.created_at).getTime();
            const isRead =
              isMine &&
              otherMembers.some(
                (om) => om.last_read_at && new Date(om.last_read_at).getTime() >= msgTs
              );
            const isDelivered =
              isMine &&
              !isRead &&
              otherMembers.some(
                (om) =>
                  om.last_delivered_at && new Date(om.last_delivered_at).getTime() >= msgTs
              );

            return (
              <React.Fragment key={msg.id}>
                {showDateSep && (
                  <div className="flex justify-center py-1.5">
                    <span className="px-3 py-0.5 rounded-full bg-[#31005F]/65 border border-[#D4AF37]/25 text-[11px] font-royal-ui text-[#F5D88A]">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                  </div>
                )}

                <div
                  ref={(el) => {
                    messageRefs.current[msg.id] = el;
                  }}
                  onTouchStart={(e) => {
                    touchStartMapRef.current[msg.id] = e.touches[0]?.clientX ?? 0;
                  }}
                  onTouchEnd={(e) => {
                    const startX = touchStartMapRef.current[msg.id];
                    delete touchStartMapRef.current[msg.id];
                    if (typeof startX === 'number') {
                      const endX = e.changedTouches[0]?.clientX ?? startX;
                      if (endX - startX > 55 && !msg.deleted) {
                        setReplyingTo(msg);
                      }
                    }
                  }}
                  className={`flex items-end gap-2 group transition-colors duration-500 rounded-xl ${
                    isMine ? 'flex-row-reverse' : 'flex-row'
                  } ${highlightedId === msg.id ? 'bg-[#D4AF37]/20 p-1' : ''}`}
                >
                  {isGroup && !isMine && (
                    <button
                      type="button"
                      onClick={() => openProfile(msg.sender_id)}
                      className="shrink-0 rounded-full"
                    >
                      {sender?.avatar_url ? (
                        <img
                          src={sender.avatar_url}
                          alt={senderName}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full object-cover border border-[#D4AF37]/40"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#31005F] border border-[#D4AF37]/40 flex items-center justify-center text-[10px] font-bold text-[#F5D88A]">
                          {senderName[0]?.toUpperCase() || 'Y'}
                        </div>
                      )}
                    </button>
                  )}

                  <div
                    className={`relative max-w-[80%] sm:max-w-[68%] rounded-2xl px-3.5 py-2 ${
                      isMine
                        ? 'bg-[#31005F] text-[#F5F1FF] border border-[#D4AF37]/45'
                        : 'bg-white/90 dark:bg-[#160D28]/90 text-slate-900 dark:text-[#F5F1FF] border border-slate-200 dark:border-white/10'
                    }`}
                  >
                    {isGroup && !isMine && (
                      <button
                        type="button"
                        onClick={() => openProfile(msg.sender_id)}
                        className="text-xs font-royal-ui font-bold text-[#8B24FF] dark:text-[#F5D88A] hover:underline mb-0.5 block"
                      >
                        {senderName}
                      </button>
                    )}

                    {/* Quoted Reply */}
                    {repliedMsg && !msg.deleted && (
                      <button
                        type="button"
                        onClick={() => jumpToMessage(repliedMsg.id)}
                        className="w-full text-left mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/25 border-l-2 border-[#F5D88A] text-xs"
                      >
                        <p className="font-royal-ui font-bold text-[#F5D88A] truncate">
                          {repliedSender?.full_name || 'Member'}
                        </p>
                        <p className="opacity-80 truncate">{formatSnippet(repliedMsg)}</p>
                      </button>
                    )}

                    {/* Content */}
                    {msg.deleted ? (
                      <p className="text-sm italic opacity-65">This message was deleted</p>
                    ) : msg.kind === 'image' ? (
                      <ChatImageBubble
                        mediaPath={msg.media_url}
                        onOpenLightbox={(url) => setLightboxUrl(url)}
                      />
                    ) : msg.kind === 'voice' ? (
                      <VoiceNotePlayer
                        mediaPath={msg.media_url}
                        durationSeconds={msg.duration_seconds}
                        isMine={isMine}
                      />
                    ) : (
                      <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    )}

                    {/* Timestamp + Ticks + Actions */}
                    <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] tabular-nums opacity-80">
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isMine && !msg.deleted && (
                        isRead ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[#F5D88A]" aria-label="Read" />
                        ) : isDelivered ? (
                          <CheckCheck className="w-3.5 h-3.5 text-white/75" aria-label="Delivered" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-white/60" aria-label="Sent" />
                        )
                      )}

                      {!msg.deleted && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMsgMenuId((prev) => (prev === msg.id ? null : msg.id));
                          }}
                          className="ml-1 p-0.5 rounded hover:bg-black/20"
                          aria-label="Message actions"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Message Quick Menu */}
                    {activeMsgMenuId === msg.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute ${
                          isMine ? 'right-0' : 'left-0'
                        } bottom-full mb-1 w-44 rounded-xl royal-glass-elevated border border-[#D4AF37]/40 py-1 z-40 shadow-2xl`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMsgMenuId(null);
                            setReplyingTo(msg);
                          }}
                          className="w-full min-h-[38px] px-3 text-left text-xs font-royal-ui font-semibold text-[#F5F1FF] hover:bg-[#31005F]/50 flex items-center gap-2"
                        >
                          <Reply className="w-3.5 h-3.5 text-[#F5D88A]" />
                          <span>Reply</span>
                        </button>
                        {isMine ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteForEveryone(msg.id)}
                            className="w-full min-h-[38px] px-3 text-left text-xs font-royal-ui font-semibold text-red-400 hover:bg-red-500/15 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete for everyone</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMsgMenuId(null);
                              openReportModal({
                                targetType: 'message',
                                targetId: msg.id,
                                targetUserId: msg.sender_id,
                                label: 'message',
                              });
                            }}
                            className="w-full min-h-[38px] px-3 text-left text-xs font-royal-ui font-semibold text-amber-400 hover:bg-amber-500/10 flex items-center gap-2"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            <span>Report message</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply Bar */}
      {replyingTo && (
        <div className="px-3.5 py-2 border-t border-[#D4AF37]/25 bg-[#1B0835]/85 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 border-l-2 border-[#F5D88A] pl-2.5">
            <p className="text-[11px] font-royal-ui font-bold text-[#F5D88A]">
              Replying to {profileMap[replyingTo.sender_id]?.full_name || 'Member'}
            </p>
            <p className="text-xs text-[#F5F1FF]/80 truncate">{formatSnippet(replyingTo)}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#C7A4FF]"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Composer */}
      {isSuspended ? (
        <div className="p-3 border-t border-red-400/25 bg-red-950/35 text-center text-xs font-royal-ui text-red-200 shrink-0">
          Your account is suspended. You can read messages but cannot send.
        </div>
      ) : (
        <form
          onSubmit={handleSendText}
          className="p-2.5 sm:p-3 border-t border-[#D4AF37]/25 flex items-center gap-2 bg-black/15 dark:bg-[#080610]/85 shrink-0"
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploadingMedia}
            onClick={() => imageInputRef.current?.click()}
            className="min-w-[44px] min-h-[44px] rounded-xl border border-[#D4AF37]/40 flex items-center justify-center text-[#8B24FF] dark:text-[#F5D88A] hover:bg-[#31005F]/30 shrink-0 disabled:opacity-45"
            aria-label="Send photo"
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onFocus={(e) => {
              setTimeout(() => {
                e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                scrollToBottom(true);
              }, 140);
            }}
            placeholder={uploadingMedia ? 'Uploading...' : 'Message...'}
            className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-white/90 dark:bg-[#080610]/85 border border-[#D4AF37]/35 text-base text-slate-900 dark:text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF]"
          />

          {draft.trim().length > 0 ? (
            <button
              type="submit"
              disabled={sending || uploadingMedia}
              className="min-w-[44px] min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 shrink-0 shadow-md"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          ) : (
            <VoiceNoteRecorder
              disabled={uploadingMedia}
              onRecorded={handleVoiceRecorded}
              onError={(msg) => showToast(msg, 'error')}
            />
          )}
        </form>
      )}

      {/* Group Info Modal */}
      {isGroup && conversation && (
        <GroupInfoModal
          open={showGroupInfo}
          conversation={conversation}
          members={members}
          isMuted={Boolean(myMembership?.muted)}
          onClose={() => setShowGroupInfo(false)}
          onToggleMute={handleToggleMute}
          onRefresh={async () => {
            await loadConversationData();
            onConversationUpdated?.();
          }}
          onLeftGroup={() => {
            onConversationUpdated?.();
            onBack();
          }}
        />
      )}

      {/* Calls Coming Soon Modal */}
      {showCallsComingSoon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowCallsComingSoon(null)}
        >
          <GlassCard
            elevated
            padding="lg"
            className="w-full max-w-sm text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto rounded-full bg-[#8B24FF]/25 border border-[#D4AF37]/50 flex items-center justify-center text-[#F5D88A]">
              {showCallsComingSoon === 'video' ? (
                <Video className="w-6 h-6" />
              ) : (
                <Phone className="w-6 h-6" />
              )}
            </div>
            <h3 className="font-royal-serif text-xl font-bold text-[#F5D88A]">
              Calls are coming soon
            </h3>
            <p className="text-sm text-[#C7A4FF]">
              {showCallsComingSoon === 'video' ? 'Video' : 'Voice'} calling is being prepared for
              Kiomwobo Youths. For now, use instant chat or voice notes!
            </p>
            <button
              type="button"
              onClick={() => setShowCallsComingSoon(null)}
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
            >
              Got it
            </button>
          </GlassCard>
        </div>
      )}

      {/* Fullscreen Photo Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[75] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 min-w-[44px] min-h-[44px] rounded-full bg-white/10 text-white flex items-center justify-center"
            aria-label="Close photo"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full view"
            className="max-w-full max-h-[88dvh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </GlassCard>
  );
};
