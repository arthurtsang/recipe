const FRAC_VALUE: Record<string, [number, number]> = {
  '½': [1, 2],
  '⅓': [1, 3],
  '⅔': [2, 3],
  '¼': [1, 4],
  '¾': [3, 4],
  '⅛': [1, 8],
  '⅜': [3, 8],
  '⅝': [5, 8],
  '⅞': [7, 8],
};

const FRAC_CHARS = Object.keys(FRAC_VALUE).join('');

/** A quantity: mixed (1-1/2, 1 1/2, 1½), fraction, unicode fraction, or decimal. No capturing groups. */
export const QTY_SRC = `\\d+\\s*[- ]\\s*\\d+\\s*/\\s*\\d+|\\d+\\s*[${FRAC_CHARS}]|\\d+\\s*/\\s*\\d+|[${FRAC_CHARS}]|\\d+(?:[.,]\\d+)?`;

const UNIT_SRC = 'cups?|c|tbsps?|tablespoons?|tbs|tb|tsps?|teaspoons?|tsp|ts|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|milliliters?|l|liters?|litres?|pinch(?:es)?|cloves?|cans?|packages?|pkg|slices?|pieces?|bunch(?:es)?|sprigs?|heads?|stalks?|sheets?|sticks?|dash(?:es)?|handfuls?|quarts?|pints?|gallons?';

const UNIT_WORDS = [
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tb',
  'teaspoon', 'teaspoons', 'tsp', 'ts',
  'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml', 'liter', 'liters', 'litre', 'litres', 'l',
  'pinch', 'pinches', 'clove', 'cloves',
  'can', 'cans', 'package', 'packages', 'pkg',
  'slice', 'slices', 'piece', 'pieces',
  'bunch', 'bunches', 'sprig', 'sprigs',
  'head', 'heads', 'stalk', 'stalks',
  'sheet', 'sheets', 'stick', 'sticks',
  'dash', 'dashes', 'handful', 'handfuls',
  'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons',
];

export const isQtyUnit = (word: string) => {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (!w || !/^[a-z]+$/.test(w)) return false;
  return UNIT_WORDS.some((unit) => unit === w || (w.length < unit.length && unit.startsWith(w)));
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

const mixedText = (whole: number, num: number, den: number) => {
  if (!den) return String(whole);
  const g = gcd(Math.abs(num), Math.abs(den)) || 1;
  num = Math.abs(num) / g;
  den = Math.abs(den) / g;
  whole += Math.trunc(num / den);
  const rem = num % den;
  if (rem === 0) return String(whole);
  const frac = `${rem}/${den}`;
  return whole > 0 ? `${whole}-${frac}` : frac;
};

export const canonicalQty = (token: string) => {
  const t = token.trim().replace(/\s+/g, ' ');
  const uni = FRAC_VALUE[t];
  if (uni) return mixedText(0, uni[0], uni[1]);
  const uniMixed = t.match(new RegExp(`^(\\d+)\\s*[- ]?\\s*([${FRAC_CHARS}])$`));
  if (uniMixed) {
    const [n, d] = FRAC_VALUE[uniMixed[2]];
    return mixedText(Number(uniMixed[1]), n, d);
  }
  const mixed = t.match(/^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return mixedText(Number(mixed[1]), Number(mixed[2]), Number(mixed[3]));
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return mixedText(0, Number(frac[1]), Number(frac[2]));
  return t;
};

export const parseQtyToken = (token: string) => {
  const t = canonicalQty(token).trim();
  const mixed = t.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    return den ? Number(mixed[1]) + Number(mixed[2]) / den : null;
  }
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den ? Number(frac[1]) / den : null;
  }
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const formatQty = (n: number) => {
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const nearest = Math.round(abs);
  if (Math.abs(abs - nearest) < 0.001) return `${sign}${nearest}`;
  const gcdLocal = (a: number, b: number): number => (b ? gcdLocal(b, a % b) : a);
  for (let den = 2; den <= 16; den += 1) {
    const num = Math.round(abs * den);
    if (Math.abs(abs - num / den) < 0.02) {
      const whole = Math.trunc(num / den);
      const rem = Math.abs(num % den);
      if (rem === 0) return `${sign}${whole}`;
      const g = gcdLocal(rem, den);
      const frac = `${rem / g}/${den / g}`;
      return whole > 0 ? `${sign}${whole}-${frac}` : `${sign}${frac}`;
    }
  }
  return `${sign}${Math.round(abs * 100) / 100}`;
};

export const shouldScaleQty = (line: string, index: number, token: string) => {
  const before = line.slice(0, index);
  const after = line.slice(index + token.length);
  if (/[A-Za-z0-9/]$/.test(before)) return false;
  if (/[x×]\s*$/i.test(before)) return false;
  if (/^\s*$/.test(before) && /^\s*[.)]/.test(after)) return false;
  const rest = after.trimStart();
  if (/^(?:inch(?:es)?|°|degrees?|minutes?|hours?|seconds?)\b/i.test(rest)) return false;
  if (/^°/.test(rest)) return false;
  if (/^\s*x\s*\d/i.test(after)) return false;
  return true;
};

const insideParens = (line: string, index: number) => {
  const before = line.slice(0, index);
  return (before.match(/\(/g) || []).length > (before.match(/\)/g) || []).length;
};

export const hyphenateMixedFractions = (line: string) =>
  line.replace(new RegExp(QTY_SRC, 'g'), (token, offset) => (
    shouldScaleQty(line, offset, token) ? canonicalQty(token) : token
  ));

const formatPair = (chunk: string) => {
  const match = new RegExp(`^(${QTY_SRC})`, 'i').exec(chunk);
  if (!match || !shouldScaleQty(chunk, 0, match[1])) return hyphenateMixedFractions(chunk);
  const qty = canonicalQty(match[1]);
  let rest = chunk.slice(match[1].length);
  const unitMatch = rest.match(new RegExp(`^\\s*(${UNIT_SRC})\\b`, 'i'));
  let unit = '';
  if (unitMatch) {
    unit = unitMatch[1];
    rest = rest.slice(unitMatch[0].length);
  }
  const name = rest.replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/^(?:and)\s+/i, '').trim();
  return [qty, unit, name].filter(Boolean).join(' ');
};

const splitPairs = (line: string) => {
  const re = new RegExp(QTY_SRC, 'g');
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    if (insideParens(line, match.index)) continue;
    if (!shouldScaleQty(line, match.index, match[0])) continue;
    if (match.index > 0 && !/[\s,;]/.test(line[match.index - 1])) continue;
    starts.push(match.index);
  }
  if (starts.length <= 1) return [formatPair(line)];
  const parts: string[] = [];
  const lead = line.slice(0, starts[0]).replace(/[\s,;:]+$/g, '').trim();
  if (lead) parts.push(hyphenateMixedFractions(lead));
  starts.forEach((start, index) => {
    let chunk = line.slice(start, starts[index + 1] ?? line.length);
    chunk = chunk.replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\s+and$/i, '').trim();
    if (chunk) parts.push(formatPair(chunk));
  });
  return parts.filter(Boolean);
};

export const normalizeIngredientText = (text: string) =>
  String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => {
      const cleaned = line.replace(/^\s*[-*+]\s+/, '').trim();
      return cleaned ? splitPairs(cleaned) : [];
    })
    .join('\n');
