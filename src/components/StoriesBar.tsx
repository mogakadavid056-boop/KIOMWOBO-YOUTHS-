import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Eye,
  ImagePlus,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { useToast } from '@/src/context/ToastContext';
import { getVideoDurationSeconds } from '@/src/lib/mediaUtils';
import {
  STORY_BG_STYLES,
  createStory,
  deleteStory,
  fetchActiveStories,
  fetchStoryViewers,
  formatStoryTimeLeft,
  getStoryBgGradient,
  reactToStory,
  recordStoryView,
} from '@/src/lib/stories';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import {
  REACTION_META,
  type ReactionType,
  type StoryViewerRecord,
  type UserStoryGroup,
} from '@/src/types/database';
import { formatRelativeTime } from './CommentsBottomSheet';
import { GlassCard } from './GlassCard';
import { SafetyActionMenu } from './SafetyModals';

const REACTION_CHOICES: ReactionType[] = ['like', 'love', 'pray', 'fire'];

export const StoriesBar: React.FC = () => {
  const { user, profile, isAdmin, isSuspended } = useAuth();
  const {
    openProfile,
    isUserOnline,
    blockedUserIds,
    refreshUnviewedStories,
    openReportModal,
    openBlockModal,
  } = useSocial();
  const { showToast } = useToast();

  const [groups, setGroups] = useState<UserStoryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer modal state
  const [showComposer, setShowComposer] = useState(false);
  const [caption, setCaption] = useState('');
  const [bgStyle, setBgStyle] = useState(STORY_BG_STYLES[0].id);
  const [audience, setAudience] = useState<'district' | 'church' | 'followers'>('district');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isVideoPreview, setIsVideoPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Viewer modal state
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);
  const [viewerStoryIdx, setViewerStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [swipeDrawerOpen, setSwipeDrawerOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Viewers & reactions drawer (owner)
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [viewersList, setViewersList] = useState<StoryViewerRecord[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);

  const touchStartYRef = useRef<number | null>(null);
  const holdPauseRef = useRef(false);

  const loadStories = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const next = await fetchActiveStories(user?.id, blockedUserIds);
      setGroups(next);
      refreshUnviewedStories();
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [user?.id, blockedUserIds, refreshUnviewedStories]);

  useEffect(() => {
    loadStories();
    const refreshId = window.setInterval(loadStories, 60_000);
    return () => window.clearInterval(refreshId);
  }, [loadStories]);

  const activeGroup = viewerGroupIdx !== null ? groups[viewerGroupIdx] ?? null : null;
  const activeStory = activeGroup ? activeGroup.stories[viewerStoryIdx] ?? null : null;

  // Record view whenever activeStory changes
  useEffect(() => {
    if (!activeStory || !user?.id) return;
    if (activeStory.user_id !== user.id) {
      recordStoryView(activeStory.id, user.id, activeStory.user_id).then(() => {
        setGroups((prev) =>
          prev.map((g, gIdx) =>
            gIdx !== viewerGroupIdx
              ? g
              : {
                  ...g,
                  stories: g.stories.map((s) =>
                    s.id === activeStory.id
                      ? {
                          ...s,
                          viewed_by_me: true,
                          views_count: s.viewed_by_me ? s.views_count : s.views_count + 1,
                        }
                      : s
                  ),
                  hasUnseen: g.stories.some((s) => s.id !== activeStory.id && !s.viewed_by_me),
                }
          )
        );
        refreshUnviewedStories();
      });
    }
  }, [activeStory?.id, activeStory?.user_id, user?.id, viewerGroupIdx, refreshUnviewedStories]);

  const closeViewer = useCallback(() => {
    setViewerGroupIdx(null);
    setViewerStoryIdx(0);
    setProgress(0);
    setShowViewersSheet(false);
    setSwipeDrawerOpen(false);
    setPaused(false);
  }, []);

  const goNextStory = useCallback(() => {
    if (viewerGroupIdx === null || !activeGroup) return;
    if (viewerStoryIdx + 1 < activeGroup.stories.length) {
      setViewerStoryIdx((i) => i + 1);
      setProgress(0);
    } else if (viewerGroupIdx + 1 < groups.length) {
      setViewerGroupIdx(viewerGroupIdx + 1);
      setViewerStoryIdx(0);
      setProgress(0);
    } else {
      closeViewer();
    }
  }, [viewerGroupIdx, viewerStoryIdx, activeGroup, groups.length, closeViewer]);

  const goPrevStory = useCallback(() => {
    if (viewerGroupIdx === null) return;
    if (viewerStoryIdx > 0) {
      setViewerStoryIdx((i) => i - 1);
      setProgress(0);
    } else if (viewerGroupIdx > 0) {
      const prevGroup = groups[viewerGroupIdx - 1];
      setViewerGroupIdx(viewerGroupIdx - 1);
      setViewerStoryIdx(Math.max(0, prevGroup.stories.length - 1));
      setProgress(0);
    } else {
      setProgress(0);
    }
  }, [viewerGroupIdx, viewerStoryIdx, groups]);

  // Auto-advance timer (6s for image/text, up to duration_seconds for video)
  useEffect(() => {
    if (!activeStory || paused || showViewersSheet || swipeDrawerOpen) return;
    setProgress(0);
    const stepMs = 100;
    const durationMs =
      activeStory.media_type === 'video' && activeStory.duration_seconds
        ? Math.min(30000, Math.max(3000, activeStory.duration_seconds * 1000))
        : 6000;
    const inc = (stepMs / durationMs) * 100;

    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev + inc >= 100) {
          window.clearInterval(timer);
          setTimeout(goNextStory, 0);
          return 100;
        }
        return prev + inc;
      });
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [activeStory?.id, paused, showViewersSheet, swipeDrawerOpen, goNextStory]);

  const handleOpenViewers = async () => {
    if (!activeStory) return;
    setShowViewersSheet(true);
    setLoadingViewers(true);
    try {
      const list = await fetchStoryViewers(activeStory.id, activeStory.user_id);
      setViewersList(list);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load viewers', 'error');
    } finally {
      setLoadingViewers(false);
    }
  };

  const handleDeleteActiveStory = async () => {
    if (!activeStory) return;
    try {
      await deleteStory(activeStory.id);
      showToast('Story deleted.', 'info');
      closeViewer();
      await loadStories();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete story', 'error');
    }
  };

  const handleReactToStory = async (reaction: ReactionType) => {
    if (!user?.id || !activeStory) return;
    if (isSuspended) {
      showToast('Your account is suspended.', 'error');
      return;
    }
    const prevReaction = activeStory.my_reaction || null;
    try {
      const nextReaction = await reactToStory({
        storyId: activeStory.id,
        storyAuthorId: activeStory.user_id,
        userId: user.id,
        reaction,
        currentReaction: prevReaction,
      });

      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          stories: g.stories.map((s) => (s.id === activeStory.id ? { ...s, my_reaction: nextReaction } : s)),
        }))
      );
      showToast(
        nextReaction ? `Reacted ${REACTION_META[nextReaction].emoji}` : 'Reaction removed',
        'info'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to react', 'error');
    }
  };

  const handleSendStoryReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !activeStory || !replyText.trim() || isSuspended) return;
    setSendingReply(true);
    try {
      const { data: convId, error: chatErr } = await supabase.rpc('start_direct_chat', {
        target_user: activeStory.user_id,
      });
      if (chatErr || !convId) {
        showToast(
          chatErr?.message || 'Follow this member or ask them to follow you to send a story reply.',
          'info'
        );
        setSendingReply(false);
        return;
      }

      const body = `Replied to your story: "${replyText.trim()}"`;
      const { error: msgErr } = await supabase.from('dm_messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        kind: 'text',
        content: body,
      });
      if (msgErr) {
        showToast(msgErr.message, 'error');
      } else {
        setReplyText('');
        setSwipeDrawerOpen(false);
        showToast('Reply sent privately!', 'success');
      }
    } finally {
      setSendingReply(false);
    }
  };

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.type.startsWith('video/')) {
      try {
        const dur = await getVideoDurationSeconds(f);
        if (dur > 30) {
          showToast('Video must be 30 seconds or less.', 'error');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        setIsVideoPreview(true);
      } catch {
        showToast('Unable to verify video length.', 'error');
        return;
      }
    } else {
      setIsVideoPreview(false);
    }

    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(f);
    setMediaPreview(URL.createObjectURL(f));
  };

  const clearComposer = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
    setIsVideoPreview(false);
    setCaption('');
    setBgStyle(STORY_BG_STYLES[0].id);
    setAudience('district');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePublishStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuspended) {
      showToast('Your account is suspended. You can read but not post.', 'error');
      return;
    }
    if (!user || (!caption.trim() && !mediaFile)) {
      showToast('Add a photo, video, or write text for your story.', 'error');
      return;
    }
    setPublishing(true);
    try {
      await createStory({
        userId: user.id,
        churchId: profile?.church_id || null,
        mediaFile,
        caption,
        bgStyle,
        audience,
      });
      showToast('Your 24-hour story is live!', 'success');
      clearComposer();
      setShowComposer(false);
      await loadStories();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to publish story', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const myGroup = groups.find((g) => g.user_id === user?.id);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          <h2 className="font-royal-ui text-xs font-bold uppercase tracking-wider text-[#B8891B] dark:text-[#F5D88A]">
            24h Youth Stories
          </h2>
        </div>
        <span className="text-[11px] font-royal-ui text-slate-500 dark:text-[#C7A4FF]/80">
          {groups.reduce((sum, g) => sum + g.stories.length, 0)} active
        </span>
      </div>

      {/* Horizontal Stories Rail */}
      <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5">
        {/* Add Story Card */}
        <button
          type="button"
          onClick={() => {
            if (isSuspended) {
              showToast('Your account is suspended. You cannot post stories.', 'error');
              return;
            }
            setShowComposer(true);
          }}
          className="relative w-26 h-40 rounded-2xl overflow-hidden shrink-0 royal-glass border border-[#D4AF37]/40 hover:border-[#F5D88A] transition group flex flex-col"
        >
          <div className="h-26 w-full bg-[#240645] relative overflow-hidden">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#31005F] to-[#140624] flex items-center justify-center font-royal-display text-2xl font-bold text-[#F5D88A]">
                {(profile?.full_name?.[0] || 'K').toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
          <div className="relative flex-1 bg-white/90 dark:bg-[#140726] flex flex-col items-center justify-end pb-2.5 px-1.5">
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] border-2 border-[#140726] text-[#080610] flex items-center justify-center shadow-lg">
              <Plus className="w-4 h-4 stroke-[2.75]" />
            </span>
            <span className="font-royal-ui text-[11px] font-bold text-slate-900 dark:text-[#F5F1FF] leading-tight text-center">
              Add Story
            </span>
          </div>
        </button>

        {loading &&
          [0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="w-26 h-40 rounded-2xl shrink-0 royal-glass animate-pulse bg-[#31005F]/35"
            />
          ))}

        {!loading &&
          groups.map((group, gIdx) => {
            const latest = group.stories[group.stories.length - 1];
            const firstName =
              group.user_id === user?.id
                ? 'Your Story'
                : group.profile.full_name?.split(' ')[0] || 'Youth';
            const online = isUserOnline(group.user_id, group.profile.last_seen_at);

            return (
              <button
                key={group.user_id}
                type="button"
                onClick={() => {
                  const firstUnseen = group.stories.findIndex((s) => !s.viewed_by_me);
                  setViewerGroupIdx(gIdx);
                  setViewerStoryIdx(firstUnseen >= 0 ? firstUnseen : 0);
                  setPaused(false);
                  setProgress(0);
                  setShowViewersSheet(false);
                  setSwipeDrawerOpen(false);
                }}
                className={`relative w-26 h-40 rounded-2xl overflow-hidden shrink-0 text-left transition group ${
                  group.hasUnseen
                    ? 'ring-2 ring-[#F5D88A] shadow-[0_0_18px_rgba(212,175,55,0.45)]'
                    : 'ring-1 ring-[#D4AF37]/35'
                }`}
              >
                {latest.media_url && latest.media_type === 'video' ? (
                  <video
                    src={latest.media_url}
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : latest.media_url ? (
                  <img
                    src={latest.media_url}
                    alt={`${group.profile.full_name} story`}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${getStoryBgGradient(
                      latest.bg_style || latest.background_color
                    )} p-2.5 flex items-center justify-center`}
                  >
                    <p className="font-royal-body text-[11px] font-semibold text-white text-center line-clamp-4 leading-snug">
                      {latest.caption}
                    </p>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35" />

                <div className="absolute top-2 left-2 inline-block">
                  <div
                    className={`w-9 h-9 rounded-full p-0.5 ${
                      group.hasUnseen
                        ? 'bg-gradient-to-br from-[#F5D88A] via-[#D4AF37] to-[#8B24FF]'
                        : 'bg-white/40'
                    }`}
                  >
                    {group.profile.avatar_url ? (
                      <img
                        src={group.profile.avatar_url}
                        alt={group.profile.full_name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full rounded-full object-cover bg-[#080610]"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-[#31005F] flex items-center justify-center text-xs font-bold text-[#F5D88A]">
                        {(group.profile.full_name?.[0] || 'Y').toUpperCase()}
                      </div>
                    )}
                  </div>
                  {online && (
                    <span
                      className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080610]"
                      title="Online"
                    />
                  )}
                </div>

                {group.stories.length > 1 && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] font-bold text-[#F5D88A] tabular-nums">
                    {group.stories.length}
                  </span>
                )}

                {latest.media_type === 'video' && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] font-bold text-white flex items-center gap-0.5">
                    <Video className="w-2.5 h-2.5 text-[#F5D88A]" />
                  </span>
                )}

                <div className="absolute bottom-2 left-2 right-2">
                  <p className="font-royal-ui text-xs font-bold text-white truncate">
                    {firstName}
                  </p>
                  {group.user_id === user?.id && (
                    <p className="flex items-center gap-1 text-[10px] text-[#F5D88A] tabular-nums">
                      <Eye className="w-3 h-3" />
                      <span>{latest.views_count}</span>
                    </p>
                  )}
                </div>
              </button>
            );
          })}
      </div>

      {myGroup && (
        <p className="text-[11px] font-royal-ui text-slate-500 dark:text-[#C7A4FF]/80 px-0.5">
          Tap <span className="text-[#F5D88A] font-semibold">Your Story</span> to see viewers & reactions.
        </p>
      )}

      {/* Story Composer Modal */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-md relative max-h-[90dvh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowComposer(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A]">
              Add to Your Story
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#C7A4FF] mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Photo, 30s max video, or text · Expires in 24h</span>
            </p>

            <form onSubmit={handlePublishStory} className="mt-4 space-y-4">
              <div
                className={`relative h-64 rounded-2xl overflow-hidden border border-[#D4AF37]/40 flex items-center justify-center p-5 ${
                  mediaPreview ? 'bg-black' : `bg-gradient-to-br ${getStoryBgGradient(bgStyle)}`
                }`}
              >
                {mediaPreview ? (
                  <>
                    {isVideoPreview ? (
                      <video
                        src={mediaPreview}
                        controls
                        className="absolute inset-0 w-full h-full object-contain bg-black"
                      />
                    ) : (
                      <img
                        src={mediaPreview}
                        alt="Story preview"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {caption.trim() && (
                      <div className="relative z-10 mt-auto w-full rounded-xl bg-black/60 backdrop-blur-sm px-3.5 py-2 text-center text-sm text-white pointer-events-none">
                        {caption}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (mediaPreview) URL.revokeObjectURL(mediaPreview);
                        setMediaFile(null);
                        setMediaPreview(null);
                        setIsVideoPreview(false);
                      }}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/75 text-white flex items-center justify-center z-20"
                      aria-label="Remove media"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <p className="font-royal-serif text-xl font-bold text-white text-center whitespace-pre-wrap break-words">
                    {caption.trim() || 'Share a Sabbath thought, verse, photo, or short video...'}
                  </p>
                )}
              </div>

              {!mediaPreview && (
                <div>
                  <p className="text-xs font-royal-ui font-semibold text-slate-600 dark:text-[#C7A4FF] mb-2">
                    Background Theme
                  </p>
                  <div className="flex items-center gap-2">
                    {STORY_BG_STYLES.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setBgStyle(style.id)}
                        className={`w-9 h-9 rounded-full bg-gradient-to-br ${style.gradient} transition ${
                          bgStyle === style.id
                            ? 'ring-2 ring-[#F5D88A] scale-110'
                            : 'opacity-75 hover:opacity-100'
                        }`}
                        aria-label={style.label}
                        title={style.label}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <textarea
                  rows={2}
                  maxLength={280}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={mediaPreview ? 'Add a caption (optional)...' : 'Type your story text...'}
                  className="w-full p-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-royal-ui font-semibold text-slate-600 dark:text-[#C7A4FF] mb-1.5">
                  Who can see this story?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'district', label: 'Whole District' },
                      { id: 'church', label: 'My Church' },
                      { id: 'followers', label: 'Followers' },
                    ] as const
                  ).map((aud) => (
                    <button
                      key={aud.id}
                      type="button"
                      onClick={() => setAudience(aud.id)}
                      className={`min-h-[40px] px-2 rounded-xl font-royal-ui text-xs font-semibold transition ${
                        audience === aud.id
                          ? 'bg-[#8B24FF] text-white violet-glow'
                          : 'border border-[#D4AF37]/30 text-slate-700 dark:text-[#C7A4FF]'
                      }`}
                    >
                      {aud.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleSelectFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-4 rounded-xl border border-[#D4AF37]/40 text-xs font-royal-ui font-semibold text-slate-800 dark:text-[#F5D88A] inline-flex items-center gap-1.5"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>{mediaPreview ? 'Change Media' : 'Photo / Video'}</span>
                </button>

                <button
                  type="submit"
                  disabled={publishing || (!caption.trim() && !mediaFile)}
                  className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold disabled:opacity-50"
                >
                  {publishing ? 'Sharing...' : 'Share Story (24h)'}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Fullscreen Story Viewer */}
      {activeGroup && activeStory && (
        <div
          className="fixed inset-0 z-50 bg-[#05020B]/95 backdrop-blur-md flex items-center justify-center sm:p-4"
          onTouchStart={(e) => {
            touchStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            if (touchStartYRef.current === null) return;
            const endY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
            const deltaY = endY - touchStartYRef.current;
            touchStartYRef.current = null;
            if (deltaY > 75) {
              closeViewer();
            } else if (deltaY < -60) {
              if (activeStory.user_id === user?.id) {
                handleOpenViewers();
              } else {
                setSwipeDrawerOpen(true);
              }
            }
          }}
        >
          <div className="relative w-full h-dvh sm:h-[88dvh] sm:max-w-md sm:rounded-3xl overflow-hidden border border-[#D4AF37]/35 bg-[#0D051A] flex flex-col">
            {/* Progress Segments */}
            <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-1.5">
              {activeGroup.stories.map((st, idx) => {
                const width =
                  idx < viewerStoryIdx ? 100 : idx === viewerStoryIdx ? progress : 0;
                return (
                  <div
                    key={st.id}
                    className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden"
                  >
                    <div
                      className="h-full bg-[#F5D88A] transition-[width] duration-100 ease-linear"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Header */}
            <div className="absolute top-6 left-3 right-3 z-30 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  closeViewer();
                  openProfile(activeGroup.user_id);
                }}
                className="flex items-center gap-2.5 min-w-0 text-left"
              >
                <div className="relative shrink-0">
                  {activeGroup.profile.avatar_url ? (
                    <img
                      src={activeGroup.profile.avatar_url}
                      alt={activeGroup.profile.full_name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-[#F5D88A]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#31005F] border border-[#F5D88A] flex items-center justify-center font-bold text-[#F5D88A]">
                      {(activeGroup.profile.full_name?.[0] || 'Y').toUpperCase()}
                    </div>
                  )}
                  {isUserOnline(activeGroup.user_id, activeGroup.profile.last_seen_at) && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0D051A]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-royal-ui text-sm font-bold text-white truncate">
                    {activeGroup.profile.full_name}
                  </p>
                  <p className="text-[11px] text-white/80 tabular-nums">
                    {formatRelativeTime(activeStory.created_at)} · {formatStoryTimeLeft(activeStory.expires_at)}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center"
                  aria-label={paused ? 'Resume story' : 'Pause story'}
                >
                  {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>

                <SafetyActionMenu
                  lightButton
                  targetType="story"
                  targetId={activeStory.id}
                  targetUserId={activeStory.user_id}
                  targetUserName={activeGroup.profile.full_name}
                  isOwn={activeStory.user_id === user?.id}
                  canDelete={activeStory.user_id === user?.id || isAdmin}
                  onDelete={handleDeleteActiveStory}
                  onReport={() => {
                    setPaused(true);
                    openReportModal({
                      targetType: 'story',
                      targetId: activeStory.id,
                      targetUserId: activeStory.user_id,
                      label: 'story',
                    });
                  }}
                  onBlock={() => {
                    setPaused(true);
                    openBlockModal({
                      userId: activeStory.user_id,
                      userName: activeGroup.profile.full_name,
                      onBlocked: () => {
                        closeViewer();
                        loadStories();
                      },
                    });
                  }}
                />

                <button
                  type="button"
                  onClick={closeViewer}
                  className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center"
                  aria-label="Close story"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Story Body + Hold-to-Pause + Tap Zones */}
            <div
              className="relative flex-1 flex items-center justify-center select-none"
              onMouseDown={() => {
                holdPauseRef.current = true;
                setPaused(true);
              }}
              onMouseUp={() => {
                if (holdPauseRef.current) {
                  holdPauseRef.current = false;
                  setPaused(false);
                }
              }}
              onTouchStart={() => {
                holdPauseRef.current = true;
                setPaused(true);
              }}
              onTouchEnd={() => {
                if (holdPauseRef.current) {
                  holdPauseRef.current = false;
                  setPaused(false);
                }
              }}
            >
              {activeStory.media_url && activeStory.media_type === 'video' ? (
                <video
                  src={activeStory.media_url}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : activeStory.media_url ? (
                <img
                  src={activeStory.media_url}
                  alt="Story"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <div
                  className={`w-full h-full bg-gradient-to-br ${getStoryBgGradient(
                    activeStory.bg_style || activeStory.background_color
                  )} flex items-center justify-center p-8`}
                >
                  <p className="font-royal-serif text-2xl font-bold text-white text-center whitespace-pre-wrap break-words leading-relaxed">
                    {activeStory.caption}
                  </p>
                </div>
              )}

              {activeStory.media_url && activeStory.caption && (
                <div className="absolute bottom-20 left-4 right-4 z-20 rounded-2xl bg-black/65 backdrop-blur-md px-4 py-3 text-center text-base text-white">
                  {activeStory.caption}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrevStory();
                }}
                className="absolute inset-y-20 left-0 w-1/3 z-20 flex items-center justify-start pl-2 text-white/0 hover:text-white/80 transition"
                aria-label="Previous story"
              >
                <ChevronLeft className="w-7 h-7" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNextStory();
                }}
                className="absolute inset-y-20 right-0 w-1/3 z-20 flex items-center justify-end pr-2 text-white/0 hover:text-white/80 transition"
                aria-label="Next story"
              >
                <ChevronRight className="w-7 h-7" />
              </button>
            </div>

            {/* Bottom Action Bar */}
            <div className="relative z-30 px-4 py-3 bg-gradient-to-t from-black/95 to-black/60 border-t border-white/10 flex items-center justify-between gap-2 pb-safe">
              {activeStory.user_id === user?.id ? (
                <>
                  <button
                    type="button"
                    onClick={handleOpenViewers}
                    className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/20 text-[#F5D88A] font-royal-ui text-xs font-bold inline-flex items-center gap-2 transition"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="tabular-nums">
                      {activeStory.views_count === 0
                        ? 'No views yet'
                        : `Seen by ${activeStory.views_count}`}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteActiveStory}
                      className="min-h-[44px] px-3 rounded-xl bg-red-500/20 border border-red-400/40 text-red-300 font-royal-ui text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeViewer();
                        setShowComposer(true);
                      }}
                      className="min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSwipeDrawerOpen(true)}
                    className="flex-1 min-h-[44px] px-4 rounded-full bg-white/10 border border-white/20 text-left text-xs font-royal-ui text-white/80 flex items-center justify-between"
                  >
                    <span>Reply or react...</span>
                    <ChevronUp className="w-4 h-4 text-[#F5D88A]" />
                  </button>
                  <div className="flex items-center gap-1">
                    {REACTION_CHOICES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleReactToStory(r)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition ${
                          activeStory.my_reaction === r
                            ? 'bg-[#8B24FF]/70 ring-2 ring-[#F5D88A] scale-110'
                            : 'bg-white/10 hover:bg-white/20'
                        }`}
                        aria-label={REACTION_META[r].label}
                      >
                        {REACTION_META[r].emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Reply / Reaction Bar Drawer (swipe up on others' stories) */}
            {swipeDrawerOpen && activeStory.user_id !== user?.id && (
              <div
                className="absolute inset-0 z-40 bg-black/75 flex items-end"
                onClick={() => setSwipeDrawerOpen(false)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-full royal-glass-elevated rounded-t-3xl p-4 space-y-4 pb-safe"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-royal-serif text-base font-bold text-[#F5D88A]">
                      React or Reply to {activeGroup.profile.full_name}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSwipeDrawerOpen(false)}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#C7A4FF]"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-around py-1">
                    {REACTION_CHOICES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleReactToStory(r)}
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition ${
                          activeStory.my_reaction === r
                            ? 'bg-[#8B24FF] ring-2 ring-[#F5D88A]'
                            : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        {REACTION_META[r].emoji}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSendStoryReply} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Send a private reply..."
                      className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-[#080610]/85 border border-[#D4AF37]/35 text-sm text-white"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="min-w-[44px] min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-bold inline-flex items-center justify-center disabled:opacity-45"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Owner Viewers & Reactions Sheet */}
            {showViewersSheet && (
              <div
                className="absolute inset-0 z-40 bg-black/70 flex items-end"
                onClick={() => setShowViewersSheet(false)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-h-[65%] royal-glass-elevated rounded-t-3xl flex flex-col overflow-hidden"
                >
                  <div className="px-5 py-3.5 border-b border-[#D4AF37]/25 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-[#D4AF37]" />
                      <h3 className="font-royal-serif text-base font-bold text-[#F5D88A]">
                        Viewers & Reactions ({viewersList.length})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowViewersSheet(false)}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#C7A4FF]"
                      aria-label="Close viewers"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {loadingViewers ? (
                      <p className="text-center text-sm text-[#C7A4FF] py-6">
                        Loading viewers...
                      </p>
                    ) : viewersList.length === 0 ? (
                      <p className="text-center text-sm text-[#C7A4FF] py-8">
                        No views recorded on this story yet.
                      </p>
                    ) : (
                      viewersList.map((v) => {
                        const viewerName = v.profiles?.full_name || 'Youth Member';
                        const online = isUserOnline(v.user_id);
                        return (
                          <button
                            key={`${v.user_id}-${v.viewed_at}`}
                            type="button"
                            onClick={() => {
                              setShowViewersSheet(false);
                              closeViewer();
                              openProfile(v.user_id);
                            }}
                            className="w-full min-h-[52px] p-2.5 rounded-xl hover:bg-[#31005F]/40 flex items-center gap-3 text-left transition"
                          >
                            <div className="relative shrink-0">
                              {v.profiles?.avatar_url ? (
                                <img
                                  src={v.profiles.avatar_url}
                                  alt={viewerName}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/50"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-[#31005F] border border-[#D4AF37]/50 flex items-center justify-center text-xs font-bold text-[#F5D88A]">
                                  {viewerName[0]?.toUpperCase() || 'Y'}
                                </div>
                              )}
                              {online && (
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080610]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm text-white truncate">
                                {viewerName}
                              </p>
                              <p className="text-xs text-[#C7A4FF]/80">
                                {online ? 'Online now' : v.profiles?.title || 'Youth Member'}
                              </p>
                            </div>
                            {v.reaction && (
                              <span className="text-lg shrink-0">
                                {REACTION_META[v.reaction].emoji}
                              </span>
                            )}
                            <span className="text-[11px] text-[#C7A4FF]/70 tabular-nums shrink-0">
                              {formatRelativeTime(v.viewed_at)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
