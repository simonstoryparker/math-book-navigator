export function googleAiUrl(prompt) {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('udm', '50');
  url.searchParams.set('q', prompt);
  return url.href;
}
// Browser primitives are injected so clipboard and popup handling stay separate.
export function createAiLauncher({
  write,
  makeItem,
  openTab,
  busy = () => {},
}) {
  let pending = false;
  return async function launch({ image, prompt }) {
    if (pending) return { state: 'busy' };
    pending = true;
    busy(true);
    let tab;
    try {
      // Request the clipboard FIRST, while activation is still available. The PNG
      // promise may finish later; window.open can consume activation in Safari.
      const png = Promise.resolve().then(image);
      // Some browsers reject the write before image preparation completes.
      // Still observe a later render failure, without hiding it from ClipboardItem.
      png.catch(() => {});
      const copy = write([makeItem({ 'image/png': png })]);
      try {
        tab = openTab();
        if (tab) tab.opener = null;
      } catch {
        /* Popup blocked. */
      }
      await copy;
      const url = googleAiUrl(prompt);
      if (!tab || tab.closed) return { state: 'popup-blocked', url };
      try {
        tab.location.replace(url);
      } catch {
        tab.close?.();
        return { state: 'popup-blocked', url };
      }
      return { state: 'opened', url };
    } catch (error) {
      try {
        tab?.close();
      } catch {
        /* Closing is best-effort. */
      }
      return { state: 'copy-failed', error, url: googleAiUrl(prompt) };
    } finally {
      pending = false;
      busy(false);
    }
  };
}
