import {
  sectionHeadings,
  nextAnswerOverride,
  confirmedVisualAnchors,
  pdfChunkForPage,
  pdfChunkUrl,
  PDF_CHUNK_BASE,
  pdfSourceForCourse,
  rememberCourse as persistCourse,
} from './navigator-core.mjs';
import { continuousCrops, blankSideBounds } from './continuous-view.mjs';
import { setupDivider } from './site-ui.mjs';
import { createAiControls } from './ai-preview.mjs';
import { attachQuestionActions } from './question-actions.mjs';
import { setupStudySession } from './study-session.mjs';
import * as pdfjsLib from '../vendor/pdfjs/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  './vendor/pdfjs/build/pdf.worker.min.mjs';

const aiControls = createAiControls();
const params = new URLSearchParams(location.search);
const selectedCourse = params.get('course') === 'sl' ? 'sl' : 'hl';
let courseStorage = null;
try {
  courseStorage = window.localStorage;
} catch {
  /* Storage can be blocked by browser settings. */
}
if (params.get('course') === 'sl' || params.get('course') === 'hl')
  persistCourse(courseStorage, selectedCourse);
const requestedBookPage =
  Number(params.get('book')) || (selectedCourse === 'sl' ? 18 : 7);
const requestedAnswerPage =
  Number(params.get('answer')) || (selectedCourse === 'sl' ? 443 : 857);
const label = params.get('label') || 'Questions and answers';
const focus = params.get('focus') === 'answer' ? 'answer' : 'book';
const pairedMode = params.get('mode') === 'paired';
const bookOrdinal = Math.max(1, Number(params.get('bookOrdinal')) || 1);
const answerOrdinal = Math.max(1, Number(params.get('answerOrdinal')) || 1);
const bookTopOverride =
  Number.isFinite(Number(params.get('bookTop'))) && params.has('bookTop')
    ? Number(params.get('bookTop'))
    : null;
const answerTopOverride =
  Number.isFinite(Number(params.get('answerTop'))) && params.has('answerTop')
    ? Number(params.get('answerTop'))
    : null;
const answerColumnOverride = params.has('answerColumn')
  ? Math.max(0, Math.min(1, Number(params.get('answerColumn')) || 0))
  : null;
const bookEndOverride =
  Number.isFinite(Number(params.get('bookEnd'))) && params.has('bookEnd')
    ? Number(params.get('bookEnd'))
    : null;
const bookEndTopOverride =
  Number.isFinite(Number(params.get('bookEndTop'))) && params.has('bookEndTop')
    ? Number(params.get('bookEndTop'))
    : null;
const answerEndOverride =
  Number.isFinite(Number(params.get('answerEnd'))) && params.has('answerEnd')
    ? Number(params.get('answerEnd'))
    : null;
const answerEndTopOverride =
  Number.isFinite(Number(params.get('answerEndTop'))) &&
  params.has('answerEndTop')
    ? Number(params.get('answerEndTop'))
    : null;
const answerEndColumnOverride = params.has('answerEndColumn')
  ? Math.max(0, Math.min(1, Number(params.get('answerEndColumn')) || 0))
  : null;
let answerNumberOverrides = {};
try {
  const parsedOverrides = JSON.parse(
    params.get('answerNumberOverrides') || '{}',
  );
  if (
    parsedOverrides &&
    typeof parsedOverrides === 'object' &&
    !Array.isArray(parsedOverrides)
  )
    answerNumberOverrides = parsedOverrides;
} catch {
  /* Ignore malformed optional catalog hints and keep automatic pairing. */
}
const hosted =
  location.hostname === 'simon-math-book.netlify.app' ||
  location.hostname.endsWith('.netlify.app');
const pdfSource = pdfSourceForCourse(selectedCourse, hosted);
const totalPages = pdfSource.totalPages;
const useCloudflarePdf = pdfSource.useChunks;
const localPdfName = pdfSource.localPdf;
const chunkForPage = (pageNumber) => {
  return pdfChunkForPage(selectedCourse, pageNumber, totalPages);
};
const pdfHref = (pageNumber) => {
  if (!useCloudflarePdf)
    return `./${localPdfName}#page=${pageNumber}&zoom=page-width`;
  const chunk = chunkForPage(pageNumber);
  return `${pdfChunkUrl(PDF_CHUNK_BASE, selectedCourse, chunk.filename)}#page=${chunk.localPage}&zoom=page-width`;
};
document.getElementById('questionPdfLink').href = pdfHref(requestedBookPage);
document.getElementById('answerPdfLink').href = pdfHref(requestedAnswerPage);
if (params.get('missingAnswer') === '1') {
  const link = document.getElementById('answerPdfLink');
  link.textContent = 'No printed answer';
  link.removeAttribute('href');
  link.setAttribute('aria-disabled', 'true');
}
document.getElementById('title').textContent = label;
document.title = `${label} | Simon Math Book`;
document.getElementById(`${focus}Viewer`).classList.add('is-focus');
if (pairedMode) {
  document.body.classList.add('paired');
  document.querySelector('.title span').textContent =
    'Drag the divider to resize the reading panes';
}

const panes = {
  book: {
    pane: document.getElementById('bookPane'),
    pages: document.getElementById('bookPages'),
    status: document.getElementById('bookStatus'),
    zoomLabel: document.getElementById('bookZoom'),
    base: requestedBookPage,
    zoom: 1,
  },
  answer: {
    pane: document.getElementById('answerPane'),
    pages: document.getElementById('answerPages'),
    status: document.getElementById('answerStatus'),
    zoomLabel: document.getElementById('answerZoom'),
    base: requestedAnswerPage,
    zoom: 1,
  },
};
const renderTasks = new WeakMap();
let localPdf;
const chunkDocuments = new Map();
const documentOptions = (url) => ({
  url,
  cMapUrl: './vendor/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: './vendor/pdfjs/standard_fonts/',
  wasmUrl: './vendor/pdfjs/wasm/',
});
async function getPdfPage(pageNumber) {
  if (!useCloudflarePdf) return localPdf.getPage(pageNumber);
  const chunk = chunkForPage(pageNumber);
  const sourceUrl = pdfChunkUrl(PDF_CHUNK_BASE, selectedCourse, chunk.filename);
  if (!chunkDocuments.has(chunk.filename)) {
    const loadingTask = pdfjsLib.getDocument(
      documentOptions(sourceUrl),
    ).promise;
    chunkDocuments.set(chunk.filename, loadingTask);
  }
  let document;
  try {
    document = await chunkDocuments.get(chunk.filename);
  } catch (error) {
    if (
      error?.name === 'InvalidPDFException' ||
      /Invalid PDF structure/i.test(error?.message || '')
    ) {
      throw new Error(
        'This book page is unavailable. Reload the study view or try the source PDF. If it still fails, the hosted book needs to be checked.',
      );
    }
    throw error;
  }
  return document.getPage(chunk.localPage);
}
const minZoom = 0.7;
const maxZoom = 2.5;
const zoomStep = 0.15;
const pairedZoom = { book: 1, answer: 1 };

function showError(error) {
  const message =
    location.protocol === 'file:'
      ? 'Double-click “Open Math Book.command” in this folder, then use the navigator it opens.'
      : error?.message || String(error);
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('error').style.display = 'grid';
}

