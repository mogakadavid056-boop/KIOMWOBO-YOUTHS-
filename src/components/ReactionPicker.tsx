import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { REACTION_META, type ReactionType } from '@/src/types/database';

const REACTION_LIST: ReactionType[] = ['like', 'love', 'pray', 'fire'];

interface ReactionButtonProps {
  myReaction?: ReactionType | null;
  totalCount: number;
  onReact: (reaction: ReactionType) => void;
}

export const ReactionButton: React.FC<ReactionButtonProps> = ({
  myReaction,
  totalCount,
  onReact,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const didHoldRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [pickerOpen]);

  const startHold = () => {
    didHoldRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      didHoldRef.current = true;
      setPickerOpen(true);
    }, 350);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePrimaryTap = () => {
    if (didHoldRef.current) {
      didHoldRef.current = false;
      return;
    }
    if (myReaction) {
      // Tapping my current reaction removes it
      onReact(myReaction);
    } else {
      onReact('like');
    }
  };

  const activeMeta = myReaction ? REACTION_META[myReaction] : REACTION_META.like;

  return (
    <div ref={wrapperRef} className="relative flex items-stretch">
      {pickerOpen && (
        <div className="absolute bottom-full left-0 mb-2 z-40 rounded-full royal-glass-elevated border border-[#D4AF37]/50 px-2 py-1.5 flex items-center gap-1 shadow-2xl">
          {REACTION_LIST.map((r) => {
            const meta = REACTION_META[r];
            const isSelected = myReaction === r;
            return (
              <button
                key={r}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPickerOpen(false);
                  onReact(r);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition hover:scale-125 ${
                  isSelected ? 'bg-[#8B24FF]/50 ring-2 ring-[#F5D88A]' : 'hover:bg-white/10'
                }`}
                title={meta.label}
                aria-label={meta.label}
              >
                {meta.emoji}
              </button>
            );
          })}
        </div>
      )}

      <div
        className={`flex-1 min-h-[44px] rounded-xl flex items-center overflow-hidden transition ${
          myReaction
            ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/60 violet-glow'
            : 'border border-[#D4AF37]/25 text-slate-700 dark:text-[#C7A4FF] hover:bg-[#31005F]/25'
        }`}
      >
        <button
          type="button"
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          onClick={handlePrimaryTap}
          className="flex-1 min-h-[44px] pl-3 pr-1.5 font-royal-ui text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <span className="text-base leading-none">{activeMeta.emoji}</span>
          <span className="truncate tabular-nums">
            {myReaction ? activeMeta.label : 'React'}
            {totalCount > 0 ? ` (${totalCount})` : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPickerOpen((v) => !v);
          }}
          className="min-w-[30px] min-h-[44px] px-1.5 border-l border-[#D4AF37]/20 flex items-center justify-center hover:bg-white/10"
          aria-label="Choose reaction"
        >
          <ChevronUp className={`w-3.5 h-3.5 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
};

interface ReactionSummaryProps {
  reactionCounts?: Partial<Record<ReactionType, number>>;
  totalReactions: number;
  commentsCount: number;
  sharesCount: number;
  onOpenComments?: () => void;
}

export const ReactionSummaryBar: React.FC<ReactionSummaryProps> = ({
  reactionCounts,
  totalReactions,
  commentsCount,
  sharesCount,
  onOpenComments,
}) => {
  const topReactions = REACTION_LIST.filter((r) => (reactionCounts?.[r] || 0) > 0)
    .sort((a, b) => (reactionCounts?.[b] || 0) - (reactionCounts?.[a] || 0))
    .slice(0, 3);

  if (totalReactions === 0 && commentsCount === 0 && sharesCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-[#C7A4FF]/85 pt-0.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {totalReactions > 0 && (
          <>
            <span className="inline-flex items-center -space-x-1">
              {(topReactions.length > 0 ? topReactions : (['like'] as ReactionType[])).map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1C0A38] border border-[#D4AF37]/40 text-xs"
                >
                  {REACTION_META[r].emoji}
                </span>
              ))}
            </span>
            <span className="tabular-nums font-medium">{totalReactions}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 tabular-nums">
        {commentsCount > 0 && (
          <button
            type="button"
            onClick={onOpenComments}
            className="hover:underline"
          >
            {commentsCount} {commentsCount === 1 ? 'comment' : 'comments'}
          </button>
        )}
        {sharesCount > 0 && (
          <span>
            {sharesCount} {sharesCount === 1 ? 'share' : 'shares'}
          </span>
        )}
      </div>
    </div>
  );
};
