import React, { useState } from 'react';
import { Repeat2, Share2, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useToast } from '@/src/context/ToastContext';
import { supabase } from '@/src/lib/supabase';
import { type Post } from '@/src/types/database';
import { GlassCard } from './GlassCard';

interface SharePostModalProps {
  post: Post | null;
  onClose: () => void;
  onShared?: (createdPost: Post) => void;
}

export const SharePostModal: React.FC<SharePostModalProps> = ({
  post,
  onClose,
  onShared,
}) => {
  const { user, profile, isSuspended } = useAuth();
  const { showToast } = useToast();
  const [comment, setComment] = useState('');
  const [audience, setAudience] = useState<'district' | 'church'>('district');
  const [sharing, setSharing] = useState(false);

  if (!post) return null;

  const targetOriginal = post.shared_post ? post.shared_post : post;

  const handleShareToFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isSuspended) {
      showToast('Your account is suspended. You can read but not post.', 'error');
      return;
    }

    setSharing(true);
    const targetChurchId = audience === 'church' ? profile?.church_id || null : null;

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        church_id: targetChurchId,
        content: comment.trim(),
        category: post.category || 'general',
        shared_post_id: targetOriginal.id,
        hidden: false,
      })
      .select(
        'id, user_id, church_id, content, image_url, category, shared_post_id, hidden, created_at, profiles!user_id(id, full_name, avatar_url, role, title, church_id, last_seen_at), churches(id, name)'
      )
      .single();

    setSharing(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }

    if (targetOriginal.user_id !== user.id) {
      try {
        await supabase.from('notifications').insert({
          user_id: targetOriginal.user_id,
          actor_id: user.id,
          kind: 'share',
          post_id: targetOriginal.id,
          read: false,
        });
      } catch {
        // Trigger or RLS may handle
      }
    }

    if (data) {
      const created = data as unknown as Post;
      created.shared_post = targetOriginal;
      onShared?.(created);
    }

    setComment('');
    showToast('Shared to your feed!', 'success');
    onClose();
  };

  const handleShareOutside = async () => {
    const author = targetOriginal.profiles?.full_name || 'Youth Member';
    const appLink = typeof window !== 'undefined' ? window.location.origin : '';
    const snippet = targetOriginal.content
      ? `"${targetOriginal.content.slice(0, 200)}" — ${author} on KIOMWOBO YOUTHS`
      : `${author} shared a moment on KIOMWOBO YOUTHS`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'KIOMWOBO YOUTHS',
          text: snippet,
          url: appLink,
        });
        onClose();
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${snippet}\n${appLink}`);
      showToast('Post link and text copied to clipboard.', 'success');
      onClose();
    } catch {
      showToast('Could not copy share text.', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <GlassCard
        elevated
        padding="lg"
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl relative space-y-4 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
          aria-label="Close share dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] pr-10">
          Share Post
        </h2>

        <form onSubmit={handleShareToFeed} className="space-y-3">
          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Say something about this (optional)..."
            className="w-full p-3 rounded-xl bg-white/85 dark:bg-[#080610]/75 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
          />

          <div className="rounded-xl p-3 bg-black/15 dark:bg-[#080610]/60 border border-[#D4AF37]/25 space-y-1">
            <p className="text-xs font-royal-ui font-bold text-[#F5D88A]">
              {targetOriginal.profiles?.full_name || 'Youth Member'}
            </p>
            <p className="text-xs text-slate-700 dark:text-[#F5F1FF]/85 line-clamp-3">
              {targetOriginal.content || (targetOriginal.image_url ? '📷 Shared photo' : 'Shared post')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as 'district' | 'church')}
              aria-label="Share audience"
              className="min-h-[44px] px-3 rounded-xl bg-white/85 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-xs font-royal-ui font-semibold text-slate-900 dark:text-[#F5F1FF]"
            >
              <option value="district">Whole District</option>
              {profile?.church_id && <option value="church">My Church</option>}
            </select>

            <button
              type="submit"
              disabled={sharing || isSuspended}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Repeat2 className="w-4 h-4" />
              <span>{sharing ? 'Sharing...' : 'Share to my feed'}</span>
            </button>
          </div>
        </form>

        <div className="pt-2 border-t border-[#D4AF37]/20">
          <button
            type="button"
            onClick={handleShareOutside}
            className="w-full min-h-[44px] px-4 rounded-xl royal-glass border border-[#D4AF37]/35 font-royal-ui text-xs font-semibold text-slate-900 dark:text-[#F5D88A] inline-flex items-center justify-center gap-2 hover:bg-[#31005F]/35"
          >
            <Share2 className="w-4 h-4" />
            <span>Share outside (WhatsApp / Copy)</span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
