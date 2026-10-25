// Reading positions and preferences stay in optional browser storage.
export const RECENTS_KEY = 'mathNavigatorRecents';
export const HOME_KEY = 'mathNavigatorHome';
export function readStored(storage, key, fallback) {
  try {
    return JSON.parse(storage?.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* Browsing still works without storage. */
  }
}
const sectionFields = new Set([
  'course',
  'book',
  'answer',
  'label',
  'mode',
  'bookOrdinal',
  'answerOrdinal',
  'bookTop',
  'answerTop',
  'answerColumn',
  'bookEnd',
  'bookEndTop',
  'answerEnd',
  'answerEndTop',
  'answerEndColumn',
  'answerNumberOverrides',
  'missingAnswer',
  'focus',
]);
export function sectionIdentity(url, course) {
  const source = new URL(url, 'https://local.invalid/');
  const params = new URLSearchParams();
  [...source.searchParams.keys()]
    .filter((key) => sectionFields.has(key))
    .sort()
    .forEach((key) => params.set(key, source.searchParams.get(key)));
  params.set('course', course);
  return `split-view.html?${params}`;
}
function validLocation(value, course) {
  if (
    !value ||
    value.course !== course ||
    typeof value.url !== 'string' ||
    typeof value.label !== 'string'
  )
    return false;
  if (
    !value.url.startsWith('split-view.html?') ||
    value.url.length > 10000 ||
    value.label.length > 200
  )
    return false;
  const params = new URL(value.url, 'https://local.invalid/').searchParams;
  return (
    params.get('course') === course &&
    /^\d+$/.test(params.get('book') || '') &&
    Number(params.get('book')) > 0
  );
}
export function recentSections(storage, course) {
  const values = readStored(storage, RECENTS_KEY, []);
  return Array.isArray(values)
    ? values.filter((value) => validLocation(value, course)).slice(0, 5)
    : [];
}
export function rememberSection(storage, value) {
  if (!['sl', 'hl'].includes(value.course)) return;
  const url = sectionIdentity(value.url, value.course);
  const entry = { ...value, url };
  if (!validLocation(entry, value.course)) return;
  const other = value.course === 'sl' ? 'hl' : 'sl';
  const values = [
    entry,
    ...recentSections(storage, value.course).filter((item) => item.url !== url),
  ].slice(0, 5);
  writeStored(storage, RECENTS_KEY, [
    ...values,
    ...recentSections(storage, other),
  ]);
}
export function requestedQuestion(params) {
  const value = params.get('question');
  return /^[1-9]\d{0,3}$/.test(value || '') ? Number(value) : null;
}
export function anchorBox(anchor, crop) {
  if (
    ![anchor.x, anchor.top, crop.x, crop.y, crop.width, crop.height].every(
      Number.isFinite,
    ) ||
    crop.width <= 0 ||
    crop.height <= 0
  )
    return null;
  if (
    anchor.unitOrder !== crop.unitOrder ||
    anchor.top < crop.y ||
    anchor.top >= crop.y + crop.height
  )
    return null;
  return {
    left: ((anchor.x - crop.x) / crop.width) * 100,
    top: ((anchor.top - crop.y) / crop.height) * 100,
    width: ((anchor.width || 14) / crop.width) * 100,
    height: ((anchor.height || 18) / crop.height) * 100,
  };
}
export function savedPaneAnchor(pane, frames) {
  const edge = pane.getBoundingClientRect().top + 1;
  const frame =
    frames.find((frame) => frame.shell.getBoundingClientRect().bottom > edge) ||
    frames.at(-1);
  if (!frame) return null;
  const rect = frame.shell.getBoundingClientRect();
  return {
    pageNumber: frame.crop.pageNumber,
    unitOrder: frame.crop.unitOrder,
    top:
      frame.crop.y +
      Math.max(0, Math.min(1, (edge - rect.top) / Math.max(1, rect.height))) *
        frame.crop.height,
  };
}
export function restorePaneAnchor(pane, frames, saved) {
  if (!saved || !Number.isFinite(saved.top)) return false;
  const frame = frames.find(
    (frame) =>
      frame.crop.pageNumber === saved.pageNumber &&
      frame.crop.unitOrder === saved.unitOrder,
  );
  if (!frame) return false;
  const rect = frame.shell.getBoundingClientRect();
  pane.scrollTop +=
    rect.top -
    pane.getBoundingClientRect().top +
    Math.max(0, Math.min(1, (saved.top - frame.crop.y) / frame.crop.height)) *
      rect.height;
  return true;
}
