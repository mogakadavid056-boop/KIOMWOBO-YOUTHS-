import type { BibleVerse, BibleVersion, Hymn } from '@/src/types/database';

const DB_NAME = 'kiomwobo-youths-offline';
const DB_VERSION = 1;
const BIBLE_STORE = 'bible_chapters';
const HYMN_STORE = 'hymns';

interface CachedBibleChapter {
  key: string; // `${version}:${book}:${chapter}`
  version: BibleVersion;
  book: string;
  chapter: number;
  verses: BibleVerse[];
  cachedAt: number;
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BIBLE_STORE)) {
        db.createObjectStore(BIBLE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(HYMN_STORE)) {
        db.createObjectStore(HYMN_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheBibleChapter(
  version: BibleVersion,
  book: string,
  chapter: number,
  verses: BibleVerse[]
): Promise<void> {
  if (!verses.length) return;
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(BIBLE_STORE, 'readwrite');
    const store = tx.objectStore(BIBLE_STORE);
    const payload: CachedBibleChapter = {
      key: `${version}:${book}:${chapter}`,
      version,
      book,
      chapter,
      verses,
      cachedAt: Date.now(),
    };
    store.put(payload);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // Graceful no-op in restricted browsing contexts
  }
}

export async function getCachedBibleChapter(
  version: BibleVersion,
  book: string,
  chapter: number
): Promise<BibleVerse[] | null> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(BIBLE_STORE, 'readonly');
    const store = tx.objectStore(BIBLE_STORE);
    const req = store.get(`${version}:${book}:${chapter}`);
    return await new Promise<BibleVerse[] | null>((resolve) => {
      req.onsuccess = () => {
        const result = req.result as CachedBibleChapter | undefined;
        resolve(result?.verses ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheHymns(hymns: Hymn[]): Promise<void> {
  if (!hymns.length) return;
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(HYMN_STORE, 'readwrite');
    const store = tx.objectStore(HYMN_STORE);
    for (const hymn of hymns) {
      store.put(hymn);
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // Graceful no-op
  }
}

export async function getCachedHymns(): Promise<Hymn[]> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(HYMN_STORE, 'readonly');
    const store = tx.objectStore(HYMN_STORE);
    const req = store.getAll();
    return await new Promise<Hymn[]>((resolve) => {
      req.onsuccess = () => resolve((req.result as Hymn[]) ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function getOfflineCacheStats(): Promise<{ chapters: number; hymns: number }> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction([BIBLE_STORE, HYMN_STORE], 'readonly');
    const bibleCountReq = tx.objectStore(BIBLE_STORE).count();
    const hymnCountReq = tx.objectStore(HYMN_STORE).count();

    const [chapters, hymns] = await Promise.all([
      new Promise<number>((res) => {
        bibleCountReq.onsuccess = () => res(bibleCountReq.result);
        bibleCountReq.onerror = () => res(0);
      }),
      new Promise<number>((res) => {
        hymnCountReq.onsuccess = () => res(hymnCountReq.result);
        hymnCountReq.onerror = () => res(0);
      }),
    ]);

    return { chapters, hymns };
  } catch {
    return { chapters: 0, hymns: 0 };
  }
}

export async function clearOfflineCache(): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction([BIBLE_STORE, HYMN_STORE], 'readwrite');
    tx.objectStore(BIBLE_STORE).clear();
    tx.objectStore(HYMN_STORE).clear();
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch {
    // No-op
  }
}
