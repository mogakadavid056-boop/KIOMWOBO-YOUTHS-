import { isSupabaseConfigured, supabase } from './supabase';

const CANDIDATE_BUCKETS = ['assets', 'asset', 'backgrounds', 'public', 'gallery', 'images', 'media', 'files', 'avatars'];

const TARGET_FILES: Record<'login' | 'home' | 'profile', string[]> = {
  login: ['bg-login.png', 'bg-login.jpg', 'bg-login.webp', 'login.png'],
  home: ['bg-home.png', 'bg-home.jpg', 'bg-home.webp', 'home.png'],
  profile: ['bg-profile.png', 'bg-profile.jpg', 'bg-profile.webp', 'profile.png'],
};

async function checkImageExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    return ct.startsWith('image/') || ct === '' || ct === 'application/octet-stream';
  } catch {
    return false;
  }
}

function setCssBgVar(key: 'login' | 'home' | 'profile', url: string) {
  const varName =
    key === 'login'
      ? '--bg-login-image'
      : key === 'home'
      ? '--bg-home-image'
      : '--bg-profile-image';
  document.documentElement.style.setProperty(varName, `url("${url}")`);
}

export async function resolveBackgroundAssets(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Check local /public/assets/ files first
  const [hasLocalLogin, hasLocalHome, hasLocalProfile] = await Promise.all([
    checkImageExists('/assets/bg-login.png'),
    checkImageExists('/assets/bg-home.png'),
    checkImageExists('/assets/bg-profile.png'),
  ]);

  if (hasLocalLogin && hasLocalHome && hasLocalProfile) {
    return;
  }

  if (!isSupabaseConfigured) return;

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (!supabaseUrl) return;

  const resolved: Partial<Record<'login' | 'home' | 'profile', string>> = {};
  if (hasLocalLogin) resolved.login = '/assets/bg-login.png';
  if (hasLocalHome) resolved.home = '/assets/bg-home.png';
  if (hasLocalProfile) resolved.profile = '/assets/bg-profile.png';

  // 2. Probe public object URLs across standard bucket names
  for (const bucket of CANDIDATE_BUCKETS) {
    if (resolved.login && resolved.home && resolved.profile) break;

    const checks: Array<Promise<void>> = [];
    for (const key of ['login', 'home', 'profile'] as const) {
      if (resolved[key]) continue;
      for (const fileName of TARGET_FILES[key]) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
        checks.push(
          checkImageExists(publicUrl).then((ok) => {
            if (ok && !resolved[key]) {
              resolved[key] = publicUrl;
              setCssBgVar(key, publicUrl);
            }
          })
        );
      }
    }
    await Promise.all(checks);

    // 3. Fallback: try listing bucket files if bucket allows public listing and filenames differ slightly
    if (!resolved.login || !resolved.home || !resolved.profile) {
      try {
        const { data: listed } = await supabase.storage.from(bucket).list('', { limit: 50 });
        if (listed && listed.length > 0) {
          for (const item of listed) {
            const lower = item.name.toLowerCase();
            const { data: pub } = supabase.storage.from(bucket).getPublicUrl(item.name);
            if (!resolved.login && lower.includes('login')) {
              resolved.login = pub.publicUrl;
              setCssBgVar('login', pub.publicUrl);
            }
            if (!resolved.home && lower.includes('home')) {
              resolved.home = pub.publicUrl;
              setCssBgVar('home', pub.publicUrl);
            }
            if (!resolved.profile && lower.includes('profile')) {
              resolved.profile = pub.publicUrl;
              setCssBgVar('profile', pub.publicUrl);
            }
          }
        }
      } catch {
        // Ignore if listing is restricted by bucket policy
      }
    }
  }
}