function makeShell(pageNumber) {
  const shell = document.createElement('article');
  shell.className = 'page-shell';
  shell.dataset.page = pageNumber;
  shell.innerHTML = `<div class="loading">Loading page ${pageNumber}…</div><span class="page-number">${pageNumber}</span>`;
  return shell;
}

async function renderPage(shell) {
  if (shell.dataset.rendered || renderTasks.has(shell)) return;
  const task = (async () => {
    const page = await getPdfPage(Number(shell.dataset.page));
    const unscaled = page.getViewport({ scale: 1 });
    const cssWidth = Math.max(320, shell.clientWidth);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    const viewport = page.getViewport({
      scale: (cssWidth / unscaled.width) * pixelRatio,
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport })
      .promise;
    shell.querySelector('.loading')?.remove();
    shell.prepend(canvas);
    shell.dataset.rendered = 'true';
  })()
    .catch(showError)
    .finally(() => renderTasks.delete(shell));
  renderTasks.set(shell, task);
}

function pageAtScroll(state) {
  const shells = [...state.pages.children];
  if (!shells.length) return state.base;
  const center = state.pane.scrollTop + state.pane.clientHeight * 0.34;
  let closest = shells[0];
  let distance = Infinity;
  for (const shell of shells) {
    const nextDistance = Math.abs(
      shell.offsetTop + shell.offsetHeight / 2 - center,
    );
    if (nextDistance > distance) break;
    closest = shell;
    distance = nextDistance;
  }
  return Number(closest.dataset.page);
}

function updateStatus(state) {
  state.status.textContent = `PDF page ${pageAtScroll(state)} of ${totalPages}`;
}

function rerenderNearby(state) {
  const viewportTop = state.pane.scrollTop - state.pane.clientHeight;
  const viewportBottom = state.pane.scrollTop + state.pane.clientHeight * 2;
  [...state.pages.children].forEach((shell) => {
    const shellBottom = shell.offsetTop + shell.offsetHeight;
    if (shellBottom < viewportTop || shell.offsetTop > viewportBottom) return;
    shell.querySelector('canvas')?.remove();
    delete shell.dataset.rendered;
    if (!shell.querySelector('.loading')) {
      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.textContent = `Loading page ${shell.dataset.page}…`;
      shell.prepend(loading);
    }
    renderPage(shell);
  });
}

function setZoom(name, nextZoom) {
  const state = panes[name];
  const scrollableBefore = Math.max(
    1,
    state.pane.scrollHeight - state.pane.clientHeight,
  );
  const progress = state.pane.scrollTop / scrollableBefore;
  state.zoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
  state.pages.style.width = `${Math.round(state.zoom * 100)}%`;
  state.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  document.querySelector(`[data-pane="${name}"][data-zoom="out"]`).disabled =
    state.zoom <= minZoom;
  document.querySelector(`[data-pane="${name}"][data-zoom="in"]`).disabled =
    state.zoom >= maxZoom;
  requestAnimationFrame(() => {
    const scrollableAfter = Math.max(
      0,
      state.pane.scrollHeight - state.pane.clientHeight,
    );
    state.pane.scrollTop = progress * scrollableAfter;
    rerenderNearby(state);
    updateStatus(state);
  });
}

async function analyzePage(pageNumber) {
  const page = await getPdfPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const text = await page.getTextContent();
  const items = text.items
    .filter((item) => item.str?.trim())
    .map((item) => ({
      str: item.str.trim(),
      x: item.transform[4],
      top:
        viewport.height -
        item.transform[5] -
        Math.abs(item.height || item.transform[3]),
      height: Math.abs(item.height || item.transform[3]),
      width: Math.abs(item.width || 0),
    }));
  // Require a heading at the beginning of a text run; ordinary in-line
  // references such as “Exercise 10D” must not start a section.
  const headings = sectionHeadings(items);
  return {
    pageNumber,
    page,
    width: viewport.width,
    height: viewport.height,
    items,
    headings,
  };
}

function unitForHeading(analysis, heading, kind) {
  if (kind === 'book') return 0;
  return heading.x < analysis.width / 2 ? 0 : 1;
}

function orderedHeadings(analyses, kind) {
  const results = [];
  analyses.forEach((analysis, pageOffset) => {
    analysis.headings.forEach((heading) => {
      const column = unitForHeading(analysis, heading, kind);
      const unitOrder = kind === 'book' ? pageOffset : pageOffset * 2 + column;
      results.push({ ...heading, analysis, column, unitOrder });
    });
  });
  return results.sort(
    (a, b) => a.unitOrder - b.unitOrder || a.top - b.top || a.x - b.x,
  );
}

function buildUnits(analyses, kind, headingX) {
  const units = [];
  analyses.forEach((analysis, pageOffset) => {
    if (kind === 'book') {
      const margin = 65; // Preserve both outer margins on facing pages.
      units.push({
        order: pageOffset,
        pageNumber: analysis.pageNumber,
        analysis,
        x: margin,
        width: analysis.width - margin * 2,
        top: 90,
        bottom: analysis.height - 75,
      });
      return;
    }
    const half = analysis.width / 2;
    for (let column = 0; column < 2; column++) {
      units.push({
        order: pageOffset * 2 + column,
        pageNumber: analysis.pageNumber,
        analysis,
        x: column * half + 8,
        width: half - 16,
        top: 95,
        bottom: analysis.height - 70,
      });
    }
  });
  return units;
}

