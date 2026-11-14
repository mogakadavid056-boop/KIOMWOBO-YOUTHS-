import React, { useEffect, useState } from 'react';
import { Bell, Calendar, MapPin, Sunset } from 'lucide-react';
import { useSocial } from '@/src/context/SocialContext';
import { formatCountdownDuration, getUpcomingSabbathWindows } from '@/src/lib/sabbath';
import { type AppRoute } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { ErrorState, SkeletonCard } from '@/src/components/StateViews';

interface SabbathPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const SabbathPage: React.FC<SabbathPageProps> = ({ onNavigate }) => {
  const { sabbathLocation, refreshSabbathLocation } = useSocial();
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshSabbathLocation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Sabbath location');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const windows = getUpcomingSabbathWindows(sabbathLocation, 4, now);
  const current = windows[0];
  const inSabbath = current
    ? now.getTime() >= current.start.getTime() && now.getTime() < current.end.getTime()
    : false;
  const countdownText = current
    ? inSabbath
      ? `Sabbath ends in ${formatCountdownDuration(current.end.getTime() - now.getTime())}`
      : `Sabbath begins in ${formatCountdownDuration(current.start.getTime() - now.getTime())}`
    : '';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            Sabbath Times
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600 dark:text-[#C7A4FF]">
            <MapPin className="w-4 h-4 text-[#D4AF37]" />
            <span>
              {sabbathLocation.name} ({sabbathLocation.timezone})
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="min-h-[44px] px-4 py-2 rounded-xl royal-glass inline-flex items-center gap-2 font-royal-ui text-xs font-semibold text-[#F5D88A] self-start sm:self-auto"
        >
          <Bell className="w-4 h-4 text-[#D4AF37]" />
          <span>Reminder Settings</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={handleLoad} />
      ) : (
        <>
          {current && (
            <GlassCard elevated padding="lg">
              <div className="flex items-center gap-2.5 text-[#D4AF37]">
                <Sunset className="w-5 h-5" />
                <h2 className="font-royal-ui text-xs font-semibold uppercase tracking-[0.16em] text-[#B8891B] dark:text-[#F5D88A]">
                  {inSabbath ? 'Happy Sabbath' : 'Upcoming Sabbath'}
                </h2>
              </div>

              <p className="mt-2 font-royal-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#F5F1FF] tabular-nums">
                {countdownText}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-[#D4AF37]/20">
                <div>
                  <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">
                    Begins ({current.fridayLabel})
                  </p>
                  <p className="mt-0.5 font-royal-display text-xl font-bold text-[#B8891B] dark:text-[#F5D88A] tabular-nums">
                    {current.startFormatted}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-royal-ui text-slate-500 dark:text-[#C7A4FF]">
                    Ends ({current.saturdayLabel})
                  </p>
                  <p className="mt-0.5 font-royal-display text-xl font-bold text-[#B8891B] dark:text-[#F5D88A] tabular-nums">
                    {current.endFormatted}
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          <div className="space-y-3">
            <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5D88A] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#D4AF37]" />
              <span>Next 4 Weeks</span>
            </h2>

            {windows.map((w, idx) => (
              <GlassCard key={w.start.toISOString()} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-royal-ui text-xs font-semibold text-[#B8891B] dark:text-[#F5D88A]">
                    {idx === 0 ? 'This Week' : `Week ${idx + 1}`}
                  </p>
                  <p className="font-royal-body text-base text-slate-800 dark:text-[#F5F1FF]">
                    {w.fridayLabel} – {w.saturdayLabel}
                  </p>
                </div>

                <div className="text-right tabular-nums">
                  <p className="font-royal-ui text-sm font-bold text-slate-900 dark:text-[#F5F1FF]">
                    Fri {w.startFormatted}
                  </p>
                  <p className="font-royal-ui text-xs text-slate-500 dark:text-[#C7A4FF]">
                    Sat {w.endFormatted}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
