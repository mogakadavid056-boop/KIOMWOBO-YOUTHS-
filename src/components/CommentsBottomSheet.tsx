import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownRight, MessageCircle, Reply, Send, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { supabase } from '@/src/lib/supabase';
import { type PostComment } from '@/src/types/database';
import {
  MentionInput,
  RichMentionText,
  type SelectedMention,
  saveMentions,
} from './MentionInput';
import { SafetyActionMenu } from './SafetyModals';
import { SkeletonCard } from './StateViews';

interface CommentsBottomSheetProps {
  postId: string | null;
  postAuthorId?: string;
  onClose: () => void;
  onCommentCountDelta?: (postId: string, delta: number) => void;
}

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const CommentsBottomSheet: React.FC<CommentsBottomSheetProps> = ({
  postId,
  postAuthorId,
  onClose,
  onCommentCountDelta,
}) => {
  const { user, profile, isAdmin, isSuspended } = useAuth();
  const {
    openProfile,
    isUserOnline,
    blockedUserIds,
    openReportModal,
    openBlockModal,
  } = useSocial();
  const { showToast } = useToast();

  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<SelectedMention[]>([]);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const stopTypingTimeoutRef = useRef<number | null>(null);
  const remoteTimeoutsRef = useRef<Record<string, number>>({});

  const loadComments = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('post_comments')
      .select(
        'id, post_id, user_id, parent_id, content, created_at, profiles!user_id(id, full_name, avatar_url, role, last_seen_at)'
      )
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      showToast(error.message, 'error');
    } else {
      setComments((data as unknown as PostComment[]) || []);
    }
    setLoading(false);
  }, [postId, showToast]);

  useEffect(() => {
    if (!postId) return;
    setTypingUsers({});
    setReplyTo(null);
    loadComments();

    const channel = supabase
      .channel(`post-comments-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const inserted = payload.new as PostComment;
            const { data: prof } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url, role, last_seen_at')
              .eq('id', inserted.user_id)
              .maybeSingle();

            const enriched: PostComment = {
              ...inserted,
              profiles: (prof as PostComment['profiles']) || null,
            };

            setTypingUsers((prev) => {
              if (!prev[inserted.user_id]) return prev;
              const next = { ...prev };
              delete next[inserted.user_id];
              return next;
            });

            setComments((prev) => {
              if (prev.some((c) => c.id === enriched.id)) return prev;
              if (inserted.user_id !== user?.id) {
                onCommentCountDelta?.(postId, 1);
              }
              return [...prev, enriched];
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setComments((prev) => prev.filter((c) => c.id !== deletedId));
          }
        }
      )
      .on(
        'broadcast',
        { event: 'typing' },
        ({
          payload,
        }: {
          payload: { user_id?: string; full_name?: string; is_typing?: boolean };
        }) => {
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

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      if (stopTypingTimeoutRef.current) {
        window.clearTimeout(stopTypingTimeoutRef.current);
      }
      Object.values(remoteTimeoutsRef.current).forEach((tId) => window.clearTimeout(tId));
      remoteTimeoutsRef.current = {};
      supabase.removeChannel(channel);
    };
  }, [postId, loadComments, user?.id, onCommentCountDelta]);

  const visibleComments = useMemo(
    () => comments.filter((c) => !blockedUserIds.has(c.user_id)),
    [comments, blockedUserIds]
  );

  const { topLevel, repliesByParent } = useMemo(() => {
    const parentIds = new Set(visibleComments.map((c) => c.id));
    const roots: PostComment[] = [];
    const childMap = new Map<string, PostComment[]>();
    for (const c of visibleComments) {
      if (c.parent_id && parentIds.has(c.parent_id)) {
        const list = childMap.get(c.parent_id) || [];
        list.push(c);
        childMap.set(c.parent_id, list);
      } else {
        roots.push(c);
      }
    }
    return { topLevel: roots, repliesByParent: childMap };
  }, [visibleComments]);

  if (!postId) return null;

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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuspended) {
      showToast('Your account is suspended. You can read but not post.', 'error');
      return;
    }
    if (!user || !draft.trim()) return;

    const text = draft.trim();
    const targetParentId = replyTo ? replyTo.parent_id || replyTo.id : null;
    const mentionSnapshot = [...selectedMentions];

    setDraft('');
    setSelectedMentions([]);
    setReplyTo(null);
    broadcastTyping(false);
    setSubmitting(true);

    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        parent_id: targetParentId,
        content: text,
      })
      .select(
        'id, post_id, user_id, parent_id, content, created_at, profiles!user_id(id, full_name, avatar_url, role, last_seen_at)'
      )
      .single();

    setSubmitting(false);
    if (error) {
      setDraft(text);
      showToast(error.message, 'error');
      return;
    }

    if (data) {
      const created = data as unknown as PostComment;
      setComments((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
      onCommentCountDelta?.(postId, 1);

      await saveMentions({
        actorId: user.id,
        text,
        selectedMentions: mentionSnapshot,
        postId,
        commentId: created.id,
      });

      if (postAuthorId && postAuthorId !== user.id) {
        try {
          const since = new Date(Date.now() - 5000).toISOString();
          const { data: existingNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', postAuthorId)
            .eq('actor_id', user.id)
            .eq('kind', 'comment')
            .eq('post_id', postId)
            .gte('created_at', since)
            .limit(1);
          if (!existingNotif || existingNotif.length === 0) {
            await supabase.from('notifications').insert({
              user_id: postAuthorId,
              actor_id: user.id,
              kind: 'comment',
              post_id: postId,
              read: false,
            });
          }
        } catch {
          // Handled by trigger or RLS
        }
      }
    }
  };

  const handleDeleteComment = async (comment: PostComment) => {
    const { error } = await supabase.from('post_comments').delete().eq('id', comment.id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
    onCommentCountDelta?.(postId, -1);
  };

  const renderCommentItem = (c: PostComment, isReply = false) => {
    const isOwn = c.user_id === user?.id;
    const canDelete = isAdmin || isOwn;
    const online = isUserOnline(c.user_id, c.profiles?.last_seen_at);
    const authorName = c.profiles?.full_name || 'Youth Member';

    return (
      <div
        key={c.id}
        className={`flex items-start gap-2.5 rounded-2xl p-3 bg-black/5 dark:bg-[#080610]/55 border border-[#D4AF37]/15 ${
          isReply ? 'ml-8 border-l-2 border-l-[#8B24FF]/70' : ''
        }`}
      >
        {isReply && <CornerDownRight className="w-3.5 h-3.5 text-[#C7A4FF]/60 mt-2 shrink-0" />}
        <button
          type="button"
          onClick={() => {
            onClose();
            openProfile(c.user_id);
          }}
          className="relative shrink-0"
          aria-label={`Open ${authorName} profile`}
        >
          {c.profiles?.avatar_url ? (
            <img
              src={c.profiles.avatar_url}
              alt={authorName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]/50"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#31005F] border border-[#D4AF37]/50 flex items-center justify-center text-xs font-bold text-[#F5D88A]">
              {(authorName[0] ?? 'Y').toUpperCase()}
            </div>
          )}
          {online && (
            <span
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080610]"
              title="Online"
            />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                openProfile(c.user_id);
              }}
              className="font-semibold text-sm text-slate-900 dark:text-[#F5D88A] hover:underline truncate"
            >
              {authorName}
            </button>
            <span className="text-[11px] text-slate-500 dark:text-[#C7A4FF]/70 tabular-nums shrink-0">
              {formatRelativeTime(c.created_at)}
            </span>
          </div>
          <p className="mt-1 text-sm sm:text-base text-slate-800 dark:text-[#F5F1FF] whitespace-pre-wrap break-words">
            <RichMentionText text={c.content} />
          </p>
          {!isSuspended && (
            <button
              type="button"
              onClick={() => setReplyTo(c)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-royal-ui font-semibold text-[#8B24FF] dark:text-[#C7A4FF] hover:text-[#F5D88A]"
            >
              <Reply className="w-3 h-3" />
              <span>Reply</span>
            </button>
          )}
        </div>

        <SafetyActionMenu
          targetType="comment"
          targetId={c.id}
          targetUserId={c.user_id}
          targetUserName={authorName}
          isOwn={isOwn}
          canDelete={canDelete}
          onDelete={() => handleDeleteComment(c)}
          onReport={() =>
            openReportModal({
              targetType: 'comment',
              targetId: c.id,
              targetUserId: c.user_id,
              label: 'comment',
            })
          }
          onBlock={() =>
            openBlockModal({
              userId: c.user_id,
              userName: authorName,
            })
          }
        />
      </div>
    );
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[85dvh] royal-glass-elevated rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#D4AF37]/25 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-royal-serif text-lg font-bold text-[#F5D88A]">
              Comments ({visibleComments.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#C7A4FF] hover:text-white"
            aria-label="Close comments"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-royal-body">
          {loading ? (
            <SkeletonCard lines={3} />
          ) : visibleComments.length === 0 ? (
            <p className="text-center text-base text-slate-500 dark:text-[#C7A4FF] py-8">
              No comments yet. Share a word of encouragement!
            </p>
          ) : (
            topLevel.map((parent) => (
              <div key={parent.id} className="space-y-2">
                {renderCommentItem(parent, false)}
                {(repliesByParent.get(parent.id) || []).map((child) =>
                  renderCommentItem(child, true)
                )}
              </div>
            ))
          )}
        </div>

        {typingBanner && (
          <div className="px-4 py-1.5 border-t border-[#D4AF37]/15 bg-[#1B0835]/80 flex items-center gap-2 text-xs font-royal-ui text-[#F5D88A] shrink-0">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5D88A] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5D88A] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5D88A] animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>{typingBanner}...</span>
          </div>
        )}

        {replyTo && (
          <div className="px-4 py-2 border-t border-[#D4AF37]/20 bg-[#31005F]/50 flex items-center justify-between gap-2 text-xs font-royal-ui text-[#F5D88A] shrink-0">
            <span className="truncate">
              Replying to <strong>{replyTo.profiles?.full_name || 'Youth Member'}</strong>
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="p-1 text-[#C7A4FF] hover:text-white"
              aria-label="Cancel reply"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form
          onSubmit={handleAddComment}
          className="p-3 border-t border-[#D4AF37]/25 flex items-center gap-2 bg-black/10 dark:bg-[#080610]/75 pb-safe shrink-0"
        >
          <MentionInput
            value={draft}
            onChange={handleDraftChange}
            onMentionsChange={setSelectedMentions}
            disabled={isSuspended}
            dropdownPosition="above"
            placeholder={
              isSuspended
                ? 'Account suspended (read-only)'
                : replyTo
                ? `Reply to ${replyTo.profiles?.full_name?.split(' ')[0] || 'member'} (@ to mention)...`
                : 'Write a comment (@ to mention)...'
            }
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting || !draft.trim() || isSuspended}
            className="min-w-[44px] min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 shrink-0"
            aria-label="Post comment"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
