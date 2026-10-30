import { animateDialog } from './site-ui.mjs';
import { createAiLauncher, googleAiUrl } from './ai-launch.mjs';

export function createAiControls() {
  const $ = (id) => document.getElementById(id);
  const dialog = $('aiDialog'),
    field = $('aiPrompt'),
    status = $('aiStatus');
  let current,
    generation = 0,
    objectUrl,
    busy = false;
  const feedback = document.createElement('div');
  feedback.className = 'ai-feedback';
  const message = document.createElement('span');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const recovery = document.createElement('a');
  recovery.target = '_blank';
  recovery.rel = 'noopener';
  recovery.hidden = true;
  feedback.hidden = true;
  feedback.append(message, recovery);
  document.querySelector('.toolbar').after(feedback);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.onclick = () => {
    feedback.hidden = true;
  };
  feedback.append(dismiss);
  const setBusy = (value) => {
    busy = value;
    document
      .querySelectorAll('[data-ai-launch]')
      .forEach((button) => (button.disabled = value));
    document.dispatchEvent(new CustomEvent('ai-busy', { detail: value }));
  };
  const launch = createAiLauncher({
    write: (items) => {
      if (!navigator.clipboard?.write || !window.ClipboardItem)
        throw new Error('Clipboard unavailable');
      return navigator.clipboard.write(items);
    },
    makeItem: (values) => new ClipboardItem(values),
    openTab: () => window.open('about:blank', '_blank'),
    busy: setBusy,
  });
  function blob(context) {
    return context
      .image()
      .then(
        (canvas) =>
          new Promise((resolve, reject) =>
            canvas.toBlob(
              (value) =>
                value
                  ? resolve(value)
                  : reject(
                      new Error('The question image could not be prepared.'),
                    ),
              'image/png',
            ),
          ),
      );
  }
  async function open(context, prompt = context.prompt) {
    if (busy) return;
    feedback.hidden = true;
    message.textContent = '';
    recovery.hidden = true;
    const result = await launch({ image: () => blob(context), prompt });
    if (result.state === 'busy') return;
    recovery.href = result.url;
    if (result.state === 'copy-failed') {
      message.textContent =
        'Image copy was unavailable. Preview the image to retry or download it.';
      await preview(context);
      status.textContent =
        'The image was not copied. Try Copy image, or download it and upload the file in Google AI.';
      recovery.textContent = 'Open Google AI';
      recovery.hidden = false;
      $('openGoogle').href = result.url;
      $('openGoogle').hidden = false;
    } else {
      message.textContent =
        'Image copied. Paste in Google AI (⌘V or Ctrl+V), or use Preview to download and upload.';
      status.textContent = message.textContent;
      if (result.state === 'popup-blocked') {
        message.textContent = 'Your browser blocked the Google AI tab.';
        recovery.textContent = 'Open Google AI';
        recovery.hidden = false;
        feedback.hidden = false;
      }
    }
  }
  async function preview(context) {
    current = context;
    const ticket = ++generation;
    $('aiTitle').textContent =
      context.number === 'section'
        ? 'Section · Google AI'
        : `Question ${context.number} · Google AI`;
    $('aiNote').textContent =
      'Paste or upload the image after Google opens. The prompt asks Google to wait for it.';
    field.value = context.prompt;
    status.textContent = 'Preparing image…';
    $('aiPreview').replaceChildren();
    $('openGoogle').href = googleAiUrl(field.value);
    $('openGoogle').hidden = true;
    animateDialog(dialog);
    try {
      const image = await context.image();
      if (ticket !== generation || !dialog.open) return;
      const copy = document.createElement('canvas');
      copy.width = image.width;
      copy.height = image.height;
      copy.getContext('2d').drawImage(image, 0, 0);
      copy.setAttribute('role', 'img');
      copy.setAttribute(
        'aria-label',
        `Source image for ${context.number === 'section' ? 'this section' : `question ${context.number}`}`,
      );
      $('aiPreview').replaceChildren(copy);
      status.textContent =
        'Ready. Ask Google AI copies this image and opens Google in a new tab.';
    } catch {
      if (ticket === generation)
        status.textContent =
          'The image could not be prepared. Close the preview and try again, or open the source PDF.';
    }
  }
  field.oninput = () => {
    $('openGoogle').href = googleAiUrl(field.value);
  };
  $('askFromPreview').dataset.aiLaunch = '';
  $('askFromPreview').onclick = () => {
    if (current) open(current, field.value);
  };
  $('copyImage').onclick = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob(current) }),
      ]);
      status.textContent =
        'Image copied. Paste it in Google AI with ⌘V or Ctrl+V.';
    } catch {
      status.textContent =
        'Image copy is unavailable. Download the image, then upload it in Google AI.';
    }
  };
  $('saveImage').onclick = async () => {
    if (!current) return;
    try {
      const value = await blob(current);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(value);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${current.label.replace(/[^a-z0-9]+/gi, '-')}-question-${current.number}.png`;
      link.click();
      status.textContent =
        'Download started. Upload the saved image using Google AI’s image control.';
    } catch {
      status.textContent =
        'The image could not be downloaded. Close the preview and try again.';
    }
  };
  $('copyPrompt').onclick = async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      status.textContent =
        'Prompt copied. Copy the image again before pasting the image in Google AI.';
    } catch {
      field.focus();
      field.select();
      status.textContent = 'Press ⌘C or Ctrl+C to copy the selected prompt.';
    }
  };
  dialog.addEventListener('close', () => {
    generation++;
    current = null;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  });
  return {
    open,
    preview,
    get busy() {
      return busy;
    },
  };
}
