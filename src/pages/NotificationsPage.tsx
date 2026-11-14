import React, { useCallback, useEffect, useState } from 'react';
import {
  AtSign,
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  PhoneMissed,
  Repeat2,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import {
  type NotificationRecord,
  REACTION_META,
  type ReactionType,
} from '@/src/types/database';
import { formatRelativeTime } from '@/src/components/CommentsBottomSheet';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const {
    openPost,
    openProfile,
    openConversation,
    openChatTab,
    refreshUnreadNotifications,
    isUserOnline,
    blockedUserIds,
  } = useSocial();
  const { showToast } = useToast();

  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('notifications')
      .select(
        'id, user_id, actor_id, kind, post_id, story_id, conversation_id, meta, read, created_at, actor:profiles!actor_id(id, full_name, avatar_url, role)'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);

    if (err) {
      setError(err.message);
    } else {
      const list = ((data as unknown as NotificationRecord[]) || []).filter(
        (n) => !n.actor_id || !blockedUserIds.has(n.actor_id)
      );
      setItems(list);
    }
    setLoading(false);
  }, [user?.id, blockedUserIds]);

  useEffect(() => {
    loadNotifications();

    if (!user?.id || !isSupabaseConfigured) return;
    const channel = supabase
      .channel(`notif-page-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadNotifications]);

  const handleOpenItem = async (item: NotificationRecord) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      await supabase.from('notifications').update({ read: true }).eq('id', item.id);
      refreshUnreadNotifications();
    }

    const convId =
      item.conversation_id ||
      (typeof item.meta?.conversation_id === 'string' ? item.meta.conversation_id : null);

    if (item.kind === 'missed_call') {
      openChatTab('calls');
    } else if (item.kind === 'group_add' && convId) {
      openConversation(convId);
    } else if (item.post_id && ['like', 'comment', 'share', 'mention'].includes(item.kind)) {
      openPost(item.post_id);
    } else if (item.actor_id) {
      openProfile(item.actor_id);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    const { error: err } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    refreshUnreadNotifications();
    showToast('All notifications marked as read.', 'success');
  };

  const getReactionEmoji = (item: NotificationRecord): string => {
    const rawEmoji = item.meta?.emoji;
    if (typeof rawEmoji === 'string' && rawEmoji) return rawEmoji;
    const key = item.meta?.reaction as ReactionType | undefined;
    if (key && REACTION_META[key]) return REACTION_META[key].emoji;
    return '👍';
  };

  const describeNotification = (item: NotificationRecord) => {
    const actorName = item.actor?.full_name || 'Someone';
    switch (item.kind) {
      case 'like':
        return `${actorName} reacted ${getReactionEmoji(item)} to your post`;
      case 'comment':
        return `${actorName} commented on your post`;
      case 'follow':
        return `${actorName} started following you`;
      case 'share':
        return `${actorName} shared your post`;
      case 'mention':
        return `${actorName} mentioned you`;
      case 'story_reaction':
        return `${actorName} reacted ${getReactionEmoji(item)} to your story`;
      case 'group_add':
        return `${actorName} added you to a group chat`;
      case 'missed_call':
        return `Missed call from ${actorName}`;
      default:
        return `${actorName} interacted with you`;
    }
  };

  const renderBadgeIcon = (item: NotificationRecord) => {
    switch (item.kind) {
      case 'like':
        return <span className="text-xs leading-none">{getReactionEmoji(item)}</span>;
      case 'comment':
        return <MessageCircle className="w-3.5 h-3.5 text-[#F5D88A]" />;
      case 'follow':
        return <UserPlus className="w-3.5 h-3.5 text-[#C7A4FF]" />;
      case 'share':
        return <Repeat2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'mention':
        return <AtSign className="w-3.5 h-3.5 text-[#F5D88A]" />;
      case 'story_reaction':
        return <Sparkles className="w-3.5 h-3.5 text-[#F5D88A]" />;
      case 'group_add':
        return <Users className="w-3.5 h-3.5 text-[#C7A4FF]" />;
      case 'missed_call':
        return <PhoneMissed className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Heart className="w-3.5 h-3.5 text-[#D4AF37]" />;
    }
  };

  const hasUnread = items.some((n) => !n.read);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            Notifications
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            Reactions, mentions, comments, shares, and group updates in real time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {user?.id && (
            <button
              type="button"
              onClick={() => openProfile(user.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-slate-800 dark:text-[#C7A4FF] hover:text-[#F5D88A]"
            >
              <Users className="w-4 h-4 text-[#D4AF37]" />
              <span>My Followers</span>
            </button>
          )}
          {hasUnread && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-[#F5D88A]"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadNotifications} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="When members react, comment, mention you, share your posts, or follow you, updates will appear here."
          icon={<Bell className="w-6 h-6" />}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleOpenItem(item)}
              className="w-full text-left"
            >
              <GlassCard
                className={`flex items-center gap-3.5 min-h-[72px] transition hover:border-[#D4AF37]/65 ${
                  !item.read ? 'border-[#8B24FF]/70 bg-[#31005F]/30' : ''
                }`}
              >
                <div className="relative shrink-0">
                  {item.actor?.avatar_url ? (
                    <img
                      src={item.actor.avatar_url}
                      alt={item.actor.full_name}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover border border-[#D4AF37]/60"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-[#31005F] border border-[#D4AF37]/60 flex items-center justify-center font-royal-ui font-bold text-[#F5D88A]">
                      {(item.actor?.full_name?.[0] || 'K').toUpperCase()}
                    </div>
                  )}
                  {isUserOnline(item.actor_id) && (
                    <span
                      className="absolute top-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#120822]"
                      title="Online"
                    />
                  )}
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#140624] border border-[#D4AF37]/50 flex items-center justify-center">
                    {renderBadgeIcon(item)}
                  </span>
                </div>

                <div className="min-w-0 flex-1 font-royal-body">
                  <p className="text-base text-slate-900 dark:text-[#F5F1FF]">
                    {describeNotification(item)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-[#C7A4FF]/75 tabular-nums">
                    {formatRelativeTime(item.created_at)}
                  </p>
                </div>

                {!item.read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F5D88A] shrink-0" aria-label="Unread" />
                )}
              </GlassCard>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
