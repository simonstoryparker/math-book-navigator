const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialogs = new WeakMap();
export function animateDialog(dialog) {
  let state = dialogs.get(dialog);
  if (!state) {
    state = { animation: null, generation: 0, opener: null };
    dialogs.set(dialog, state);
    const close = () => {
      const generation = ++state.generation;
      state.animation?.cancel();
      dialog.classList.add('dialog-closing');
      const frames =
        reduced() || document.documentElement.hasAttribute('data-keyboard')
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(.96)' },
            ];
      const finish = () => {
        if (generation !== state.generation) return;
        dialog.close();
        dialog.classList.remove('dialog-closing');
        if (state.opener?.isConnected)
          state.opener.focus({ preventScroll: true });
      };
      if (document.documentElement.hasAttribute('data-keyboard')) {
        finish();
        return;
      }
      state.animation = dialog.animate(frames, {
        duration: 160,
        easing: easeOut,
      });
      state.animation.finished.then(finish).catch(() => {});
    };
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener('submit', (event) => {
      if (event.target.getAttribute('method') === 'dialog') {
        event.preventDefault();
        close();
      }
    });
  }
  state.generation++;
  state.animation?.cancel();
  dialog.classList.remove('dialog-closing');
  if (!dialog.open) {
    state.opener = document.activeElement.closest('.question-actions')
      ? document.querySelector('.question-hotspot[data-open]') ||
        document.activeElement
      : document.activeElement;
    dialog.showModal();
  }
  if (document.documentElement.hasAttribute('data-keyboard')) return;
  state.animation = dialog.animate(
    reduced()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: 'scale(.96)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
    { duration: reduced() ? 160 : 200, easing: easeOut },
  );
}
import { setupAppearance } from './appearance.mjs';
export { setupAppearance };
setupAppearance();
export function setupDivider(grid) {
  const handle = grid.querySelector('.split-divider');
  const mobile = matchMedia('(max-width:760px)');
  let ratio = 0.6;
  try {
    const saved = Number(localStorage.getItem('mathBookSplitRatio'));
    if (saved > 0.1 && saved < 0.9) ratio = saved;
  } catch {}
  function update(next, save = true) {
    const size = mobile.matches ? grid.clientHeight : grid.clientWidth;
    const available = Math.max(1, size - 10);
    const min = Math.min(mobile.matches ? 100 : 240, available / 2);
    ratio = Math.min(1 - min / available, Math.max(min / available, next));
    // Pixel basis avoids the separator width being added to percentage sizing.
    const positions = [...grid.querySelectorAll('.pair-cell,.scroll-pane')].map(
      (pane) => ({
        pane,
        width: pane.firstElementChild?.getBoundingClientRect().width || 1,
        top: pane.scrollTop,
      }),
    );
    grid.style.setProperty('--split', `${ratio * available}px`);
    for (const { pane, width, top } of positions)
      pane.scrollTop =
        (top *
          (pane.firstElementChild?.getBoundingClientRect().width || width)) /
        width;
    handle.setAttribute(
      'aria-orientation',
      mobile.matches ? 'horizontal' : 'vertical',
    );
    handle.setAttribute(
      'aria-valuemin',
      String(Math.round((min / available) * 100)),
    );
    handle.setAttribute(
      'aria-valuemax',
      String(Math.round((1 - min / available) * 100)),
    );
    handle.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    handle.setAttribute(
      'aria-valuetext',
      `${Math.round(ratio * 100)} percent questions`,
    );
    if (save)
      try {
        localStorage.setItem('mathBookSplitRatio', String(ratio));
      } catch {}
  }
  let dragging = false;
  function move(event) {
    if (!dragging) return;
    const rect = grid.getBoundingClientRect();
    const pos = mobile.matches
      ? event.clientY - rect.top
      : event.clientX - rect.left;
    update(
      (pos - 5) / Math.max(1, (mobile.matches ? rect.height : rect.width) - 10),
    );
  }
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    event.preventDefault();
  });
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', () => (dragging = false));
  handle.addEventListener('pointercancel', () => (dragging = false));
  handle.addEventListener('lostpointercapture', () => (dragging = false));
  handle.addEventListener('dblclick', () => update(0.6));
  handle.addEventListener('keydown', (event) => {
    const previous = mobile.matches ? 'ArrowUp' : 'ArrowLeft',
      next = mobile.matches ? 'ArrowDown' : 'ArrowRight';
    if (event.key === previous || event.key === next) {
      event.preventDefault();
      update(ratio + (event.key === next ? 0.02 : -0.02));
    }
    if (event.key === 'Home') {
      event.preventDefault();
      update(0.6);
    }
  });
  new ResizeObserver(() => update(ratio, false)).observe(grid);
  mobile.addEventListener('change', () => update(ratio, false));
  update(ratio, false);
}
