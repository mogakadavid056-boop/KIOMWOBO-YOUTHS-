import React, { useEffect, useRef, useState } from 'react';
import { Ban, Eye, EyeOff, Flag, MoreVertical, ShieldAlert, Trash2, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useToast } from '@/src/context/ToastContext';
import { supabase } from '@/src/lib/supabase';
import {
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetType,
} from '@/src/types/database';
import { GlassCard } from './GlassCard';

export interface ReportRequest {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string | null;
  label?: string;
  onDone?: () => void;
}

export interface BlockRequest {
  userId: string;
  userName?: string | null;
  onBlocked?: () => void;
}

interface ReportModalProps {
  request: ReportRequest | null;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ request, onClose }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (request) {
      setReason('harassment');
      setDetails('');
    }
  }, [request]);

  if (!request) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSubmitting(true);

    try {
      if (request.targetType === 'message') {
        const { error } = await supabase.rpc('report_message', {
          p_message: request.targetId,
          p_reason: reason,
          p_details: details.trim() || null,
        });
        if (error) {
          showToast(error.message, 'error');
          setSubmitting(false);
          return;
        }
        showToast(
          'Reported. Only admins will see this report and the recent messages around it. Your other chats stay private.',
          'success'
        );
      } else {
        const { error } = await supabase.from('reports').insert({
          reporter_id: user.id,
          target_type: request.targetType,
          target_id: request.targetId,
          target_user_id: request.targetUserId || null,
          reason,
          details: details.trim() || null,
          status: 'open',
        });
        if (error) {
          showToast(error.message, 'error');
          setSubmitting(false);
          return;
        }
        showToast('Thank you. Our admins will review this.', 'success');
      }

      request.onDone?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <GlassCard
        elevated
        padding="lg"
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl relative max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#C7A4FF]"
          aria-label="Close report dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 pr-10">
          <Flag className="w-5 h-5 text-amber-400 shrink-0" />
          <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A]">
            Report {request.label || request.targetType}
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-[#C7A4FF]/85">
          Reports are confidential and reviewed by Kiomwobo Youths Admins.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-royal-ui font-semibold uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF]">
              Select Reason
            </label>
            <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-left font-royal-ui text-sm font-medium transition border ${
                    reason === r.id
                      ? 'bg-[#8B24FF]/35 border-[#F5D88A] text-white'
                      : 'bg-black/10 dark:bg-[#080610]/55 border-[#D4AF37]/20 text-slate-800 dark:text-[#F5F1FF]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-royal-ui font-semibold uppercase tracking-wider text-slate-500 dark:text-[#C7A4FF] mb-1.5">
              Additional details (optional)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Explain what happened..."
              className="w-full p-3 rounded-xl bg-white/85 dark:bg-[#080610]/75 border border-[#D4AF37]/30 text-sm text-slate-900 dark:text-[#F5F1FF]"
            />
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-[#D4AF37]/30 font-royal-ui text-xs font-semibold text-slate-700 dark:text-[#C7A4FF]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
};

interface BlockConfirmModalProps {
  request: BlockRequest | null;
  onClose: () => void;
  onConfirmBlock: (userId: string) => Promise<boolean>;
}

export const BlockConfirmModal: React.FC<BlockConfirmModalProps> = ({
  request,
  onClose,
  onConfirmBlock,
}) => {
  const [busy, setBusy] = useState(false);

  if (!request) return null;

  const displayName = request.userName || 'this member';

  const handleConfirm = async () => {
    setBusy(true);
    const ok = await onConfirmBlock(request.userId);
    setBusy(false);
    if (ok) {
      request.onBlocked?.();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <GlassCard
        elevated
        padding="lg"
        className="w-full max-w-sm relative space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <h2 className="font-royal-serif text-lg font-bold text-[#F5D88A]">
            Block {displayName}?
          </h2>
        </div>

        <p className="font-royal-body text-sm text-slate-700 dark:text-[#F5F1FF]/90 leading-relaxed">
          You will no longer see {displayName}&apos;s posts, comments, or stories, and neither of
          you can send private messages to each other. You can unblock them anytime in Settings.
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl border border-[#D4AF37]/30 font-royal-ui text-xs font-semibold text-slate-700 dark:text-[#C7A4FF]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Ban className="w-4 h-4" />
            <span>{busy ? 'Blocking...' : 'Block User'}</span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
};

interface SafetyActionMenuProps {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string | null;
  targetUserName?: string | null;
  isOwn?: boolean;
  canDelete?: boolean;
  canHide?: boolean;
  isHidden?: boolean;
  onDelete?: () => void;
  onToggleHide?: () => void;
  onReport: () => void;
  onBlock?: () => void;
  lightButton?: boolean;
}

export const SafetyActionMenu: React.FC<SafetyActionMenuProps> = ({
  targetUserId,
  isOwn = false,
  canDelete = false,
  canHide = false,
  isHidden = false,
  onDelete,
  onToggleHide,
  onReport,
  onBlock,
  lightButton = false,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center transition ${
          lightButton
            ? 'bg-black/40 text-white hover:bg-black/60'
            : 'text-slate-500 dark:text-[#C7A4FF] hover:bg-[#31005F]/30'
        }`}
        aria-label="More options"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 mt-1 w-44 rounded-xl royal-glass-elevated border border-[#D4AF37]/40 py-1.5 z-50 shadow-2xl"
        >
          {canHide && onToggleHide && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onToggleHide();
              }}
              className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-slate-800 dark:text-[#F5F1FF] hover:bg-[#31005F]/45 flex items-center gap-2"
            >
              {isHidden ? <Eye className="w-4 h-4 text-[#F5D88A]" /> : <EyeOff className="w-4 h-4 text-[#F5D88A]" />}
              <span>{isHidden ? 'Unhide' : 'Hide'}</span>
            </button>
          )}

          {canDelete && onDelete && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-red-400 hover:bg-red-500/15 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}

          {!isOwn && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onReport();
              }}
              className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-amber-400 hover:bg-amber-500/10 flex items-center gap-2"
            >
              <Flag className="w-4 h-4" />
              <span>Report</span>
            </button>
          )}

          {!isOwn && targetUserId && onBlock && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onBlock();
              }}
              className="w-full min-h-[40px] px-3.5 text-left text-xs font-royal-ui font-semibold text-red-400 hover:bg-red-500/15 flex items-center gap-2"
            >
              <Ban className="w-4 h-4" />
              <span>Block user</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
