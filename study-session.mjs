import {
  sectionIdentity,
  recentSections,
  rememberSection,
  requestedQuestion,
  savedPaneAnchor,
  restorePaneAnchor,
} from './navigator-state.mjs?v=mn-1';

export function setupStudySession({
  course,
  label,
  params,
  frames,
  panes,
  jump,
  jumpTo,
}) {
  let storage;
  try {
    storage = localStorage;
  } catch {}
  const url = sectionIdentity(location.href, course);
  const saved =
    params.get('resume') === '1'
      ? recentSections(storage, course).find((value) => value.url === url)
      : null;
  const explicit = requestedQuestion(params);
  let restoring = true,
    timer;
  if (
    jump &&
    explicit &&
    [...jump.options].some((option) => Number(option.value) === explicit)
  ) {
    jump.value = String(explicit);
    jumpTo();
  } else if (saved) {
    if (
      jump &&
      saved.question &&
      [...jump.options].some(
        (option) => Number(option.value) === saved.question,
      )
    )
      jump.value = String(saved.question);
    for (const [kind, pane] of Object.entries(panes))
      restorePaneAnchor(
        pane,
        frames.filter((frame) => frame.kind === kind),
        saved.positions?.[kind],
      );
  }
  function save() {
    if (restoring) return;
    const positions = Object.fromEntries(
      Object.entries(panes).map(([kind, pane]) => [
        kind,
        savedPaneAnchor(
          pane,
          frames.filter((frame) => frame.kind === kind),
        ),
      ]),
    );
    rememberSection(storage, {
      course,
      label,
      url,
      question: Number(jump?.value) || null,
      positions,
      updated: Date.now(),
    });
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(save, 200);
  }
  for (const pane of Object.values(panes))
    pane.addEventListener('scroll', schedule, { passive: true });
  jump?.addEventListener('change', schedule);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  const back = document.querySelector('.back');
  back.href = `index.html?course=${course}`;
  // Browser Back restores the whole home document; direct-entry tabs use its saved state.
  back.addEventListener('click', (event) => {
    save();
    try {
      if (
        document.referrer &&
        new URL(document.referrer).origin === location.origin &&
        /\/(?:index|math_book_navigator)\.html$/.test(
          new URL(document.referrer).pathname,
        )
      ) {
        event.preventDefault();
        history.back();
      }
    } catch {}
  });
  restoring = false;
  save();
  return { save };
}
