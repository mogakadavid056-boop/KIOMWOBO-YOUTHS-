import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useToast } from '@/src/context/ToastContext';
import { formatLastSeenLabel, playSoftNotificationSound } from '@/src/lib/mediaUtils';
import {
  DEFAULT_SABBATH_LOCATION,
  fetchSabbathLocation,
  fetchUserSettings,
  getSabbathReminderCopy,
  getUpcomingSabbathWindows,
} from '@/src/lib/sabbath';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import {
  type AppRoute,
  type NotificationRecord,
  REACTION_META,
  type ReactionType,
  type SabbathLocation,
} from '@/src/types/database';
import {
  BlockConfirmModal,
  type BlockRequest,
  ReportModal,
  type ReportRequest,
} from '@/src/components/SafetyModals';

export type ChatSectionTab = 'chats' | 'rooms' | 'calls';

interface SocialContextValue {
  viewingProfileId: string | null;
  setViewingProfileId: (id: string | null) => void;
  openProfile: (userId: string) => void;
  focusedPostId: string | null;
  setFocusedPostId: (postId: string | null) => void;
  openPost: (postId: string) => void;
  activeConversationId: string | null;
  setActiveConversationId: (conversationId: string | null) => void;
  openConversation: (conversationId: string) => void;
  chatTabRequest: ChatSectionTab | null;
  setChatTabRequest: (tab: ChatSectionTab | null) => void;
  openChatTab: (tab: ChatSectionTab) => void;
  unreadNotifications: number;
  refreshUnreadNotifications: () => Promise<void>;
  unreadChatsCount: number;
  refreshUnreadChatsCount: () => Promise<void>;
  onlineUserIds: Set<string>;
  showOnline: boolean;
  setShowOnlineState: (val: boolean) => void;
  isUserOnline: (userId?: string | null, lastSeenAt?: string | null) => boolean;
  getPresenceLabel: (userId?: string | null, lastSeenAt?: string | null) => string | null;
  blockedUserIds: Set<string>;
  refreshBlockedUsers: () => Promise<void>;
  unviewedStoryUserIds: Set<string>;
  refreshUnviewedStories: () => Promise<void>;
  openReportModal: (req: ReportRequest) => void;
  openBlockModal: (req: BlockRequest) => void;
  sabbathLocation: SabbathLocation;
  refreshSabbathLocation: () => Promise<void>;
  sabbathBanner: { title: string; body: string } | null;
  dismissSabbathBanner: () => void;
  rescheduleSabbathReminder: () => Promise<void>;
}

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

interface SocialProviderProps {
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}

function formatNotificationToast(n: NotificationRecord, actorName: string): string {
  const reactionKey = (n.meta?.reaction as ReactionType | undefined) || 'like';
  const emoji = REACTION_META[reactionKey]?.emoji || '👍';
  switch (n.kind) {
    case 'like':
      return `${actorName} reacted ${emoji} to your post`;
    case 'comment':
      return `${actorName} commented on your post`;
    case 'follow':
      return `${actorName} started following you`;
    case 'share':
      return `${actorName} shared your post`;
    case 'mention':
      return `${actorName} mentioned you`;
    case 'story_reaction':
      return `${actorName} reacted ${emoji} to your story`;
    case 'group_add':
      return `${actorName} added you to a group`;
    case 'missed_call':
      return `Missed call from ${actorName}`;
    default:
      return `${actorName} sent you an update`;
  }
}