async function findSection(
  kind,
  startPage,
  ordinal,
  topOverride = null,
  columnOverride = null,
  endPageOverride = null,
  endTopOverride = null,
  endColumnOverride = null,
) {
  const analyses = [];
  let currentHeading;
  let nextHeading;
  const lastPage =
    kind === 'book' ? (selectedCourse === 'sl' ? 441 : 856) : totalPages;
  const explicitBounds =
    Number.isInteger(endPageOverride) && Number.isFinite(endTopOverride);
  const stopPage = explicitBounds ? endPageOverride : lastPage;
  const maxPages = explicitBounds
    ? Math.max(1, stopPage - startPage + 1)
    : kind === 'book'
      ? 18
      : 8;
  if (stopPage < startPage || stopPage > lastPage)
    throw new Error(`Invalid ${label} section boundary.`);

  for (
    let offset = 0;
    offset < maxPages && startPage + offset <= stopPage;
    offset++
  ) {
    analyses.push(await analyzePage(startPage + offset));
    if (explicitBounds) {
      // SL catalog boundaries are verified from the printed pages. Ignore
      // OCR headings and inline references between these explicit anchors.
      analyses[analyses.length - 1].headings = [];
      continue;
    }
    if (offset === 0 && topOverride !== null) {
      analyses[0].headings = analyses[0].headings.filter(
        (heading) => Math.abs(heading.top - topOverride) > 70,
      );
      const x = columnOverride === 1 ? analyses[0].width / 2 + 90 : 90;
      analyses[0].headings.push({
        str: 'CATALOG HEADING',
        x,
        top: topOverride,
        height: 24,
        width: 190,
        catalogHeading: true,
      });
    }
    const headings = orderedHeadings(analyses, kind);
    if (!currentHeading) {
      const startingHeadings = headings.filter(
        (heading) => heading.analysis.pageNumber === startPage,
      );
      if (topOverride !== null)
        currentHeading = startingHeadings.reduce(
          (best, heading) =>
            !best ||
            Math.abs(heading.top - topOverride) <
              Math.abs(best.top - topOverride)
              ? heading
              : best,
          null,
        );
      else currentHeading = startingHeadings[ordinal - 1];
      if (!currentHeading) break;
    }
    const currentIndex = headings.findIndex(
      (heading) =>
        heading.analysis.pageNumber === currentHeading.analysis.pageNumber &&
        heading.x === currentHeading.x &&
        heading.top === currentHeading.top,
    );
    nextHeading = headings[currentIndex + 1];
    if (nextHeading) break;
  }

  if (explicitBounds) {
    const startAnalysis = analyses[0];
    const endAnalysis = analyses[analyses.length - 1];
    if (!startAnalysis || !endAnalysis)
      throw new Error(`Could not read the ${label} section boundaries.`);
    const startColumn = kind === 'answer' ? columnOverride || 0 : 0;
    const endColumn = kind === 'answer' ? endColumnOverride || 0 : 0;
    const headingAt = (analysis, page, top, column) => {
      const x =
        kind === 'answer' && column === 1 ? analysis.width / 2 + 90 : 90;
      const pageOffset = page - startPage;
      const unitOrder = kind === 'book' ? pageOffset : pageOffset * 2 + column;
      return { analysis, pageNumber: page, top, x, column, unitOrder };
    };
    currentHeading = headingAt(
      startAnalysis,
      startPage,
      topOverride ?? 0,
      startColumn,
    );
    nextHeading = headingAt(
      endAnalysis,
      endPageOverride,
      endTopOverride,
      endColumn,
    );
  }
  if (!currentHeading) {
    const error = new Error(
      `Could not find the ${label} heading on PDF page ${startPage}.`,
    );
    error.name = 'SectionHeadingError';
    throw error;
  }
  if (
    !explicitBounds &&
    !nextHeading &&
    analyses.at(-1).pageNumber < lastPage
  ) {
    const error = new Error(
      `The end of ${label} could not be identified. Showing full source pages instead.`,
    );
    error.name = 'SectionHeadingError';
    throw error;
  }
  const units = buildUnits(analyses, kind, currentHeading.x);
  const startUnit =
    units.find((unit) => unit.order === currentHeading.unitOrder) || units[0];
  const endUnit = nextHeading
    ? units.find((unit) => unit.order === nextHeading.unitOrder)
    : units[units.length - 1];
  if (!startUnit || !endUnit)
    throw new Error(`Could not map the ${label} page range.`);
  const endAtBottom = nextHeading && nextHeading.top >= endUnit.bottom - 100;
  return {
    kind,
    units,
    start: { unitOrder: startUnit.order, top: currentHeading.top + 10 },
    end: {
      unitOrder: endUnit.order,
      top: nextHeading
        ? endAtBottom
          ? nextHeading.top
          : nextHeading.top - 8
        : endUnit.bottom,
    },
    anchorX: currentHeading.x + 15,
  };
}

function expectedAnchorX(section, unit, top, bottom) {
  if (section.kind === 'book') return unit.pageNumber % 2 === 0 ? 233 : 126;
  const marginNumbers = unit.analysis.items
    .filter(
      (item) =>
        /^\d{1,2}$/.test(item.str) &&
        item.x >= unit.x &&
        item.x < unit.x + 150 &&
        item.top >= top &&
        item.top < bottom,
    )
    .map((item) => item.x)
    .sort((a, b) => a - b);
  if (marginNumbers.length)
    return marginNumbers[Math.floor(marginNumbers.length / 2)];
  return (
    Math.floor(unit.order % 2) * (unit.analysis.width / 2) +
    (section.anchorX % (unit.analysis.width / 2))
  );
}

function questionAnchors(section) {
  const candidates = [];
  for (const unit of section.units) {
    if (
      unit.order < section.start.unitOrder ||
      unit.order > section.end.unitOrder
    )
      continue;
    const top =
      unit.order === section.start.unitOrder ? section.start.top : unit.top;
    const bottom =
      unit.order === section.end.unitOrder ? section.end.top : unit.bottom;
    unit.analysis.items.forEach((item) => {
      if (!/^\d{1,2}$/.test(item.str)) return;
      const expectedX = expectedAnchorX(section, unit, top, bottom);
      if (
        Math.abs(item.x - expectedX) > (section.kind === 'book' ? 90 : 48) ||
        item.top < top ||
        item.top >= bottom
      )
        return;
      candidates.push({
        number: Number(item.str),
        unitOrder: unit.order,
        pageNumber: unit.pageNumber,
        x: item.x,
        width: item.width,
        top: item.top,
        height: item.height,
        reliable: Math.abs(item.x - expectedX) < 35,
      });
    });
  }
  candidates.sort((a, b) => a.unitOrder - b.unitOrder || a.top - b.top);
  const anchors = [];
  let lastNumber = 0;
  for (const candidate of candidates) {
    if (candidate.number <= lastNumber || candidate.number > lastNumber + 4)
      continue;
    anchors.push(candidate);
    lastNumber = candidate.number;
  }
  return anchors;
}

function cropsBetween(section, start, end) {
  const crops = [];
  for (const unit of section.units) {
    if (unit.order < start.unitOrder || unit.order > end.unitOrder) continue;
    // Book question numbers align with the text baseline, while matrices,
    // fractions, and vectors can extend well above it. Divide adjacent
    // questions above that baseline so tall notation stays with its card.
    const leadingOffset = section.kind === 'book' ? 30 : 1;
    const trailingOffset =
      section.kind === 'book' && Number.isFinite(end.number) ? 30 : 14;
    const sectionTop =
      unit.order === section.start.unitOrder
        ? Math.max(unit.top, section.start.top)
        : unit.top;
    const top =
      unit.order === start.unitOrder
        ? Math.max(sectionTop, start.top - leadingOffset)
        : unit.top;
    const bottom =
      unit.order === end.unitOrder
        ? Math.min(unit.bottom, end.top - trailingOffset)
        : unit.bottom;
    if (bottom - top < 18) continue;
    crops.push({
      pageNumber: unit.pageNumber,
      x: unit.x,
      y: top,
      width: unit.width,
      height: bottom - top,
    });
  }
  return crops;
}

function questionMap(section) {
  const anchors = questionAnchors(section);
  const map = new Map();
  anchors.forEach((anchor, index) => {
    const next = anchors[index + 1] || section.end;
    const crops = cropsBetween(section, anchor, next);
    if (crops.length) map.set(anchor.number, crops);
  });
  return map;
}

