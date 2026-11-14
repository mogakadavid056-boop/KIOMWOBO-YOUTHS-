import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, MessageSquareText, Send, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { compressImageFile, generateUuid } from '@/src/lib/mediaUtils';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { STORY_PREFIX, isStoryPostContent } from '@/src/lib/stories';
import {
  POST_CATEGORIES,
  type Post,
  type PostCategory,
  type PostReactionCount,
  type PostStat,
  REACTION_META,
  type ReactionType,
} from '@/src/types/database';
import { CommentsBottomSheet } from '@/src/components/CommentsBottomSheet';
import { GlassCard } from '@/src/components/GlassCard';
import {
  MentionInput,
  type SelectedMention,
  saveMentions,
} from '@/src/components/MentionInput';
import { PostCard } from '@/src/components/PostCard';
import { SharePostModal } from '@/src/components/SharePostModal';
import { StoriesBar } from '@/src/components/StoriesBar';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

type FeedTab = 'district' | 'church' | 'following';
type CategoryFilter = 'all' | PostCategory;
const PAGE_SIZE = 12;

export const CommunityPage: React.FC = () => {
  const { user, profile, isAdmin, isSuspended } = useAuth();
  const { focusedPostId, setFocusedPostId, blockedUserIds } = useSocial();
  const { showToast } = useToast();

  const [tab, setTab] = useState<FeedTab>('district');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [focusedPost, setFocusedPost] = useState<Post | null>(null);
  const [postStats, setPostStats] = useState<
    Record<string, { likes: number; comments: number; shares: number }>
  >({});
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType>>({});
  const [reactionBreakdown, setReactionBreakdown] = useState<
    Record<string, Partial<Record<ReactionType, number>>>
  >({});

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<SelectedMention[]>([]);
  const [category, setCategory] = useState<PostCategory>('general');
  const [audience, setAudience] = useState<'district' | 'church'>('district');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hydrateSharedPosts = useCallback(async (rows: Post[]): Promise<Post[]> => {
    const sharedIds = Array.from(
      new Set(rows.map((r) => r.shared_post_id).filter((id): id is string => Boolean(id)))
    );
    if (sharedIds.length === 0) return rows;

    const { data: originals } = await supabase
      .from('posts')
      .select(
        'id, user_id, church_id, content, image_url, category, hidden, created_at, profiles!user_id(id, full_name, avatar_url, role, title, church_id, last_seen_at), churches(id, name)'
      )
      .in('id', sharedIds);

    const origMap = new Map<string, Post>();
    for (const orig of (originals as unknown as Post[]) || []) {
      origMap.set(orig.id, orig);
    }

    return rows.map((r) =>
      r.shared_post_id ? { ...r, shared_post: origMap.get(r.shared_post_id) || null } : r
    );
  }, []);

  const enrichStatsAndReactions = useCallback(
    async (rows: Post[]) => {
      if (rows.length === 0) return;
      const ids = rows.map((r) => r.id);
      const [statsRes, countsRes, myRes] = await Promise.all([
        supabase
          .from('post_stats')
          .select('post_id, likes, comments, shares')
          .in('post_id', ids),
        supabase
          .from('post_reaction_counts')
          .select('*')
          .in('post_id', ids),
        user?.id
          ? supabase
              .from('post_likes')
              .select('post_id, reaction')
              .eq('user_id', user.id)
              .in('post_id', ids)
          : Promise.resolve({ data: [], error: null }),
      ]);

      setPostStats((prev) => {
        const next = { ...prev };
        for (const s of (statsRes.data as PostStat[]) || []) {
          next[s.post_id] = {
            likes: Number(s.likes || 0),
            comments: Number(s.comments || 0),
            shares: Number(s.shares || 0),
          };
        }
        return next;
      });

      if (!countsRes.error && countsRes.data) {
        setReactionBreakdown((prev) => {
          const next = { ...prev };
          for (const pid of ids) {
            next[pid] = {};
          }
          for (const row of countsRes.data as PostReactionCount[]) {
            if (!next[row.post_id]) next[row.post_id] = {};
            if (row.reaction && typeof row.count === 'number') {
              next[row.post_id][row.reaction] = Number(row.count);
            } else {
              if (row.like_count) next[row.post_id].like = Number(row.like_count);
              if (row.love_count) next[row.post_id].love = Number(row.love_count);
              if (row.pray_count) next[row.post_id].pray = Number(row.pray_count);
              if (row.fire_count) next[row.post_id].fire = Number(row.fire_count);
            }
          }
          return next;
        });
      }

      setMyReactions((prev) => {
        const next = { ...prev };
        for (const l of (myRes.data as { post_id: string; reaction?: ReactionType }[]) || []) {
          next[l.post_id] = l.reaction || 'like';
        }
        return next;
      });
    },
    [user?.id]
  );

  useEffect(() => {
    if (!focusedPostId || !isSupabaseConfigured) {
      setFocusedPost(null);
      return;
    }
    supabase
      .from('posts')
      .select(
        'id, user_id, church_id, content, image_url, category, shared_post_id, hidden, created_at, profiles!user_id(id, full_name, avatar_url, role, title, church_id, last_seen_at), churches(id, name)'
      )
      .eq('id', focusedPostId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data) {
          const [hydrated] = await hydrateSharedPosts([data as unknown as Post]);
          setFocusedPost(hydrated);
          enrichStatsAndReactions([hydrated]);
        }
      });
  }, [focusedPostId, hydrateSharedPosts, enrichStatsAndReactions]);

  const loadFeed = useCallback(
    async (offset: number, reset: boolean) => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        let followingIds: string[] | null = null;
        if (tab === 'following') {
          if (!user?.id) {
            setPosts([]);
            setHasMore(false);
            setLoading(false);
            setLoadingMore(false);
            return;
          }
          const { data: followRows, error: fErr } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);

          if (fErr) {
            setError(fErr.message);
            setLoading(false);
            setLoadingMore(false);
            return;
          }
          followingIds = ((followRows as { following_id: string }[]) || []).map(
            (r) => r.following_id
          );
          if (followingIds.length === 0) {
            setPosts([]);
            setHasMore(false);
            setLoading(false);
            setLoadingMore(false);
            return;
          }
        }

        let query = supabase
          .from('posts')
          .select(
            'id, user_id, church_id, content, image_url, category, shared_post_id, hidden, created_at, profiles!user_id(id, full_name, avatar_url, role, title, church_id, last_seen_at), churches(id, name)'
          )
          .not('content', 'like', `${STORY_PREFIX}%`)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (!isAdmin) {
          query = query.eq('hidden', false);
        }

        if (categoryFilter !== 'all') {
          query = query.eq('category', categoryFilter);
        }

        if (tab === 'church') {
          if (!profile?.church_id) {
            setPosts([]);
            setHasMore(false);
            setLoading(false);
            setLoadingMore(false);
            return;
          }
          query = query.eq('church_id', profile.church_id);
        } else if (tab === 'following' && followingIds) {
          query = query.in('user_id', followingIds);
        }

        const { data, error: err } = await query;
        if (err) {
          setError(err.message);
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        const rawRows = (data as unknown as Post[]) || [];
        const filteredRows = rawRows.filter((r) => !isStoryPostContent(r.content));
        const hydratedRows = await hydrateSharedPosts(filteredRows);

        setHasMore(rawRows.length === PAGE_SIZE);
        setPosts((prev) => {
          if (reset) return hydratedRows;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...hydratedRows.filter((r) => !seen.has(r.id))];
        });
        await enrichStatsAndReactions(hydratedRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load community feed');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab, categoryFilter, user?.id, profile?.church_id, isAdmin, hydrateSharedPosts, enrichStatsAndReactions]
  );

  useEffect(() => {
    setHasMore(true);
    loadFeed(0, true);
  }, [tab, categoryFilter, loadFeed]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadFeed(posts.length, false);
        }
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, posts.length, loadFeed]);

  const handleSelectImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearSelectedImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuspended) {
      showToast('Your account is suspended. You can read but not post.', 'error');
      return;
    }
    if (!user || (!content.trim() && !imageFile)) return;
    setPosting(true);

    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const compressed = await compressImageFile(imageFile, 1280);
        const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${user.id}/post-${generateUuid()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('gallery')
          .upload(path, compressed, { upsert: false, contentType: compressed.type || 'image/jpeg' });
        if (upErr) {
          showToast(upErr.message, 'error');
          setPosting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const targetChurchId = audience === 'church' ? profile?.church_id || null : null;
      const cleanText = content.trim();
      const mentionSnapshot = [...selectedMentions];

      const { data: created, error: insErr } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          church_id: targetChurchId,
          content: cleanText,
          image_url: imageUrl,
          category,
          hidden: false,
        })
        .select(
          'id, user_id, church_id, content, image_url, category, shared_post_id, hidden, created_at, profiles!user_id(id, full_name, avatar_url, role, title, church_id, last_seen_at), churches(id, name)'
        )
        .single();

      if (insErr) {
        showToast(insErr.message, 'error');
        setPosting(false);
        return;
      }

      if (created) {
        const newPost = created as unknown as Post;
        setPosts((prev) => [newPost, ...prev]);
        setPostStats((prev) => ({
          ...prev,
          [newPost.id]: { likes: 0, comments: 0, shares: 0 },
        }));
        await saveMentions({
          actorId: user.id,
          text: cleanText,
          selectedMentions: mentionSnapshot,
          postId: newPost.id,
        });
      }
      setContent('');
      setSelectedMentions([]);
      setCategory('general');
      clearSelectedImage();
      showToast('Post published to Community!', 'success');
    } finally {
      setPosting(false);
    }
  };

  const handleReact = async (post: Post, chosen: ReactionType) => {
    if (!user) return;
    if (isSuspended) {
      showToast('Your account is suspended.', 'error');
      return;
    }

    const prevReaction = myReactions[post.id] || null;
    const prevStatsSnapshot = postStats[post.id] || { likes: 0, comments: 0, shares: 0 };
    const prevBreakdownSnapshot = { ...(reactionBreakdown[post.id] || {}) };
    const isRemoving = prevReaction === chosen;

    setMyReactions((prev) => {
      const next = { ...prev };
      if (isRemoving) delete next[post.id];
      else next[post.id] = chosen;
      return next;
    });

    setPostStats((prev) => {
      const cur = prev[post.id] || { likes: 0, comments: 0, shares: 0 };
      const delta = isRemoving ? -1 : prevReaction ? 0 : 1;
      return {
        ...prev,
        [post.id]: { ...cur, likes: Math.max(0, cur.likes + delta) },
      };
    });

    setReactionBreakdown((prev) => {
      const cur = { ...(prev[post.id] || {}) };
      if (prevReaction) {
        cur[prevReaction] = Math.max(0, (cur[prevReaction] || 1) - 1);
      }
      if (!isRemoving) {
        cur[chosen] = (cur[chosen] || 0) + 1;
      }
      return { ...prev, [post.id]: cur };
    });

    const rollbackReaction = () => {
      setMyReactions((prev) => {
        const next = { ...prev };
        if (prevReaction) next[post.id] = prevReaction;
        else delete next[post.id];
        return next;
      });
      setPostStats((prev) => ({ ...prev, [post.id]: prevStatsSnapshot }));
      setReactionBreakdown((prev) => ({ ...prev, [post.id]: prevBreakdownSnapshot }));
    };

    if (isRemoving) {
      const { error: err } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', user.id);
      if (err) {
        rollbackReaction();
        showToast(err.message, 'error');
      }
    } else {
      const { error: err } = await supabase
        .from('post_likes')
        .upsert(
          { post_id: post.id, user_id: user.id, reaction: chosen },
          { onConflict: 'post_id,user_id' }
        );
      if (err) {
        rollbackReaction();
        showToast(err.message, 'error');
      } else if (post.user_id !== user.id) {
        try {
          await supabase.from('notifications').insert({
            user_id: post.user_id,
            actor_id: user.id,
            kind: 'like',
            post_id: post.id,
            meta: { reaction: chosen, emoji: REACTION_META[chosen].emoji },
            read: false,
          });
        } catch {
          // Trigger or RLS
        }
      }
    }
  };

  const handleDeletePost = async (post: Post) => {
    const { error: err } = await supabase.from('posts').delete().eq('id', post.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    if (focusedPost?.id === post.id) {
      setFocusedPost(null);
      setFocusedPostId(null);
    }
    showToast('Post deleted.', 'info');
  };

  const handleToggleHidePost = async (post: Post) => {
    const nextHidden = !post.hidden;
    const { error: err } = await supabase
      .from('posts')
      .update({ hidden: nextHidden })
      .eq('id', post.id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, hidden: nextHidden } : p)));
    showToast(nextHidden ? 'Post hidden.' : 'Post visible.', 'info');
  };

  const visiblePosts = useMemo(
    () => posts.filter((p) => !blockedUserIds.has(p.user_id)),
    [posts, blockedUserIds]
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
          Community Feed
        </h1>
        <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
          Share your testimony or experience across Kiomwobo District
        </p>
      </div>

      {focusedPost && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setFocusedPost(null);
              setFocusedPostId(null);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-[#F5D88A]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to full feed</span>
          </button>

          <PostCard
            post={focusedPost}
            likesCount={postStats[focusedPost.id]?.likes ?? 0}
            commentsCount={postStats[focusedPost.id]?.comments ?? 0}
            sharesCount={postStats[focusedPost.id]?.shares ?? 0}
            myReaction={myReactions[focusedPost.id] || null}
            reactionCounts={reactionBreakdown[focusedPost.id]}
            onReact={handleReact}
            onOpenComments={(p) => setCommentPost(p)}
            onShare={(p) => setSharePost(p)}
            onDelete={handleDeletePost}
            onToggleHide={handleToggleHidePost}
          />
        </div>
      )}

      {!focusedPost && (
        <>
          <StoriesBar />

          {!isSuspended && (
            <GlassCard elevated>
              <form onSubmit={handleCreatePost} className="space-y-3">
                <MentionInput
                  multiline
                  rows={3}
                  value={content}
                  onChange={setContent}
                  onMentionsChange={setSelectedMentions}
                  placeholder="Share your testimony or experience... (type @ to mention a member)"
                  className="w-full p-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 font-royal-body text-base text-slate-900 dark:text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF]"
                />

                {/* Category Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {POST_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`min-h-[34px] px-3 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                        category === cat.id
                          ? 'bg-[#8B24FF] text-white border border-[#F5D88A]/50 violet-glow'
                          : 'bg-black/10 dark:bg-[#080610]/55 border border-[#D4AF37]/25 text-slate-700 dark:text-[#C7A4FF]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {imagePreview && (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Selected preview"
                      className="max-h-56 rounded-xl border border-[#D4AF37]/40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearSelectedImage}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/75 text-white flex items-center justify-center"
                      aria-label="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleSelectImage}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[44px] px-3.5 rounded-xl border border-[#D4AF37]/35 text-xs font-royal-ui font-semibold text-slate-800 dark:text-[#F5D88A] inline-flex items-center gap-1.5 hover:bg-[#31005F]/30"
                    >
                      <ImagePlus className="w-4 h-4" />
                      <span>Photo</span>
                    </button>

                    <select
                      value={audience}
                      onChange={(e) => setAudience(e.target.value as 'district' | 'church')}
                      aria-label="Post audience"
                      className="min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/35 text-xs font-royal-ui font-semibold text-slate-900 dark:text-[#F5F1FF]"
                    >
                      <option value="district">Whole District</option>
                      {profile?.church_id && <option value="church">My Church</option>}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={posting || (!content.trim() && !imageFile)}
                    className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{posting ? 'Posting...' : 'Post'}</span>
                  </button>
                </div>
              </form>
            </GlassCard>
          )}

          {/* Audience Tabs */}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'district', label: 'District' },
                { id: 'church', label: 'My Church' },
                { id: 'following', label: 'Following' },
              ] as { id: FeedTab; label: string }[]
            ).map((tItem) => (
              <button
                key={tItem.id}
                type="button"
                onClick={() => setTab(tItem.id)}
                className={`min-h-[44px] px-3 rounded-xl font-royal-ui text-xs font-semibold transition ${
                  tab === tItem.id
                    ? 'bg-[#8B24FF] text-white violet-glow'
                    : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
                }`}
              >
                {tItem.label}
              </button>
            ))}
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`min-h-[36px] px-3.5 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                categoryFilter === 'all'
                  ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60'
                  : 'royal-glass text-slate-600 dark:text-[#C7A4FF]'
              }`}
            >
              All
            </button>
            {POST_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`min-h-[36px] px-3.5 rounded-xl font-royal-ui text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                  categoryFilter === cat.id
                    ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60'
                    : 'royal-glass text-slate-600 dark:text-[#C7A4FF]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-4">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => loadFeed(0, true)} />
          ) : visiblePosts.length === 0 ? (
            <EmptyState
              title="No posts yet, be the first!"
              description={
                tab === 'following'
                  ? 'Follow youth members from the directory or feed to see their posts here.'
                  : 'Share your testimony or experience'
              }
              icon={<MessageSquareText className="w-6 h-6" />}
            />
          ) : (
            <div className="space-y-4">
              {visiblePosts.map((post) => {
                const st = postStats[post.id] || { likes: 0, comments: 0, shares: 0 };
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    likesCount={st.likes}
                    commentsCount={st.comments}
                    sharesCount={st.shares}
                    myReaction={myReactions[post.id] || null}
                    reactionCounts={reactionBreakdown[post.id]}
                    onReact={handleReact}
                    onOpenComments={(p) => setCommentPost(p)}
                    onShare={(p) => setSharePost(p)}
                    onDelete={handleDeletePost}
                    onToggleHide={handleToggleHidePost}
                  />
                );
              })}

              <div ref={sentinelRef} className="h-6" />
              {loadingMore && <SkeletonCard lines={2} />}
            </div>
          )}
        </>
      )}

      <CommentsBottomSheet
        postId={commentPost?.id || null}
        postAuthorId={commentPost?.user_id}
        onClose={() => setCommentPost(null)}
        onCommentCountDelta={(pid, delta) =>
          setPostStats((prev) => {
            const cur = prev[pid] || { likes: 0, comments: 0, shares: 0 };
            return { ...prev, [pid]: { ...cur, comments: Math.max(0, cur.comments + delta) } };
          })
        }
      />

      <SharePostModal
        post={sharePost}
        onClose={() => setSharePost(null)}
        onShared={(created) => {
          setPosts((prev) => [created, ...prev]);
          if (created.shared_post_id) {
            setPostStats((prev) => {
              const orig = prev[created.shared_post_id!] || {
                likes: 0,
                comments: 0,
                shares: 0,
              };
              return {
                ...prev,
                [created.shared_post_id!]: { ...orig, shares: orig.shares + 1 },
              };
            });
          }
        }}
      />
    </div>
  );
};
