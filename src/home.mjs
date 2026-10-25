import {
  resolveCourse,
  rememberCourse,
  pdfSourceForCourse,
  pdfChunkForPage,
  pdfChunkUrl,
  studyViewUrl,
} from '../navigator-core.mjs?v=mn-1';
import { createCatalogSearch } from '../search.mjs?v=mn-1';
import {
  HOME_KEY,
  readStored,
  writeStored,
  recentSections,
} from '../navigator-state.mjs?v=mn-1';
import '../site-ui.mjs?v=mn-1';
import { setupRecentMotion } from './recent-motion.mjs';

let storage;
try {
  storage = window.localStorage;
} catch {
  /* Storage is optional. */
}
const $ = (id) => document.getElementById(id);
const catalogs = new Map();
let course = resolveCourse(location.search, storage).course;
let catalog,
  searchCatalog,
  activeChapter,
  recentMotion,
  renderId = 0;
let home = readStored(storage, HOME_KEY, {});
if (!home || typeof home !== 'object' || Array.isArray(home)) home = {};
const search = $('search');
function pdfHref(page) {
  const source = pdfSourceForCourse(
    course,
    location.hostname.endsWith('.netlify.app'),
  );
  if (!source.useChunks)
    return `${source.localPdf}#page=${page}&zoom=page-width`;
  const chunk = pdfChunkForPage(course, page, catalog.totalPages);
  return `${pdfChunkUrl('https://simon-math-book-pdf.pages.dev/pdf', course, chunk.filename)}#page=${chunk.localPage}&zoom=page-width`;
}
function saveHome() {
  if (!course) return;
  home[course] = {
    chapter: activeChapter,
    query: search.value,
    scroll: window.scrollY,
    chapterScroll: $('chapterList').scrollTop,
  };
  writeStored(storage, HOME_KEY, home);
}
function renderRecents() {
  recentMotion?.();
  const values = recentSections(storage, course)
    .filter((recent) =>
      catalog.chapters.some((ch) =>
        ch.items.some((item) => item.label === recent.label),
      ),
    )
    .slice(0, 3);
  $('recentSections').hidden = !values.length;
  $('recentList').replaceChildren(
    ...values.map((recent, index) => {
      const link = document.createElement('a');
      link.className = 'recent-link';
      link.dataset.weight = index === 0 ? '2' : '1';
      link.setAttribute(
        'aria-label',
        `Resume ${recent.label}${recent.question ? `, question ${recent.question}` : ''}`,
      );
      const params = new URL(recent.url, location.href);
      params.searchParams.set('resume', '1');
      link.href = `split-view.html?${params.searchParams}`;
      const name = document.createElement('span');
      name.className = 'recent-name';
      name.textContent = recent.label.replace(/^Exercise\s+/i, '');
      const detail = document.createElement('small');
      detail.textContent = `Resume${recent.question ? ` · Q${recent.question}` : ''}`;
      const text = document.createElement('span');
      text.className = 'recent-content';
      text.append(name, detail);
      link.append(text);
      return link;
    }),
  );
  recentMotion = setupRecentMotion($('recentList'));
}
function renderExercises() {
  const query = search.value.trim();
  const chapter =
    catalog.chapters.find((ch) => ch.number === activeChapter) ||
    catalog.chapters[0];
  const rows = query
    ? searchCatalog(query)
    : chapter.items.map((item) => ({
        ...item,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
      }));
  $('catalogBrowser').classList.toggle('searching', Boolean(query));
  $('exerciseHeading').textContent = query ? 'Search results' : chapter.title;
  $('exerciseCount').textContent =
    `${rows.length} ${rows.length === 1 ? 'section' : 'sections'}`;
  $('resultCount').textContent = query
    ? `${rows.length} ${rows.length === 1 ? 'result' : 'results'}`
    : '';
  $('emptyResults').hidden = Boolean(rows.length);
  $('exerciseList').replaceChildren(
    ...rows.map((item) => {
      const row = document.createElement('li');
      row.className = `exercise-row${/^review/i.test(item.label) ? ' review-row' : ''}`;
      const study = document.createElement('a');
      study.className = 'study-link';
      study.href = studyViewUrl(item, course);
      study.setAttribute(
        'aria-label',
        `Open ${item.label} with printed answers`,
      );
      const name = document.createElement('span');
      name.textContent = item.label.replace(/^Exercise\s+/i, '');
      const detail = document.createElement('small');
      detail.textContent = query
        ? `Chapter ${item.chapterNumber} · ${item.chapterTitle}`
        : `p. ${item.questionPage - 1}${item.missingAnswer ? ' · No printed answer' : ''}`;
      study.append(name, detail);
      const links = document.createElement('span');
      links.className = 'row-sources';
      for (const [text, page] of [
        ['Questions', item.questionPage],
        ['Answers', item.missingAnswer ? null : item.answerPage],
      ])
        if (page) {
          const link = document.createElement('a');
          link.textContent = text;
          link.href = pdfHref(page);
          link.target = '_blank';
          link.rel = 'noopener';
          link.setAttribute(
            'aria-label',
            `${item.label}: ${text.toLowerCase()} PDF`,
          );
          links.append(link);
        }
      row.append(study, links);
      return row;
    }),
  );
  document
    .querySelectorAll('[data-chapter]')
    .forEach((button) =>
      button.setAttribute(
        'aria-current',
        String(Number(button.dataset.chapter) === activeChapter),
      ),
    );
  $('chapterSelect').value = String(activeChapter);
}
function selectChapter(value) {
  activeChapter = Number(value);
  search.value = '';
  renderExercises();
  saveHome();
}
function renderChapters() {
  $('chapterList').replaceChildren(
    ...catalog.chapters.map((chapter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.chapter = chapter.number;
      const number = document.createElement('span');
      number.className = 'chapter-number';
      number.textContent = chapter.number;
      const name = document.createElement('span');
      name.textContent = chapter.title;
      button.append(number, name);
      button.onclick = () => selectChapter(chapter.number);
      return button;
    }),
  );
  $('chapterSelect').replaceChildren(
    ...catalog.chapters.map(
      (ch) => new Option(`${ch.number}. ${ch.title}`, ch.number),
    ),
  );
}
async function selectCourse(next, { restore = true } = {}) {
  const ticket = ++renderId;
  course = next;
  rememberCourse(storage, course);
  const params = new URLSearchParams(location.search);
  params.set('course', course);
  history.replaceState(null, '', `${location.pathname}?${params}`);
  document
    .querySelectorAll('[data-course]')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.course === course),
      ),
    );
  search.disabled = true;
  $('catalogBrowser').hidden = true;
  $('recentSections').hidden = true;
  $('catalogStatus').hidden = false;
  $('catalogStatus').textContent = 'Loading exercise index…';
  try {
    if (!catalogs.has(course))
      catalogs.set(
        course,
        fetch(`./${course}-catalog.json?v=mn-1`, { cache: 'force-cache' })
          .then((response) => {
            if (!response.ok) throw new Error('Index unavailable');
            return response.json();
          })
          .catch((error) => {
            catalogs.delete(next);
            throw error;
          }),
      );
    const loaded = await catalogs.get(course);
    if (ticket !== renderId) return;
    catalog = loaded;
    searchCatalog = createCatalogSearch(catalog);
    const saved = home[course] || {};
    activeChapter = catalog.chapters.some((ch) => ch.number === saved.chapter)
      ? saved.chapter
      : catalog.chapters[0].number;
    search.value =
      restore && typeof saved.query === 'string' ? saved.query : '';
    search.disabled = false;
    search.placeholder = 'Try 9A, 15K.2, or vectors';
    $('courseDescription').textContent =
      `Applications and Interpretation · ${course.toUpperCase()}`;
    $('contentsLink').href = pdfHref(catalog.contentsPage);
    $('answersLink').href = pdfHref(catalog.answersPage);
    document.querySelector('.source-links').hidden = false;
    renderChapters();
    renderExercises();
    renderRecents();
    $('catalogStatus').hidden = true;
    $('catalogBrowser').hidden = false;
    if (restore)
      requestAnimationFrame(() => {
        window.scrollTo(0, Number(saved.scroll) || 0);
        $('chapterList').scrollTop = Number(saved.chapterScroll) || 0;
      });
  } catch {
    if (ticket !== renderId) return;
    $('catalogStatus').textContent = 'The exercise index could not load. ';
    const retry = document.createElement('button');
    retry.textContent = 'Try again';
    retry.onclick = () => selectCourse(course);
    $('catalogStatus').append(retry);
  }
}
document.querySelectorAll('[data-course]').forEach(
  (button) =>
    (button.onclick = () => {
      saveHome();
      selectCourse(button.dataset.course);
    }),
);
$('chapterSelect').onchange = (event) => selectChapter(event.target.value);
search.addEventListener('input', () => {
  renderExercises();
  saveHome();
});
search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    search.value = '';
    renderExercises();
    saveHome();
  }
  if (event.key === 'Enter') {
    const link = $('exerciseList').querySelector('.study-link');
    if (link) {
      event.preventDefault();
      saveHome();
      link.click();
    }
  }
});
document.addEventListener('keydown', (event) => {
  if (
    event.key === '/' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.target.closest('input,textarea,select,[contenteditable="true"]')
  ) {
    event.preventDefault();
    if (!search.disabled) search.focus();
  }
});
document.addEventListener('click', (event) => {
  if (event.target.closest('.study-link,.recent-link')) saveHome();
});
addEventListener('pagehide', saveHome);
addEventListener('pageshow', (event) => {
  if (event.persisted && catalog) renderRecents();
});
if (course) selectCourse(course);