async function visualQuestionAnchors(section, cache) {
  const anchors = [];
  for (const unit of section.units) {
    if (
      unit.order < section.start.unitOrder ||
      unit.order > section.end.unitOrder
    )
      continue;
    const source = await makePageBitmap(unit.pageNumber, cache);
    const top =
      unit.order === section.start.unitOrder ? section.start.top : unit.top;
    const bottom =
      unit.order === section.end.unitOrder ? section.end.top : unit.bottom;
    const expectedX = expectedAnchorX(section, unit, top, bottom);
    const scanX = Math.max(0, Math.round((expectedX - 18) * source.scale));
    const scanY = Math.max(0, Math.round(top * source.scale));
    const scanWidth = Math.max(1, Math.round(48 * source.scale));
    const scanHeight = Math.max(1, Math.round((bottom - top) * source.scale));
    const context = source.canvas.getContext('2d');
    const pixels = context.getImageData(
      scanX,
      scanY,
      scanWidth,
      scanHeight,
    ).data;
    const activeRows = [];
    const detectDarkNumbers = section.kind === 'book' && /^Review/i.test(label);
    for (let y = 0; y < scanHeight; y++) {
      let colored = 0;
      for (let x = 0; x < scanWidth; x++) {
        const offset = (y * scanWidth + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        const a = pixels[offset + 3];
        const matchesBlue =
          r < 145 && g > 90 && b > 125 && g - r > 22 && b - r > 38;
        const matchesDark = r < 125 && g < 125 && b < 125;
        if (a > 80 && (detectDarkNumbers ? matchesDark : matchesBlue))
          colored++;
      }
      if (colored >= 2) activeRows.push(y);
    }

    const bands = [];
    for (const row of activeRows) {
      const last = bands[bands.length - 1];
      if (last && row - last.end <= 5) last.end = row;
      else bands.push({ start: row, end: row });
    }
    bands
      .filter(
        (band) => band.end - band.start >= 3 && band.end - band.start < 75,
      )
      .forEach((band) => {
        const bandTop = top + band.start / source.scale;
        const nearbyNumber = unit.analysis.items.find(
          (item) =>
            /^\d{1,2}$/.test(item.str) &&
            Math.abs(item.x - expectedX) < 52 &&
            Math.abs(item.top - bandTop) < 28 &&
            (section.kind === 'book' || hasBluePixels(source, item)),
        );
        anchors.push({
          number: nearbyNumber ? Number(nearbyNumber.str) : null,
          unitOrder: unit.order,
          top: bandTop,
          height: (band.end - band.start + 1) / source.scale,
          pageNumber: unit.pageNumber,
          x: nearbyNumber?.x ?? expectedX,
          width: nearbyNumber?.width ?? 16,
          reliable: Boolean(nearbyNumber),
        });
      });
  }

  return confirmedVisualAnchors(anchors);
}

function questionMapFromAnchors(section, anchors) {
  const map = new Map();
  anchors.forEach((anchor, index) => {
    const next = anchors[index + 1] || section.end;
    const crops = cropsBetween(section, anchor, next);
    if (crops.length) map.set(anchor.number, crops);
  });
  return map;
}

function hasBluePixels(source, item) {
  const scale = source.scale;
  const x = Math.max(0, Math.floor((item.x - 2) * scale));
  const y = Math.max(0, Math.floor((item.top - 2) * scale));
  const width = Math.max(1, Math.ceil((Math.max(item.width, 8) + 4) * scale));
  const height = Math.max(
    1,
    Math.ceil((Math.max(item.height, 12) + 4) * scale),
  );
  const boundedWidth = Math.min(width, source.canvas.width - x);
  const boundedHeight = Math.min(height, source.canvas.height - y);
  if (boundedWidth <= 0 || boundedHeight <= 0) return false;
  const pixels = source.canvas
    .getContext('2d')
    .getImageData(x, y, boundedWidth, boundedHeight).data;
  let colored = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    if (
      pixels[offset + 3] > 80 &&
      r < 145 &&
      g > 90 &&
      b > 125 &&
      g - r > 22 &&
      b - r > 38
    ) {
      if (++colored >= 4) return true;
    }
  }
  return false;
}

async function answerBlockMap(section, cache) {
  const map = new Map();
  const seenNumbers = new Set();
  for (const unit of section.units) {
    if (
      unit.order < section.start.unitOrder ||
      unit.order > section.end.unitOrder
    )
      continue;
    const source = await makePageBitmap(unit.pageNumber, cache);
    const top =
      unit.order === section.start.unitOrder ? section.start.top : unit.top;
    const bottom =
      unit.order === section.end.unitOrder ? section.end.top : unit.bottom;
    const markers = unit.analysis.items
      .filter(
        (item) =>
          /^\d{1,2}$/.test(item.str) &&
          item.height > 18 &&
          item.x >= unit.x &&
          item.x < unit.x + unit.width &&
          item.top >= top &&
          item.top < bottom &&
          hasBluePixels(source, item),
      )
      .map((item) => ({ ...item, number: Number(item.str) }));
    markers.sort((a, b) => a.top - b.top || a.x - b.x);

    const rows = [];
    for (const marker of markers) {
      if (seenNumbers.has(marker.number)) continue;
      let row = rows.find(
        (candidate) => Math.abs(candidate.top - marker.top) < 22,
      );
      if (!row) {
        row = { top: marker.top, markers: [] };
        rows.push(row);
      }
      row.markers.push(marker);
      seenNumbers.add(marker.number);
    }
    rows.sort((a, b) => a.top - b.top);
    rows.forEach((row) => row.markers.sort((a, b) => a.x - b.x));
    rows.forEach((row, rowIndex) => {
      const rowBottom =
        rowIndex + 1 < rows.length ? rows[rowIndex + 1].top - 5 : bottom;
      row.markers.forEach((marker, markerIndex) => {
        const right =
          markerIndex + 1 < row.markers.length
            ? row.markers[markerIndex + 1].x - 8
            : unit.x + unit.width;
        const crop = {
          pageNumber: unit.pageNumber,
          x: Math.max(unit.x, marker.x - 8),
          y: Math.max(top, row.top - 5),
          width: Math.max(25, right - Math.max(unit.x, marker.x - 8)),
          height: Math.max(20, rowBottom - Math.max(top, row.top - 5)),
        };
        map.set(marker.number, [crop]);
      });
    });
  }
  return map;
}

function recoverTrailingProblems(problems, answers) {
  const problemNumbers = [...problems.keys()];
  const answerNumbers = [...answers.keys()];
  let lastProblem = Math.max(...problemNumbers);
  const lastAnswer = Math.max(...answerNumbers);
  while (lastProblem < lastAnswer) {
    const continuation = problems.get(lastProblem);
    if (!continuation || continuation.length < 2) break;
    problems.set(lastProblem, [continuation[0]]);
    problems.set(lastProblem + 1, continuation.slice(1));
    lastProblem++;
  }
}

