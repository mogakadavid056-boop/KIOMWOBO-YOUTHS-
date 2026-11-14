import { Capacitor } from '@capacitor/core';
import { isSupabaseConfigured, supabase } from './supabase';

const NOTIF_PREF_KEY = 'kiomwobo_notifications_enabled';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
  } catch {
    return null;
  }
}

export function isNotificationsLocallyEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIF_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setNotificationsLocallyEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIF_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export interface PushStatusResult {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

export async function getPushStatus(userId?: string): Promise<PushStatusResult> {
  const localPref = (() => {
    try {
      return localStorage.getItem(NOTIF_PREF_KEY) === 'true';
    } catch {
      return false;
    }
  })();

  if (typeof window === 'undefined') {
    return { supported: false, permission: 'unsupported', subscribed: localPref };
  }

  const hasBrowserNotif = 'Notification' in window;
  const permission: NotificationPermission | 'unsupported' = hasBrowserNotif
    ? Notification.permission
    : 'unsupported';

  let subscribed = localPref;

  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg?.pushManager) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) subscribed = true;
    }
  } catch {
    // ignore pushManager error in WebView/dev
  }

  if (!subscribed && userId && isSupabaseConfigured) {
    try {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .limit(1);
      if (data && data.length > 0) subscribed = true;
    } catch {
      // ignore
    }
  }

  return {
    supported: hasBrowserNotif || Capacitor.isNativePlatform(),
    permission,
    subscribed,
  };
}

export async function subscribeToPushNotifications(
  userId: string
): Promise<{ ok: boolean; message: string }> {
  let permission: NotificationPermission = 'default';

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      permission = await Notification.requestPermission();
      if (permission === 'denied') {
        return {
          ok: false,
          message: 'Notification permission was blocked in browser settings.',
        };
      }
    } catch {
      // WebView may not support Notification.requestPermission()
    }
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  let subPayload: Record<string, unknown> = {
    endpoint: Capacitor.isNativePlatform()
      ? `android-app://${userId}`
      : `in-app-realtime://${userId}`,
    platform: Capacitor.isNativePlatform() ? 'android' : 'web',
    updated_at: new Date().toISOString(),
  };

  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg?.pushManager) {
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription && vapidKey && permission === 'granted') {
        const appServerKey = urlBase64ToUint8Array(vapidKey);
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey.buffer as ArrayBuffer,
        });
      }
      if (subscription) {
        subPayload = subscription.toJSON() as Record<string, unknown>;
      }
    }
  } catch {
    // Fallback gracefully to realtime + local notifications
  }

  if (isSupabaseConfigured) {
    const { data: existing, error: selErr } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (selErr) {
      return { ok: false, message: selErr.message };
    }

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from('push_subscriptions')
        .update({ subscription: subPayload })
        .eq('id', existing.id);
      if (updErr) return { ok: false, message: updErr.message };
    } else {
      const { error: insErr } = await supabase
        .from('push_subscriptions')
        .insert({ user_id: userId, subscription: subPayload });
      if (insErr) return { ok: false, message: insErr.message };
    }
  }

  setNotificationsLocallyEnabled(true);

  return {
    ok: true,
    message: 'Notifications enabled for announcements, events, and chat.',
  };
}

export async function unsubscribeFromPushNotifications(
  userId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg?.pushManager) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);
      if (error) return { ok: false, message: error.message };
    }

    setNotificationsLocallyEnabled(false);
    return { ok: true, message: 'Notifications disabled.' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unable to unsubscribe.',
    };
  }
}
