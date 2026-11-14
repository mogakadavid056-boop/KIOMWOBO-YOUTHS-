let sabbathTimerId = null;

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'SABBATH_SCHEDULE') return;

  if (sabbathTimerId !== null) {
    clearTimeout(sabbathTimerId);
    sabbathTimerId = null;
  }

  if (!data.enabled || !data.triggerAtMs) return;

  const delay = data.triggerAtMs - Date.now();
  if (delay <= 0 || delay > 2147483647) return;

  sabbathTimerId = setTimeout(() => {
    self.registration.showNotification(data.title || 'KIOMWOBO YOUTHS', {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'sabbath-reminder',
    });
    sabbathTimerId = null;
  }, delay);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
