import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Crown,
  Edit3,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Phone,
  Settings,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { STORY_PREFIX, isStoryPostContent } from '@/src/lib/stories';
import {
  type AppRoute,
  type Post,
  type PostReactionCount,
  type PostStat,
  type Profile,
  type ProfileStats,
  REACTION_META,
  type ReactionType,
  ROLE_LABELS,
} from '@/src/types/database';
import { CommentsBottomSheet } from '@/src/components/CommentsBottomSheet';
import { GlassCard } from '@/src/components/GlassCard';
import { PostCard } from '@/src/components/PostCard';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';
import { SafetyActionMenu } from '@/src/components/SafetyModals';
import { SharePostModal } from '@/src/components/SharePostModal';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

interface ProfilePageProps {
  onNavigate: (route: AppRoute) => void;
}

type ProfileTab = 'posts' | 'about' | 'followers' | 'following';

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { user, profile: myProfile, churches, isAdmin, isSuspended, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const {
    viewingProfileId,
    setViewingProfileId,
    openProfile,
    openConversation,
    isUserOnline,
    getPresenceLabel,
    blockedUserIds,
    unviewedStoryUserIds,
    openReportModal,
    openBlockModal,
  } = useSocial();
  const { showToast } = useToast();

  const targetUserId = viewingProfileId || user?.id || '';
  const isOwnProfile = Boolean(user?.id && targetUserId === user.id);

  const [viewedProfile, setViewedProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats>({
    user_id: targetUserId,
    followers: 0,
    following: 0,
    posts: 0,
  });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  const [posts, setPosts] = useState<Post[]>([]);
  const [postStats, setPostStats] = useState<
    Record<string, { likes: number; comments: number; shares: number }>
  >({});
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType>>({});
  const [reactionBreakdown, setReactionBreakdown] = useState<
    Record<string, Partial<Record<ReactionType, number>>>
  >({});
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [sharePost, setSharePost] = useState<Post | null>(null);

  const [followersList, setFollowersList] = useState<Profile[]>([]);
  const [followingList, setFollowingList] = useState<Profile[]>([]);
  const [myFollowingIds, setMyFollowingIds] = useState<Set<string>>(new Set());
  const [togglingPersonId, setTogglingPersonId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Male');
  const [churchId, setChurchId] = useState('');
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const loadProfileData = useCallback(async () => {
    if (!targetUserId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        profRes,
        statsRes,
        followCheckRes,
        followersCountRes,
        followingCountRes,
        postsCountRes,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, full_name, phone, gender, church_id, role, avatar_url, cover_url, title, bio, last_seen_at, status, created_at, churches(id, name)'
          )
          .eq('id', targetUserId)
          .single(),
        supabase
          .from('profile_stats')
          .select('user_id, followers, following, posts')
          .eq('user_id', targetUserId)
          .maybeSingle(),
        user?.id && targetUserId !== user.id
          ? supabase
              .from('follows')
              .select('follower_id')
              .eq('follower_id', user.id)
              .eq('following_id', targetUserId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('follows')
          .select('follower_id', { count: 'exact', head: true })
          .eq('following_id', targetUserId),
        supabase
          .from('follows')
          .select('following_id', { count: 'exact', head: true })
          .eq('follower_id', targetUserId),
        supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', targetUserId)
          .not('content', 'like', `${STORY_PREFIX}%`),
      ]);

      if (profRes.error) {
        setError(profRes.error.message);
        setLoading(false);
        return;
      }

      const loaded = profRes.data as unknown as Profile;
      setViewedProfile(loaded);

      const viewStats = statsRes.data as ProfileStats | null;
      setStats({
        user_id: targetUserId,
        followers:
          typeof followersCountRes.count === 'number'
            ? followersCountRes.count
            : Number(viewStats?.followers || 0),
        following:
          typeof followingCountRes.count === 'number'
            ? followingCountRes.count
            : Number(viewStats?.following || 0),
        posts:
          typeof postsCountRes.count === 'number'
            ? postsCountRes.count
            : Number(viewStats?.posts || 0),
      });

      setIsFollowing(Boolean(followCheckRes.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user?.id]);

  const loadUserPosts = useCallback(async () => {
    if (!targetUserId || !isSupabaseConfigured) return;
    setTabLoading(true);

    let query = supabase
      .from('posts')
      .select(
        'id, user_id, church_id, content, image_url, category, shared_post_id, hidden, created_at, profiles!user_id(id, full_name, avatar_url, role, title, church_id, last_seen_at), churches(id, name)'
      )
      .eq('user_id', targetUserId)
      .not('content', 'like', `${STORY_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!isAdmin && !isOwnProfile) {
      query = query.eq('hidden', false);
    }

    const { data, error: err } = await query;
    if (err) {
      showToast(err.message, 'error');
      setTabLoading(false);
      return;
    }

    const rows = ((data as unknown as Post[]) || []).filter((p) => !isStoryPostContent(p.content));

    const sharedIds = Array.from(
      new Set(rows.map((r) => r.shared_post_id).filter((id): id is string => Boolean(id)))
    );
    let hydrated = rows;
    if (sharedIds.length > 0) {
      const { data: origs } = await supabase
        .from('posts')
        .select(
          'id, user_id, church_id, content, image_url, category, hidden, created_at, profiles!user_id(id, full_name, avatar_url, role, title, church_id, last_seen_at), churches(id, name)'
        )
        .in('id', sharedIds);
      const map = new Map<string, Post>();
      for (const o of (origs as unknown as Post[]) || []) map.set(o.id, o);
      hydrated = rows.map((r) =>
        r.shared_post_id ? { ...r, shared_post: map.get(r.shared_post_id) || null } : r
      );
    }

    setPosts(hydrated);

    if (hydrated.length > 0) {
      const ids = hydrated.map((p) => p.id);
      const [statsRes, countsRes, likesRes] = await Promise.all([
        supabase.from('post_stats').select('post_id, likes, comments, shares').in('post_id', ids),
        supabase.from('post_reaction_counts').select('*').in('post_id', ids),
        user?.id
          ? supabase
              .from('post_likes')
              .select('post_id, reaction')
              .eq('user_id', user.id)
              .in('post_id', ids)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const nextStats: Record<string, { likes: number; comments: number; shares: number }> = {};
      for (const s of (statsRes.data as PostStat[]) || []) {
        nextStats[s.post_id] = {
          likes: Number(s.likes || 0),
          comments: Number(s.comments || 0),
          shares: Number(s.shares || 0),
        };
      }
      setPostStats(nextStats);

      const nextBreakdown: Record<string, Partial<Record<ReactionType, number>>> = {};
      for (const row of (countsRes.data as PostReactionCount[]) || []) {
        if (!nextBreakdown[row.post_id]) nextBreakdown[row.post_id] = {};
        if (row.reaction && typeof row.count === 'number') {
          nextBreakdown[row.post_id][row.reaction] = Number(row.count);
        } else {
          if (row.like_count) nextBreakdown[row.post_id].like = Number(row.like_count);
          if (row.love_count) nextBreakdown[row.post_id].love = Number(row.love_count);
          if (row.pray_count) nextBreakdown[row.post_id].pray = Number(row.pray_count);
          if (row.fire_count) nextBreakdown[row.post_id].fire = Number(row.fire_count);
        }
      }
      setReactionBreakdown(nextBreakdown);

      const nextMy: Record<string, ReactionType> = {};
      for (const l of (likesRes.data as { post_id: string; reaction?: ReactionType }[]) || []) {
        nextMy[l.post_id] = l.reaction || 'like';
      }
      setMyReactions(nextMy);
    } else {
      setPostStats({});
      setMyReactions({});
      setReactionBreakdown({});
    }

    setTabLoading(false);
  }, [targetUserId, isAdmin, isOwnProfile, user?.id, showToast]);

  const loadFollowLists = useCallback(
    async (mode: 'followers' | 'following') => {
      if (!targetUserId || !isSupabaseConfigured) return;
      setTabLoading(true);

      if (user?.id) {
        const { data: myRels } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        setMyFollowingIds(
          new Set(((myRels as { following_id: string }[]) || []).map((r) => r.following_id))
        );
      }

      if (mode === 'followers') {
        const { data: rels, error: err } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', targetUserId);
        if (err) {
          showToast(err.message, 'error');
          setTabLoading(false);
          return;
        }
        const ids = ((rels as { follower_id: string }[]) || []).map((r) => r.follower_id);
        if (ids.length === 0) {
          setFollowersList([]);
          setTabLoading(false);
          return;
        }
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role, title, church_id, last_seen_at, churches(id, name)')
          .in('id', ids)
          .order('full_name');
        setFollowersList((profs as unknown as Profile[]) || []);
      } else {
        const { data: rels, error: err } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', targetUserId);
        if (err) {
          showToast(err.message, 'error');
          setTabLoading(false);
          return;
        }
        const ids = ((rels as { following_id: string }[]) || []).map((r) => r.following_id);
        if (ids.length === 0) {
          setFollowingList([]);
          setTabLoading(false);
          return;
        }
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role, title, church_id, last_seen_at, churches(id, name)')
          .in('id', ids)
          .order('full_name');
        setFollowingList((profs as unknown as Profile[]) || []);
      }
      setTabLoading(false);
    },
    [targetUserId, user?.id, showToast]
  );

  useEffect(() => {
    setActiveTab('posts');
    loadProfileData();
  }, [loadProfileData]);

  useEffect(() => {
    if (activeTab === 'posts') loadUserPosts();
    else if (activeTab === 'followers') loadFollowLists('followers');
    else if (activeTab === 'following') loadFollowLists('following');
  }, [activeTab, loadUserPosts, loadFollowLists]);

  useEffect(() => {
    if (isOwnProfile && (viewedProfile || myProfile)) {
      const src = viewedProfile || myProfile;
      if (src) {
        setFullName(src.full_name || '');
        setPhone(src.phone || '');
        setGender(src.gender || 'Male');
        setChurchId(src.church_id || churches[0]?.id || '');
        setTitle(src.title || '');
        setBio(src.bio || '');
      }
    }
  }, [isOwnProfile, viewedProfile, myProfile, churches]);

  const handleImageUpload = async (file: File, kind: 'avatar' | 'cover') => {
    if (!user || !isOwnProfile) return;
    if (!isSupabaseConfigured) {
      showToast('Supabase is not configured.', 'error');
      return;
    }

    if (kind === 'avatar') setUploadingAvatar(true);
    else setUploadingCover(true);

    try {
      const { compressImageFile } = await import('@/src/lib/mediaUtils');
      const compressed = await compressImageFile(file, kind === 'avatar' ? 720 : 1440);
      const path = `${user.id}/${kind === 'avatar' ? 'avatar.jpg' : 'cover.jpg'}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: compressed.type || 'image/jpeg' });

      if (uploadErr) {
        showToast(uploadErr.message, 'error');
        return;
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const cacheBustedUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const updatePayload =
        kind === 'avatar' ? { avatar_url: cacheBustedUrl } : { cover_url: cacheBustedUrl };

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (updateErr) {
        showToast(updateErr.message, 'error');
        return;
      }

      setViewedProfile((prev) => (prev ? { ...prev, ...updatePayload } : prev));
      await refreshProfile();
      showToast(kind === 'avatar' ? 'Profile photo updated.' : 'Cover photo updated.', 'success');
    } finally {
      if (kind === 'avatar') {
        setUploadingAvatar(false);
        if (avatarInputRef.current) avatarInputRef.current.value = '';
      } else {
        setUploadingCover(false);
        if (coverInputRef.current) coverInputRef.current.value = '';
      }
    }
  };

  const handleToggleFollow = async () => {
    if (!user || isOwnProfile || !targetUserId || followBusy) return;
    setFollowBusy(true);
    const next = !isFollowing;
    setIsFollowing(next);
    setStats((prev) => ({
      ...prev,
      followers: Math.max(0, prev.followers + (next ? 1 : -1)),
    }));

    if (next) {
      const { error: err } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: targetUserId });
      if (err) {
        setIsFollowing(false);
        setStats((prev) => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
        showToast(err.message, 'error');
      } else {
        try {
          await supabase.from('notifications').insert({
            user_id: targetUserId,
            actor_id: user.id,
            kind: 'follow',
            read: false,
          });
        } catch {
          // Trigger or RLS
        }
      }
    } else {
      const { error: err } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);
      if (err) {
        setIsFollowing(true);
        setStats((prev) => ({ ...prev, followers: prev.followers + 1 }));
        showToast(err.message, 'error');
      }
    }
    setFollowBusy(false);
  };

  const handleStartMessage = async () => {
    if (!user?.id || !targetUserId || isOwnProfile) return;
    if (isSuspended) {
      showToast('Your account is suspended. You can read but not post or message.', 'error');
      return;
    }
    if (blockedUserIds.has(targetUserId)) {
      showToast('Unblock this user in Settings before messaging.', 'error');
      return;
    }

    setStartingChat(true);
    const { data, error: err } = await supabase.rpc('start_direct_chat', {
      target_user: targetUserId,
    });
    setStartingChat(false);

    if (err || !data) {
      showToast('Follow this person or ask them to follow you to start chatting.', 'info');
      return;
    }
    openConversation(String(data));
  };

  const handleTogglePersonFollow = async (personId: string) => {
    if (!user?.id || personId === user.id || togglingPersonId) return;
    setTogglingPersonId(personId);
    const currentlyFollowing = myFollowingIds.has(personId);

    setMyFollowingIds((prev) => {
      const next = new Set(prev);
      if (currentlyFollowing) next.delete(personId);
      else next.add(personId);
      return next;
    });

    if (isOwnProfile) {
      setStats((prev) => ({
        ...prev,
        following: Math.max(0, prev.following + (currentlyFollowing ? -1 : 1)),
      }));
    }

    if (currentlyFollowing) {
      const { error: err } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', personId);
      if (err) {
        setMyFollowingIds((prev) => new Set(prev).add(personId));
        showToast(err.message, 'error');
      }
    } else {
      const { error: err } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: personId });
      if (err) {
        setMyFollowingIds((prev) => {
          const next = new Set(prev);
          next.delete(personId);
          return next;
        });
        showToast(err.message, 'error');
      } else {
        try {
          await supabase.from('notifications').insert({
            user_id: personId,
            actor_id: user.id,
            kind: 'follow',
            read: false,
          });
        } catch {
          // Trigger or RLS
        }
      }
    }
    setTogglingPersonId(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isOwnProfile) return;
    if (!fullName.trim()) {
      showToast('Full name is required.', 'error');
      return;
    }

    setSaving(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim(),
        gender,
        church_id: churchId || null,
        title: title.trim() || null,
        bio: bio.trim(),
      })
      .eq('id', user.id);
    setSaving(false);

    if (err) {
      showToast(err.message, 'error');
    } else {
      await Promise.all([refreshProfile(), loadProfileData()]);
      setShowEditModal(false);
      showToast('Profile details saved.', 'success');
    }
  };

  const handleReact = async (post: Post, chosen: ReactionType) => {
    if (!user || isSuspended) return;
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
      if (prevReaction) cur[prevReaction] = Math.max(0, (cur[prevReaction] || 1) - 1);
      if (!isRemoving) cur[chosen] = (cur[chosen] || 0) + 1;
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
    setStats((prev) => ({ ...prev, posts: Math.max(0, prev.posts - 1) }));
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
    showToast(nextHidden ? 'Post hidden.' : 'Post restored.', 'info');
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  if (error || !viewedProfile) {
    return (
      <div className="max-w-3xl mx-auto">
        <ErrorState message={error || 'Profile not found.'} onRetry={loadProfileData} />
      </div>
    );
  }

  if (!isOwnProfile && blockedUserIds.has(viewedProfile.id)) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => setViewingProfileId(null)}
          className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-[#F5D88A]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>My Profile</span>
        </button>
        <EmptyState
          title="User blocked"
          description="You blocked this member or their content is hidden. Manage blocked users in Settings."
          actionLabel="Open Settings"
          onAction={() => onNavigate('settings')}
        />
      </div>
    );
  }

  const churchName =
    viewedProfile.churches?.name ||
    churches.find((c) => c.id === viewedProfile.church_id)?.name ||
    'Kiomwobo District';
  const onlineNow = isUserOnline(viewedProfile.id, viewedProfile.last_seen_at);
  const presenceLabel = getPresenceLabel(viewedProfile.id, viewedProfile.last_seen_at);
  const hasStoryRing = unviewedStoryUserIds.has(viewedProfile.id);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {!isOwnProfile && (
        <button
          type="button"
          onClick={() => setViewingProfileId(null)}
          className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-slate-800 dark:text-[#F5D88A]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>My Profile</span>
        </button>
      )}

      <GlassCard elevated padding="none" className="overflow-hidden">
        <div className="relative h-44 sm:h-56 w-full bg-gradient-to-br from-[#31005F] via-[#53069E] to-[#140624] overflow-hidden">
          {viewedProfile.cover_url ? (
            <img
              src={viewedProfile.cover_url}
              alt={`${viewedProfile.full_name} cover`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center opacity-35">
              <Crown className="w-16 h-16 text-[#F5D88A]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080610]/75 via-transparent to-transparent pointer-events-none" />

          {isOwnProfile && (
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f, 'cover');
                }}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingCover}
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-3 right-3 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#080610]/75 backdrop-blur-md border border-[#D4AF37]/50 text-[#F5D88A] font-royal-ui text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#31005F]/90 transition"
              >
                <Camera className="w-4 h-4" />
                <span>{uploadingCover ? 'Uploading...' : 'Edit Cover'}</span>
              </button>
            </>
          )}
        </div>

        <div className="px-5 pb-5">
          <div className="relative -mt-14 sm:-mt-16 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="relative inline-block self-start">
              <div
                className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 ${
                  hasStoryRing
                    ? 'bg-gradient-to-br from-[#F5D88A] via-[#D4AF37] to-[#8B24FF] shadow-[0_0_32px_rgba(212,175,55,0.55)]'
                    : 'bg-gradient-to-br from-[#D4AF37]/60 to-[#31005F]'
                }`}
              >
                {viewedProfile.avatar_url ? (
                  <img
                    src={viewedProfile.avatar_url}
                    alt={viewedProfile.full_name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover bg-[#080610]"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-[#1C0738] flex items-center justify-center font-royal-display text-4xl font-bold text-[#F5D88A]">
                    {(viewedProfile.full_name?.[0] || 'K').toUpperCase()}
                  </div>
                )}
              </div>

              {onlineNow && (
                <span
                  className={`absolute ${isOwnProfile ? 'bottom-1 left-1' : 'bottom-1 right-1'} w-5 h-5 rounded-full bg-emerald-400 border-3 border-[#0E071B] shadow`}
                  title="Online now"
                />
              )}

              {isOwnProfile && (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f, 'avatar');
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 min-w-[40px] min-h-[40px] rounded-full bg-[#8B24FF] hover:bg-[#7A18EB] border-2 border-[#F5D88A] text-white flex items-center justify-center shadow-lg transition"
                    aria-label="Upload avatar"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isOwnProfile ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(true)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-105 transition"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-1.5 font-royal-ui text-xs font-semibold text-slate-800 dark:text-[#F5F1FF]"
                  >
                    <Settings className="w-4 h-4 text-[#D4AF37]" />
                    <span>{t.nav.settings}</span>
                  </button>
                  <PWAInstallButton compact />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={followBusy}
                    onClick={handleToggleFollow}
                    className={`min-h-[44px] px-4 py-2 rounded-xl font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 transition ${
                      isFollowing
                        ? 'royal-glass border-[#D4AF37]/60 text-[#F5D88A]'
                        : 'bg-gradient-to-r from-[#8B24FF] to-[#5B14B8] text-white violet-glow'
                    }`}
                  >
                    {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    <span>{isFollowing ? 'Following' : 'Follow'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={startingChat}
                    onClick={handleStartMessage}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-105 transition disabled:opacity-50"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{startingChat ? '...' : 'Message'}</span>
                  </button>

                  <SafetyActionMenu
                    targetType="user"
                    targetId={viewedProfile.id}
                    targetUserId={viewedProfile.id}
                    targetUserName={viewedProfile.full_name}
                    isOwn={false}
                    onReport={() =>
                      openReportModal({
                        targetType: 'user',
                        targetId: viewedProfile.id,
                        targetUserId: viewedProfile.id,
                        label: viewedProfile.full_name,
                      })
                    }
                    onBlock={() =>
                      openBlockModal({
                        userId: viewedProfile.id,
                        userName: viewedProfile.full_name,
                        onBlocked: () => setViewingProfileId(null),
                      })
                    }
                  />
                </>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-royal-display text-2xl sm:text-3xl font-bold text-gold-gradient">
                {viewedProfile.full_name}
              </h1>
              {onlineNow ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-xs font-royal-ui font-semibold text-emerald-500 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Online</span>
                </span>
              ) : presenceLabel ? (
                <span className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]/75">
                  {presenceLabel}
                </span>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#31005F]/60 border border-[#D4AF37]/40 font-royal-ui text-xs font-semibold text-[#F5D88A]">
                <Crown className="w-3.5 h-3.5 text-[#D4AF37]" />
                {ROLE_LABELS[viewedProfile.role]}
              </span>
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-[#C7A4FF]">
                <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                {churchName}
              </span>
              {viewedProfile.title && (
                <span className="text-slate-700 dark:text-[#F5D88A] font-medium">
                  · {viewedProfile.title}
                </span>
              )}
            </div>

            {viewedProfile.bio && (
              <p className="mt-3 font-royal-body text-base text-slate-700 dark:text-[#F5F1FF]/90 leading-relaxed">
                {viewedProfile.bio}
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-[#D4AF37]/20 grid grid-cols-3 gap-2 text-center">
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className="min-h-[48px] rounded-xl hover:bg-[#31005F]/25 transition py-1.5"
              >
                <p className="font-royal-display text-lg font-bold text-[#B8891B] dark:text-[#F5D88A] tabular-nums">
                  {stats.posts}
                </p>
                <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">Posts</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('followers')}
                className="min-h-[48px] rounded-xl hover:bg-[#31005F]/25 transition py-1.5"
              >
                <p className="font-royal-display text-lg font-bold text-[#B8891B] dark:text-[#F5D88A] tabular-nums">
                  {stats.followers}
                </p>
                <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">Followers</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('following')}
                className="min-h-[48px] rounded-xl hover:bg-[#31005F]/25 transition py-1.5"
              >
                <p className="font-royal-display text-lg font-bold text-[#B8891B] dark:text-[#F5D88A] tabular-nums">
                  {stats.following}
                </p>
                <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">Following</p>
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {(
          [
            { id: 'posts', label: 'Posts' },
            { id: 'about', label: 'About' },
            { id: 'followers', label: `Followers (${stats.followers})` },
            { id: 'following', label: `Following (${stats.following})` },
          ] as { id: ProfileTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[44px] px-1.5 sm:px-2 rounded-xl font-royal-ui text-[11px] sm:text-xs font-semibold transition truncate ${
              activeTab === tab.id
                ? 'bg-[#8B24FF] text-white violet-glow'
                : 'royal-glass text-slate-700 dark:text-[#C7A4FF]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'posts' && (
        <div className="space-y-4">
          {tabLoading ? (
            <SkeletonCard lines={3} />
          ) : posts.length === 0 ? (
            <EmptyState
              title="No posts yet"
              description={
                isOwnProfile
                  ? 'Share a testimony, verse reflection, or photo in the Community feed!'
                  : `${viewedProfile.full_name} has not shared any posts yet.`
              }
              actionLabel={isOwnProfile ? 'Go to Community' : undefined}
              onAction={isOwnProfile ? () => onNavigate('community') : undefined}
              icon={<MessageSquareText className="w-6 h-6" />}
            />
          ) : (
            posts.map((post) => {
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
            })
          )}
        </div>
      )}

      {activeTab === 'about' && (
        <GlassCard className="space-y-4 font-royal-body">
          <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5D88A]">
            About {viewedProfile.full_name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-base">
            <div>
              <p className="text-xs font-royal-ui uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF]/75">
                Church
              </p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-[#F5F1FF]">{churchName}</p>
            </div>
            <div>
              <p className="text-xs font-royal-ui uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF]/75">
                Role
              </p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-[#F5F1FF]">
                {ROLE_LABELS[viewedProfile.role]}
              </p>
            </div>
            {viewedProfile.title && (
              <div>
                <p className="text-xs font-royal-ui uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF]/75">
                  Title
                </p>
                <p className="mt-0.5 font-medium text-slate-900 dark:text-[#F5F1FF]">
                  {viewedProfile.title}
                </p>
              </div>
            )}
            {viewedProfile.gender && (
              <div>
                <p className="text-xs font-royal-ui uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF]/75">
                  Gender
                </p>
                <p className="mt-0.5 font-medium text-slate-900 dark:text-[#F5F1FF]">
                  {viewedProfile.gender}
                </p>
              </div>
            )}
            {viewedProfile.phone && (
              <div>
                <p className="text-xs font-royal-ui uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF]/75">
                  Phone
                </p>
                <a
                  href={`tel:${viewedProfile.phone}`}
                  className="mt-0.5 inline-flex items-center gap-1.5 font-medium text-[#8B24FF] dark:text-[#F5D88A] hover:underline"
                >
                  <Phone className="w-4 h-4" />
                  <span>{viewedProfile.phone}</span>
                </a>
              </div>
            )}
          </div>
          {viewedProfile.bio && (
            <div className="pt-3 border-t border-[#D4AF37]/20">
              <p className="text-xs font-royal-ui uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF]/75">
                Testimony / Bio
              </p>
              <p className="mt-1 text-base text-slate-800 dark:text-[#F5F1FF] whitespace-pre-line">
                {viewedProfile.bio}
              </p>
            </div>
          )}
        </GlassCard>
      )}

      {(activeTab === 'followers' || activeTab === 'following') && (
        <div className="space-y-3">
          {tabLoading ? (
            <SkeletonCard lines={3} />
          ) : (activeTab === 'followers' ? followersList : followingList).length === 0 ? (
            <EmptyState
              title={activeTab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              description="Connect with youth members across Kiomwobo District in the Community feed and Directory."
              icon={<Users className="w-6 h-6" />}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(activeTab === 'followers' ? followersList : followingList).map((person) => {
                const personOnline = isUserOnline(person.id, person.last_seen_at);
                const iFollowPerson = myFollowingIds.has(person.id);
                const isSelf = person.id === user?.id;
                return (
                  <GlassCard
                    key={person.id}
                    className="flex items-center gap-3 hover:border-[#D4AF37]/60 min-h-[76px]"
                  >
                    <button
                      type="button"
                      onClick={() => openProfile(person.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <div className="relative shrink-0">
                        {person.avatar_url ? (
                          <img
                            src={person.avatar_url}
                            alt={person.full_name}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full object-cover border border-[#D4AF37]/60"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#31005F] border border-[#D4AF37]/60 flex items-center justify-center font-royal-ui font-bold text-[#F5D88A]">
                            {(person.full_name?.[0] || 'Y').toUpperCase()}
                          </div>
                        )}
                        {personOnline && (
                          <span
                            className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#120822]"
                            title="Online"
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-base text-slate-900 dark:text-[#F5F1FF] truncate">
                            {person.full_name}
                          </p>
                          {personOnline && (
                            <span
                              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                              title="Online"
                            />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-[#C7A4FF] truncate">
                          {person.churches?.name || 'Kiomwobo District'}
                          {person.title ? ` · ${person.title}` : ''}
                        </p>
                      </div>
                    </button>

                    {!isSelf && (
                      <button
                        type="button"
                        disabled={togglingPersonId === person.id}
                        onClick={() => handleTogglePersonFollow(person.id)}
                        className={`min-h-[38px] px-3 rounded-xl font-royal-ui text-xs font-bold shrink-0 transition ${
                          iFollowPerson
                            ? 'border border-[#D4AF37]/50 text-[#F5D88A] hover:bg-[#31005F]/40'
                            : 'bg-[#8B24FF] hover:bg-[#7A18EB] text-white'
                        }`}
                      >
                        {iFollowPerson ? 'Following' : activeTab === 'followers' ? 'Follow Back' : 'Follow'}
                      </button>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showEditModal && isOwnProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-lg relative max-h-[90dvh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              Edit Profile
            </h2>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    {t.auth.fullName}
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
                    {t.auth.phone}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    {t.auth.gender}
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  >
                    <option value="Male">{t.auth.male}</option>
                    <option value="Female">{t.auth.female}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    {t.auth.church}
                  </label>
                  <select
                    value={churchId}
                    onChange={(e) => setChurchId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  >
                    {churches.map((church) => (
                      <option key={church.id} value={church.id}>
                        {church.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Title / Ministry Role
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Choir Director, Pathfinder Counselor"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Short Testimony / Bio
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share your favorite Scripture or youth ministry role..."
                  className="w-full p-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {saving ? 'Saving...' : t.common.save}
              </button>
            </form>
          </GlassCard>
        </div>
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
          if (isOwnProfile) setPosts((prev) => [created, ...prev]);
        }}
      />
    </div>
  );
};
