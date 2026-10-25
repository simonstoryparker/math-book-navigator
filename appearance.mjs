const modes = ['system', 'light', 'dark'];
const palettes = ['blue', 'green', 'purple', 'rose', 'amber', 'teal'];
const names = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  blue: 'Blue',
  green: 'Green',
  purple: 'Purple',
  rose: 'Rose',
  amber: 'Amber',
  teal: 'Teal',
};
const paths = {
  system:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  light:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  dark: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
  gear: '<path d="m9 3-.5 2a8 8 0 0 0-2 1.2l-2-.6L2.5 9l1.5 1.4a8 8 0 0 0 0 3.2L2.5 15l2 3.4 2-.6a8 8 0 0 0 2 1.2l.5 2h4l.5-2a8 8 0 0 0 2-1.2l2 .6 2-3.4-1.5-1.4a8 8 0 0 0 0-3.2L20 9l-2-3.4-2 .6A8 8 0 0 0 14 5l-.5-2Z"/><circle cx="11.5" cy="12" r="3"/>',
};
const icon = (key) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[key]}</svg>`;
export function setupAppearance() {
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system',
    palette = 'blue';
  try {
    const saved = localStorage.getItem('mathNavigatorTheme');
    if (modes.includes(saved)) preference = saved;
    const color = localStorage.getItem('mathNavigatorPalette');
    if (palettes.includes(color)) palette = color;
  } catch {}
  const roots = [...document.querySelectorAll('[data-appearance]')];
  roots.forEach((root, index) => {
    const modeButton = (mode) =>
      `<button type="button" data-theme-option="${mode}" aria-label="${names[mode]} appearance" title="${names[mode]} appearance" aria-pressed="false">${icon(mode)}<span>${names[mode]}</span></button>`;
    root.innerHTML = `<div class="appearance-group" role="group" aria-label="Appearance">${modes.map(modeButton).join('')}</div><button class="appearance-trigger icon-button" type="button" popovertarget="appearance-${index}" aria-label="Appearance: System" title="Appearance">${icon('system')}</button><div class="appearance-menu settings-popover" id="appearance-${index}" popover aria-label="Appearance"><p>Appearance</p><div role="group" aria-label="Appearance">${modes.map(modeButton).join('')}</div></div><button class="palette-trigger icon-button" type="button" popovertarget="palette-${index}" aria-label="Color theme" title="Color theme">${icon('gear')}</button><div class="palette-menu settings-popover" id="palette-${index}" popover aria-label="Color theme"><p>Color theme</p><div class="palette-grid" role="group" aria-label="Color theme">${palettes.map((color) => `<button type="button" data-palette-option="${color}" aria-pressed="false"><span class="color-swatch" data-color="${color}" aria-hidden="true"></span>${names[color]}<span class="palette-check" aria-hidden="true">✓</span></button>`).join('')}</div></div>`;
    root.querySelectorAll('[popover]').forEach((menu) => {
      const trigger = root.querySelector(`[popovertarget="${menu.id}"]`);
      function position() {
        const rect = trigger.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(innerWidth - (menu.offsetWidth || parseFloat(getComputedStyle(menu).width)) - 8, rect.right - (menu.offsetWidth || parseFloat(getComputedStyle(menu).width))))}px`;
        menu.style.top = `${Math.min(rect.bottom + 8, innerHeight - menu.offsetHeight - 8)}px`;
      }
      menu.addEventListener('beforetoggle', (event) => {
        if (event.newState === 'open') position();
      });
      menu.addEventListener('toggle', (event) => {
        trigger.setAttribute(
          'aria-expanded',
          String(event.newState === 'open'),
        );
        if (event.newState === 'open') position();
      });
      trigger.setAttribute('aria-expanded', 'false');
      addEventListener('resize', () => {
        if (menu.matches(':popover-open')) position();
      });
      addEventListener(
        'scroll',
        () => {
          if (menu.matches(':popover-open')) position();
        },
        { capture: true, passive: true },
      );
    });
  });
  function apply() {
    document.documentElement.dataset.theme =
      preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.palette = palette;
    roots.forEach((root) => {
      root
        .querySelectorAll('[data-theme-option]')
        .forEach((button) =>
          button.setAttribute(
            'aria-pressed',
            String(button.dataset.themeOption === preference),
          ),
        );
      root
        .querySelectorAll('[data-palette-option]')
        .forEach((button) =>
          button.setAttribute(
            'aria-pressed',
            String(button.dataset.paletteOption === palette),
          ),
        );
      const trigger = root.querySelector('.appearance-trigger');
      trigger.innerHTML = icon(preference);
      trigger.setAttribute('aria-label', `Appearance: ${names[preference]}`);
      trigger.title = `Appearance: ${names[preference]}`;
    });
  }
  roots.forEach((root) =>
    root.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-theme-option]'),
        color = event.target.closest('[data-palette-option]');
      if (!mode && !color) return;
      if (mode) {
        preference = mode.dataset.themeOption;
        try {
          localStorage.setItem('mathNavigatorTheme', preference);
        } catch {}
      }
      if (color) {
        palette = color.dataset.paletteOption;
        try {
          localStorage.setItem('mathNavigatorPalette', palette);
        } catch {}
      }
      apply();
      if (mode?.closest('[popover]')) mode.closest('[popover]').hidePopover();
    }),
  );
  media.addEventListener('change', apply);
  addEventListener('storage', (event) => {
    if (event.key === 'mathNavigatorTheme' || event.key === null)
      preference = modes.includes(event.newValue) ? event.newValue : 'system';
    if (event.key === 'mathNavigatorPalette' || event.key === null)
      palette = palettes.includes(event.newValue) ? event.newValue : 'blue';
    apply();
  });
  addEventListener(
    'keydown',
    () => {
      document.documentElement.dataset.keyboard = '';
    },
    { capture: true },
  );
  addEventListener(
    'pointerdown',
    () => {
      delete document.documentElement.dataset.keyboard;
    },
    { capture: true },
  );
  addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'mouse')
        delete document.documentElement.dataset.keyboard;
    },
    { passive: true },
  );
  apply();
}
