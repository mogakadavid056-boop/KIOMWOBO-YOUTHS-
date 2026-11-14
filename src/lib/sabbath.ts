import { getTimes } from 'suncalc';
import { isSupabaseConfigured, supabase } from './supabase';
import { type SabbathLocation, type UserSettings } from '@/src/types/database';

export const DEFAULT_SABBATH_LOCATION: SabbathLocation = {
  lat: -0.6817,
  lng: 34.7667,
  name: 'Kiomwobo, Kisii',
  timezone: 'Africa/Nairobi',
};

export interface SabbathWindow {
  fridayDate: Date;
  saturdayDate: Date;
  start: Date;
  end: Date;
  startFormatted: string;
  endFormatted: string;
  fridayLabel: string;
  saturdayLabel: string;
}

export function formatTimeInZone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}

export function formatDateInZone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || 'Africa/Nairobi',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

function getZonedDateParts(date: Date, timezone: string): { year: number; month: number; day: number; weekday: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Africa/Nairobi',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    const parts = fmt.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      weekday: wkMap[map.weekday] ?? date.getDay(),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      weekday: date.getDay(),
    };
  }
}

function computeSunsetForCalendarDay(year: number, month: number, day: number, lat: number, lng: number): Date {
  const solarRef = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const times = getTimes(solarRef, lat, lng);
  return times.sunset ?? new Date(Date.UTC(year, month - 1, day, 15, 30, 0));
}

export function getUpcomingSabbathWindows(
  location: SabbathLocation,
  weeks = 4,
  now = new Date()
): SabbathWindow[] {
  const { year, month, day, weekday } = getZonedDateParts(now, location.timezone);
  let daysToFriday = 5 - weekday;
  if (weekday === 6) {
    daysToFriday = -1;
  }

  const baseAnchor = new Date(Date.UTC(year, month - 1, day + daysToFriday, 12, 0, 0));
  const windows: SabbathWindow[] = [];

  let weekOffset = 0;
  while (windows.length < weeks) {
    const fri = new Date(baseAnchor.getTime() + weekOffset * 7 * 86400_000);
    const sat = new Date(fri.getTime() + 86400_000);

    const start = computeSunsetForCalendarDay(
      fri.getUTCFullYear(),
      fri.getUTCMonth() + 1,
      fri.getUTCDate(),
      location.lat,
      location.lng
    );
    const end = computeSunsetForCalendarDay(
      sat.getUTCFullYear(),
      sat.getUTCMonth() + 1,
      sat.getUTCDate(),
      location.lat,
      location.lng
    );

    if (end.getTime() > now.getTime()) {
      windows.push({
        fridayDate: fri,
        saturdayDate: sat,
        start,
        end,
        startFormatted: formatTimeInZone(start, location.timezone),
        endFormatted: formatTimeInZone(end, location.timezone),
        fridayLabel: formatDateInZone(start, location.timezone),
        saturdayLabel: formatDateInZone(end, location.timezone),
      });
    }
    weekOffset += 1;
    if (weekOffset > weeks + 4) break;
  }

  return windows;
}

export function formatCountdownDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export async function fetchSabbathLocation(): Promise<SabbathLocation> {
  if (!isSupabaseConfigured) return DEFAULT_SABBATH_LOCATION;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'sabbath_location')
      .maybeSingle();

    const val = data?.value as Partial<SabbathLocation> | null | undefined;
    if (val && typeof val.lat === 'number' && typeof val.lng === 'number') {
      return {
        lat: val.lat,
        lng: val.lng,
        name: String(val.name || DEFAULT_SABBATH_LOCATION.name),
        timezone: String(val.timezone || DEFAULT_SABBATH_LOCATION.timezone),
      };
    }
  } catch {
    // Fallback to Kiomwobo coordinates
  }
  return DEFAULT_SABBATH_LOCATION;
}

export async function fetchUserSettings(userId: string): Promise<UserSettings> {
  const fallback: UserSettings = {
    user_id: userId,
    sabbath_reminder: false,
    reminder_minutes: 60,
    show_online: true,
  };
  if (!isSupabaseConfigured || !userId) return fallback;

  const { data } = await supabase
    .from('user_settings')
    .select('user_id, language, sabbath_reminder, reminder_minutes, show_online')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return fallback;
  const mins = Number(data.reminder_minutes);
  return {
    user_id: userId,
    language: data.language === 'sw' ? 'sw' : 'en',
    sabbath_reminder: Boolean(data.sabbath_reminder),
    reminder_minutes: mins === 30 || mins === 60 || mins === 120 || mins === 180 ? mins : 60,
    show_online: data.show_online !== false,
  };
}

export function getSabbathReminderCopy(lang: 'en' | 'sw', startTimeHHMM: string): { title: string; body: string } {
  if (lang === 'sw') {
    return {
      title: 'KIOMWOBO YOUTHS · Sabato',
      body: `Sabato inaanza saa ${startTimeHHMM}. Jiandae. Sabato njema!`,
    };
  }
  return {
    title: 'KIOMWOBO YOUTHS · Sabbath',
    body: `Sabbath begins at ${startTimeHHMM}. Time to prepare. Happy Sabbath!`,
  };
}
