import Fuse from 'fuse.js/basic';
export function normalizeSearch(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/\breview\s*set\b|\brs\b|\breview\b/g, 'review set')
    .replace(/\bex(?:\.|\b)\s*/g, 'exercise ')
    .replace(/(\d)\s+([a-z])/g, '$1$2')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, ' ');
}
export function createCatalogSearch(catalog) {
  const rows = catalog.chapters.flatMap((chapter) =>
    chapter.items.map((item) => ({
      ...item,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
    })),
  );
  const fuse = new Fuse(rows, {
    keys: ['chapterTitle', 'label'],
    threshold: 0.3,
    ignoreLocation: true,
    includeScore: true,
  });
  return (query) => {
    const text = normalizeSearch(query);
    if (!text) return rows;
    const code = text.match(/\b\d+[a-z](?:\.\d+)?\b/)?.[0];
    const kind = text.includes('review set')
      ? 'review set'
      : text.includes('exercise')
        ? 'exercise'
        : null;
    if (code)
      return rows
        .filter((row) => {
          const label = normalizeSearch(row.label);
          return (
            (!kind || label.startsWith(kind)) &&
            label.split(' ').at(-1).startsWith(code)
          );
        })
        .sort((a, b) => {
          const rank = (row) =>
            (normalizeSearch(row.label).split(' ').at(-1) === code ? 0 : 2) +
            (/^review/i.test(row.label) ? 1 : 0);
          return rank(a) - rank(b);
        });
    const tokens = text.split(' ');
    const exact = rows.filter((row) =>
      tokens.every((token) =>
        normalizeSearch(
          `chapter ${row.chapterNumber} ${row.chapterTitle} ${row.label}`,
        ).includes(token),
      ),
    );
    const included = new Set(exact);
    // Codes are never fuzzed. Topic matching is local and follows literal matches.
    if (/\d/.test(text) || text.length < 3) return exact;
    return [
      ...exact,
      ...fuse
        .search(text)
        .map((result) => result.item)
        .filter((row) => !included.has(row)),
    ];
  };
}
