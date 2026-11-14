import {
  compressImageFile,
  generateUuid,
  getVideoDurationSeconds,
} from '@/src/lib/mediaUtils';
import { supabase } from '@/src/lib/supabase';
import {
  type Profile,
  type ReactionType,
  type StoryItem,
  type StoryViewerRecord,
  type UserStoryGroup,
} from '@/src/types/database';

export const STORY_PREFIX = '[[STORY|';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface StoryBgStyle {
  id: string;
  label: string;
  gradient: string;
  hex: string;
}

export const STORY_BG_STYLES: StoryBgStyle[] = [
  {
    id: 'royal-purple',
    label: 'Royal Purple',
    gradient: 'from-[#2A044E] via-[#6B13C9] to-[#120424]',
    hex: '#6B13C9',
  },
  {
    id: 'golden-sabbath',
    label: 'Golden Sabbath',
    gradient: 'from-[#4A2B00] via-[#B8891B] to-[#1D0B38]',
    hex: '#B8891B',
  },
  {
    id: 'midnight-violet',
    label: 'Midnight Violet',
    gradient: 'from-[#090414] via-[#3A0C78] to-[#0E071B]',
    hex: '#3A0C78',
  },
  {
    id: 'emerald-hope',
    label: 'Emerald Hope',
    gradient: 'from-[#053328] via-[#0F766E] to-[#130829]',
    hex: '#0F766E',
  },
  {
    id: 'crimson-dawn',
    label: 'Crimson Dawn',
    gradient: 'from-[#4C0519] via-[#9D174D] to-[#1F0736]',
    hex: '#9D174D',
  },
];

export function getStoryBgGradient(bgId?: string | null): string {
  return (
    STORY_BG_STYLES.find((s) => s.id === bgId || s.hex === bgId)?.gradient ||
    STORY_BG_STYLES[0].gradient
  );
}

export function isStoryPostContent(content?: string | null): boolean {
  return Boolean(content && content.startsWith(STORY_PREFIX));
}

export async function fetchActiveStories(
  currentUserId?: string,
  blockedUserIds: Set<string> = new Set()
): Promise<UserStoryGroup[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('stories')
    .select(
      'id, user_id, church_id, media_type, media_url, caption, bg_style, background_color, audience, duration_seconds, hidden, created_at, expires_at'
    )
    .gt('expires_at', nowIso)
    .eq('hidden', false)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data as unknown as StoryItem[]) || []).filter(
    (r) => !blockedUserIds.has(r.user_id)
  );

  if (rows.length === 0) return [];

  const storyIds = rows.map((r) => r.id);
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

  const [profilesRes, viewsRes, reactionsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, title, last_seen_at')
      .in('id', userIds),
    supabase.from('story_views').select('story_id, viewer_id').in('story_id', storyIds),
    supabase
      .from('story_reactions')
      .select('story_id, user_id, reaction')
      .in('story_id', storyIds),
  ]);

  const profMap = new Map<
    string,
    Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'title' | 'last_seen_at'>
  >();
  for (const p of (profilesRes.data as Pick<
    Profile,
    'id' | 'full_name' | 'avatar_url' | 'role' | 'title' | 'last_seen_at'
  >[]) || []) {
    profMap.set(p.id, p);
  }

  const viewsMap = new Map<string, Set<string>>();
  for (const v of (viewsRes.data as { story_id: string; viewer_id: string }[]) || []) {
    if (!viewsMap.has(v.story_id)) viewsMap.set(v.story_id, new Set());
    viewsMap.get(v.story_id)!.add(v.viewer_id);
  }

  const reactionCountsMap = new Map<string, Partial<Record<ReactionType, number>>>();
  const myReactionMap = new Map<string, ReactionType>();

  for (const rr of (reactionsRes.data as {
    story_id: string;
    user_id: string;
    reaction: ReactionType;
  }[]) || []) {
    if (!reactionCountsMap.has(rr.story_id)) {
      reactionCountsMap.set(rr.story_id, {});
    }
    const counts = reactionCountsMap.get(rr.story_id)!;
    counts[rr.reaction] = (counts[rr.reaction] || 0) + 1;
    if (currentUserId && rr.user_id === currentUserId) {
      myReactionMap.set(rr.story_id, rr.reaction);
    }
  }

  const stories: StoryItem[] = rows.map((r) => {
    const viewers = viewsMap.get(r.id) || new Set<string>();
    const nonAuthorCount = Array.from(viewers).filter((vid) => vid !== r.user_id).length;
    const rc = reactionCountsMap.get(r.id) || {};
    const reactionList = (Object.entries(rc) as [ReactionType, number][])
      .filter(([, c]) => c > 0)
      .map(([reaction, count]) => ({ reaction, count }));

    return {
      ...r,
      bg_style: r.bg_style || r.background_color || 'royal-purple',
      profiles: profMap.get(r.user_id) || null,
      views_count: nonAuthorCount,
      viewed_by_me: Boolean(currentUserId && viewers.has(currentUserId)),
      reactions: reactionList,
      my_reaction: myReactionMap.get(r.id) || null,
    };
  });

  const groupMap = new Map<string, UserStoryGroup>();
  for (const st of stories) {
    const fallbackProf = st.profiles || {
      id: st.user_id,
      full_name: 'Youth Member',
      avatar_url: null,
      role: 'member' as const,
      title: null,
      last_seen_at: null,
    };
    const existing = groupMap.get(st.user_id);
    if (!existing) {
      groupMap.set(st.user_id, {
        user_id: st.user_id,
        profile: fallbackProf,
        stories: [st],
        hasUnseen: st.user_id !== currentUserId && !st.viewed_by_me,
        latestAt: st.created_at,
      });
    } else {
      existing.stories.push(st);
      if (st.user_id !== currentUserId && !st.viewed_by_me) {
        existing.hasUnseen = true;
      }
      if (st.created_at > existing.latestAt) {
        existing.latestAt = st.created_at;
      }
    }
  }

  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return b.latestAt.localeCompare(a.latestAt);
  });

  return groups;
}

