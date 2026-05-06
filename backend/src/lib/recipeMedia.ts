import {
  isWasabiEnabled,
  isWasabiPublicUrl,
  parseWasabiKeyFromPublicUrl,
  wasabiPublicUrlForKey,
  wasabiPresignedGetUrl,
  allowedWasabiObjectKey,
} from './wasabiStorage';

/** Default 3600s; override with WASABI_PRESIGN_EXPIRES_SEC (60–604800). */
export function wasabiPresignExpiresSec(): number {
  const n = parseInt(process.env.WASABI_PRESIGN_EXPIRES_SEC || '3600', 10);
  return Number.isFinite(n) && n >= 60 && n <= 604800 ? n : 3600;
}

export function encodeObjectKeyForMediaParam(objectKey: string): string {
  return Buffer.from(objectKey, 'utf8').toString('base64url');
}

function mediaQueryParamK(stored: string): string | null {
  const qIdx = stored.indexOf('?');
  if (qIdx === -1) return null;
  return new URLSearchParams(stored.slice(qIdx + 1)).get('k');
}

/** Validate and decode object key from ?k= (must resolve under configured bucket + key-prefix). */
export function decodeObjectKeyFromMediaParam(k: string): string | null {
  if (!k || typeof k !== 'string') return null;
  let key: string;
  try {
    key = Buffer.from(k.trim(), 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!key || key.includes('..') || key.startsWith('/')) return null;
  return allowedWasabiObjectKey(key);
}

/**
 * Replace stored Wasabi (or /api/recipes/media?k=…) with a time-limited presigned GET URL.
 */
export async function resolveClientSideRecipeImageUrl(
  stored: string | null | undefined
): Promise<string | null | undefined> {
  if (stored == null || stored === '') return stored === '' ? undefined : stored;

  if (stored.includes('/api/recipes/media')) {
    const kRaw = mediaQueryParamK(stored);
    if (!kRaw || !isWasabiEnabled()) return stored;
    const key = decodeObjectKeyFromMediaParam(kRaw);
    if (!key) return stored;
    return await wasabiPresignedGetUrl(key, wasabiPresignExpiresSec());
  }

  if (!isWasabiEnabled() || !isWasabiPublicUrl(stored)) return stored;
  const key = parseWasabiKeyFromPublicUrl(stored);
  if (!key) return stored;
  return await wasabiPresignedGetUrl(key, wasabiPresignExpiresSec());
}

export async function normalizeRecipeImageFieldsForClient<T extends Record<string, unknown>>(
  recipe: T
): Promise<T> {
  const out = { ...recipe } as Record<string, unknown>;
  if (typeof out.imageUrl === 'string' && out.imageUrl) {
    out.imageUrl = (await resolveClientSideRecipeImageUrl(out.imageUrl)) ?? out.imageUrl;
  }
  if (Array.isArray(out.versions)) {
    out.versions = await Promise.all(
      out.versions.map(async (v: unknown) => {
        if (!v || typeof v !== 'object') return v;
        const vrec = { ...(v as Record<string, unknown>) };
        if (typeof vrec.imageUrl === 'string' && vrec.imageUrl) {
          vrec.imageUrl = (await resolveClientSideRecipeImageUrl(vrec.imageUrl)) ?? vrec.imageUrl;
        }
        return vrec;
      })
    );
  }
  if (out.currentVersion && typeof out.currentVersion === 'object') {
    const cv = { ...(out.currentVersion as Record<string, unknown>) };
    if (typeof cv.imageUrl === 'string' && cv.imageUrl) {
      cv.imageUrl = (await resolveClientSideRecipeImageUrl(cv.imageUrl)) ?? cv.imageUrl;
    }
    out.currentVersion = cv;
  }
  return out as T;
}

/** Map client media URLs back to stored Wasabi HTTPS URLs for DB writes and comparisons. */
export function resolveImageUrlForStorage(url: string | null | undefined): string | null {
  if (url == null) return null;
  const s = String(url).trim();
  if (!s) return null;

  const tryFromK = (kRaw: string | null): string | null => {
    if (!kRaw || !isWasabiEnabled()) return null;
    const key = decodeObjectKeyFromMediaParam(kRaw);
    if (!key) return null;
    return wasabiPublicUrlForKey(key);
  };

  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (u.pathname.includes('/api/recipes/media')) {
        const got = tryFromK(u.searchParams.get('k'));
        if (got) return got;
      }
      if (u.hostname.includes('wasabisys.com') && isWasabiEnabled()) {
        const fromPath = parseWasabiKeyFromPublicUrl(s);
        if (fromPath) return wasabiPublicUrlForKey(fromPath);
      }
    }
  } catch {
    /* ignore */
  }

  const qIdx = s.indexOf('?');
  if (qIdx !== -1 && s.includes('/api/recipes/media')) {
    const params = new URLSearchParams(s.slice(qIdx + 1));
    const got = tryFromK(params.get('k'));
    if (got) return got;
  }

  return s;
}

export async function normalizeListRecipesForClient<R extends { imageUrl?: string | null }>(
  recipes: R[]
): Promise<R[]> {
  return Promise.all(
    recipes.map(async (r) => ({
      ...r,
      imageUrl:
        r.imageUrl != null && r.imageUrl !== ''
          ? ((await resolveClientSideRecipeImageUrl(r.imageUrl)) ?? r.imageUrl)
          : r.imageUrl,
    }))
  );
}
