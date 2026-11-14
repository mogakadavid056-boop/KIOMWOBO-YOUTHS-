import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { useSocial } from '@/src/context/SocialContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type Profile } from '@/src/types/database';

export interface SelectedMention {
  userId: string;
  fullName: string;
}

// Lightweight global cache of directory names -> ids so @mentions highlight and open profiles smoothly
let cachedMembers: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'title'>[] = [];
let cacheFetchedAt = 0;

export async function getDirectoryMembersCache(): Promise<
  Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'title'>[]
> {
  if (!isSupabaseConfigured) return cachedMembers;
  if (cachedMembers.length > 0 && Date.now() - cacheFetchedAt < 120_000) {
    return cachedMembers;
  }
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, title')
    .order('full_name')
    .limit(400);
  if (data) {
    cachedMembers = data as Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'title'>[];
    cacheFetchedAt = Date.now();
  }
  return cachedMembers;
}

export async function saveMentions(params: {
  actorId: string;
  text: string;
  selectedMentions: SelectedMention[];
  postId?: string | null;
  commentId?: string | null;
}): Promise<void> {
  const { actorId, text, selectedMentions, postId = null, commentId = null } = params;
  if (!text.includes('@')) return;

  const uniqueIds = new Set<string>();
  for (const m of selectedMentions) {
    if (m.userId !== actorId && text.includes(`@${m.fullName}`)) {
      uniqueIds.add(m.userId);
    }
  }

  // Also resolve any manually typed @Full Name from directory cache
  const members = await getDirectoryMembersCache();
  const lowerText = text.toLowerCase();
  for (const member of members) {
    if (!member.full_name || member.id === actorId) continue;
    if (lowerText.includes(`@${member.full_name.toLowerCase()}`)) {
      uniqueIds.add(member.id);
    }
  }

  if (uniqueIds.size === 0) return;

  const rows = Array.from(uniqueIds).map((uid) => ({
    mentioned_user_id: uid,
    post_id: postId,
    comment_id: commentId,
  }));

  await supabase.from('mentions').insert(rows);

  // Send mention notifications
  for (const uid of uniqueIds) {
    try {
      await supabase.from('notifications').insert({
        user_id: uid,
        actor_id: actorId,
        kind: 'mention',
        post_id: postId,
        read: false,
      });
    } catch {
      // Trigger or RLS may handle
    }
  }
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onMentionsChange?: (mentions: SelectedMention[]) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  className?: string;
  dropdownPosition?: 'above' | 'below';
  onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  onMentionsChange,
  placeholder,
  multiline = false,
  rows = 3,
  disabled = false,
  className = '',
  dropdownPosition = 'below',
  onFocus,
}) => {
  const { blockedUserIds } = useSocial();
  const [members, setMembers] = useState<Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'title'>[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number>(0);
  const selectedRef = useRef<SelectedMention[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    getDirectoryMembersCache().then(setMembers);
  }, []);

  useEffect(() => {
    if (!value) {
      selectedRef.current = [];
    }
  }, [value]);

  const detectMentionQuery = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = before.match(/(?:^|\s)@([^\s@]{0,28})$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }
  };

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return members
      .filter((m) => {
        if (!m.full_name || blockedUserIds.has(m.id)) return false;
        if (!mentionQuery) return true;
        return m.full_name.toLowerCase().includes(mentionQuery);
      })
      .slice(0, 6);
  }, [members, mentionQuery, blockedUserIds]);

  const handleValueChange = (nextVal: string, caret: number) => {
    onChange(nextVal);
    setCursorIndex(caret);
    detectMentionQuery(nextVal, caret);
  };

  const handleSelectMember = (member: Pick<Profile, 'id' | 'full_name'>) => {
    const before = value.slice(0, cursorIndex);
    const after = value.slice(cursorIndex);
    const replacedBefore = before.replace(/@([^\s@]{0,28})$/, `@${member.full_name} `);
    const nextVal = `${replacedBefore}${after}`;
    onChange(nextVal);
    setMentionQuery(null);

    if (!selectedRef.current.some((s) => s.userId === member.id)) {
      selectedRef.current = [
        ...selectedRef.current,
        { userId: member.id, fullName: member.full_name },
      ];
      onMentionsChange?.(selectedRef.current);
    }

    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const pos = replacedBefore.length;
        el.setSelectionRange?.(pos, pos);
      }
    }, 0);
  };

  return (
    <div className="relative flex-1 min-w-0">
      {multiline ? (
        <textarea
          ref={(el) => {
            inputRef.current = el;
          }}
          rows={rows}
          value={value}
          disabled={disabled}
          onChange={(e) => handleValueChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onClick={(e) => {
            const target = e.currentTarget;
            setCursorIndex(target.selectionStart ?? value.length);
            detectMentionQuery(value, target.selectionStart ?? value.length);
          }}
          onFocus={onFocus}
          placeholder={placeholder}
          className={className}
        />
      ) : (
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => handleValueChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onClick={(e) => {
            const target = e.currentTarget;
            setCursorIndex(target.selectionStart ?? value.length);
            detectMentionQuery(value, target.selectionStart ?? value.length);
          }}
          onFocus={onFocus}
          placeholder={placeholder}
          className={className}
        />
      )}

      {mentionQuery !== null && suggestions.length > 0 && (
        <div
          className={`absolute left-0 right-0 z-50 rounded-2xl royal-glass-elevated border border-[#D4AF37]/45 shadow-2xl overflow-hidden max-h-56 overflow-y-auto ${
            dropdownPosition === 'above' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {suggestions.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectMember(m);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleSelectMember(m);
              }}
              className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left hover:bg-[#31005F]/50 transition border-b border-[#D4AF37]/10 last:border-b-0"
            >
              {m.avatar_url ? (
                <img
                  src={m.avatar_url}
                  alt={m.full_name}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover border border-[#D4AF37]/50 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#31005F] border border-[#D4AF37]/50 flex items-center justify-center text-[11px] font-bold text-[#F5D88A] shrink-0">
                  {(m.full_name?.[0] || 'Y').toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-[#F5F1FF] truncate">
                  {m.full_name}
                </p>
                {m.title && (
                  <p className="text-[11px] text-slate-500 dark:text-[#C7A4FF]/75 truncate">
                    {m.title}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface RichMentionTextProps {
  text: string;
  className?: string;
}

export const RichMentionText: React.FC<RichMentionTextProps> = ({ text, className = '' }) => {
  const { openProfile } = useSocial();
  const { user } = useAuth();
  const [members, setMembers] = useState<Pick<Profile, 'id' | 'full_name'>[]>([]);

  useEffect(() => {
    if (!text.includes('@')) return;
    getDirectoryMembersCache().then((list) => setMembers(list));
  }, [text]);

  if (!text.includes('@')) {
    return <span className={className}>{text}</span>;
  }

  // Sort longest names first so multi-word @Full Name matches cleanly
  const sortedNames = members
    .filter((m) => m.full_name && m.full_name.trim().length > 0)
    .sort((a, b) => b.full_name.length - a.full_name.length);

  const segments: { str: string; userId?: string }[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const atIdx = text.indexOf('@', cursor);
    if (atIdx === -1) {
      segments.push({ str: text.slice(cursor) });
      break;
    }

    if (atIdx > cursor) {
      segments.push({ str: text.slice(cursor, atIdx) });
    }

    const rest = text.slice(atIdx + 1);
    const matchedMember = sortedNames.find((m) => {
      const name = m.full_name;
      if (!rest.toLowerCase().startsWith(name.toLowerCase())) return false;
      const nextChar = rest.charAt(name.length);
      return !nextChar || /[\s.,!?;:)]/.test(nextChar);
    });

    if (matchedMember) {
      segments.push({
        str: `@${text.slice(atIdx + 1, atIdx + 1 + matchedMember.full_name.length)}`,
        userId: matchedMember.id,
      });
      cursor = atIdx + 1 + matchedMember.full_name.length;
    } else {
      const wordMatch = rest.match(/^([A-Za-z0-9_.-]+)/);
      if (wordMatch) {
        segments.push({ str: `@${wordMatch[1]}`, userId: undefined });
        cursor = atIdx + 1 + wordMatch[1].length;
      } else {
        segments.push({ str: '@' });
        cursor = atIdx + 1;
      }
    }
  }

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.str.startsWith('@') && seg.str.length > 1 ? (
          <button
            key={`${i}-${seg.str}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (seg.userId) openProfile(seg.userId);
              else if (user?.id) {
                // Non-resolved mention still highlights in gold
              }
            }}
            className={`font-semibold text-[#B8891B] dark:text-[#F5D88A] ${
              seg.userId ? 'hover:underline cursor-pointer' : 'cursor-default'
            }`}
          >
            {seg.str}
          </button>
        ) : (
          <React.Fragment key={i}>{seg.str}</React.Fragment>
        )
      )}
    </span>
  );
};
