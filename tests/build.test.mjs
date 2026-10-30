import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

test('local and hosted builds contain complete browser assets', async () => {
  for (const local of [true, false]) {
    execFileSync(
      process.execPath,
      [resolve(root, 'scripts/build.mjs'), ...(local ? ['--local'] : [])],
      { cwd: root },
    );
    const output = resolve(root, 'dist');
    for (const name of ['index.html', 'split-view.html']) {
      const html = await readFile(resolve(output, name), 'utf8');
      for (const match of html.matchAll(
        /(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g,
      )) {
        if (/^(https?:|#)/.test(match[1])) continue;
        assert.ok((await lstat(resolve(output, match[1]))).isFile(), match[1]);
      }
    }
    const study = await readFile(resolve(output, 'study.mjs'), 'utf8');
    for (const match of study.matchAll(
      /(?:from|import)\s*["'](\.[^"']+)["']/g,
    )) {
      assert.ok((await lstat(resolve(output, match[1]))).isFile(), match[1]);
    }
    assert.ok(
      (
        await lstat(resolve(output, 'vendor/pdfjs/build/pdf.worker.min.mjs'))
      ).isFile(),
    );
    assert.equal(
      await readFile(resolve(output, 'index.html'), 'utf8'),
      await readFile(resolve(output, 'math_book_navigator.html'), 'utf8'),
    );
    for (const book of ['math_book_sl.pdf', 'math_book_indexed.pdf']) {
      if (local) {
        assert.equal(
          await readlink(resolve(output, book)),
          resolve(root, book),
        );
      } else {
        assert.ok(!(await readdir(output)).includes(book));
      }
    }
  }
});
