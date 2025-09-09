export function smartFilter(query: string, source: string[]): string[] {
  const q = (query || '').toLowerCase();
  if (!q) return source.slice();
  return source
    .map(item => {
      const lower = item.toLowerCase();
      let score = -1;
      if (lower.startsWith(q)) score = 3;
      else if (lower.endsWith(q)) score = 2;
      else if (lower.includes(q)) score = 1;
      return { item, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}

export function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