function recoverInternalAnswerBlocks(problems, answers) {
  const crops = [...answers.values()].flat();
  if (!crops.length) return;
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 1;
  };
  const medianHeight = median(crops.map((crop) => crop.height));
  const medianWidth = median(crops.map((crop) => crop.width));
  const orderedAnswerNumbers = [...answers.keys()].sort((a, b) => a - b);
  const verticalDeltas = [];
  for (let index = 1; index < orderedAnswerNumbers.length; index++) {
    const previous = answers.get(orderedAnswerNumbers[index - 1])?.[0];
    const next = answers.get(orderedAnswerNumbers[index])?.[0];
    if (
      previous &&
      next &&
      previous.pageNumber === next.pageNumber &&
      Math.abs(previous.x - next.x) < 100 &&
      next.y > previous.y
    ) {
      verticalDeltas.push(next.y - previous.y);
    }
  }
  const medianDelta = median(verticalDeltas);
  const problemNumbers = [...problems.keys()].sort((a, b) => a - b);
  for (const number of problemNumbers) {
    if (
      answers.has(number) ||
      !answers.has(number - 1) ||
      !answers.has(number + 1)
    )
      continue;
    const previousCrops = answers.get(number - 1);
    const previous = previousCrops[previousCrops.length - 1];
    if (previous.height > medianHeight * 1.55) {
      const half = previous.height / 2;
      previous.height = half;
      answers.set(number, [
        { ...previous, y: previous.y + half, height: half },
      ]);
    } else if (previous.width > medianWidth * 1.55) {
      const half = previous.width / 2;
      previous.width = half;
      answers.set(number, [{ ...previous, x: previous.x + half, width: half }]);
    } else {
      const next = answers.get(number + 1)?.[0];
      if (
        next &&
        next.pageNumber === previous.pageNumber &&
        Math.abs(next.x - previous.x) < 100 &&
        next.y - previous.y > medianDelta * 1.5
      ) {
        const y = previous.y + medianDelta;
        answers.set(number, [{ ...next, y, height: Math.max(20, next.y - y) }]);
      }
    }
  }
}

function applyAnswerNumberOverrides(section, anchors, answers, overrides) {
  if (!section || !overrides || typeof overrides !== 'object') return;
  const ordered = [...anchors].sort(
    (a, b) => a.unitOrder - b.unitOrder || a.top - b.top,
  );
  if (overrides.replace === true) answers.clear();
  const numberedOverrides = Object.entries(overrides)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => Number(a) - Number(b));
  for (const [rawNumber, override] of numberedOverrides) {
    const number = Number(rawNumber);
    if (override === null) {
      answers.delete(number);
      continue;
    }
    const page = Number(override?.page);
    const top = Number(override?.top);
    const column = Math.max(0, Math.min(1, Number(override?.column) || 0));
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      !Number.isInteger(page) ||
      !Number.isFinite(top)
    )
      continue;
    const unit = section.units.find(
      (candidate) =>
        candidate.pageNumber === page && candidate.order % 2 === column,
    );
    if (!unit || top < unit.top || top >= unit.bottom) continue;
    const anchor = {
      number,
      unitOrder: unit.order,
      top,
      height: 18,
      detectedNumber: number,
    };
    const after = (candidate) =>
      candidate.unitOrder > unit.order ||
      (candidate.unitOrder === unit.order && candidate.top > top + 3);
    const nextOverrideData = nextAnswerOverride(overrides, number);
    const nextOverrideUnit =
      nextOverrideData &&
      section.units.find(
        (entry) =>
          entry.pageNumber === nextOverrideData.page &&
          entry.order % 2 === nextOverrideData.column,
      );
    const nextOverride = nextOverrideUnit
      ? {
          number: nextOverrideData.number,
          unitOrder: nextOverrideUnit.order,
          top: nextOverrideData.top,
          detectedNumber: nextOverrideData.number,
        }
      : null;
    const next =
      nextOverride ||
      (overrides.replace === true ? section.end : null) ||
      ordered.find(
        (candidate) => after(candidate) && candidate.number === number + 1,
      ) ||
      ordered.find(after) ||
      section.end;
    const crops = cropsBetween(section, anchor, next);
    if (crops.length) answers.set(number, crops);
  }
}

function setPairedZoom(name, nextZoom) {
  pairedZoom[name] =
    Math.round(Math.min(maxZoom, Math.max(minZoom, nextZoom)) * 100) / 100;
  const percent = `${Math.round(pairedZoom[name] * 100)}%`;
  const cellClass = name === 'book' ? 'problem-cell' : 'answer-cell';
  document.querySelectorAll(`.${cellClass} .crop-stack`).forEach((stack) => {
    const pane = stack.parentElement,
      width = stack.getBoundingClientRect().width || 1,
      top = pane.scrollTop;
    stack.style.width = percent;
    pane.scrollTop = (top * stack.getBoundingClientRect().width) / width;
  });
  document.getElementById(
    name === 'book' ? 'pairedBookZoom' : 'pairedAnswerZoom',
  ).textContent = percent;
  document.querySelector(
    `[data-pair-pane="${name}"][data-zoom="out"]`,
  ).disabled = pairedZoom[name] <= minZoom;
  document.querySelector(
    `[data-pair-pane="${name}"][data-zoom="in"]`,
  ).disabled = pairedZoom[name] >= maxZoom;
}

async function makePageBitmap(pageNumber, cache) {
  if (cache.has(pageNumber)) return cache.get(pageNumber);
  const promise = (async () => {
    const page = await getPdfPage(pageNumber);
    const scale = Math.min(1.05, Math.max(0.82, window.devicePixelRatio || 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport })
      .promise;
    return { canvas, scale };
  })();
  cache.set(pageNumber, promise);
  return promise;
}

