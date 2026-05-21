// ═══════════════════════════════════════════════════════════════
// ParaHype Service Worker v2
// - Offline caching (app shell + API responses)
// - Push notifications (habit reminders, buddy alerts, streak)
// - Background sync for offline habit toggles
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'parahype-v2';
const API_CACHE = 'parahype-api-v1';
const WORKER_URL = 'https://parahype-api.betha-a.workers.dev';

// App shell — files needed for the app to work offline
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/dashboard.html',
  '/landing.html',
  '/subscribe.html',
  '/privacy.html',
  '/accessibility.html',
];

// External resources to cache (fonts, Google auth)
const EXTERNAL_CACHE = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&family=Space+Grotesk:wght@500;600;700&display=swap',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache app shell — don't fail install if some files 404
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(err => console.warn('Cache skip:', url, err)))
      );
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (POST habit toggles etc go through normally)
  if (event.request.method !== 'GET') return;

  // API requests: network-first, cache fallback
  if (url.origin === WORKER_URL) {
    event.respondWith(networkFirstAPI(event.request));
    return;
  }

  // App shell and same-origin: cache-first, network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstShell(event.request));
    return;
  }

  // External (fonts, CDN): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// Cache-first for app shell
async function cacheFirstShell(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline fallback — serve index.html for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// Network-first for API calls (fresh data preferred, cached fallback)
async function networkFirstAPI(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Stale-while-revalidate for external resources
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// ═══════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
self.addEventListener('push', event => {
  let data = { title: 'ParaHype', body: 'Time to check in!', icon: '/icon-192.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: '/icon-badge-72.png',
    tag: data.tag || 'parahype-notification',
    renotify: data.renotify || false,
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      type: data.type || 'general'
    },
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const action = event.action;

  // Handle action buttons
  if (action === 'check-habit') {
    // Opens app to habits tab
    event.waitUntil(openApp('/index.html#habits'));
    return;
  }
  if (action === 'start-focus') {
    event.waitUntil(openApp('/index.html#focus'));
    return;
  }
  if (action === 'dismiss') {
    return; // Just close
  }

  // Default: open the app
  event.waitUntil(openApp(url));
});

async function openApp(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // Focus existing tab if open
  for (const client of clients) {
    if (client.url.includes(self.location.origin)) {
      client.focus();
      if (url !== '/') client.navigate(url);
      return;
    }
  }
  // Otherwise open new tab
  return self.clients.openWindow(url);
}

// Handle notification close (for analytics later)
self.addEventListener('notificationclose', event => {
  // Could log dismissed notifications for analytics
});

// ═══════════════════════════════════════════════════════════════
// BACKGROUND SYNC (for offline habit toggles)
// ═══════════════════════════════════════════════════════════════
self.addEventListener('sync', event => {
  if (event.tag === 'sync-habits') {
    event.waitUntil(syncPendingHabits());
  }
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncPendingTasks());
  }
});

async function syncPendingHabits() {
  // Read pending habit toggles from IndexedDB
  // This gets called when connectivity returns
  try {
    const db = await openSyncDB();
    const tx = db.transaction('pending_habits', 'readwrite');
    const store = tx.objectStore('pending_habits');
    const all = await storeGetAll(store);

    for (const item of all) {
      try {
        const token = item.token;
        await fetch(WORKER_URL + '/api/daily/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ habitId: item.habitId })
        });
        store.delete(item.id);
      } catch (e) {
        console.warn('Sync habit failed:', e);
      }
    }
  } catch (e) {
    console.warn('syncPendingHabits error:', e);
  }
}

async function syncPendingTasks() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction('pending_tasks', 'readwrite');
    const store = tx.objectStore('pending_tasks');
    const all = await storeGetAll(store);

    for (const item of all) {
      try {
        const token = item.token;
        await fetch(WORKER_URL + item.endpoint, {
          method: item.method || 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(item.body)
        });
        store.delete(item.id);
      } catch (e) {
        console.warn('Sync task failed:', e);
      }
    }
  } catch (e) {
    console.warn('syncPendingTasks error:', e);
  }
}

// IndexedDB helpers for background sync
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('parahype-sync', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending_habits')) {
        db.createObjectStore('pending_habits', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_tasks')) {
        db.createObjectStore('pending_tasks', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function storeGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ═══════════════════════════════════════════════════════════════
// PERIODIC BACKGROUND SYNC (for scheduled notifications)
// Not all browsers support this yet, but it's the right pattern
// ═══════════════════════════════════════════════════════════════
self.addEventListener('periodicsync', event => {
  if (event.tag === 'morning-checkin') {
    event.waitUntil(showMorningReminder());
  }
});

async function showMorningReminder() {
  const hour = new Date().getHours();
  if (hour < 7 || hour > 10) return; // Only 7-10 AM

  self.registration.showNotification('ParaHype', {
    body: "Good morning! Your habits are waiting. Let's start strong today.",
    icon: '/icon-192.png',
    badge: '/icon-badge-72.png',
    tag: 'morning-checkin',
    actions: [
      { action: 'check-habit', title: 'Check habits' },
      { action: 'dismiss', title: 'Later' }
    ],
    data: { url: '/index.html', type: 'morning' }
  });
}
