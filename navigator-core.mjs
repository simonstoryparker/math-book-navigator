export const COURSE_STORAGE_KEY = 'mathBookCourse';
export const SL_PDF_CACHE_VERSION = 'sl-pdf-1';
// The desktop/local launcher reads nearby PDFs. The hosted build sets
// this single flag to "cloudflare" so book traffic stays on chunk assets.
export const PDF_ASSET_MODE = 'local';

// PDF text runs may split a printed heading into its word and section ID.
// Join only adjacent runs on the same line, retaining the heading's geometry.
export function sectionHeadings(items) {
  const complete = /^(?:EXERCISE|REVIEW\s*SET)\s+\d/i;
  return items.flatMap((item) => {
    if (complete.test(item.str)) return [item];
    if (!/^(?:EXERCISE|REVIEW(?:\s*SET)?)$/i.test(item.str)) return [];
    let str = item.str;
    let right = item.x + item.width;
    const neighbors = items
      .filter(
        (other) =>
          other !== item &&
          other.x > item.x + item.width * 0.5 &&
          Math.abs(other.top - item.top) <=
            Math.max(item.height, other.height) * 0.6,
      )
      .sort((a, b) => a.x - b.x);
    for (const next of neighbors) {
      if (next.x - right > Math.max(item.height, next.height) * 2) break;
      str += ` ${next.str}`;
      right = next.x + next.width;
      if (complete.test(str)) return [{ ...item, str, width: right - item.x }];
      if (!/^REVIEW\s+SET$/i.test(str)) break;
    }
    // The OCR can also corrupt the section ID; the printed heading word
    // still provides the correct boundary and catalog ordinals select it.
    return /^(?:EXERCISE|REVIEW\s*SET)$/i.test(item.str) ? [item] : [];
  });
}

export function normalizeCourse(value) {
  return value === 'sl' || value === 'hl' ? value : null;
}

export function resolveCourse(search, storage) {
  const params = new URLSearchParams(search);
  const explicit = normalizeCourse(params.get('course'));
  if (explicit) return { course: explicit, explicit: true };
  let saved = null;
  try {
    saved = normalizeCourse(storage?.getItem(COURSE_STORAGE_KEY));
  } catch {
    /* Storage may be disabled. */
  }
  return { course: saved, explicit: false };
}

export function rememberCourse(storage, course) {
  const normalized = normalizeCourse(course);
  if (!normalized) return false;
  try {
    storage?.setItem(COURSE_STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

export function pdfChunkForPage(course, page, totalPages) {
  const selected = normalizeCourse(course);
  if (!selected || !Number.isInteger(page) || page < 1 || page > totalPages) {
    throw new RangeError(`Invalid ${course} PDF page: ${page}`);
  }
  const start = Math.floor((page - 1) / 64) * 64 + 1;
  const end = Math.min(start + 63, totalPages);
  const prefix = selected === 'sl' ? 'sl-book' : 'book';
  return {
    start,
    end,
    localPage: page - start + 1,
    filename: `${prefix}-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}.pdf`,
  };
}

export function pdfChunkUrl(base, course, filename) {
  const selected = normalizeCourse(course);
  if (!selected)
    throw new RangeError(`Invalid course for PDF chunk URL: ${course}`);
  const source = `${base.replace(/\/$/, '')}/${filename}`;
  return selected === 'sl' ? `${source}?v=${SL_PDF_CACHE_VERSION}` : source;
}

export function studyViewUrl(item, course, options = {}) {
  const selected = normalizeCourse(course) || 'hl';
  const params = new URLSearchParams({
    course: selected,
    book: String(item.questionPage),
    answer: String(item.answerPage || item.questionPage),
    label: item.label,
    mode: 'paired',
    bookOrdinal: String(item.questionOrdinal || 1),
    answerOrdinal: String(item.answerOrdinal || 1),
  });
  const fields = {
    bookTop: item.questionTop,
    answerTop: item.answerTop,
    answerColumn: item.answerColumn,
    bookEnd: item.questionEndPage,
    bookEndTop: item.questionEndTop,
    answerEnd: item.answerEndPage,
    answerEndTop: item.answerEndTop,
    answerEndColumn: item.answerEndColumn,
  };
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== null && value !== undefined) params.set(key, String(value));
  });
  if (
    item.answerNumberOverrides &&
    Object.keys(item.answerNumberOverrides).length
  ) {
    params.set(
      'answerNumberOverrides',
      JSON.stringify(item.answerNumberOverrides),
    );
  }
  if (item.missingAnswer) params.set('missingAnswer', '1');
  if (Number.isInteger(options.question) && options.question > 0)
    params.set('question', String(options.question));
  return `split-view.html?${params}`;
}

