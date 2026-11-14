/**
 * Local CLI script to import Hymns (SDA Hymnal, Nyimbo za Kristo, etc.) into Supabase in batches of 500.
 *
 * Usage:
 *   SUPABASE_URL="https://your-project.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
 *   npx tsx scripts/import-hymns.ts path/to/hymns.json "SDA Hymnal" en
 *
 * Supported JSON shapes:
 *   1. Array of { number, title, lyrics, hymnal?, language? }
 *   2. Object { hymns: [...] }
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface HymnInsertRow {
  hymnal: string;
  language: 'en' | 'sw';
  number: number;
  title: string;
  lyrics: string;
}

const BATCH_SIZE = 500;

function normalizeHymnsJson(
  raw: unknown,
  defaultHymnal: string,
  defaultLang: 'en' | 'sw'
): HymnInsertRow[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).hymns)
    ? ((raw as Record<string, unknown>).hymns as unknown[])
    : [];

  const rows: HymnInsertRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const number = Number(rec.number ?? rec.no ?? rec.sortOrder ?? rec.id);
    const title = String(rec.title ?? rec.name ?? '').trim();
    const metaLines = [
      rec.category ? `Category: ${String(rec.category)}` : '',
      rec.author ? `Author: ${String(rec.author)}` : '',
      rec.composer ? `Composer: ${String(rec.composer)}` : '',
      rec.sheetMusic ? `Sheet Music: ${String(rec.sheetMusic)}` : '',
      rec.vocal ? `Vocal Audio: ${String(rec.vocal)}` : '',
      rec.instrumental ? `Instrumental Audio: ${String(rec.instrumental)}` : '',
    ].filter(Boolean);
    const rawSource = rec.lyrics ?? rec.verses;
    const rawLyrics = Array.isArray(rawSource)
      ? rawSource.join('\n\n')
      : String(rawSource ?? '').trim() || metaLines.join('\n') || title;
    const hymnal = String(rec.hymnal ?? defaultHymnal).trim();
    const langVal = String(rec.language ?? defaultLang).toLowerCase();
    const language: 'en' | 'sw' = langVal.startsWith('sw') ? 'sw' : 'en';

    if (Number.isFinite(number) && title && rawLyrics) {
      rows.push({
        hymnal,
        language,
        number,
        title,
        lyrics: rawLyrics,
      });
    }
  }
  return rows;
}

async function main() {
  const filePathArg = process.argv[2];
  const defaultHymnal = process.argv[3] || 'SDA Hymnal';
  const defaultLang: 'en' | 'sw' = (process.argv[4] || 'en').toLowerCase().startsWith('sw')
    ? 'sw'
    : 'en';

  if (!filePathArg) {
    console.error('Usage: npx tsx scripts/import-hymns.ts <json-file> [HymnalName] [en|sw]');
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
  const rows = normalizeHymnsJson(parsed, defaultHymnal, defaultLang);

  if (rows.length === 0) {
    console.error('No valid hymns found in input JSON.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Importing ${rows.length} hymns into "${defaultHymnal}" in batches of ${BATCH_SIZE}...`);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('hymns').insert(batch);
    if (error) {
      console.error(`Batch starting at index ${i} failed:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`Inserted ${inserted} / ${rows.length} hymns`);
  }

  console.log('Hymns import completed successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
