export type UserRole = 'super_admin' | 'district_admin' | 'church_admin' | 'member';

export type ReactionType = 'like' | 'love' | 'pray' | 'fire';

export const REACTION_META: Record<ReactionType, { emoji: string; label: string }> = {
  like: { emoji: '👍', label: 'Like' },
  love: { emoji: '❤️', label: 'Love' },
  pray: { emoji: '🙏', label: 'Pray' },
  fire: { emoji: '🔥', label: 'Fire' },
};

export type PostCategory =
  | 'general'
  | 'testimony'
  | 'experience'
  | 'event'
  | 'prayer'
  | 'devotion';

export const POST_CATEGORIES: { id: PostCategory; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'testimony', label: 'Testimony' },
  { id: 'experience', label: 'Experience' },
  { id: 'event', label: 'Event' },
  { id: 'prayer', label: 'Prayer' },
  { id: 'devotion', label: 'Devotion' },
];

export type ReportTargetType = 'post' | 'comment' | 'story' | 'user' | 'message';

export type ReportReason =
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'spam'
  | 'scam'
  | 'self_harm'
  | 'impersonation'
  | 'other';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'sexual', label: 'Sexual or inappropriate content' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'spam', label: 'Spam' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'self_harm', label: 'Self-harm concern' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'other', label: 'Other' },
];

export interface Church {
  id: string;
  name: string;
  location?: string | null;
  created_at?: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  church_id?: string | null;
  role: UserRole;
  avatar_url?: string | null;
  cover_url?: string | null;
  title?: string | null;
  bio?: string | null;
  last_seen_at?: string | null;
  status?: 'active' | 'suspended' | string | null;
  suspended_until?: string | null;
  created_at?: string;
  updated_at?: string;
  churches?: Church | null;
}

export interface ProfileStats {
  user_id: string;
  followers: number;
  following: number;
  posts: number;
}

export interface Post {
  id: string;
  user_id: string;
  church_id: string | null;
  content: string;
  image_url?: string | null;
  category?: string | null;
  shared_post_id?: string | null;
  hidden?: boolean;
  created_at: string;
  profiles?: Pick<
    Profile,
    'id' | 'full_name' | 'avatar_url' | 'role' | 'title' | 'church_id' | 'last_seen_at'
  > | null;
  churches?: Church | null;
  shared_post?: Post | null;
}

export interface PostStat {
  post_id: string;
  likes: number;
  comments: number;
  shares?: number;
}

export interface PostReactionCount {
  post_id: string;
  reaction?: ReactionType;
  count?: number;
  like_count?: number;
  love_count?: number;
  pray_count?: number;
  fire_count?: number;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id?: string | null;
  content: string;
  hidden?: boolean;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'last_seen_at'> | null;
}

export interface FollowRecord {
  follower_id: string;
  following_id: string;
  created_at?: string;
}

export interface StoryItem {
  id: string;
  user_id: string;
  church_id?: string | null;
  media_type?: 'photo' | 'video' | 'text' | string;
  media_url?: string | null;
  caption?: string | null;
  bg_style?: string;
  background_color?: string | null;
  audience?: 'district' | 'church' | 'followers' | string;
  duration_seconds?: number | null;
  hidden?: boolean;
  created_at: string;
  expires_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'title' | 'last_seen_at'> | null;
  views_count: number;
  viewed_by_me: boolean;
  reactions?: { reaction: ReactionType; count: number }[];
  my_reaction?: ReactionType | null;
}

export interface StoryViewerRecord {
  user_id: string;
  viewed_at: string;
  reaction?: ReactionType | null;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'title'> | null;
}

export interface StoryReactionRecord {
  story_id: string;
  user_id: string;
  reaction: ReactionType;
  created_at?: string;
}

export interface UserStoryGroup {
  user_id: string;
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'title' | 'last_seen_at'>;
  stories: StoryItem[];
  hasUnseen: boolean;
  latestAt: string;
}

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'follow'
  | 'share'
  | 'mention'
  | 'story_reaction'
  | 'group_add'
  | 'missed_call'
  | 'dm'
  | string;

export interface NotificationRecord {
  id: string;
  user_id: string;
  actor_id: string | null;
  kind: NotificationKind;
  post_id?: string | null;
  story_id?: string | null;
  conversation_id?: string | null;
  meta?: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
  actor?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role'> | null;
}

export interface BlockRecord {
  blocker_id: string;
  blocked_id: string;
  created_at?: string;
  blocked_profile?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'title'> | null;
}

export interface ReportRecord {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  target_user_id?: string | null;
  reason: ReportReason;
  details?: string | null;
  status: 'open' | 'reviewing' | 'resolved' | string;
  admin_note?: string | null;
  handled_by?: string | null;
  handled_at?: string | null;
  created_at: string;
  reporter?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  target_user?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'status'> | null;
}

export interface MentionRecord {
  id?: string;
  mentioned_user_id: string;
  post_id?: string | null;
  comment_id?: string | null;
  created_at?: string;
}

export interface Leader {
  id: string;
  church_id: string | null;
  full_name: string;
  position: string;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  sort_order: number;
  created_at?: string;
  churches?: Church | null;
}

export interface SabbathLocation {
  lat: number;
  lng: number;
  name: string;
  timezone: string;
}

export interface UserSettings {
  user_id: string;
  language?: 'en' | 'sw';
  sabbath_reminder: boolean;
  reminder_minutes: 30 | 60 | 120 | 180;
  show_online: boolean;
}

