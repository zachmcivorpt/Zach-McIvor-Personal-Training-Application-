// Ranked food search for the client's Add Food page. The plain
// matchesSearch() filter (search.js) returns matches in database order, so
// "rice" listed Rice Protein Powder first and "apple" listed Pineapple
// second, a typo ("chiken") found nothing, and the foods a client logs
// every day were buried among everyone else's. This keeps the same
// "every word must appear" rule for what matches, then orders the matches:
// the client's own frequently-logged foods first, then whole-word and
// start-of-name matches, plain foods ahead of brands and supplements,
// shorter names ahead of longer ones. Only when nothing matches at all
// does it fall back to a typo-tolerant match (one or two letters off).

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%.]+/g, " ")
    .trim();
}

// Supplement-type words that should only rank high when they're actually
// being searched for ("rice" means rice, not rice protein powder).
const SUPPLEMENT_RE = /\b(powder|shake|bar|bars|supplement|gainer|isolate|whey|smoothie|drink|sachets?)\b/;
const BRAND_RE = /\b(woolworths|coles|aldi|iga|uncle tobys|nestle|kellogg|subway|mcdonald|kfc|hungry jack|grill'?d|domino|red rooster|guzman|nando|farmwood|rokeby|crankt|nescafe|nature valley)/;

function isWholeWord(word, term) {
  return word === term || word === `${term}s` || word === `${term}es` || `${word}s` === term;
}

// Damerau-free Levenshtein with an early exit — names and terms are short.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function typoAllowance(term) {
  if (term.length >= 7) return 2;
  if (term.length >= 4) return 1;
  return 0;
}

// The food itself, minus its descriptors: "White Rice (cooked)" -> "white
// rice", "Eggs, whole" -> "eggs". Its last word is what the food *is*
// ("rice" in white rice, but "cakes" in rice cakes).
function headWord(rawName) {
  const segment = normalize((rawName || "").split(/[(,]/)[0]);
  const parts = segment.split(" ").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function score(food, name, words, terms, query, historyCount, orderBonus) {
  let s = 0;
  const head = headWord(food.name);
  if (terms.some((t) => isWholeWord(head, t))) s += 60;
  if (name === query) s += 1000;
  if (name.startsWith(query)) s += 60;
  terms.forEach((t) => {
    if (words.some((w) => w.startsWith(t))) s += 40;
    if (words.some((w) => isWholeWord(w, t))) s += 20;
  });
  if (!SUPPLEMENT_RE.test(query) && SUPPLEMENT_RE.test(name)) s -= 200;
  const branded = !!(food.brand || food.barcode || food.fromBarcode) || BRAND_RE.test(name);
  if (!branded) s += 50;
  // Shorter, plainer names first — a long run of descriptors ("Chicken
  // (skin, composite, baked, no added fat)") is rarely the one wanted.
  s -= name.length * 1.5 + ((food.name || "").match(/,/g) || []).length * 12;
  // The library lists everyday staples first (Chicken Breast is its very
  // first entry), so position is a mild tiebreaker toward them.
  s += orderBonus;
  if (historyCount) s += Math.min(historyCount, 20) * 30;
  return s;
}

// `foods`: any objects with a `name`. `historyCounts`: Map/object of
// lower-cased food key -> how often this client has logged it (see
// nutritionLog.js foodKey). Returns `{ results, fuzzy }` — `fuzzy` is
// true when the results came from the typo-tolerant fallback, so the page
// can say "Showing close matches".
export function rankFoods(query, foods, { historyCounts, keyOf, limit = 60 } = {}) {
  const q = normalize(query);
  if (!q) return { results: [], fuzzy: false };
  const terms = q.split(" ").filter(Boolean);
  const countFor = (food) => {
    if (!historyCounts) return 0;
    const key = keyOf ? keyOf(food) : (food.id || food.name || "").toString().toLowerCase();
    return (historyCounts.get ? historyCounts.get(key) : historyCounts[key]) || 0;
  };

  const exact = [];
  const prepared = [];
  const list = foods || [];
  const orderBonusAt = (i) => 50 * (1 - i / Math.max(list.length, 1));
  for (let i = 0; i < list.length; i++) {
    const food = list[i];
    if (!food || !food.name) continue;
    const name = normalize(food.name);
    const words = name.split(" ");
    prepared.push({ food, name, words, i });
    if (terms.every((t) => name.includes(t))) exact.push({ food, s: score(food, name, words, terms, q, countFor(food), orderBonusAt(i)) });
  }
  if (exact.length) {
    return { results: exact.sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.food), fuzzy: false };
  }

  const fuzzy = [];
  for (const { food, name, words, i } of prepared) {
    let penalty = 0;
    const ok = terms.every((t) => {
      if (name.includes(t)) return true;
      const max = typoAllowance(t);
      if (!max) return false;
      let best = max + 1;
      for (const w of words) {
        const d = Math.min(editDistance(t, w, max), w.length > t.length ? editDistance(t, w.slice(0, t.length), max) : max + 1);
        if (d < best) best = d;
        if (best === 1) break;
      }
      penalty += best * 60;
      return best <= max;
    });
    if (ok) fuzzy.push({ food, s: score(food, name, words, terms, q, countFor(food), orderBonusAt(i)) - penalty });
  }
  return { results: fuzzy.sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.food), fuzzy: fuzzy.length > 0 };
}
