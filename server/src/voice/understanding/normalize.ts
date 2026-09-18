const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/** Spoken numbers arrive as words; production shorthand needs them as digits. */
export function digitsFromWord(word: string): number | null {
  const direct = Number(word);
  if (Number.isFinite(direct) && word.trim() !== '') return direct;
  return NUMBER_WORDS[word] ?? null;
}

/**
 * Speech recognition punctuation is noise for matching, but em dashes and
 * commas carry the self-correction signal, so they survive as a marker.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[—–]/g, ' -- ')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/['’]s\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function numberIn(text: string): number | null {
  const digit = text.match(/\b(\d{1,3})\b/);
  if (digit?.[1]) return Number(digit[1]);

  for (const word of text.split(' ')) {
    const value = NUMBER_WORDS[word];
    if (value !== undefined) return value;
  }
  return null;
}