export interface Conversation {
  id: string;
  type?: 'direct' | 'group' | string;
  is_group?: boolean;
  name?: string | null;
  avatar_url?: string | null;
  created_by?: string | null;
  church_id?: string | null;
  department?: string | null;
  is_official?: boolean;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_kind?: 'text' | 'image' | 'voice' | string | null;
  created_at?: string;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  role?: 'admin' | 'member' | string;
  muted?: boolean;
  last_delivered_at?: string | null;
  last_read_at?: string | null;
  joined_at?: string;
  profiles?: Pick<
    Profile,
    'id' | 'full_name' | 'avatar_url' | 'role' | 'title' | 'last_seen_at'
  > | null;
}

export interface ConversationUnread {
  conversation_id: string;
  user_id?: string;
  unread_count: number;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind?: 'text' | 'image' | 'voice' | string;
  content?: string | null;
  media_url?: string | null;
  duration_seconds?: number | null;
  reply_to?: string | null;
  deleted?: boolean;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role'> | null;
  replied_message?: Pick<DmMessage, 'id' | 'sender_id' | 'kind' | 'content' | 'deleted' | 'profiles'> | null;
}

export interface CallLog {
  id: string;
  conversation_id?: string | null;
  caller_id: string;
  callee_id?: string | null;
  call_type?: 'audio' | 'video' | string;
  direction?: 'incoming' | 'outgoing' | string;
  status: 'missed' | 'answered' | 'declined' | 'ended' | string;
  duration_seconds?: number | null;
  started_at?: string;
  created_at: string;
  caller?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  callee?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
}

export interface Announcement {
  id: string;
  title: string;
  body?: string | null;
  content?: string | null;
  church_id: string | null;
  pinned?: boolean;
  is_pinned?: boolean;
  author_id?: string | null;
  created_by?: string | null;
  image_url?: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role'> | null;
  churches?: Church | null;
}

export interface EventItem {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  start_time?: string | null;
  event_date?: string | null;
  end_time?: string | null;
  church_id: string | null;
  created_by?: string | null;
  created_at?: string;
  churches?: Church | null;
}

export type RsvpStatus = 'going' | 'maybe' | 'no';

export interface EventRsvp {
  id?: string;
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  created_at?: string;
}

export interface AttendanceSession {
  id: string;
  title: string;
  session_date: string;
  church_id: string | null;
  created_by?: string | null;
  created_at?: string;
  churches?: Church | null;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
  present: boolean;
  marked_by?: string | null;
  created_at?: string;
  attendance_sessions?: AttendanceSession | null;
  profiles?: Profile | null;
}

export type BibleVersion = 'KJV' | 'SWAHILI';

export interface BibleVerse {
  id: string;
  version: BibleVersion;
  book_number: number;
  book_name: string;
  book?: string;
  chapter: number;
  verse: number;
  text: string;
}

export type HighlightColor = 'gold' | 'violet' | 'emerald' | 'rose' | 'none';

export interface BibleBookmark {
  id: string;
  user_id: string;
  verse_id?: string | null;
  version?: BibleVersion | null;
  book: string;
  chapter: number;
  verse: number;
  color: HighlightColor;
  note?: string | null;
  created_at?: string;
}

export interface Hymn {
  id: string;
  hymnal: string;
  language: 'en' | 'sw';
  number: number;
  title: string;
  lyrics: string;
}

export interface HymnFavorite {
  id: string;
  user_id: string;
  hymn_id: string;
  created_at?: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  body: string;
  verse_ref?: string | null;
  tags?: string[] | string | null;
  created_at: string;
  updated_at?: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  slug?: string | null;
  room_type?: 'district' | 'church' | 'admin' | string | null;
  church_id?: string | null;
  admin_only?: boolean;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id?: string;
  user_id?: string;
  content?: string | null;
  body?: string | null;
  image_url?: string | null;
  is_deleted?: boolean;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role'> | null;
}

export interface Prayer {
  id: string;
  user_id: string;
  kind?: 'request' | 'testimony';
  type?: 'request' | 'testimony';
  title?: string | null;
  content?: string | null;
  body?: string | null;
  anonymous?: boolean;
  is_anonymous?: boolean;
  hidden?: boolean;
  is_hidden?: boolean;
  church_id?: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'church_id'> | null;
  prayer_amens?: { id?: string; prayer_id?: string; user_id: string }[];
}

export interface MediaItem {
  id: string;
  user_id: string;
  church_id: string | null;
  url: string;
  file_path?: string | null;
  caption?: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  churches?: Church | null;
}

export interface PushSubscriptionRecord {
  id?: string;
  user_id: string;
  subscription?: Record<string, unknown>;
  created_at?: string;
}

export type AppRoute =
  | 'home'
  | 'community'
  | 'directory'
  | 'profile'
  | 'notifications'
  | 'leaders'
  | 'sabbath'
  | 'announcements'
  | 'events'
  | 'attendance'
  | 'bible'
  | 'hymnal'
  | 'notebook'
  | 'chat'
  | 'prayer'
  | 'gallery'
  | 'admin'
  | 'data-import'
  | 'settings'
  | 'more';

export const DISTRICT_CHURCH_NAMES = [
  'Kiomwobo SDA',
  'Ekerubo',
  'Suguta',
  'Gechamge',
  'Nyangiti Main',
  'Nyangiti Central',
  'Nyabichuki',
] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  district_admin: 'District Admin',
  church_admin: 'Church Admin',
  member: 'Youth Member',
};