export async function createStory(params: {
  userId: string;
  churchId?: string | null;
  mediaFile?: File | null;
  caption: string;
  bgStyle: string;
  audience: 'district' | 'church' | 'followers';
}): Promise<void> {
  const { userId, churchId, mediaFile, caption, bgStyle, audience } = params;
  const expiresAtIso = new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString();

  let mediaType: 'photo' | 'video' | 'text' = 'text';
  let mediaUrl: string | null = null;
  let durationSeconds: number | null = null;

  if (mediaFile) {
    const isVideo = mediaFile.type.startsWith('video/');
    if (isVideo) {
      const dur = await getVideoDurationSeconds(mediaFile);
      if (dur > 30) {
        throw new Error('Videos must be 30 seconds or less.');
      }
      mediaType = 'video';
      durationSeconds = Math.max(1, Math.min(30, dur || 10));
      const ext = (mediaFile.name.split('.').pop() || 'mp4').toLowerCase();
      const path = `${userId}/${generateUuid()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(path, mediaFile, { upsert: false, contentType: mediaFile.type || 'video/mp4' });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('stories').getPublicUrl(path);
      mediaUrl = urlData.publicUrl;
    } else {
      mediaType = 'photo';
      const compressed = await compressImageFile(mediaFile, 1080);
      const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${userId}/${generateUuid()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(path, compressed, {
          upsert: false,
          contentType: compressed.type || 'image/jpeg',
        });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('stories').getPublicUrl(path);
      mediaUrl = urlData.publicUrl;
    }
  }

  const styleObj = STORY_BG_STYLES.find((s) => s.id === bgStyle) || STORY_BG_STYLES[0];

  const { error } = await supabase.from('stories').insert({
    user_id: userId,
    church_id: audience === 'church' ? churchId || null : null,
    media_type: mediaType,
    media_url: mediaUrl,
    caption: caption.trim(),
    bg_style: styleObj.id,
    background_color: styleObj.hex,
    audience,
    duration_seconds: durationSeconds,
    hidden: false,
    expires_at: expiresAtIso,
  });

  if (error) throw new Error(error.message);
}

export async function recordStoryView(
  storyId: string,
  viewerId: string,
  authorId: string
): Promise<void> {
  if (!storyId || !viewerId || viewerId === authorId) return;
  await supabase
    .from('story_views')
    .upsert(
      { story_id: storyId, viewer_id: viewerId, viewed_at: new Date().toISOString() },
      { onConflict: 'story_id,viewer_id' }
    );
}

export async function reactToStory(params: {
  storyId: string;
  storyAuthorId: string;
  userId: string;
  reaction: ReactionType;
  currentReaction?: ReactionType | null;
}): Promise<ReactionType | null> {
  const { storyId, storyAuthorId, userId, reaction, currentReaction } = params;
  if (currentReaction === reaction) {
    const { error } = await supabase
      .from('story_reactions')
      .delete()
      .eq('story_id', storyId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return null;
  }

  const { error } = await supabase
    .from('story_reactions')
    .upsert(
      { story_id: storyId, user_id: userId, reaction },
      { onConflict: 'story_id,user_id' }
    );
  if (error) throw new Error(error.message);

  if (storyAuthorId !== userId) {
    try {
      await supabase.from('notifications').insert({
        user_id: storyAuthorId,
        actor_id: userId,
        kind: 'story_reaction',
        story_id: storyId,
        meta: { reaction },
        read: false,
      });
    } catch {
      // Trigger or RLS may handle
    }
  }

  return reaction;
}

export async function fetchStoryViewers(
  storyId: string,
  authorId: string
): Promise<StoryViewerRecord[]> {
  const [viewsRes, reactionsRes] = await Promise.all([
    supabase
      .from('story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', storyId)
      .neq('viewer_id', authorId)
      .order('viewed_at', { ascending: false }),
    supabase
      .from('story_reactions')
      .select('user_id, reaction')
      .eq('story_id', storyId)
      .neq('user_id', authorId),
  ]);

  if (viewsRes.error) throw new Error(viewsRes.error.message);

  const rawViews = ((viewsRes.data as { viewer_id: string; viewed_at: string }[]) || []).map(
    (r) => ({
      user_id: r.viewer_id,
      viewed_at: r.viewed_at,
    })
  );

  const reactionByUser = new Map<string, ReactionType>();
  for (const r of (reactionsRes.data as { user_id: string; reaction: ReactionType }[]) || []) {
    reactionByUser.set(r.user_id, r.reaction);
  }

  const allUserIds = Array.from(
    new Set([
      ...rawViews.map((v) => v.user_id),
      ...Array.from(reactionByUser.keys()),
    ])
  );
  if (allUserIds.length === 0) return [];

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, title')
    .in('id', allUserIds);

  const profMap = new Map<
    string,
    Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'title'>
  >();
  for (const p of (profilesData as Pick<
    Profile,
    'id' | 'full_name' | 'avatar_url' | 'role' | 'title'
  >[]) || []) {
    profMap.set(p.id, p);
  }

  const viewUserIds = new Set(rawViews.map((v) => v.user_id));
  const combined: StoryViewerRecord[] = rawViews.map((v) => ({
    user_id: v.user_id,
    viewed_at: v.viewed_at,
    reaction: reactionByUser.get(v.user_id) || null,
    profiles: profMap.get(v.user_id) || null,
  }));

  for (const [uid, reaction] of reactionByUser.entries()) {
    if (!viewUserIds.has(uid)) {
      combined.push({
        user_id: uid,
        viewed_at: new Date().toISOString(),
        reaction,
        profiles: profMap.get(uid) || null,
      });
    }
  }

  return combined;
}

export async function deleteStory(storyId: string): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', storyId);
  if (error) throw new Error(error.message);
}

export function formatStoryTimeLeft(expiresAtIso: string): string {
  const diffMs = Math.max(0, new Date(expiresAtIso).getTime() - Date.now());
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hrs >= 1) return `${hrs}h left`;
  return `${Math.max(1, mins)}m left`;
}