export const SocialProvider: React.FC<SocialProviderProps> = ({ onNavigate, children }) => {
  const { user, profile } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { showToast } = useToast();

  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [focusedPostId, setFocusedPostId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [chatTabRequest, setChatTabRequest] = useState<ChatSectionTab | null>(null);

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [showOnline, setShowOnline] = useState(true);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [unviewedStoryUserIds, setUnviewedStoryUserIds] = useState<Set<string>>(new Set());

  const [reportRequest, setReportRequest] = useState<ReportRequest | null>(null);
  const [blockRequest, setBlockRequest] = useState<BlockRequest | null>(null);

  const [sabbathLocation, setSabbathLocation] = useState<SabbathLocation>(DEFAULT_SABBATH_LOCATION);
  const [sabbathBanner, setSabbathBanner] = useState<{ title: string; body: string } | null>(null);

  const timerRef = useRef<number | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const blockedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    blockedIdsRef.current = blockedUserIds;
  }, [blockedUserIds]);

  const openProfile = useCallback(
    (userId: string) => {
      if (!userId) return;
      setViewingProfileId(userId === user?.id ? null : userId);
      onNavigate('profile');
    },
    [user?.id, onNavigate]
  );

  const openPost = useCallback(
    (postId: string) => {
      if (!postId) return;
      setFocusedPostId(postId);
      onNavigate('community');
    },
    [onNavigate]
  );

  const openConversation = useCallback(
    (conversationId: string) => {
      if (!conversationId) return;
      setChatTabRequest('chats');
      setActiveConversationId(conversationId);
      onNavigate('chat');
    },
    [onNavigate]
  );

  const openChatTab = useCallback(
    (tab: ChatSectionTab) => {
      setChatTabRequest(tab);
      if (tab !== 'chats') setActiveConversationId(null);
      onNavigate('chat');
    },
    [onNavigate]
  );

  const isUserOnline = useCallback(
    (userId?: string | null, lastSeenAt?: string | null) => {
      if (!userId) return false;
      if (user?.id && userId === user.id) return showOnline;
      if (onlineUserIds.has(userId)) return true;
      if (lastSeenAt) {
        const ts = new Date(lastSeenAt).getTime();
        if (Number.isFinite(ts) && Date.now() - ts < 120_000) return true;
      }
      return false;
    },
    [onlineUserIds, user?.id, showOnline]
  );

  const getPresenceLabel = useCallback(
    (userId?: string | null, lastSeenAt?: string | null) => {
      if (!userId) return null;
      if (user?.id && userId === user.id) {
        return showOnline ? 'Online' : null;
      }
      if (onlineUserIds.has(userId)) return 'Online';
      return formatLastSeenLabel(lastSeenAt);
    },
    [onlineUserIds, user?.id, showOnline]
  );

  const refreshUnreadNotifications = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setUnreadNotifications(0);
      return;
    }
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (!error && typeof count === 'number') {
      setUnreadNotifications(count);
    }
  }, [user?.id]);

  const refreshUnreadChatsCount = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setUnreadChatsCount(0);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('conversation_unread')
        .select('conversation_id, unread_count');
      if (!error && data) {
        const total = (data as { unread_count?: number }[]).reduce(
          (sum, row) => sum + Number(row.unread_count || 0),
          0
        );
        setUnreadChatsCount(total);
      }
    } catch {
      // Ignore if view not yet populated
    }
  }, [user?.id]);

  const refreshBlockedUsers = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setBlockedUserIds(new Set());
      return;
    }
    const { data, error } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

    if (!error && data) {
      const next = new Set<string>();
      for (const row of data as { blocker_id: string; blocked_id: string }[]) {
        if (row.blocker_id === user.id && row.blocked_id) next.add(row.blocked_id);
        if (row.blocked_id === user.id && row.blocker_id) next.add(row.blocker_id);
      }
      setBlockedUserIds(next);
    }
  }, [user?.id]);

  const refreshUnviewedStories = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setUnviewedStoryUserIds(new Set());
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const { data: stories } = await supabase
        .from('stories')
        .select('id, user_id')
        .gt('expires_at', nowIso)
        .eq('hidden', false);

      const rows = (stories as { id: string; user_id: string }[]) || [];
      if (rows.length === 0) {
        setUnviewedStoryUserIds(new Set());
        return;
      }

      const storyIds = rows.map((r) => r.id);
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', user.id)
        .in('story_id', storyIds);

      const viewedSet = new Set(
        ((views as { story_id: string }[]) || []).map((v) => v.story_id)
      );

      const unviewedAuthors = new Set<string>();
      for (const r of rows) {
        if (r.user_id !== user.id && !viewedSet.has(r.id)) {
          unviewedAuthors.add(r.user_id);
        }
      }
      setUnviewedStoryUserIds(unviewedAuthors);
    } catch {
      // Ignore if stories table unavailable
    }
  }, [user?.id]);

  const refreshSabbathLocation = useCallback(async () => {
    const loc = await fetchSabbathLocation();
    setSabbathLocation(loc);
  }, []);

  const rescheduleSabbathReminder = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const loc = await fetchSabbathLocation();
    setSabbathLocation(loc);

    if (!user?.id || !isSupabaseConfigured) return;

    const settings = await fetchUserSettings(user.id);
    setShowOnline(settings.show_online);
    if (settings.language && settings.language !== language) {
      setLanguage(settings.language);
    }

    const windows = getUpcomingSabbathWindows(loc, 2);
    const nextUpcoming = windows.find((w) => w.start.getTime() > Date.now());
    const triggerAtMs = nextUpcoming
      ? nextUpcoming.start.getTime() - settings.reminder_minutes * 60_000
      : 0;

    const copy = nextUpcoming
      ? getSabbathReminderCopy(settings.language || language, nextUpcoming.startFormatted)
      : { title: 'KIOMWOBO YOUTHS', body: '' };

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sw = reg?.active || navigator.serviceWorker.controller;
        sw?.postMessage({
          type: 'SABBATH_SCHEDULE',
          enabled: settings.sabbath_reminder && triggerAtMs > Date.now(),
          triggerAtMs,
          title: copy.title,
          body: copy.body,
        });
      } catch {
        // Ignore if SW is not active
      }
    }

    if (!settings.sabbath_reminder || !nextUpcoming) return;

    const now = Date.now();
    const delay = triggerAtMs - now;

    if (delay <= 0 && nextUpcoming.start.getTime() > now) {
      const shownKey = `sabbath_banner_${nextUpcoming.start.toISOString().slice(0, 10)}`;
      if (!sessionStorage.getItem(shownKey)) {
        sessionStorage.setItem(shownKey, '1');
        setSabbathBanner(copy);
      }
      return;
    }

    if (delay > 0 && delay <= 2147483647) {
      timerRef.current = window.setTimeout(() => {
        setSabbathBanner(copy);
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(copy.title, {
              body: copy.body,
              icon: '/pwa-192x192.png',
              tag: 'sabbath-reminder',
            });
          } catch {
            // Ignore in WebView where Notification constructor is restricted
          }
        }
      }, delay);
    }
  }, [user?.id, language, setLanguage]);

  const handleConfirmBlock = async (blockedId: string): Promise<boolean> => {
    if (!user?.id) return false;
    const { error } = await supabase
      .from('blocks')
      .upsert(
        { blocker_id: user.id, blocked_id: blockedId },
        { onConflict: 'blocker_id,blocked_id' }
      );
    if (error) {
      showToast(error.message, 'error');
      return false;
    }
    await refreshBlockedUsers();
    showToast('User blocked.', 'info');
    return true;
  };

  useEffect(() => {
    refreshSabbathLocation();
  }, [refreshSabbathLocation]);

  // Update last_seen_at every minute when online status is enabled
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return;
    if (!showOnline) {
      supabase.from('profiles').update({ last_seen_at: null }).eq('id', user.id).then(() => {});
      return;
    }

    const pingLastSeen = () => {
      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
    };

    pingLastSeen();
    const id = window.setInterval(pingLastSeen, 60_000);
    return () => window.clearInterval(id);
  }, [user?.id, showOnline]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) {
      setUnreadNotifications(0);
      setUnreadChatsCount(0);
      setOnlineUserIds(new Set());
      setBlockedUserIds(new Set());
      setUnviewedStoryUserIds(new Set());
      return;
    }

    refreshUnreadNotifications();
    refreshUnreadChatsCount();
    refreshBlockedUsers();
    refreshUnviewedStories();
    rescheduleSabbathReminder();

    // Notifications Realtime (instant bell count + toast)
    const notifChannel = supabase
      .channel(`social-notif-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          refreshUnreadNotifications();
          if (payload.eventType === 'INSERT') {
            const notif = payload.new as NotificationRecord;
            if (notif.actor_id && blockedIdsRef.current.has(notif.actor_id)) return;
            let actorName = 'Someone';
            if (notif.actor_id) {
              const { data: actor } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', notif.actor_id)
                .maybeSingle();
              if (actor?.full_name) actorName = actor.full_name;
            }
            showToast(formatNotificationToast(notif, actorName), 'info');
          }
        }
      )
      .subscribe();

    // Private DM & Group Messages Realtime (delivery receipt, unread badge, toast + soft sound)
    const dmChannel = supabase
      .channel(`social-dm-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            kind?: string;
            content?: string | null;
          };
          if (!msg || msg.sender_id === user.id) return;
          if (blockedIdsRef.current.has(msg.sender_id)) return;

          // Mark delivered
          supabase
            .from('conversation_members')
            .update({ last_delivered_at: new Date().toISOString() })
            .eq('conversation_id', msg.conversation_id)
            .eq('user_id', user.id)
            .then(() => {});

          refreshUnreadChatsCount();

          if (activeConversationRef.current === msg.conversation_id) return;

          const [{ data: memberRow }, { data: senderProf }] = await Promise.all([
            supabase
              .from('conversation_members')
              .select('muted')
              .eq('conversation_id', msg.conversation_id)
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('profiles')
              .select('full_name')
              .eq('id', msg.sender_id)
              .maybeSingle(),
          ]);

          if ((memberRow as { muted?: boolean } | null)?.muted) return;

          const senderName =
            (senderProf as { full_name?: string } | null)?.full_name || 'Youth Member';
          const preview =
            msg.kind === 'voice'
              ? '🎤 Voice note'
              : msg.kind === 'image'
              ? '📷 Photo'
              : (msg.content || '').slice(0, 60) || 'Sent a message';

          playSoftNotificationSound();
          showToast(`${senderName}: ${preview}`, 'info');
        }
      )
      .subscribe();

    const presenceChannel = supabase.channel('global-online-presence', {
      config: { presence: { key: user.id } },
    });

    const syncOnlineUsers = () => {
      const state = presenceChannel.presenceState<{ user_id?: string; show_online?: boolean }>();
      const next = new Set<string>();
      if (showOnline) next.add(user.id);
      for (const [key, presences] of Object.entries(state)) {
        const visible = presences.some((p) => p.show_online !== false);
        if (key && visible) next.add(key);
        for (const p of presences) {
          if (p.user_id && p.show_online !== false) next.add(p.user_id);
        }
      }
      setOnlineUserIds(next);
    };

    presenceChannel
      .on('presence', { event: 'sync' }, syncOnlineUsers)
      .on('presence', { event: 'join' }, syncOnlineUsers)
      .on('presence', { event: 'leave' }, syncOnlineUsers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && showOnline) {
          await presenceChannel.track({
            user_id: user.id,
            full_name: profile?.full_name || 'Youth Member',
            show_online: true,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(dmChannel);
      supabase.removeChannel(presenceChannel);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    user?.id,
    profile?.full_name,
    showOnline,
    refreshUnreadNotifications,
    refreshUnreadChatsCount,
    refreshBlockedUsers,
    refreshUnviewedStories,
    rescheduleSabbathReminder,
    showToast,
  ]);

  return (
    <SocialContext.Provider
      value={{
        viewingProfileId,
        setViewingProfileId,
        openProfile,
        focusedPostId,
        setFocusedPostId,
        openPost,
        activeConversationId,
        setActiveConversationId,
        openConversation,
        chatTabRequest,
        setChatTabRequest,
        openChatTab,
        unreadNotifications,
        refreshUnreadNotifications,
        unreadChatsCount,
        refreshUnreadChatsCount,
        onlineUserIds,
        showOnline,
        setShowOnlineState: setShowOnline,
        isUserOnline,
        getPresenceLabel,
        blockedUserIds,
        refreshBlockedUsers,
        unviewedStoryUserIds,
        refreshUnviewedStories,
        openReportModal: setReportRequest,
        openBlockModal: setBlockRequest,
        sabbathLocation,
        refreshSabbathLocation,
        sabbathBanner,
        dismissSabbathBanner: () => setSabbathBanner(null),
        rescheduleSabbathReminder,
      }}
    >
      {children}
      <ReportModal request={reportRequest} onClose={() => setReportRequest(null)} />
      <BlockConfirmModal
        request={blockRequest}
        onClose={() => setBlockRequest(null)}
        onConfirmBlock={handleConfirmBlock}
      />
    </SocialContext.Provider>
  );
};

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used inside SocialProvider');
  return ctx;
}
