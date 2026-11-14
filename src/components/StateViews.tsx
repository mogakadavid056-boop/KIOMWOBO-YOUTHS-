import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { GlassCard } from './GlassCard';

export const SkeletonCard: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = '',
}) => (
  <GlassCard className={`animate-pulse ${className}`}>
    <div className="h-4 w-1/3 rounded bg-slate-300/60 dark:bg-[#C7A4FF]/20" />
    <div className="mt-4 space-y-2.5">
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className={`h-3.5 rounded bg-slate-200/70 dark:bg-white/10 ${
            idx === lines - 1 ? 'w-2/3' : 'w-full'
          }`}
        />
      ))}
    </div>
  </GlassCard>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => (
  <GlassCard className="text-center py-10 px-6 flex flex-col items-center">
    <div className="w-12 h-12 rounded-2xl bg-[#31005F]/35 border border-[#D4AF37]/30 flex items-center justify-center text-[#F5D88A]">
      {icon ?? <Inbox className="w-6 h-6" />}
    </div>
    <h3 className="mt-4 font-royal-serif text-lg font-semibold text-slate-900 dark:text-[#F5F1FF]">
      {title}
    </h3>
    <p className="mt-1.5 max-w-md text-base text-slate-600 dark:text-[#C7A4FF]/85">
      {description}
    </p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#8B24FF] text-white font-royal-ui text-sm font-semibold hover:bg-[#7A18EB] transition"
      >
        {actionLabel}
      </button>
    )}
  </GlassCard>
);

export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <GlassCard className="text-center py-8 px-6 flex flex-col items-center border-red-400/40">
    <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-400/35 flex items-center justify-center text-red-400">
      <AlertTriangle className="w-6 h-6" />
    </div>
    <p className="mt-3 text-base text-red-600 dark:text-red-300 max-w-md">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#D4AF37]/40 text-sm font-royal-ui font-semibold text-slate-800 dark:text-[#F5D88A] hover:bg-[#31005F]/30 transition"
      >
        <RefreshCw className="w-4 h-4" />
        <span>Try again</span>
      </button>
    )}
  </GlassCard>
);
