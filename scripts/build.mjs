import { build } from 'esbuild';
import { readFile, writeFile, copyFile, cp, mkdir, rm } from 'node:fs/promises';
await build({
  entryPoints: ['src/search.mjs', 'src/question-actions.mjs'],
  outdir: '.',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['safari17', 'chrome120', 'firefox125'],
  legalComments: 'eof',
});
const homeBuild = {
  entryPoints: ['src/home.mjs'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['safari17', 'chrome120', 'firefox125'],
  legalComments: 'eof',
};
await build({ ...homeBuild, outfile: 'home.mjs' });
const pdfExternal = {
  name: 'existing-pdfjs',
  setup(builder) {
    builder.onResolve({ filter: /pdfjs\.min\.js$/ }, () => ({
      path: './pdfjs.min.js',
      external: true,
    }));
  },
};
const studyBuild = {
  ...homeBuild,
  entryPoints: ['src/study.mjs'],
  plugins: [pdfExternal],
};
await build({ ...studyBuild, outfile: 'study.mjs' });
const deploy = 'dist';
await rm(deploy, { recursive: true, force: true });
await mkdir(deploy, { recursive: true });
const files = [
  'index.html',
  'split-view.html',
  'site-ui.css',
  'site-ui.mjs',
  'appearance.mjs',
  'home.mjs',
  'study.mjs',
  'navigator-state.mjs',
  'navigator-core.mjs',
  'ai-launch.mjs',
  'ai-preview.mjs',
  'study-session.mjs',
  'search.mjs',
  'question-actions.mjs',
  'hl-catalog.json',
  'sl-catalog.json',
  'continuous-view.mjs',
  'review-set-9a.js',
  'THIRD-PARTY-NOTICES.txt',
  'pdfjs.min.js',
  'pdfjs-worker.min.js',
  '_headers',
];
for (const file of files) {
  let content = await readFile(file);
  if (file === 'navigator-core.mjs')
    content = Buffer.from(
      content
        .toString()
        .replace("PDF_ASSET_MODE = 'local'", "PDF_ASSET_MODE = 'cloudflare'"),
    );
  await writeFile(`${deploy}/${file}`, content);
}
await cp('vendor/pdfjs', `${deploy}/vendor/pdfjs`, { recursive: true });
for (const dir of ['.', deploy])
  await copyFile(`${dir}/index.html`, `${dir}/math_book_navigator.html`);
// The local launcher reads nearby PDFs. The hosted bundle must also work on
// custom domains, where hostname detection alone cannot select Cloudflare.
const hostedMode = {
  name: 'hosted-pdf-mode',
  setup(builder) {
    builder.onLoad({ filter: /navigator-core\.mjs$/ }, async (args) => ({
      contents: (await readFile(args.path, 'utf8')).replace(
        "PDF_ASSET_MODE = 'local'",
        "PDF_ASSET_MODE = 'cloudflare'",
      ),
      loader: 'js',
    }));
  },
};
await build({
  ...homeBuild,
  outfile: `${deploy}/home.mjs`,
  plugins: [hostedMode],
});
await build({
  ...studyBuild,
  outfile: `${deploy}/study.mjs`,
  plugins: [pdfExternal, hostedMode],
});
console.log('Built browser libraries and the static site in dist/.');
