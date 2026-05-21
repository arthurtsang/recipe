import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

export type WasabiConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  keyPrefix: string;
  /** Base URL with no trailing slash (virtual-hosted style by default). */
  publicUrlBase: string;
  endpoint: string;
};

let cached: WasabiConfig | null | undefined;

export function getWasabiConfig(): WasabiConfig | null {
  if (process.env.WASABI_DISABLE === '1' || process.env.WASABI_DISABLE === 'true') {
    return null;
  }
  if (cached !== undefined) return cached;

  const accessKeyId =
    process.env.WASABI_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey =
    process.env.WASABI_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
  const bucket = process.env.WASABI_BUCKET || '';
  const region = process.env.WASABI_REGION || 'us-east-1';
  const keyPrefix = (process.env.WASABI_KEY_PREFIX || 'recipes').replace(/^\/+|\/+$/g, '');
  const endpoint =
    process.env.WASABI_ENDPOINT || `https://s3.${region}.wasabisys.com`;
  const publicUrlBase = (process.env.WASABI_PUBLIC_URL_BASE || '').replace(/\/+$/, '');

  if (!accessKeyId || !secretAccessKey || !bucket) {
    cached = null;
    return null;
  }

  const publicBase =
    publicUrlBase || `https://${bucket}.s3.${region}.wasabisys.com`;

  cached = {
    accessKeyId,
    secretAccessKey,
    bucket,
    region,
    keyPrefix,
    publicUrlBase: publicBase,
    endpoint,
  };
  return cached;
}

export function isWasabiEnabled(): boolean {
  return getWasabiConfig() !== null;
}

/** S3 key prefix for DB dumps (same bucket as recipe images). */
export function getWasabiBackupKeyPrefix(): string {
  const fromEnv = process.env.WASABI_BACKUP_KEY_PREFIX?.trim();
  if (fromEnv) return fromEnv.replace(/^\/+|\/+$/g, '');
  return 'db-backups';
}

export type WasabiListedObject = { key: string; lastModified?: Date };

export async function listWasabiObjectsWithPrefix(prefix: string): Promise<WasabiListedObject[]> {
  const c = getWasabiConfig();
  if (!c) return [];
  const client = getClient();
  const p = prefix.replace(/^\/+/, '');
  const outList: WasabiListedObject[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: c.bucket,
        Prefix: p,
        ContinuationToken: continuationToken,
      })
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) {
        outList.push({ key: o.Key, lastModified: o.LastModified });
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return outList;
}

/** Delete any object key in the bucket (not restricted to recipe image prefix). */
export async function deleteWasabiKeyUnrestricted(rawKey: string): Promise<void> {
  const c = getWasabiConfig();
  if (!c) return;
  const key = rawKey.replace(/^\/+/, '');
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: c.bucket,
      Key: key,
    })
  );
}

export function wasabiPublicUrlForKey(key: string): string {
  const c = getWasabiConfig();
  if (!c) throw new Error('Wasabi not configured');
  const k = key.replace(/^\/+/, '');
  return `${c.publicUrlBase}/${k}`;
}

