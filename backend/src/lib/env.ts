/** Trim whitespace / wrapping quotes from env vars (Vercel/dashboard copy-paste). */
export function env(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed === '' ? undefined : trimmed;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
