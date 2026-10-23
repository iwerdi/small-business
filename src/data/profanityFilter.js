import { badWords } from "./badWords.js";

// Keep one implementation for both the browser UX and the authoritative API check.
// Only lookalike characters are normalized; ordinary punctuation remains available
// as a separator so strings like "б л я д ь" can still be detected.
function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    // Latin characters that commonly imitate Cyrillic in Russian words.
    .replace(/[aceopxykmth]/g, (char) => ({
      a: "а", c: "с", e: "е", o: "о", p: "р", x: "х",
      y: "у", k: "к", m: "м", t: "т", h: "н",
    })[char] || char)
    // Leetspeak substitutions only when the digit is inside a word.
    .replace(/(?<=\p{L})0(?=\p{L})/gu, "о")
    .replace(/(?<=\p{L})3(?=\p{L})/gu, "з")
    .replace(/(?<=\p{L})4(?=\p{L})/gu, "ч")
    .replace(/(?<=\p{L})6(?=\p{L})/gu, "б")
    .replace(/(?<=\p{L})1(?=\p{L})/gu, "и")
    .replace(/(?<=\p{L})5(?=\p{L})/gu, "с")
    .replace(/(?<=\p{L})8(?=\p{L})/gu, "в")
    .replace(/(?<=\p{L})9(?=\p{L})/gu, "я")
    // Symbols used in place of letters, but only between word characters.
    .replace(/(?<=\p{L})@(?=\p{L})/gu, "я")
    .replace(/(?<=\p{L})\$(?=\p{L})/gu, "с")
    .replace(/(?<=\p{L})[!|](?=\p{L})/gu, "и");
}

function normalizeDictionaryEntry(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/gi, "");
}

// A trie keeps matching fast even with a large dictionary and avoids the
// catastrophic backtracking that a huge collection of fuzzy regular expressions can cause.
const letterPattern = /[\p{L}]/u;
const separatorPattern = /[\s\p{P}\p{S}_]/u;
const root = { next: new Map(), terminal: false };

for (const entry of new Set(badWords.map(normalizeDictionaryEntry))) {
  if (entry.length < 3 || !/[а-я]/i.test(entry)) continue;
  let node = root;
  for (const char of entry) {
    if (!node.next.has(char)) node.next.set(char, { next: new Map(), terminal: false });
    node = node.next.get(char);
  }
  node.terminal = true;
}

function matchesFrom(text, start, firstNode) {
  // State is (trie node, position just after the last matched character).
  const stack = [{ node: firstNode, pos: start + 1 }];
  while (stack.length) {
    const { node, pos } = stack.pop();
    if (node.terminal && (pos >= text.length || !letterPattern.test(text[pos]))) return true;

    let nextPos = pos;
    for (let skipped = 0; skipped <= 3 && nextPos < text.length; skipped++) {
      const nextNode = node.next.get(text[nextPos]);
      if (nextNode) stack.push({ node: nextNode, pos: nextPos + 1 });
      if (skipped === 3 || !separatorPattern.test(text[nextPos])) break;
      nextPos++;
    }
  }
  return false;
}

export function containsProfanity(value) {
  const normalized = normalizeText(value);
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    if (!letterPattern.test(char)) continue;
    if (index > 0 && letterPattern.test(normalized[index - 1])) continue;
    const node = root.next.get(char);
    if (node && matchesFrom(normalized, index, node)) return true;
  }
  return false;
}
