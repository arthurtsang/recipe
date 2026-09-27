const PREFIX = 'sg-recent-searches:';
const MAX = 10;

function keyFor(userId?: string | null) {
  return `${PREFIX}${userId?.trim() || 'anon'}`;
}

export function loadRecentSearches(userId?: string | null): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberSearch(userId: string | null | undefined, term: string): string[] {
  const q = term.trim();
  if (!q) return loadRecentSearches(userId);
  const next = [q, ...loadRecentSearches(userId).filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
