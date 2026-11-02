import { build } from 'esbuild';
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Resolve inputs from the project root, even when invoked from another folder.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const local = process.argv.includes('--local');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });
await cp(resolve(root, 'vendor/pdfjs'), resolve(output, 'vendor/pdfjs'), {
  recursive: true,
});
await copyFile(
  resolve(root, 'THIRD-PARTY-NOTICES.txt'),
  resolve(output, 'THIRD-PARTY-NOTICES.txt'),
);
await copyFile(
  resolve(output, 'index.html'),
  resolve(output, 'math_book_navigator.html'),
);
await build({
  absWorkingDir: root,
  entryPoints: ['src/home.mjs', 'src/study.mjs'],
  outdir: output,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['safari17', 'chrome120', 'firefox125'],
  legalComments: 'eof',
  define: {
    __PDF_ASSET_MODE__: JSON.stringify(local ? 'local' : 'cloudflare'),
  },
  plugins: [
    {
      name: 'external-pdfjs',
      setup(builder) {
        builder.onResolve({ filter: /\/pdf\.min\.mjs$/ }, () => ({
          path: './vendor/pdfjs/build/pdf.min.mjs',
          external: true,
        }));
      },
    },
  ],
});
// Each deployed bundle gets a new URL when its contents change, so cached
// readers cannot keep running old exercise mapping logic after a deployment.
for (const [bundle, pages] of [
  ['home.mjs', ['index.html', 'math_book_navigator.html']],
  ['study.mjs', ['split-view.html']],
]) {
  const version = createHash('sha256')
    .update(await readFile(resolve(output, bundle)))
    .digest('hex')
    .slice(0, 12);
  for (const page of pages) {
    const path = resolve(output, page);
    const html = await readFile(path, 'utf8');
    await writeFile(
      path,
      html.replace(`${bundle}?v=mn-2`, `${bundle}?v=${version}`),
    );
  }
}
if (local) {
  // Serve local books without copying hundreds of megabytes into each build.
  // Only the local build has symlinks; hosted builds contain no source PDFs.
  for (const name of ['math_book_sl.pdf', 'math_book_indexed.pdf']) {
    await symlink(resolve(root, name), resolve(output, name));
  }
}
console.log(`Built ${local ? 'local' : 'hosted'} site in dist/.`);