function findCleanPrompt(crop, number, section) {
  const unit = section.units.find(
    (candidate) => candidate.pageNumber === crop.pageNumber,
  );
  if (!unit) return null;
  const items = unit.analysis.items.filter(
    (item) =>
      item.str?.trim() &&
      item.x >= crop.x - 4 &&
      item.x < crop.x + crop.width &&
      item.top >= crop.y - 3 &&
      item.top < Math.min(crop.y + crop.height, crop.y + 240),
  );
  if (!items.length) return null;

  const lines = [];
  items
    .sort((a, b) => a.top - b.top || a.x - b.x)
    .forEach((item) => {
      let line = lines.find(
        (candidate) =>
          Math.abs(candidate.top - item.top) <= Math.max(4, item.height * 0.35),
      );
      if (!line) {
        line = { top: item.top, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    });
  lines.sort((a, b) => a.top - b.top);

  const candidates = [];
  lines
    .filter((line) => line.top < crop.y + 95)
    .slice(0, 4)
    .forEach((line) => {
      line.items.sort((a, b) => a.x - b.x);
      candidates.push(line);
      line.items.forEach((item) =>
        candidates.push({ top: item.top, items: [item] }),
      );
    });

  for (const line of candidates) {
    const contentItems = line.items.filter(
      (item, index) => !(index === 0 && item.str.trim() === String(number)),
    );
    let text = contentItems
      .map((item) => item.str.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    text = text.replace(new RegExp(`^${number}\\s*[.)-]?\\s*`), '').trim();
    const words = text.match(/[A-Za-z]{2,}/g) || [];
    const suspicious =
      /[�¢¤§]|\bV\s*\d|[_=<>±×÷√∑∫]|\^|\*{2,}|\b(?:Example|Self Tutor|EXERCISE|REVIEW|FUNCTIONS)\b/i.test(
        text,
      );
    const nonProse = (text.match(/[^A-Za-z0-9\s.,;:'()?!\-]/g) || []).length;
    const lowerCaseLetters = (text.match(/[a-z]/g) || []).length;
    const startsAsSubpart = /^\(?[a-z]\)?\s/i.test(text);
    const startsMidSentence = /^[a-z]/.test(text);
    if (
      text.length >= 12 &&
      text.length <= 220 &&
      words.length >= 3 &&
      lowerCaseLetters >= 5 &&
      !suspicious &&
      nonProse === 0 &&
      !startsAsSubpart &&
      !startsMidSentence
    ) {
      const bottom = Math.max(
        ...contentItems.map((item) => item.top + item.height),
      );
      if (crop.y + crop.height - bottom >= 30) return { text, bottom };
    }
  }
  return null;
}

function extractProblemText(crops, number, section) {
  const cropTexts = crops
    .map((crop, cropIndex) => {
      const unit = section.units.find(
        (candidate) => candidate.pageNumber === crop.pageNumber,
      );
      if (!unit) return { cropIndex, lines: [] };
      const items = unit.analysis.items
        .filter((item) => {
          const itemRight = item.x + Math.max(item.width, 1);
          const itemBottom = item.top + Math.max(item.height, 1);
          const insideCrop =
            itemRight >= crop.x &&
            item.x <= crop.x + crop.width &&
            itemBottom >= crop.y &&
            item.top <= crop.y + crop.height;
          if (!insideCrop || /^(?:EXERCISE|REVIEW)\b/i.test(item.str))
            return false;
          const isProblemNumber =
            item.str.trim() === String(number) &&
            item.top < crop.y + 55 &&
            item.x < crop.x + 130;
          return !isProblemNumber;
        })
        .sort((a, b) => a.top - b.top || a.x - b.x);

      const lines = [];
      items.forEach((item) => {
        let line = lines.find(
          (candidate) =>
            Math.abs(candidate.top - item.top) <=
            Math.max(4, item.height * 0.38),
        );
        if (!line) {
          line = { top: item.top, items: [] };
          lines.push(line);
        }
        line.items.push(item);
      });
      lines.sort((a, b) => a.top - b.top);
      return {
        cropIndex,
        lines: lines
          .map((line) => {
            line.items.sort((a, b) => a.x - b.x);
            return line.items
              .map((item) => item.str.trim())
              .filter(Boolean)
              .join(' ')
              .replace(/\s+([,.;:!?])/g, '$1')
              .replace(/\s+/g, ' ')
              .trim();
          })
          .filter(Boolean),
      };
    })
    .sort((a, b) => a.cropIndex - b.cropIndex);

  const orderedLines = cropTexts.flatMap((crop) => crop.lines);
  const problemLines = [];
  for (const line of orderedLines) {
    const letters = line.replace(/[^A-Za-z]/g, '');
    const isRunningHeader = /^[A-Z][A-Z\s]+\(Chapter\s+\d+\)$/i.test(line);
    const startsNewMaterial =
      /\b(?:Example\s+\d+|Self\s+Tutor)\b/i.test(line) ||
      (problemLines.length > 0 &&
        letters.length >= 7 &&
        letters === letters.toUpperCase());
    if (isRunningHeader) continue;
    if (startsNewMaterial) break;
    problemLines.push(line);
  }

  const text = problemLines.join('\n').trim();
  if (text.replace(/\s/g, '').length >= 2) return text;
  return `The source is ${label}, problem ${number}, but its mathematical expression or diagram could not be extracted as text.`;
}

function buildGeminiPrompt(number, problemText) {
  return `Help me solve ${label}, question ${number}. Explain the reasoning step by step and solve every labeled subpart in order. Parenthesized coordinate lists represent vectors with components in the given order; preserve every sign, number, and variable. Vector XY points from X to Y. Wait for me to attach the question image before solving. Use the image as the source of truth. Solve only the selected question and its continuations. First restate the givens. If information is missing, ask rather than guess.\n\n${problemText}`;
}

function combinedImage(stack) {
  const images = [...stack.querySelectorAll('canvas')];
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(...images.map((image) => image.width));
  canvas.height = images.reduce(
    (height, image) => height + image.height + 16,
    0,
  );
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const image of images) {
    ctx.drawImage(image, 0, y);
    y += image.height + 16;
  }
  return canvas;
}

function makeGeminiLink(number, problemText, stack) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gemini-link';
  button.dataset.aiLaunch = '';
  button.textContent = 'Ask Google AI';
  const context = {
    number,
    label,
    prompt: buildGeminiPrompt(number, problemText),
    image: async () => combinedImage(stack),
  };
  button.addEventListener('click', () => aiControls.open(context));
  return button;
}

function contiguousProblemCount(map) {
  let number = 1;
  while (map.has(number)) number++;
  return number - 1;
}

async function renderCrop(crop, stack, cache, kind = 'problem') {
  const source = await makePageBitmap(crop.pageNumber, cache);
  const padding = crop.exact
    ? { left: 0, right: 0, top: 0, bottom: 0 }
    : kind === 'answer'
      ? { left: 6, right: 6, top: 20, bottom: 6 }
      : { left: 8, right: 8, top: 12, bottom: 12 };
  const pageWidth = source.canvas.width / source.scale;
  const pageHeight = source.canvas.height / source.scale;
  const x = Math.max(0, crop.x - padding.left);
  const y = Math.max(0, crop.y - padding.top);
  const right = Math.min(pageWidth, crop.x + crop.width + padding.right);
  const bottom = Math.min(pageHeight, crop.y + crop.height + padding.bottom);
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  const frame = 10;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((width + frame * 2) * source.scale));
  canvas.height = Math.max(1, Math.round((height + frame * 2) * source.scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source.canvas,
    x * source.scale,
    y * source.scale,
    width * source.scale,
    height * source.scale,
    frame * source.scale,
    frame * source.scale,
    width * source.scale,
    height * source.scale,
  );
  if (crop.exclude) {
    const area = crop.exclude;
    context.fillRect(
      (area.x - x + frame) * source.scale,
      (area.y - y + frame) * source.scale,
      area.width * source.scale,
      area.height * source.scale,
    );
  }
  if (kind === 'answer' && crop.exact)
    canvas.style.width = `${Math.min(100, ((width + frame * 2) / (pageWidth * 0.46)) * 100)}%`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `${kind === 'answer' ? 'Answer' : 'Question'} from printed page ${crop.pageNumber - 1}`,
  );
  stack.append(canvas);
}

async function startPairedView() {
  const bitmapCache = new Map();
  const bookSection = await findSection(
    'book',
    panes.book.base,
    bookOrdinal,
    bookTopOverride,
    null,
    bookEndOverride,
    bookEndTopOverride,
  );
  const answerSection =
    params.get('missingAnswer') === '1'
      ? null
      : await findSection(
          'answer',
          panes.answer.base,
          answerOrdinal,
          answerTopOverride,
          answerColumnOverride,
          answerEndOverride,
          answerEndTopOverride,
          answerEndColumnOverride,
        );
  const bookCrops = continuousCrops(bookSection);
  const answerCrops = answerSection ? continuousCrops(answerSection) : [];
  // Trim only visually blank side columns across the entire section unit.
  // Include the full question page width so illustrations outside text margins survive.
  for (const crop of [...bookCrops, ...answerCrops]) {
    const source = await makePageBitmap(crop.pageNumber, bitmapCache);
    if (bookCrops.includes(crop)) {
      crop.x = 0;
      crop.width = source.canvas.width / source.scale;
    }
    const x = Math.max(0, Math.floor(crop.x * source.scale)),
      y = Math.max(0, Math.floor(crop.y * source.scale));
    const width = Math.min(
      source.canvas.width - x,
      Math.floor(crop.width * source.scale),
    );
    const height = Math.min(
      source.canvas.height - y,
      Math.floor(crop.height * source.scale),
    );
    const pixels = source.canvas
      .getContext('2d')
      .getImageData(x, y, width, height);
    const bounds = blankSideBounds(
      pixels.data,
      width,
      height,
      Math.ceil(8 * source.scale),
    );
    crop.x = (x + bounds.left) / source.scale;
    crop.width = bounds.width / source.scale;
  }
  const bookStack = document.getElementById('sectionBook');
  const answerStack = document.getElementById('sectionAnswer');
  // Only whole section units are rendered. Question anchors are navigation metadata.
  const frames = [];
  async function renderSection(crops, stack, kind) {
    for (const crop of crops) {
      const shell = document.createElement('div');
      shell.className = 'section-frame';
      shell.style.aspectRatio = `${crop.width} / ${crop.height}`;
      stack.append(shell);
      frames.push({ crop, shell, kind });
    }
  }
  await renderSection(bookCrops, bookStack, 'problem');
  await renderSection(answerCrops, answerStack, 'answer');
  if (!answerCrops.length)
    answerStack.innerHTML =
      '<p class="no-answer">No printed answers for this section.</p>';
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          const frame = frames.find((frame) => frame.shell === entry.target);
          renderFrame(frame);
          observer.unobserve(entry.target);
        }
    },
    { rootMargin: '800px' },
  );
  async function renderFrame(frame) {
    if (frame.rendering) return;
    frame.rendering = true;
    try {
      const page = await getPdfPage(frame.crop.pageNumber);
      const scale = Math.min(
        3,
        Math.max(
          1,
          (frame.shell.clientWidth / frame.crop.width) *
            (devicePixelRatio || 1),
        ),
      );
      const viewport = page.getViewport({ scale });
      const renderedWidth = frame.shell.clientWidth;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(frame.crop.width * scale);
      canvas.height = Math.ceil(frame.crop.height * scale);
      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: [1, 0, 0, 1, -frame.crop.x * scale, -frame.crop.y * scale],
      }).promise;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute(
        'aria-label',
        `${frame.kind === 'answer' ? 'Answers' : 'Questions'} from printed page ${frame.crop.pageNumber - 1}`,
      );
      frame.shell.querySelector('canvas')?.remove();
      frame.shell.prepend(canvas);
      frame.renderedWidth = renderedWidth;
    } catch (error) {
      frame.shell.textContent =
        'Page could not render. Open the source PDF above.';
      console.error(error);
    } finally {
      frame.rendering = false;
      if (
        frame.renderedWidth &&
        Math.abs(frame.renderedWidth - frame.shell.clientWidth) > 2
      )
        renderFrame(frame);
    }
  }
  frames.forEach((frame) => observer.observe(frame.shell));
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(
      () =>
        frames
          .filter((frame) => {
            const r = frame.shell.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight;
          })
          .forEach(renderFrame),
      180,
    );
  }).observe(bookStack);
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(
      () =>
        frames
          .filter((frame) => {
            const r = frame.shell.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight;
          })
          .forEach(renderFrame),
      180,
    );
  }).observe(answerStack);
  let anchors = questionAnchors(bookSection);
  try {
    const visual = await visualQuestionAnchors(bookSection, bitmapCache);
    const contiguous = (list) => {
      let n = 1;
      const numbers = new Set(list.map((anchor) => anchor.number));
      while (numbers.has(n)) n++;
      return n - 1;
    };
    if (contiguous(visual) > contiguous(anchors)) anchors = visual;
  } catch {
    /* Question metadata is optional; the continuous section remains usable. */
  }
  const jump = document.getElementById('questionJump');
  if (!anchors.length) jump.add(new Option('Entire section', 'section'));
  anchors.forEach((anchor) =>
    jump.add(new Option(String(anchor.number), String(anchor.number))),
  );
  function selectedAnchor() {
    return anchors.find((anchor) => String(anchor.number) === jump.value);
  }
  function jumpTo() {
    const anchor = selectedAnchor();
    if (!anchor) return;
    const frame = frames.find(
      (frame) =>
        frame.kind === 'problem' && frame.crop.unitOrder === anchor.unitOrder,
    );
    if (!frame) return;
    const pane = document.getElementById('continuousBook');
    pane.scrollTop =
      frame.shell.getBoundingClientRect().top -
      pane.getBoundingClientRect().top +
      pane.scrollTop +
      Math.max(0, (anchor.top - frame.crop.y - 30) / frame.crop.height) *
        frame.shell.clientHeight;
  }
  jump.addEventListener('change', jumpTo);
  let session;
  const contexts = new Map();
  function contextFor(anchor) {
    const number = anchor?.number ?? 'section';
    if (contexts.has(number)) return contexts.get(number);
    const unit =
      anchor &&
      bookSection.units.find((unit) => unit.order === anchor.unitOrder);
    const nextAnchor = anchor && anchors[anchors.indexOf(anchor) + 1];
    const nextUnit =
      nextAnchor &&
      bookSection.units.find((unit) => unit.order === nextAnchor.unitOrder);
    const lastContextPage = nextUnit?.pageNumber ?? bookCrops.at(-1).pageNumber;
    const contextCrops = bookCrops.filter(
      (crop) =>
        !unit ||
        (crop.pageNumber >= unit.pageNumber &&
          crop.pageNumber <= Math.max(unit.pageNumber + 1, lastContextPage)),
    );
    const draft = anchor
      ? extractProblemText(
          cropsBetween(bookSection, anchor, nextAnchor || bookSection.end),
          anchor.number,
          bookSection,
        )
      : 'Ask me to identify the question on the attached source pages.';
    const text = `PDF text is an unverified draft and may omit notation:\n${draft}`;
    let imagePromise;
    const context = {
      number,
      label,
      prompt: buildGeminiPrompt(number, text),
      image: () =>
        (imagePromise ??= (async () => {
          const stack = document.createElement('div');
          for (const crop of contextCrops)
            await renderCrop({ ...crop, exact: true }, stack, bitmapCache);
          return combinedImage(stack);
        })().catch((error) => {
          imagePromise = null;
          throw error;
        })),
    };
    contexts.set(number, context);
    if (contexts.size > 3) contexts.delete(contexts.keys().next().value);
    return context;
  }
  const ask = document.createElement('button');
  ask.type = 'button';
  ask.className = 'gemini-link';
  ask.dataset.aiLaunch = '';
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.textContent = 'Preview';
  document.getElementById('aiToolbar').append(ask, preview);
  const updateAsk = () => {
    ask.textContent = 'Ask Google AI';
    ask.setAttribute(
      'aria-label',
      selectedAnchor()
        ? `Ask Google AI about question ${jump.value}`
        : 'Ask Google AI about this section',
    );
    document.getElementById('currentQuestion').textContent = selectedAnchor()
      ? `Question ${jump.value}`
      : 'Entire section';
  };
  ask.onclick = () => aiControls.open(contextFor(selectedAnchor()));
  preview.onclick = () => aiControls.preview(contextFor(selectedAnchor()));
  jump.addEventListener('change', updateAsk);
  updateAsk();
  const actions = attachQuestionActions({
    anchors,
    frames,
    onSelect: (anchor) => {
      jump.value = String(anchor.number);
      updateAsk();
      actions.setCurrent(anchor);
      session?.save();
    },
    onAsk: (anchor) => aiControls.open(contextFor(anchor)),
    onPreview: (anchor) => aiControls.preview(contextFor(anchor)),
  });
  document.addEventListener('ai-busy', (event) =>
    actions.setBusy(event.detail),
  );
  document.getElementById('questionCount').textContent =
    `${selectedCourse.toUpperCase()} · ${anchors.length ? `${anchors.length} questions` : 'Section view'}`;
  document.getElementById('fitQuestions').onclick = () => {
    setPairedZoom('book', 1);
    setPairedZoom('answer', 1);
  };
  document.getElementById('toggleAnswers').onclick = (event) => {
    const hidden = document.body.classList.toggle('answers-hidden');
    event.currentTarget.textContent = hidden ? 'Show answers' : 'Hide answers';
    event.currentTarget.setAttribute('aria-pressed', String(hidden));
  };
  document
    .querySelectorAll('[data-pair-pane]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          setPairedZoom(
            button.dataset.pairPane,
            pairedZoom[button.dataset.pairPane] +
              (button.dataset.zoom === 'in' ? zoomStep : -zoomStep),
          )),
    );
  const left = document.getElementById('continuousBook'),
    right = document.getElementById('continuousAnswer');
  setupDivider(document.getElementById('continuousGrid'));
  setPairedZoom('book', 1);
  setPairedZoom('answer', 1);
  requestAnimationFrame(() => {
    session = setupStudySession({
      course: selectedCourse,
      label,
      params,
      frames,
      panes: { problem: left, answer: right },
      jump,
      jumpTo,
    });
    updateAsk();
    actions.setCurrent(selectedAnchor());
    let readingFrame;
    const followReading = () => {
      cancelAnimationFrame(readingFrame);
      readingFrame = requestAnimationFrame(() => {
        const edge =
          left.getBoundingClientRect().top +
          Math.min(96, left.clientHeight * 0.18);
        let current = anchors[0];
        for (const anchor of anchors) {
          const frame = frames.find(
            (frame) =>
              frame.kind === 'problem' &&
              frame.crop.unitOrder === anchor.unitOrder,
          );
          if (!frame) continue;
          const rect = frame.shell.getBoundingClientRect();
          const top =
            rect.top +
            ((anchor.top - frame.crop.y) / frame.crop.height) * rect.height;
          if (top <= edge) current = anchor;
          else break;
        }
        if (current && jump.value !== String(current.number)) {
          jump.value = String(current.number);
          updateAsk();
          actions.setCurrent(current);
          session.save();
        }
      });
    };
    // A deep link can be clamped by the end of the document. Preserve its
    // explicit target until the reader actually moves, including on resume.
    let previousTop = left.scrollTop;
    left.addEventListener(
      'scroll',
      () => {
        if (Math.abs(left.scrollTop - previousTop) < 0.5) return;
        previousTop = left.scrollTop;
        actions.hide();
        followReading();
      },
      { passive: true },
    );
  });
}

