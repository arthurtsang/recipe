/** Trim whitespace from env vars (common copy/paste issue in Vercel dashboard). */
export function env(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
