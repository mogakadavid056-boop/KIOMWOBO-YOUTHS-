import React from 'react';
import { MessageCircle, Repeat2, Share2 } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { POST_CATEGORIES, type Post, type ReactionType } from '@/src/types/database';
import { formatRelativeTime } from './CommentsBottomSheet';
import { GlassCard } from './GlassCard';
import { RichMentionText } from './MentionInput';
import { ReactionButton, ReactionSummaryBar } from './ReactionPicker';
import { SafetyActionMenu } from './SafetyModals';

interface PostCardProps {
  post: Post;
  likesCount: number;
  commentsCount: number;
  sharesCount?: number;
  myReaction?: ReactionType | null;
  reactionCounts?: Partial<Record<ReactionType, number>>;
  onReact: (post: Post, reaction: ReactionType) => void;
  onOpenComments: (post: Post) => void;
  onShare: (post: Post) => void;
  onDelete: (post: Post) => void;
  onToggleHide: (post: Post) => void;
  onBlockedAuthor?: () => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  likesCount,
  commentsCount,
  sharesCount = 0,
  myReaction,
  reactionCounts,
  onReact,
  onOpenComments,
  onShare,
  onDelete,
  onToggleHide,
  onBlockedAuthor,
}) => {
  const { user, isAdmin } = useAuth();
  const {
    openProfile,
    openPost,
    isUserOnline,
    unviewedStoryUserIds,
    openReportModal,
    openBlockModal,
  } = useSocial();

  const isAuthor = post.user_id === user?.id;
  const canDelete = isAuthor || isAdmin;
  const authorName = post.profiles?.full_name || 'Youth Member';
  const churchLabel = post.churches?.name || 'Whole District';
  const authorOnline = isUserOnline(post.user_id, post.profiles?.last_seen_at);
  const hasUnviewedStory = unviewedStoryUserIds.has(post.user_id);

  const categoryMeta = POST_CATEGORIES.find(
    (c) => c.id.toLowerCase() === (post.category || '').toLowerCase()
  );

  return (
    <GlassCard className={`space-y-3.5 ${post.hidden ? 'opacity-60 border-red-400/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => openProfile(post.user_id)}
            className="relative shrink-0 rounded-full focus:outline-none"
            aria-label={`View ${authorName} profile`}
          >
            <div
              className={`rounded-full p-0.5 ${
                hasUnviewedStory
                  ? 'bg-gradient-to-br from-[#F5D88A] via-[#D4AF37] to-[#8B24FF]'
                  : 'bg-transparent'
              }`}
            >
              {post.profiles?.avatar_url ? (
                <img
                  src={post.profiles.avatar_url}
                  alt={authorName}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full object-cover border border-[#D4AF37]/60 bg-[#080610]"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-[#31005F] border border-[#D4AF37]/60 flex items-center justify-center font-royal-ui font-bold text-[#F5D88A]">
                  {authorName[0]?.toUpperCase() || 'Y'}
                </div>
              )}
            </div>
            {authorOnline && (
              <span
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#120822]"
                title="Online"
              />
            )}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <button
                type="button"
                onClick={() => openProfile(post.user_id)}
                className="font-semibold text-base text-slate-900 dark:text-[#F5F1FF] hover:text-[#8B24FF] dark:hover:text-[#F5D88A] transition text-left truncate"
              >
                {authorName}
              </button>
              {categoryMeta && (
                <span className="px-2 py-0.5 rounded-md bg-[#31005F]/65 border border-[#D4AF37]/35 font-royal-ui text-[10px] font-bold uppercase tracking-wide text-[#F5D88A] shrink-0">
                  {categoryMeta.label}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-[#C7A4FF]/80">
              <span>{churchLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatRelativeTime(post.created_at)}</span>
              {authorOnline && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-500 dark:text-emerald-400 font-semibold">Online</span>
                </>
              )}
              {post.hidden && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-400 font-semibold">Hidden</span>
                </>
              )}
            </div>
          </div>
        </div>

        <SafetyActionMenu
          targetType="post"
          targetId={post.id}
          targetUserId={post.user_id}
          targetUserName={authorName}
          isOwn={isAuthor}
          canDelete={canDelete}
          canHide={isAdmin}
          isHidden={Boolean(post.hidden)}
          onDelete={() => onDelete(post)}
          onToggleHide={() => onToggleHide(post)}
          onReport={() =>
            openReportModal({
              targetType: 'post',
              targetId: post.id,
              targetUserId: post.user_id,
              label: 'post',
            })
          }
          onBlock={() =>
            openBlockModal({
              userId: post.user_id,
              userName: authorName,
              onBlocked: onBlockedAuthor,
            })
          }
        />
      </div>

      {post.content && (
        <p className="font-royal-body text-base leading-relaxed text-slate-800 dark:text-[#F5F1FF] whitespace-pre-wrap break-words">
          <RichMentionText text={post.content} />
        </p>
      )}

      {post.image_url && (
        <div className="overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-black/20">
          <img
            src={post.image_url}
            alt="Post attachment"
            referrerPolicy="no-referrer"
            className="w-full max-h-[420px] object-cover"
          />
        </div>
      )}

      {/* Quoted Shared Post Card */}
      {post.shared_post && (
        <button
          type="button"
          onClick={() => openPost(post.shared_post!.id)}
          className="w-full text-left rounded-2xl p-3.5 bg-black/15 dark:bg-[#080610]/65 border border-[#D4AF37]/30 hover:border-[#F5D88A]/70 transition space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Repeat2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span className="text-xs font-royal-ui font-bold text-[#B8891B] dark:text-[#F5D88A] truncate">
                {post.shared_post.profiles?.full_name || 'Youth Member'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-[#C7A4FF]/70 tabular-nums shrink-0">
              {formatRelativeTime(post.shared_post.created_at)}
            </span>
          </div>
          {post.shared_post.content && (
            <p className="text-sm text-slate-700 dark:text-[#F5F1FF]/90 line-clamp-4 whitespace-pre-wrap break-words">
              <RichMentionText text={post.shared_post.content} />
            </p>
          )}
          {post.shared_post.image_url && (
            <img
              src={post.shared_post.image_url}
              alt="Shared attachment"
              referrerPolicy="no-referrer"
              className="w-full max-h-48 rounded-xl object-cover border border-[#D4AF37]/20"
            />
          )}
          <span className="inline-block text-[11px] font-royal-ui font-semibold text-[#8B24FF] dark:text-[#C7A4FF]">
            View original post →
          </span>
        </button>
      )}

      <ReactionSummaryBar
        reactionCounts={reactionCounts}
        totalReactions={likesCount}
        commentsCount={commentsCount}
        sharesCount={sharesCount}
        onOpenComments={() => onOpenComments(post)}
      />

      <div className="pt-2 border-t border-[#D4AF37]/20 grid grid-cols-3 gap-2">
        <ReactionButton
          myReaction={myReaction}
          totalCount={likesCount}
          onReact={(r) => onReact(post, r)}
        />

        <button
          type="button"
          onClick={() => onOpenComments(post)}
          className="min-h-[44px] px-2.5 rounded-xl border border-[#D4AF37]/25 text-slate-700 dark:text-[#C7A4FF] hover:bg-[#31005F]/25 font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
        >
          <MessageCircle className="w-4 h-4 text-[#D4AF37]" />
          <span className="truncate tabular-nums">Comment</span>
        </button>

        <button
          type="button"
          onClick={() => onShare(post)}
          className="min-h-[44px] px-2.5 rounded-xl border border-[#D4AF37]/25 text-slate-700 dark:text-[#C7A4FF] hover:bg-[#31005F]/25 font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
        >
          <Share2 className="w-4 h-4 text-[#D4AF37]" />
          <span className="truncate">Share</span>
        </button>
      </div>
    </GlassCard>
  );
};
