/**
 * Normalizes recipe image URLs for <img src>.
 * - Local /uploads/ paths go through the API.
 * - API normally returns presigned Wasabi URLs; legacy `/api/recipes/media?k=...` still works (302 to presigned).
 * - Raw https://…wasabisys.com/… is rewritten to `/api/recipes/media?k=...` so one hop gets a redirect to a presigned URL.
 * - Other https:// URLs load directly.
 * - http:// off-site URLs use the proxy to avoid mixed-content issues on https pages.
 */

/** Derive S3 object key from a Wasabi HTTPS URL (virtual-hosted or path-style). */
function objectKeyFromWasabiUrl(wasabiHttpsUrl: string): string | undefined {
  try {
    const u = new URL(wasabiHttpsUrl);
    let pathOnly = u.pathname.replace(/^\/+/, '');
    if (!pathOnly) return undefined;

    const labels = u.hostname.split('.');
    const virtualBucket =
      labels.length >= 3 && labels[1] === 's3' && labels[0] !== 's3' ? labels[0] : null;
    if (virtualBucket && pathOnly.startsWith(`${virtualBucket}/`)) {
      pathOnly = pathOnly.slice(virtualBucket.length + 1);
    }

    const pathStyleHost = u.hostname.startsWith('s3.') || u.hostname === 's3.wasabisys.com';
    if (pathStyleHost && virtualBucket === null) {
      const i = pathOnly.indexOf('/');
      if (i !== -1) pathOnly = pathOnly.slice(i + 1);
    }

    return pathOnly || undefined;
  } catch {
    return undefined;
  }
}

function virtualHostWasabiToMediaSrc(wasabiHttpsUrl: string): string | undefined {
  try {
    const pathOnly = objectKeyFromWasabiUrl(wasabiHttpsUrl);
    if (!pathOnly) return undefined;
    const bytes = new TextEncoder().encode(pathOnly);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    const k = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/api/recipes/media?k=${encodeURIComponent(k)}`;
  } catch {
    return undefined;
  }
}

export function recipeImageSrc(raw: string | undefined | null): string | undefined {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return undefined;
  let u = raw;

  if (u.startsWith('/uploads/')) {
    return `${window.location.origin}/api/uploads/${u.replace(/^\/uploads\/?/, '')}`;
  }
  if (u.includes('localhost:8081')) {
    u = u.replace(/https?:\/\/localhost:8081/, window.location.origin);
  }
  if (u.includes('/api/recipes/media?')) {
    return u;
  }
  if (u.startsWith('https://') && u.includes('wasabisys.com')) {
    return virtualHostWasabiToMediaSrc(u) ?? u;
  }
  if (u.startsWith('https://')) {
    return u;
  }
  if (u.startsWith('http://') && !u.startsWith(window.location.origin)) {
    return `/api/recipes/proxy-image?url=${encodeURIComponent(u)}`;
  }
  return u;
}
