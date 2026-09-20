// Word-token search used everywhere someone types into a list (exercises,
// foods, meals): every word in the query must appear somewhere in the
// text, in any order — so "burger chicken" still finds "Grilled Chicken
// Burger" instead of requiring the typed text to be a single contiguous
// substring starting from wherever the query happens to line up.
export function matchesSearch(text, query) {
  if (!query || !query.trim()) return true;
  if (!text) return false;
  const haystack = text.toLowerCase();
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}
