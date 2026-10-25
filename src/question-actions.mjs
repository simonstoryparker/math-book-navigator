import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/dom';
import { anchorBox } from '../navigator-state.mjs';

export function attachQuestionActions({
  anchors,
  frames,
  onAsk,
  onPreview,
  onSelect,
}) {
  const group = document.createElement('div');
  group.className = 'question-actions';
  group.hidden = true;
  group.setAttribute('role', 'group');
  const heading = document.createElement('strong');
  heading.className = 'question-actions-title';
  group.append(heading);
  const ask = document.createElement('button');
  ask.type = 'button';
  ask.className = 'gemini-link';
  ask.textContent = 'Ask Google AI';
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.textContent = 'Preview';
  group.append(ask, preview);
  document.body.append(group);
  let active, cleanup, timer;
  const buttons = new Map();
  function hide() {
    clearTimeout(timer);
    cleanup?.();
    cleanup = null;
    group.hidden = true;
    active?.removeAttribute('data-open');
    active?.setAttribute('aria-expanded', 'false');
    active = null;
  }
  function show(button, anchor) {
    clearTimeout(timer);
    if (active === button) return;
    hide();
    active = button;
    button.dataset.open = '';
    button.setAttribute('aria-expanded', 'true');
    heading.textContent = `Question ${anchor.number}`;
    group.hidden = false;
    group.setAttribute('aria-label', `Question ${anchor.number} actions`);
    ask.onclick = () => {
      onSelect(anchor);
      onAsk(anchor);
    };
    preview.onclick = () => {
      onSelect(anchor);
      onPreview(anchor);
    };
    cleanup = autoUpdate(button, group, () =>
      computePosition(button, group, {
        strategy: 'fixed',
        placement: 'right-start',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (active === button) {
          group.style.left = `${x}px`;
          group.style.top = `${y}px`;
        }
      }),
    );
  }
  const scheduleHide = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (
        !group.matches(':hover') &&
        !group.contains(document.activeElement) &&
        !active?.matches(':hover') &&
        document.activeElement !== active
      )
        hide();
    }, 160);
  };
  group.addEventListener('pointerenter', () => clearTimeout(timer));
  group.addEventListener('pointerleave', scheduleHide);
  group.addEventListener('focusout', scheduleHide);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) {
      const previous = active;
      hide();
      previous.focus({ preventScroll: true });
      hide();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (active && !group.contains(event.target) && event.target !== active)
      hide();
  });
  const placements = anchors
    .filter((anchor) => anchor.reliable)
    .flatMap((anchor) => {
      const frame = frames.find(
        (frame) =>
          frame.kind === 'problem' && frame.crop.unitOrder === anchor.unitOrder,
      );
      const box = frame && anchorBox(anchor, frame.crop);
      return box && box.left >= 0 && box.left <= 100
        ? [{ anchor, frame, box }]
        : [];
    });
  // Use one column across pages; OCR glyph widths and inferred numbers must
  // never shift individual buttons sideways.
  const centers = placements
    .map(({ box }) => box.left + box.width / 2)
    .sort((a, b) => a - b);
  const column = centers[Math.floor(centers.length / 2)];
  for (const { anchor, frame, box } of placements) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'question-hotspot';
    button.textContent = anchor.number;
    buttons.set(anchor.number, button);
    button.setAttribute('aria-label', `Question ${anchor.number}: AI actions`);
    button.setAttribute('aria-expanded', 'false');
    Object.assign(button.style, {
      left: `${column}%`,
      top: `${box.top + box.height / 2}%`,
    });
    button.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') show(button, anchor);
    });
    button.addEventListener('pointerleave', scheduleHide);
    button.addEventListener('focus', () => show(button, anchor));
    button.addEventListener('blur', scheduleHide);
    button.addEventListener('click', (event) => {
      onSelect(anchor);
      show(button, anchor);
      if (event.detail === 0) ask.focus();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(button, anchor);
        ask.focus();
      }
    });
    frame.shell.append(button);
  }
  return {
    hide,
    setCurrent(anchor) {
      for (const [number, button] of buttons) {
        const current = number === anchor?.number;
        button.toggleAttribute('data-current', current);
        if (current) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
    },
    setBusy(value) {
      ask.disabled = value;
    },
    destroy() {
      hide();
      group.remove();
    },
  };
}
