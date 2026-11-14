import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crown,
  ImagePlus,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  Users,
  Video,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { type ChatSectionTab, useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { compressImageFile, formatDurationClock } from '@/src/lib/mediaUtils';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import {
  type CallLog,
  type ChatMessage,
  type ChatRoom,
  type Conversation,
  type ConversationMember,
  type ConversationUnread,
  type Profile,
} from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { NewGroupModal } from '@/src/components/GroupInfoModal';
import { PrivateChatView } from '@/src/components/PrivateChatView';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

interface EnrichedConversation {
  conversation: Conversation;
  members: ConversationMember[];
  unreadCount: number;
  isMuted: boolean;
  isGroup: boolean;
  otherMember: ConversationMember | null;
  displayName: string;
  displayAvatar: string | null;
}

function formatChatTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ChatPage: React.FC = () => {
  const { user, profile, churches, isAdmin, isSuspended } = useAuth();
  const { t } = useLanguage();
  const {
    openProfile,
    isUserOnline,
    onlineUserIds,
    blockedUserIds,
    activeConversationId,
    setActiveConversationId,
    chatTabRequest,
    setChatTabRequest,
    refreshUnreadChatsCount,
  } = useSocial();
  const { showToast } = useToast();

  const [section, setSection] = useState<ChatSectionTab>('chats');

  // Private & Group Chats state
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [followConnections, setFollowConnections] = useState<Profile[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);

  // Rooms state
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomChurchId, setNewRoomChurchId] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Calls state
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const stopTypingTimeoutRef = useRef<number | null>(null);
  const remoteTimeoutsRef = useRef<Record<string, number>>({});

  // Sync external navigation into Chat tabs / conversation
  useEffect(() => {
    if (chatTabRequest) {
      setSection(chatTabRequest);
      setChatTabRequest(null);
    }
  }, [chatTabRequest, setChatTabRequest]);

  useEffect(() => {
    if (activeConversationId) {
      setSection('chats');
    }
  }, [activeConversationId]);

  // Clear active conversation when leaving ChatPage so background notifications resume properly
  useEffect(() => {
    return () => {
      setActiveConversationId(null);
    };
  }, [setActiveConversationId]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load private & group conversations
  const loadConversations = useCallback(async (silent = false) => {
    if (!user?.id || !isSupabaseConfigured) {
      setLoadingChats(false);
      return;
    }
    if (!silent) {
      setLoadingChats(true);
    }
    setChatsError(null);

    try {
      const { data: myMemRows, error: memErr } = await supabase
        .from('conversation_members')
        .select('conversation_id, muted')
        .eq('user_id', user.id);

      if (memErr) {
        setChatsError(memErr.message);
        setLoadingChats(false);
        return;
      }

      const memList = (myMemRows as { conversation_id: string; muted?: boolean }[]) || [];
      if (memList.length === 0) {
        setConversations([]);
        setLoadingChats(false);
        return;
      }

      const convIds = memList.map((m) => m.conversation_id);
      const myMuteMap = new Map(memList.map((m) => [m.conversation_id, Boolean(m.muted)]));

      const [convRes, allMemRes, unreadRes] = await Promise.all([
        supabase
          .from('conversations')
          .select('*')
          .in('id', convIds)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
        supabase
          .from('conversation_members')
          .select('*, profiles(id, full_name, avatar_url, role, title, last_seen_at)')
          .in('conversation_id', convIds),
        supabase
          .from('conversation_unread')
          .select('conversation_id, unread_count')
          .in('conversation_id', convIds),
      ]);

      if (convRes.error) {
        setChatsError(convRes.error.message);
        setLoadingChats(false);
        return;
      }

      const allMembersByConv = new Map<string, ConversationMember[]>();
      for (const m of (allMemRes.data as unknown as ConversationMember[]) || []) {
        const arr = allMembersByConv.get(m.conversation_id) || [];
        arr.push(m);
        allMembersByConv.set(m.conversation_id, arr);
      }

      const unreadByConv = new Map<string, number>();
      for (const u of (unreadRes.data as ConversationUnread[]) || []) {
        unreadByConv.set(u.conversation_id, Number(u.unread_count || 0));
      }

      const enriched: EnrichedConversation[] = ((convRes.data as Conversation[]) || []).map(
        (conv) => {
          const members = allMembersByConv.get(conv.id) || [];
          const isGroup = Boolean(
            conv.is_group || conv.type === 'group' || members.length > 2 || conv.name
          );
          const otherMember = !isGroup
            ? members.find((m) => m.user_id !== user.id) ?? null
            : null;
          const displayName = isGroup
            ? conv.name || 'Group Chat'
            : otherMember?.profiles?.full_name || 'Private Chat';
          const displayAvatar = isGroup
            ? conv.avatar_url || null
            : otherMember?.profiles?.avatar_url || null;

          return {
            conversation: conv,
            members,
            unreadCount: unreadByConv.get(conv.id) || 0,
            isMuted: myMuteMap.get(conv.id) || false,
            isGroup,
            otherMember,
            displayName,
            displayAvatar,
          };
        }
      );

      setConversations(enriched);
      refreshUnreadChatsCount();
    } catch (err) {
      setChatsError(err instanceof Error ? err.message : 'Unable to load chats.');
    } finally {
      setLoadingChats(false);
    }
  }, [user?.id, refreshUnreadChatsCount]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Refresh conversation list when dm_messages, members, or conversations change
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return;
    const ch = supabase
      .channel(`chat-list-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => {
        loadConversations(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
        loadConversations(true);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${user.id}` },
        () => {
          loadConversations(true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, loadConversations]);

  // Load follow connections for "New Chat"
  const openNewChatPicker = async () => {
    setShowNewChatModal(true);
    setNewChatSearch('');
    if (!user?.id) return;
    setLoadingConnections(true);

    try {
      const { data: followRows, error: fErr } = await supabase
        .from('follows')
        .select('follower_id, following_id')
        .or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);

      if (fErr) {
        showToast(fErr.message, 'error');
        setFollowConnections([]);
        return;
      }

      const otherIds = new Set<string>();
      for (const row of (followRows as { follower_id: string; following_id: string }[]) || []) {
        if (row.follower_id === user.id && row.following_id) otherIds.add(row.following_id);
        if (row.following_id === user.id && row.follower_id) otherIds.add(row.follower_id);
      }

      const validIds = Array.from(otherIds).filter((id) => !blockedUserIds.has(id));
      if (validIds.length === 0) {
        setFollowConnections([]);
        return;
      }

      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, title, role, last_seen_at, church_id, churches(id, name)')
        .in('id', validIds)
        .order('full_name');

      if (pErr) {
        showToast(pErr.message, 'error');
        setFollowConnections([]);
        return;
      }

      setFollowConnections((profs as unknown as Profile[]) || []);
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleStartDirectChat = async (targetUserId: string) => {
    setStartingChatWith(targetUserId);
    const { data: convId, error: err } = await supabase.rpc('start_direct_chat', {
      target_user: targetUserId,
    });
    setStartingChatWith(null);

    if (err || !convId) {
      showToast(
        err?.message || 'Follow each other first to start a private chat.',
        'error'
      );
      return;
    }

    setShowNewChatModal(false);
    setActiveConversationId(String(convId));
    loadConversations(true);
  };

  // Load Fellowship Rooms
  const loadRooms = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingRooms(false);
      return;
    }
    setLoadingRooms(true);
    setRoomsError(null);

    const { data, error: err } = await supabase
      .from('chat_rooms')
      .select('id, name, church_id, room_type, admin_only')
      .order('name');

    if (err) {
      setRoomsError(err.message);
      setLoadingRooms(false);
      return;
    }

    let allRooms = (data as ChatRoom[]) || [];

    if (allRooms.length === 0 && user) {
      const { data: created } = await supabase
        .from('chat_rooms')
        .insert({ name: 'Kiomwobo District Youths', church_id: null })
        .select('id, name, church_id')
        .maybeSingle();
      if (created) {
        allRooms = [created as ChatRoom];
      }
    }

    const visible = allRooms.filter((r) => {
      const lowerName = (r.name || '').toLowerCase();
      const isAdminRoom =
        Boolean(r.admin_only) ||
        r.room_type === 'admin' ||
        lowerName.includes('admin') ||
        lowerName.includes('leaders');
      if (isAdminRoom && !isAdmin) return false;
      if (r.church_id && profile?.church_id && !isAdmin) {
        return r.church_id === profile.church_id;
      }
      return true;
    });

    setRooms(visible);
    if (visible.length > 0) {
      setActiveRoomId((prev) => (prev && visible.some((r) => r.id === prev) ? prev : visible[0].id));
    }
    setLoadingRooms(false);
  }, [isAdmin, profile?.church_id, user]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const loadMessages = useCallback(
    async (roomId: string) => {
      if (!roomId || !isSupabaseConfigured) return;
      setLoadingMessages(true);
      const { data, error: err } = await supabase
        .from('messages')
        .select('*, profiles!sender_id(id, full_name, avatar_url, role)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (err) {
        showToast(err.message, 'error');
      } else {
        setMessages((data as ChatMessage[]) || []);
        setTimeout(scrollToBottom, 80);
      }
      setLoadingMessages(false);
    },
    [showToast, scrollToBottom]
  );

  useEffect(() => {
    if (section !== 'rooms' || !activeRoomId || !isSupabaseConfigured) return;
    setTypingUsers({});
    loadMessages(activeRoomId);

    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${activeRoomId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const inserted = payload.new as ChatMessage;
            const authorId = inserted.sender_id || inserted.user_id;
            let senderProfile: ChatMessage['profiles'] = null;
            if (authorId) {
              setTypingUsers((prev) => {
                if (!prev[authorId]) return prev;
                const next = { ...prev };
                delete next[authorId];
                return next;
              });
              const { data } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, role')
                .eq('id', authorId)
                .maybeSingle();
              senderProfile = (data as ChatMessage['profiles']) || null;
            }

            const enriched: ChatMessage = {
              ...inserted,
              profiles: senderProfile,
            };

            setMessages((prev) =>
              prev.some((m) => m.id === enriched.id) ? prev : [...prev, enriched]
            );
            setTimeout(scrollToBottom, 60);
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .on(
        'broadcast',
        { event: 'typing' },
        ({ payload }: { payload: { user_id?: string; full_name?: string; is_typing?: boolean } }) => {
          const uid = payload?.user_id;
          if (!uid || uid === user?.id) return;

          if (remoteTimeoutsRef.current[uid]) {
            window.clearTimeout(remoteTimeoutsRef.current[uid]);
            delete remoteTimeoutsRef.current[uid];
          }

          if (payload.is_typing) {
            const displayName = payload.full_name?.split(' ')[0] || 'Someone';
            setTypingUsers((prev) => ({ ...prev, [uid]: displayName }));
            remoteTimeoutsRef.current[uid] = window.setTimeout(() => {
              setTypingUsers((prev) => {
                const next = { ...prev };
                delete next[uid];
                return next;
              });
            }, 3800);
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

    roomChannelRef.current = channel;

    return () => {
      roomChannelRef.current = null;
      if (stopTypingTimeoutRef.current) {
        window.clearTimeout(stopTypingTimeoutRef.current);
      }
      Object.values(remoteTimeoutsRef.current).forEach((tId) => window.clearTimeout(tId));
      remoteTimeoutsRef.current = {};
      supabase.removeChannel(channel);
    };
  }, [section, activeRoomId, loadMessages, scrollToBottom, user?.id]);

  // Load Calls history
  const loadCalls = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setLoadingCalls(false);
      return;
    }
    setLoadingCalls(true);
    setCallsError(null);

    const { data, error: err } = await supabase
      .from('call_logs')
      .select('*')
      .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(60);

    if (err) {
      setCallsError(err.message);
      setLoadingCalls(false);
      return;
    }

    const rows = (data as CallLog[]) || [];
    const uids = Array.from(
      new Set(rows.flatMap((r) => [r.caller_id, r.callee_id].filter(Boolean) as string[]))
    );

    const profMap = new Map<string, Pick<Profile, 'id' | 'full_name' | 'avatar_url'>>();
    if (uids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', uids);
      for (const p of (profs as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]) || []) {
        profMap.set(p.id, p);
      }
    }

    setCallLogs(
      rows.map((r) => ({
        ...r,
        caller: profMap.get(r.caller_id) || null,
        callee: r.callee_id ? profMap.get(r.callee_id) || null : null,
      }))
    );
    setLoadingCalls(false);
  }, [user?.id]);

  useEffect(() => {
    if (section === 'calls') {
      loadCalls();
    }
  }, [section, loadCalls]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const filteredConversations = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!c.isGroup && c.otherMember?.user_id && blockedUserIds.has(c.otherMember.user_id)) {
        return false;
      }
      if (!q) return true;
      return (
        c.displayName.toLowerCase().includes(q) ||
        (c.conversation.last_message_preview || '').toLowerCase().includes(q)
      );
    });
  }, [conversations, chatSearch, blockedUserIds]);

  const filteredConnections = useMemo(() => {
    const q = newChatSearch.trim().toLowerCase();
    if (!q) return followConnections;
    return followConnections.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.churches?.name?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q)
    );
  }, [followConnections, newChatSearch]);

  const broadcastTyping = (isTyping: boolean) => {
    if (!roomChannelRef.current || !user?.id) return;
    roomChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: user.id,
        full_name: profile?.full_name || 'Youth Member',
        is_typing: isTyping,
      },
    });
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (!user?.id) return;

    const now = Date.now();
    if (val.trim().length > 0 && now - lastTypingSentRef.current > 1400) {
      lastTypingSentRef.current = now;
      broadcastTyping(true);
    }

    if (stopTypingTimeoutRef.current) {
      window.clearTimeout(stopTypingTimeoutRef.current);
    }
    if (val.trim().length === 0) {
      broadcastTyping(false);
    } else {
      stopTypingTimeoutRef.current = window.setTimeout(() => {
        broadcastTyping(false);
      }, 2800);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreatingRoom(true);
    const { data, error: err } = await supabase
      .from('chat_rooms')
      .insert({
        name: newRoomName.trim(),
        church_id: newRoomChurchId || null,
      })
      .select('id, name, church_id')
      .single();

    setCreatingRoom(false);
    if (err) {
      showToast(err.message, 'error');
      return;
    }

    if (data) {
      const created = data as ChatRoom;
      setRooms((prev) => [...prev, created]);
      setActiveRoomId(created.id);
    }
    setNewRoomName('');
    setNewRoomChurchId('');
    setShowCreateRoom(false);
    showToast('Chat channel created.', 'success');
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeRoomId || !draft.trim() || isSuspended) return;
    const text = draft.trim();
    setDraft('');
    broadcastTyping(false);
    setSending(true);

    const { data, error: err } = await supabase
      .from('messages')
      .insert({
        room_id: activeRoomId,
        sender_id: user.id,
        content: text,
      })
      .select('*, profiles!sender_id(id, full_name, avatar_url, role)')
      .single();

    setSending(false);
    if (err) {
      showToast(err.message, 'error');
      setDraft(text);
      return;
    }

    if (data) {
      const msg = data as ChatMessage;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setTimeout(scrollToBottom, 60);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeRoomId || isSuspended) return;

    setUploadingImage(true);
    try {
      const compressed = await compressImageFile(file, 1280);
      const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/room-${activeRoomId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('gallery')
        .upload(path, compressed, { upsert: false, contentType: compressed.type || 'image/jpeg' });

      if (upErr) {
        showToast(upErr.message, 'error');
        return;
      }

      const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(path);
      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .insert({
          room_id: activeRoomId,
          sender_id: user.id,
          content: '',
          image_url: urlData.publicUrl,
        })
        .select('*, profiles!sender_id(id, full_name, avatar_url, role)')
        .single();

      if (msgErr) {
        showToast(msgErr.message, 'error');
      } else if (msgData) {
        const msg = msgData as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        setTimeout(scrollToBottom, 60);
      }
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    const { error: err } = await supabase.from('messages').delete().eq('id', msgId);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  };

  const typingNames = Object.values(typingUsers);
  const typingBanner =
    typingNames.length === 1
      ? `${typingNames[0]} is typing`
      : typingNames.length === 2
      ? `${typingNames[0]} and ${typingNames[1]} are typing`
      : typingNames.length > 2
      ? `${typingNames[0]} and ${typingNames.length - 1} others are typing`
      : '';

  const totalUnreadChats = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="space-y-3 flex flex-col h-[calc(100dvh-10.75rem)] sm:h-[calc(100dvh-10.25rem)] lg:h-[calc(100dvh-6.25rem)] min-h-[240px]">
      {/* Page Header + Section Tabs (hidden when inside a private conversation for max space) */}
      {!(section === 'chats' && activeConversationId) && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
            <div>
              <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
                {t.nav.chat}
              </h1>
              <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
                Private DMs, group fellowships, and district channels
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {section === 'chats' && !isSuspended && (
                <>
                  <button
                    type="button"
                    onClick={openNewChatPicker}
                    className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    <span>New Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewGroupModal(true)}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#8B24FF] text-white font-royal-ui text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Users className="w-4 h-4" />
                    <span>New Group</span>
                  </button>
                </>
              )}
              {section === 'rooms' && isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowCreateRoom(true)}
                  className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Channel</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 shrink-0">
            {(
              [
                { id: 'chats', label: 'Chats', badge: totalUnreadChats },
                { id: 'rooms', label: 'Rooms', badge: 0 },
                { id: 'calls', label: 'Calls', badge: 0 },
              ] as { id: ChatSectionTab; label: string; badge: number }[]
            ).map((tab) => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSection(tab.id);
                    if (tab.id !== 'chats') setActiveConversationId(null);
                  }}
                  className={`min-h-[44px] px-3 rounded-xl font-royal-ui text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                    active
                      ? 'bg-[#8B24FF] text-white violet-glow'
                      : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4AF37] text-[#080610] text-[10px] font-bold flex items-center justify-center">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ==================== CHATS TAB ==================== */}
      {section === 'chats' && activeConversationId ? (
        <PrivateChatView
          conversationId={activeConversationId}
          onBack={() => {
            setActiveConversationId(null);
            loadConversations(true);
          }}
          onConversationUpdated={() => loadConversations(true)}
        />
      ) : section === 'chats' ? (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          <div className="relative shrink-0">
            <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full min-h-[44px] pl-10 pr-4 rounded-xl royal-glass border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
            {loadingChats ? (
              <div className="space-y-2.5">
                <SkeletonCard lines={2} />
                <SkeletonCard lines={2} />
              </div>
            ) : chatsError ? (
              <ErrorState message={chatsError} onRetry={() => loadConversations(false)} />
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                title={chatSearch ? 'No matching chats' : 'No private chats yet'}
                description={
                  chatSearch
                    ? 'Try a different name or message keyword.'
                    : 'Start a private chat with someone you follow, or create a group fellowship chat.'
                }
                actionLabel={!chatSearch && !isSuspended ? 'Start a Chat' : undefined}
                onAction={!chatSearch && !isSuspended ? openNewChatPicker : undefined}
                icon={<MessageCircle className="w-6 h-6" />}
              />
            ) : (
              filteredConversations.map((item) => {
                const {
                  conversation: conv,
                  unreadCount,
                  isMuted,
                  isGroup,
                  otherMember,
                  displayName,
                  displayAvatar,
                } = item;
                const online = !isGroup
                  ? isUserOnline(otherMember?.user_id, otherMember?.profiles?.last_seen_at)
                  : false;
                const preview =
                  conv.last_message_kind === 'voice'
                    ? '🎤 Voice note'
                    : conv.last_message_kind === 'image'
                    ? '📷 Photo'
                    : conv.last_message_preview || 'Tap to open chat';

                return (
                  <GlassCard
                    key={conv.id}
                    padding="md"
                    onClick={() => setActiveConversationId(conv.id)}
                    className="cursor-pointer hover:border-[#D4AF37]/60 transition flex items-center gap-3.5"
                  >
                    <div className="relative shrink-0">
                      {displayAvatar ? (
                        <img
                          src={displayAvatar}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-full object-cover border border-[#D4AF37]/50"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[#31005F] border border-[#D4AF37]/50 flex items-center justify-center text-sm font-bold text-[#F5D88A]">
                          {isGroup ? <Users className="w-5 h-5" /> : displayName[0]?.toUpperCase() || 'Y'}
                        </div>
                      )}
                      {online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#080610]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-royal-ui text-sm font-bold text-slate-900 dark:text-[#F5F1FF] truncate">
                            {displayName}
                          </span>
                          {conv.is_official && (
                            <Crown className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                          )}
                          {isMuted && (
                            <VolumeX className="w-3.5 h-3.5 text-[#C7A4FF]/65 shrink-0" />
                          )}
                        </div>
                        <span className="text-[11px] tabular-nums text-slate-500 dark:text-[#C7A4FF]/70 shrink-0">
                          {formatChatTime(conv.last_message_at || conv.created_at)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600 dark:text-[#C7A4FF]/80 truncate">
                          {preview}
                        </p>
                        {unreadCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#D4AF37] text-[#080610] text-[11px] font-bold flex items-center justify-center shrink-0">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {/* ==================== ROOMS TAB (Existing Channels Preserved) ==================== */}
      {section === 'rooms' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {rooms.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
              {rooms.map((room) => {
                const lowerName = (room.name || '').toLowerCase();
                const isAdminRoom =
                  Boolean(room.admin_only) ||
                  room.room_type === 'admin' ||
                  lowerName.includes('admin') ||
                  lowerName.includes('leaders');
                const active = room.id === activeRoomId;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setActiveRoomId(room.id)}
                    className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                      active
                        ? 'bg-[#8B24FF] text-white violet-glow'
                        : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
                    }`}
                  >
                    {isAdminRoom && <Shield className="w-3.5 h-3.5 text-[#F5D88A]" />}
                    <span>{room.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {loadingRooms ? (
            <SkeletonCard lines={4} />
          ) : roomsError ? (
            <ErrorState message={roomsError} onRetry={loadRooms} />
          ) : rooms.length === 0 ? (
            <EmptyState
              title="No chat rooms available"
              description={
                isAdmin
                  ? 'Create a District or Church fellowship channel to start chatting.'
                  : 'District and Church chat channels will appear here once created by an admin.'
              }
              actionLabel={isAdmin ? 'Create Channel' : undefined}
              onAction={isAdmin ? () => setShowCreateRoom(true) : undefined}
              icon={<MessageCircle className="w-6 h-6" />}
            />
          ) : (
            <GlassCard padding="none" className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#D4AF37]/25 flex items-center justify-between gap-2 shrink-0">
                <span className="font-royal-ui text-sm font-semibold text-slate-900 dark:text-[#F5D88A] truncate">
                  {activeRoom?.name}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-royal-ui font-semibold text-emerald-500 dark:text-emerald-400 shrink-0 tabular-nums">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{Math.max(1, onlineUserIds.size)} online</span>
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 font-royal-body min-h-0">
                {loadingMessages ? (
                  <p className="text-center text-sm text-slate-500 dark:text-[#C7A4FF] py-6">
                    Loading messages...
                  </p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-base text-slate-500 dark:text-[#C7A4FF] py-10">
                    No messages yet. Start the fellowship conversation!
                  </p>
                ) : (
                  messages.map((msg) => {
                    const authorId = msg.sender_id || msg.user_id;
                    const isMine = authorId === user?.id;
                    const text = msg.content || msg.body || '';
                    const senderOnline = isUserOnline(authorId);
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2.5 ${
                          isMine ? 'flex-row-reverse' : 'flex-row'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => authorId && openProfile(authorId)}
                          className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                          aria-label={`Open ${msg.profiles?.full_name || 'member'} profile`}
                        >
                          {msg.profiles?.avatar_url ? (
                            <img
                              src={msg.profiles.avatar_url}
                              alt={msg.profiles.full_name}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]/50"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#31005F] border border-[#D4AF37]/50 flex items-center justify-center text-xs font-bold text-[#F5D88A]">
                              {(msg.profiles?.full_name?.[0] ?? 'Y').toUpperCase()}
                            </div>
                          )}
                          {senderOnline && (
                            <span
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080610]"
                              title="Online"
                            />
                          )}
                        </button>

                        <div
                          className={`max-w-[78%] sm:max-w-[65%] rounded-2xl px-3.5 py-2.5 ${
                            isMine
                              ? 'bg-[#31005F] text-[#F5F1FF] border border-[#D4AF37]/45'
                              : 'bg-white/85 dark:bg-[#160D28]/90 text-slate-900 dark:text-[#F5F1FF] border border-slate-200 dark:border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <button
                              type="button"
                              onClick={() => authorId && openProfile(authorId)}
                              className="text-xs font-semibold text-[#8B24FF] dark:text-[#F5D88A] hover:underline text-left"
                            >
                              {msg.profiles?.full_name || 'Youth Member'}
                            </button>
                            <span className="text-[11px] tabular-nums opacity-70">
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {msg.image_url && (
                            <img
                              src={msg.image_url}
                              alt="Shared attachment"
                              referrerPolicy="no-referrer"
                              className="rounded-xl max-h-64 w-auto object-cover mb-1.5 border border-[#D4AF37]/30"
                            />
                          )}

                          {text && (
                            <p className="text-base leading-snug whitespace-pre-wrap break-words">
                              {text}
                            </p>
                          )}

                          {(isAdmin || isMine) && (
                            <div className="mt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1 text-red-400/75 hover:text-red-400"
                                aria-label="Delete message"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {typingBanner && (
                <div className="px-4 py-1.5 border-t border-[#D4AF37]/15 bg-[#1B0835]/75 flex items-center gap-2 text-xs font-royal-ui text-[#F5D88A] shrink-0">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[#F5D88A] animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[#F5D88A] animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[#F5D88A] animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </span>
                  <span>{typingBanner}...</span>
                </div>
              )}

              {isSuspended ? (
                <div className="p-3 border-t border-red-400/25 bg-red-950/35 text-center text-xs font-royal-ui text-red-200 shrink-0">
                  Your account is suspended. You can read messages but cannot post.
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
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => imageInputRef.current?.click()}
                    className="min-w-[44px] min-h-[44px] rounded-xl border border-[#D4AF37]/40 flex items-center justify-center text-[#8B24FF] dark:text-[#F5D88A] hover:bg-[#31005F]/30 shrink-0"
                    aria-label="Send image"
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
                        scrollToBottom();
                      }, 150);
                    }}
                    placeholder="Write a message..."
                    className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-white/90 dark:bg-[#080610]/85 border border-[#D4AF37]/35 text-base text-slate-900 dark:text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF]"
                  />

                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="min-w-[44px] min-h-[44px] px-3.5 sm:px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 shrink-0 shadow-md"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </button>
                </form>
              )}
            </GlassCard>
          )}
        </div>
      )}

      {/* ==================== CALLS TAB ==================== */}
      {section === 'calls' && (
        <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0">
          {loadingCalls ? (
            <div className="space-y-2.5">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </div>
          ) : callsError ? (
            <ErrorState message={callsError} onRetry={loadCalls} />
          ) : callLogs.length === 0 ? (
            <EmptyState
              title="No call history yet"
              description="Audio and video call logs will appear here. Calling is launching soon!"
              icon={<Phone className="w-6 h-6" />}
            />
          ) : (
            callLogs.map((log) => {
              const isOutgoing = log.caller_id === user?.id;
              const otherUser = isOutgoing ? log.callee : log.caller;
              const otherId = isOutgoing ? log.callee_id : log.caller_id;
              const isMissed = log.status === 'missed' || log.status === 'declined';
              const isVideo = log.call_type === 'video';
              const otherName = otherUser?.full_name || 'Youth Member';

              return (
                <GlassCard
                  key={log.id}
                  padding="md"
                  onClick={() => {
                    if (log.conversation_id) {
                      setSection('chats');
                      setActiveConversationId(log.conversation_id);
                    } else if (otherId) {
                      handleStartDirectChat(otherId);
                    }
                  }}
                  className="cursor-pointer hover:border-[#D4AF37]/60 transition flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {otherUser?.avatar_url ? (
                      <img
                        src={otherUser.avatar_url}
                        alt={otherName}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-full object-cover border border-[#D4AF37]/40 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-[#31005F] border border-[#D4AF37]/40 flex items-center justify-center text-sm font-bold text-[#F5D88A] shrink-0">
                        {otherName[0]?.toUpperCase() || 'Y'}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p
                        className={`font-royal-ui text-sm font-bold truncate ${
                          isMissed ? 'text-red-400' : 'text-slate-900 dark:text-[#F5F1FF]'
                        }`}
                      >
                        {otherName}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-[#C7A4FF]/80">
                        {isMissed ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        ) : isOutgoing ? (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <PhoneIncoming className="w-3.5 h-3.5 text-[#F5D88A] shrink-0" />
                        )}
                        <span className={isMissed ? 'text-red-400 font-semibold' : ''}>
                          {isMissed ? 'Missed' : isOutgoing ? 'Outgoing' : 'Incoming'}
                        </span>
                        {log.duration_seconds ? (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">
                              {formatDurationClock(log.duration_seconds)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500 dark:text-[#C7A4FF]/70">
                    <span className="tabular-nums">{formatChatTime(log.created_at)}</span>
                    {isVideo ? (
                      <Video className="w-4 h-4 text-[#F5D88A]" />
                    ) : (
                      <Phone className="w-4 h-4 text-[#F5D88A]" />
                    )}
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* ==================== NEW CHAT PICKER MODAL ==================== */}
      {showNewChatModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowNewChatModal(false)}
        >
          <GlassCard
            elevated
            padding="lg"
            className="w-full max-w-md relative max-h-[85dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowNewChatModal(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-1 pr-10">
              New Private Chat
            </h2>
            <p className="text-xs text-[#C7A4FF]/80 mb-3">
              Message anyone you follow or who follows you.
            </p>

            <div className="relative mb-3 shrink-0">
              <Search className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={newChatSearch}
                onChange={(e) => setNewChatSearch(e.target.value)}
                placeholder="Search connections..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[#080610]/75 border border-[#D4AF37]/30 text-sm text-[#F5F1FF]"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[160px] pr-1">
              {loadingConnections ? (
                <SkeletonCard lines={3} />
              ) : filteredConnections.length === 0 ? (
                <p className="text-center text-sm text-[#C7A4FF]/80 py-8">
                  {followConnections.length === 0
                    ? 'Follow a youth member or wait for someone to follow you to start a private chat.'
                    : 'No matching connections.'}
                </p>
              ) : (
                filteredConnections.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    disabled={startingChatWith === person.id}
                    onClick={() => handleStartDirectChat(person.id)}
                    className="w-full min-h-[52px] px-3 py-2 rounded-xl bg-black/20 hover:bg-[#31005F]/40 border border-[#D4AF37]/20 flex items-center gap-3 text-left transition disabled:opacity-50"
                  >
                    {person.avatar_url ? (
                      <img
                        src={person.avatar_url}
                        alt={person.full_name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#31005F] flex items-center justify-center text-xs font-bold text-[#F5D88A] shrink-0">
                        {(person.full_name?.[0] || 'Y').toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">
                        {person.full_name}
                      </p>
                      <p className="text-xs text-[#C7A4FF]/75 truncate">
                        {person.churches?.name || person.title || 'Kiomwobo District'}
                      </p>
                    </div>
                    <span className="text-xs font-royal-ui font-bold text-[#F5D88A] shrink-0">
                      {startingChatWith === person.id ? 'Opening...' : 'Message'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ==================== NEW GROUP MODAL ==================== */}
      <NewGroupModal
        open={showNewGroupModal}
        onClose={() => setShowNewGroupModal(false)}
        onCreated={(convId) => {
          setSection('chats');
          setActiveConversationId(convId);
          loadConversations();
        }}
      />

      {/* ==================== CREATE CHANNEL MODAL (Admins) ==================== */}
      {showCreateRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-md relative">
            <button
              type="button"
              onClick={() => setShowCreateRoom(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              Create Chat Channel
            </h2>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Channel Name
                </label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Kiomwobo District Youths"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Church (optional)
                </label>
                <select
                  value={newRoomChurchId}
                  onChange={(e) => setNewRoomChurchId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                >
                  <option value="">District-Wide (All 7 Churches)</option>
                  {churches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={creatingRoom}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {creatingRoom ? 'Creating...' : 'Create Channel'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
