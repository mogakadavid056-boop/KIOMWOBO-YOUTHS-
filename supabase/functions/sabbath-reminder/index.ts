/**
 * Server-Side Push Reminder Scaffold (Supabase Edge Function - Prepared for Future Deployment)
 *
 * Purpose:
 * Browsers and mobile WebViews may suspend background timers when the app is completely closed.
 * Scheduling a Supabase Cron job (e.g., every 15 minutes on Fridays) to invoke this Edge Function
 * ensures reliable Web Push delivery via VAPID keys.
 *
 * Required Supabase Edge Function Secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT (e.g., "mailto:admin@kiomwobo.org")
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import SunCalc from 'https://esm.sh/suncalc@1.9.0';

export async function handleSabbathPushJob(): Promise<{ checked: number; sent: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: locSetting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'sabbath_location')
    .maybeSingle();

  const loc = (locSetting?.value as { lat: number; lng: number; timezone: string } | null) ?? {
    lat: -0.6817,
    lng: 34.7667,
    timezone: 'Africa/Nairobi',
  };

  const now = new Date();
  const times = SunCalc.getTimes(now, loc.lat, loc.lng);
  const sunsetTime = times.sunset;
  const minutesUntilSunset = Math.round((sunsetTime.getTime() - now.getTime()) / 60_000);

  const { data: usersToNotify } = await admin
    .from('user_settings')
    .select('user_id, language, reminder_minutes')
    .eq('sabbath_reminder', true);

  if (!usersToNotify || usersToNotify.length === 0) {
    return { checked: 0, sent: 0 };
  }

  let sent = 0;
  for (const userSetting of usersToNotify as Array<{ user_id: string; language?: string; reminder_minutes: number }>) {
    if (Math.abs(minutesUntilSunset - userSetting.reminder_minutes) > 15) continue;

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', userSetting.user_id);

    if (!subs || subs.length === 0) continue;

    const hhmm = new Intl.DateTimeFormat('en-GB', {
      timeZone: loc.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(sunsetTime);

    const body =
      userSetting.language === 'sw'
        ? `Sabato inaanza saa ${hhmm}. Jiandae. Sabato njema!`
        : `Sabbath begins at ${hhmm}. Time to prepare. Happy Sabbath!`;

    // TODO: Sign and deliver Web Push payload using VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
    // for (const row of subs) { await webpush.sendNotification(row.subscription, JSON.stringify({ title: 'KIOMWOBO YOUTHS', body })); }
    void body;
    sent += subs.length;
  }

  return { checked: usersToNotify.length, sent };
}
