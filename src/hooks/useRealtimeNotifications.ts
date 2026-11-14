import { useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { useToast } from '@/src/context/ToastContext';
import { isNotificationsLocallyEnabled } from '@/src/lib/pushNotifications';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

function triggerSystemNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
    });
  } catch {
    // Ignore in environments where Notification constructor is restricted (e.g. Android WebView)
  }
}

export function useRealtimeNotifications() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`user-alerts-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          if (!isNotificationsLocallyEnabled()) return;
          const row = payload.new as { title?: string; church_id?: string | null; author_id?: string | null };
          if (row.author_id === user.id) return;
          if (row.church_id && profile?.church_id && row.church_id !== profile.church_id) return;
          const title = row.title || 'New Announcement';
          showToast(`Announcement: ${title}`, 'info');
          triggerSystemNotification('KIOMWOBO YOUTHS · Announcement', title);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events' },
        (payload) => {
          if (!isNotificationsLocallyEnabled()) return;
          const row = payload.new as { title?: string; church_id?: string | null; created_by?: string | null };
          if (row.created_by === user.id) return;
          if (row.church_id && profile?.church_id && row.church_id !== profile.church_id) return;
          const title = row.title || 'New Youth Event';
          showToast(`New Event: ${title}`, 'info');
          triggerSystemNotification('KIOMWOBO YOUTHS · New Event', title);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (!isNotificationsLocallyEnabled()) return;
          const row = payload.new as { sender_id?: string; content?: string | null };
          if (row.sender_id === user.id) return;
          const preview = row.content ? row.content.slice(0, 70) : 'Sent an image';
          showToast(`New Chat: ${preview}`, 'info');
          triggerSystemNotification('KIOMWOBO YOUTHS · Chat', preview);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile?.church_id, showToast]);
}
