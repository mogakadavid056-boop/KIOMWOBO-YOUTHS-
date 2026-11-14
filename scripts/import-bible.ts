/**
 * Local CLI script to import Bible verses (KJV or SWAHILI) into Supabase in batches of 500.
 *
 * Usage:
 *   SUPABASE_URL="https://your-project.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
 *   npx tsx scripts/import-bible.ts path/to/kjv.json KJV
 *
 * Supported JSON shapes:
 *   1. Array of { book, chapter, verse, text, version? }
 *   2. Nested { books: [{ name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }
 *   3. Nested { [bookName]: { [chapterNum]: { [verseNum]: text } } }
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface VerseInsertRow {
  version: 'KJV' | 'SWAHILI';
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

const BATCH_SIZE = 500;

function normalizeBibleJson(raw: unknown, defaultVersion: 'KJV' | 'SWAHILI'): VerseInsertRow[] {
  const rows: VerseInsertRow[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const book = String(rec.book ?? rec.book_name ?? '').trim();
      const chapter = Number(rec.chapter);
      const verse = Number(rec.verse);
      const text = String(rec.text ?? '').trim();
      const version = (String(rec.version ?? defaultVersion).toUpperCase() === 'SWAHILI'
        ? 'SWAHILI'
        : 'KJV') as 'KJV' | 'SWAHILI';

      if (book && Number.isFinite(chapter) && Number.isFinite(verse) && text) {
        rows.push({ version, book, chapter, verse, text });
      }
    }
    return rows;
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.books)) {
      for (const b of obj.books as Array<Record<string, unknown>>) {
        const book = String(b.name ?? b.book ?? '').trim();
        const chapters = Array.isArray(b.chapters) ? b.chapters : [];
        for (const ch of chapters as Array<Record<string, unknown>>) {
          const chapter = Number(ch.chapter);
          const verses = Array.isArray(ch.verses) ? ch.verses : [];
          for (const v of verses as Array<Record<string, unknown>>) {
            const verse = Number(v.verse);
            const text = String(v.text ?? '').trim();
            if (book && Number.isFinite(chapter) && Number.isFinite(verse) && text) {
              rows.push({ version: defaultVersion, book, chapter, verse, text });
            }
          }
        }
      }
      return rows;
    }

    // Object map: { Book: { "1": { "1": "..." } } }
    for (const [bookName, chaptersObj] of Object.entries(obj)) {
      if (!chaptersObj || typeof chaptersObj !== 'object') continue;
      for (const [chNum, versesObj] of Object.entries(chaptersObj as Record<string, unknown>)) {
        const chapter = Number(chNum);
        if (!versesObj || typeof versesObj !== 'object' || !Number.isFinite(chapter)) continue;
        for (const [vNum, textVal] of Object.entries(versesObj as Record<string, unknown>)) {
          const verse = Number(vNum);
          const text = String(textVal ?? '').trim();
          if (bookName && Number.isFinite(verse) && text) {
            rows.push({ version: defaultVersion, book: bookName, chapter, verse, text });
          }
        }
      }
    }
  }

  return rows;
}

async function main() {
  const filePathArg = process.argv[2];
  const versionArg = (process.argv[3] || 'KJV').toUpperCase();
  const defaultVersion: 'KJV' | 'SWAHILI' = versionArg === 'SWAHILI' ? 'SWAHILI' : 'KJV';

  if (!filePathArg) {
    console.error('Usage: npx tsx scripts/import-bible.ts <json-file> [KJV|SWAHILI]');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in local env.');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePathArg);
  const jsonText = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(jsonText);
  const rows = normalizeBibleJson(parsed, defaultVersion);

  if (rows.length === 0) {
    console.error('No valid Bible verses found in input JSON.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Importing ${rows.length} ${defaultVersion} verses in batches of ${BATCH_SIZE}...`);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('bible_verses').insert(batch);
    if (error) {
      console.error(`Batch starting at index ${i} failed:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`Inserted ${inserted} / ${rows.length} verses`);
  }

  console.log('Bible import completed successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