let s3Client: S3Client | null = null;
function getClient(): S3Client {
  const c = getWasabiConfig();
  if (!c) throw new Error('Wasabi not configured');
  if (!s3Client) {
    s3Client = new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export function objectKeyForFilename(filename: string): string {
  const c = getWasabiConfig();
  if (!c) throw new Error('Wasabi not configured');
  const base = path.basename(filename);
  return `${c.keyPrefix}/${base}`;
}

/** Allowed object key under configured prefix, or null.
 * Accepts keys as stored in S3 (e.g. `recipes/foo.jpg`) or path-style path surplus (`bucket/recipes/foo.jpg`). */
export function allowedWasabiObjectKey(rawKey: string): string | null {
  const c = getWasabiConfig();
  if (!c) return null;
  let normalized = rawKey.replace(/^\/+/, '');
  if (normalized.startsWith(`${c.bucket}/`)) {
    normalized = normalized.slice(c.bucket.length + 1);
  }
  const prefix = c.keyPrefix.replace(/^\/+|\/+$/g, '');
  if (!prefix || !normalized.startsWith(`${prefix}/`)) return null;
  return normalized;
}

/**
 * Time-limited HTTPS URL for direct browser GET (Wasabi is S3-compatible; same SigV4 presign as AWS).
 * Note: the URL reveals endpoint and bucket; use /api/recipes/media?k= when you want that hidden.
 */
export async function wasabiPresignedGetUrl(rawKey: string, expiresInSec = 3600): Promise<string> {
  const normalized = allowedWasabiObjectKey(rawKey);
  if (!normalized) throw new Error('Invalid object key or Wasabi not configured');
  const ttl = Math.min(Math.max(expiresInSec, 60), 604800);
  const cmd = new GetObjectCommand({
    Bucket: getWasabiConfig()!.bucket,
    Key: normalized,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: ttl });
}

export async function uploadBufferToWasabi(
  body: Buffer,
  objectKey: string,
  contentType: string
): Promise<string> {
  const c = getWasabiConfig();
  if (!c) throw new Error('Wasabi not configured');
  const key = objectKey.replace(/^\/+/, '');
  await getClient().send(
    new PutObjectCommand({
      Bucket: c.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return wasabiPublicUrlForKey(key);
}

export async function uploadLocalFileToWasabi(
  localPath: string,
  objectKey: string,
  contentType: string
): Promise<string> {
  const c = getWasabiConfig();
  if (!c) throw new Error('Wasabi not configured');
  const key = objectKey.replace(/^\/+/, '');
  await getClient().send(
    new PutObjectCommand({
      Bucket: c.bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: contentType,
    })
  );
  return wasabiPublicUrlForKey(key);
}

export function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.sql': 'text/plain',
    '.gz': 'application/gzip',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
  };
  return map[ext] || 'application/octet-stream';
}

export async function promoteLocalFileToWasabi(
  localPath: string,
  filename: string,
  unlinkAfter: boolean
): Promise<string> {
  const key = objectKeyForFilename(filename);
  const ct = guessContentType(filename);
  const url = await uploadLocalFileToWasabi(localPath, key, ct);
  if (unlinkAfter) {
    try {
      fs.unlinkSync(localPath);
    } catch {
      /* ignore */
    }
  }
  return url;
}

export function parseWasabiKeyFromPublicUrl(imageUrl: string): string | null {
  const c = getWasabiConfig();
  if (!c) return null;
  if (imageUrl.startsWith(c.publicUrlBase)) {
    const rest = imageUrl.slice(c.publicUrlBase.length).replace(/^\/+/, '');
    return rest || null;
  }
  try {
    const u = new URL(imageUrl);
    let pathname = u.pathname.replace(/^\/+/, '');
    if (pathname.startsWith(`${c.bucket}/`)) {
      return pathname.slice(c.bucket.length + 1) || null;
    }
    if (u.hostname.startsWith(`${c.bucket}.`)) {
      return pathname || null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function deleteWasabiObjectByKey(objectKey: string): Promise<void> {
  const normalized = allowedWasabiObjectKey(objectKey);
  if (!normalized) return;
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: getWasabiConfig()!.bucket,
        Key: normalized,
      })
    );
  } catch (e) {
    console.warn('[wasabi] delete object failed', normalized, e);
  }
}

export async function deleteWasabiObjectByPublicUrl(imageUrl: string): Promise<void> {
  const key = parseWasabiKeyFromPublicUrl(imageUrl);
  if (key) await deleteWasabiObjectByKey(key);
}

export function isWasabiPublicUrl(imageUrl: string): boolean {
  if (!imageUrl.startsWith('https://')) return false;
  return imageUrl.includes('wasabisys.com');
}
