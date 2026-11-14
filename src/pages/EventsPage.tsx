import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, List, MapPin, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useToast } from '@/src/context/ToastContext';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { type EventItem, type EventRsvp, type RsvpStatus } from '@/src/types/database';
import { GlassCard } from '@/src/components/GlassCard';
import { EmptyState, ErrorState, SkeletonCard } from '@/src/components/StateViews';

export const EventsPage: React.FC = () => {
  const { user, profile, churches, isAdmin, isDistrictAdmin } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState('');
  const [churchId, setChurchId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [evtRes, rsvpRes] = await Promise.all([
      supabase.from('events').select('*, churches(id, name)').order('starts_at', { ascending: true }),
      supabase.from('event_rsvps').select('event_id, user_id, status'),
    ]);

    if (evtRes.error) {
      setError(evtRes.error.message);
    } else {
      setEvents((evtRes.data as EventItem[]) || []);
    }

    if (!rsvpRes.error && rsvpRes.data) {
      setRsvps(rsvpRes.data as EventRsvp[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRsvp = async (eventId: string, status: RsvpStatus) => {
    if (!user) return;
    const existing = rsvps.find((r) => r.event_id === eventId && r.user_id === user.id);

    if (existing) {
      const { error: err } = await supabase
        .from('event_rsvps')
        .update({ status })
        .eq('event_id', eventId)
        .eq('user_id', user.id);
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      setRsvps((prev) =>
        prev.map((r) => (r.event_id === eventId && r.user_id === user.id ? { ...r, status } : r))
      );
    } else {
      const { data, error: err } = await supabase
        .from('event_rsvps')
        .upsert({ event_id: eventId, user_id: user.id, status }, { onConflict: 'event_id,user_id' })
        .select('event_id, user_id, status')
        .single();
      if (err) {
        showToast(err.message, 'error');
        return;
      }
      if (data) setRsvps((prev) => [...prev, data as EventRsvp]);
    }
    showToast(`RSVP updated: ${status.toUpperCase()}`, 'success');
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !startTime) return;
    setSaving(true);
    const chosenChurch = isDistrictAdmin ? (churchId || null) : (profile?.church_id || null);
    const { error: err } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      starts_at: new Date(startTime).toISOString(),
      church_id: chosenChurch,
      created_by: user.id,
    });
    setSaving(false);

    if (err) {
      showToast(err.message, 'error');
      return;
    }
    showToast('Event scheduled.', 'success');
    setTitle('');
    setDescription('');
    setLocation('');
    setStartTime('');
    setShowCreate(false);
    loadEvents();
  };

  const handleDeleteEvent = async (id: string) => {
    const { error: err } = await supabase.from('events').delete().eq('id', id);
    if (err) {
      showToast(err.message, 'error');
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
    showToast('Event deleted.', 'info');
  };

  // Calendar Grid Calculations
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const eventsByDate = useMemo(() => {
    const map: Record<string, EventItem[]> = {};
    for (const evt of events) {
      const dtStr = evt.starts_at || evt.start_time || evt.event_date;
      if (!dtStr) continue;
      const d = new Date(dtStr);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(evt);
    }
    return map;
  }, [events]);

  const visibleListEvents = useMemo(() => {
    if (viewMode === 'calendar' && selectedDay) {
      return eventsByDate[selectedDay] || [];
    }
    return events;
  }, [viewMode, selectedDay, eventsByDate, events]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-royal-display text-2xl font-bold text-gold-gradient">
            {t.nav.events}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#C7A4FF]">
            Youth rallies, Sabbath programmes, and fellowship gatherings
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl royal-glass">
            <button
              type="button"
              onClick={() => {
                setViewMode('list');
                setSelectedDay(null);
              }}
              className={`min-h-[40px] px-3 rounded-lg inline-flex items-center gap-1.5 font-royal-ui text-xs font-semibold transition ${
                viewMode === 'list' ? 'bg-[#8B24FF] text-white' : 'text-slate-600 dark:text-[#C7A4FF]'
              }`}
            >
              <List className="w-4 h-4" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`min-h-[40px] px-3 rounded-lg inline-flex items-center gap-1.5 font-royal-ui text-xs font-semibold transition ${
                viewMode === 'calendar' ? 'bg-[#8B24FF] text-white' : 'text-slate-600 dark:text-[#C7A4FF]'
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              <span>Calendar</span>
            </button>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>New Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <GlassCard padding="md">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setCalMonth(new Date(year, month - 1, 1))}
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-[#31005F]/30 text-slate-700 dark:text-[#F5D88A]"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="font-royal-serif text-lg font-bold text-slate-900 dark:text-[#F5F1FF]">
              {calMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            <button
              type="button"
              onClick={() => setCalMonth(new Date(year, month + 1, 1))}
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center hover:bg-[#31005F]/30 text-slate-700 dark:text-[#F5D88A]"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-royal-ui font-semibold text-slate-500 dark:text-[#C7A4FF]/70 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="h-11" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = eventsByDate[dateKey] || [];
              const isSelected = selectedDay === dateKey;
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                  className={`h-11 rounded-xl flex flex-col items-center justify-center text-sm font-medium tabular-nums transition ${
                    isSelected
                      ? 'bg-[#8B24FF] text-white violet-glow'
                      : dayEvents.length > 0
                      ? 'bg-[#31005F]/50 border border-[#D4AF37]/55 text-[#F5D88A]'
                      : 'hover:bg-white/10 text-slate-800 dark:text-[#F5F1FF]'
                  }`}
                >
                  <span>{day}</span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] leading-none text-[#F5D88A] font-semibold">
                      {dayEvents.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Events List */}
      {loading ? (
        <div className="space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadEvents} />
      ) : visibleListEvents.length === 0 ? (
        <EmptyState
          title={selectedDay ? 'No events on selected date' : 'No events scheduled'}
          description="Check back soon for upcoming Sabbath youth rallies and district programmes."
          icon={<CalendarIcon className="w-6 h-6" />}
        />
      ) : (
        <div className="space-y-4">
          {visibleListEvents.map((evt) => {
            const evtRsvps = rsvps.filter((r) => r.event_id === evt.id);
            const myRsvp = evtRsvps.find((r) => r.user_id === user?.id)?.status;
            const goingCount = evtRsvps.filter((r) => r.status === 'going').length;
            const maybeCount = evtRsvps.filter((r) => r.status === 'maybe').length;
            const dt = evt.starts_at || evt.start_time || evt.event_date;

            return (
              <GlassCard key={evt.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[#F5D88A] mb-1">
                      <span>{evt.churches?.name || t.common.districtWide}</span>
                      {dt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {new Date(dt).toLocaleString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </>
                      )}
                      {evt.location && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {evt.location}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
                      {evt.title}
                    </h2>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(evt.id)}
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/15 shrink-0"
                      aria-label="Delete event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {evt.description && (
                  <p className="mt-2.5 text-base text-slate-700 dark:text-[#F5F1FF]/85">
                    {evt.description}
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-[#D4AF37]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-[#C7A4FF] tabular-nums">
                    <span>{goingCount} Going</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span>{maybeCount} Maybe</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['going', 'maybe', 'no'] as RsvpStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => handleRsvp(evt.id, status)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl font-royal-ui text-xs font-semibold capitalize transition ${
                          myRsvp === status
                            ? 'bg-[#8B24FF] text-white border border-[#F5D88A]/60 violet-glow'
                            : 'border border-[#D4AF37]/30 text-slate-700 dark:text-[#C7A4FF] hover:bg-[#31005F]/35'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Create Event Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <GlassCard elevated padding="lg" className="w-full max-w-lg relative">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#C7A4FF]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-royal-serif text-xl font-bold text-[#F5D88A] mb-4">
              Schedule Youth Event
            </h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="District Adventist Youth Day"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Kiomwobo SDA Main"
                    className="w-full min-h-[44px] px-3 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  />
                </div>
              </div>

              {isDistrictAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                    Church Scope
                  </label>
                  <select
                    value={churchId}
                    onChange={(e) => setChurchId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                  >
                    <option value="">District-Wide</option>
                    {churches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#C7A4FF] mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3.5 rounded-xl bg-white/80 dark:bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-slate-900 dark:text-[#F5F1FF]"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] text-[#080610] font-royal-ui text-sm font-bold"
              >
                {saving ? 'Saving...' : 'Create Event'}
              </button>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