async function start() {
  if (!useCloudflarePdf) {
    localPdf = await pdfjsLib.getDocument(documentOptions(`./${localPdfName}`))
      .promise;
  }

  panes.book.base = Math.min(Math.max(1, panes.book.base), totalPages);
  panes.answer.base = Math.min(Math.max(1, panes.answer.base), totalPages);
  if (pairedMode) {
    try {
      await startPairedView();
      return;
    } catch (error) {
      if (error.name !== 'SectionHeadingError') throw error;
      // Some scanned headings have no readable text. Keep the source
      // pages usable when automatic question pairing is unavailable.
      document.body.classList.remove('paired');
      document.querySelector('.title span').textContent =
        'Showing source pages because the section heading could not be read';
    }
  }
  const pageCount = Math.min(
    totalPages - panes.book.base + 1,
    totalPages - panes.answer.base + 1,
  );

  for (const state of Object.values(panes)) {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < pageCount; index++)
      fragment.append(makeShell(state.base + index));
    state.pages.append(fragment);
    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry) => renderPage(entry.target));
      },
      { root: state.pane, rootMargin: '1400px 0px' },
    );
    [...state.pages.children].forEach((shell) => observer.observe(shell));
    updateStatus(state);
  }

  setupDivider(document.getElementById('sourceGrid'));
  let sourceResizeTimer;
  new ResizeObserver(() => {
    clearTimeout(sourceResizeTimer);
    sourceResizeTimer = setTimeout(
      () => Object.values(panes).forEach(rerenderNearby),
      180,
    );
  }).observe(document.getElementById('sourceGrid'));
  function fallbackContext() {
    const shells = [...panes.book.pages.children];
    const shell =
      shells.find(
        (shell) =>
          shell.offsetTop + shell.offsetHeight > panes.book.pane.scrollTop,
      ) || shells[0];
    const pageNumber = Number(shell.dataset.page);
    return {
      number: 'section',
      label,
      prompt: buildGeminiPrompt(
        'section',
        'Ask me which question I mean on the attached source page.',
      ),
      image: async () => {
        const page = await getPdfPage(pageNumber),
          viewport = page.getViewport({ scale: 1 });
        const stack = document.createElement('div');
        await renderCrop(
          {
            pageNumber,
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
            exact: true,
          },
          stack,
          new Map(),
        );
        return combinedImage(stack);
      },
    };
  }
  const fallbackAsk = document.createElement('button');
  fallbackAsk.type = 'button';
  fallbackAsk.className = 'gemini-link';
  fallbackAsk.dataset.aiLaunch = '';
  fallbackAsk.textContent = 'Ask Google AI';
  fallbackAsk.onclick = () => aiControls.open(fallbackContext());
  const fallbackPreview = document.createElement('button');
  fallbackPreview.type = 'button';
  fallbackPreview.textContent = 'Preview';
  fallbackPreview.onclick = () => aiControls.preview(fallbackContext());
  document
    .querySelector('#bookViewer .pane-heading')
    .append(fallbackAsk, fallbackPreview);
  const sourceFrames = Object.entries(panes).flatMap(([name, state]) =>
    [...state.pages.children].map((shell, index) => ({
      kind: name === 'book' ? 'problem' : 'answer',
      shell,
      crop: {
        pageNumber: Number(shell.dataset.page),
        unitOrder: index,
        y: 0,
        height: 1,
      },
    })),
  );
  setupStudySession({
    course: selectedCourse,
    label,
    params,
    frames: sourceFrames,
    panes: { problem: panes.book.pane, answer: panes.answer.pane },
  });
  panes.book.pane.addEventListener('scroll', () => updateStatus(panes.book), {
    passive: true,
  });
  panes.answer.pane.addEventListener(
    'scroll',
    () => updateStatus(panes.answer),
    { passive: true },
  );
  document.querySelectorAll('[data-pane][data-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      const state = panes[button.dataset.pane];
      const direction = button.dataset.zoom === 'in' ? 1 : -1;
      setZoom(button.dataset.pane, state.zoom + direction * zoomStep);
    });
  });
  setZoom('book', panes.book.zoom);
  setZoom('answer', panes.answer.zoom);
  panes[focus].pane.focus({ preventScroll: true });
}

start().catch(showError);