export function normalizeAnchorSequence(anchors) {
  const ordered = [...anchors].sort(
    (a, b) => a.unitOrder - b.unitOrder || a.top - b.top,
  );
  const resolved = [];
  let nextNumber = 1;
  for (const anchor of ordered) {
    const detectedNumber = Number(anchor.number) || null;
    if (detectedNumber) {
      if (nextNumber >= 10 && detectedNumber <= 5) {
        resolved.push({ ...anchor, number: nextNumber, detectedNumber: null });
        nextNumber++;
        continue;
      }
      while (
        resolved.length &&
        detectedNumber < nextNumber &&
        !resolved[resolved.length - 1].detectedNumber
      ) {
        resolved.pop();
        nextNumber = resolved.length
          ? resolved[resolved.length - 1].number + 1
          : 1;
      }
      if (detectedNumber < nextNumber) {
        continue;
      }
      if (detectedNumber > nextNumber + 4) {
        resolved.push({ ...anchor, number: nextNumber, detectedNumber: null });
        nextNumber++;
        continue;
      }
      resolved.push({ ...anchor, number: detectedNumber, detectedNumber });
      nextNumber = detectedNumber + 1;
    } else {
      resolved.push({ ...anchor, number: nextNumber, detectedNumber: null });
      nextNumber++;
    }
  }
  return resolved;
}

// A colored number band can survive OCR even when its glyph is read as a letter.
// Only accept an unread number when confirmed neighbors identify its sequence.
export function confirmedVisualAnchors(anchors) {
  const ordered = normalizeAnchorSequence(anchors);
  return ordered.flatMap((anchor, index) => {
    if (anchor.reliable) return [anchor];
    const previous = ordered[index - 1],
      next = ordered[index + 1];
    if (
      previous?.reliable &&
      next?.reliable &&
      previous.number === anchor.number - 1 &&
      next.number === anchor.number + 1
    )
      return [{ ...anchor, reliable: true }];
    return [];
  });
}

export function nextAnswerOverride(overrides, number) {
  if (!overrides || typeof overrides !== 'object') return null;
  return (
    Object.entries(overrides)
      .filter(
        ([key, value]) =>
          /^\d+$/.test(key) && Number(key) > number && value !== null,
      )
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([key, value]) => ({
        number: Number(key),
        page: Number(value?.page),
        top: Number(value?.top),
        column: Number(value?.column),
      }))
      .find(
        (value) =>
          Number.isInteger(value.page) &&
          Number.isFinite(value.top) &&
          (value.column === 0 || value.column === 1),
      ) || null
  );
}

export function pdfSourceForCourse(
  course,
  hosted,
  assetMode = PDF_ASSET_MODE,
  localFiles = {},
) {
  const selected = normalizeCourse(course) || 'hl';
  const useChunks = assetMode === 'cloudflare' || hosted;
  return {
    useChunks,
    localPdf:
      selected === 'sl'
        ? localFiles.sl || 'math_book_sl.pdf'
        : localFiles.hl || 'math_book_indexed.pdf',
    prefix: selected === 'sl' ? 'sl-book' : 'book',
    totalPages: selected === 'sl' ? 505 : 969,
  };
}
