import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  pdfChunkForPage,
  pdfSourceForCourse,
  resolveCourse,
  studyViewUrl,
} from '../src/navigator-core.mjs';
import { createCatalogSearch } from '../src/search.mjs';

for (const course of ['sl', 'hl']) {
  const catalog = JSON.parse(
    await readFile(
      new URL(`../public/${course}-catalog.json`, import.meta.url),
    ),
  );
  test(`${course}: every catalog section produces a valid study link`, () => {
    for (const item of catalog.chapters.flatMap((chapter) => chapter.items)) {
      const url = new URL(studyViewUrl(item, course), 'https://example.test/');
      assert.equal(url.pathname, '/split-view.html');
      assert.equal(url.searchParams.get('course'), course);
      assert.equal(url.searchParams.get('label'), item.label);
      for (const key of ['book', 'answer']) {
        const page = Number(url.searchParams.get(key));
        assert.ok(
          Number.isInteger(page) && page >= 1 && page <= catalog.totalPages,
        );
      }
    }
  });
  test(`${course}: review sections remain searchable through the standard catalog`, () => {
    const search = createCatalogSearch(catalog);
    const result = search('review set 9a');
    assert.equal(result[0].label, 'Review Set 9A');
    const url = new URL(
      studyViewUrl(result[0], course),
      'https://example.test/',
    );
    assert.equal(url.searchParams.get('mode'), 'paired');
  });
  test(`${course}: chunk boundaries cover every book page`, () => {
    for (let page = 1; page <= catalog.totalPages; page++) {
      const chunk = pdfChunkForPage(course, page, catalog.totalPages);
      assert.ok(chunk.start <= page && chunk.end >= page);
      assert.ok(chunk.end <= catalog.totalPages);
      assert.equal(chunk.localPage, page - chunk.start + 1);
      assert.ok(chunk.localPage >= 1 && chunk.localPage <= 64);
    }
    assert.throws(
      () => pdfChunkForPage(course, 0, catalog.totalPages),
      RangeError,
    );
    assert.throws(
      () => pdfChunkForPage(course, catalog.totalPages + 1, catalog.totalPages),
      RangeError,
    );
  });
}

test('hosted builds use chunks on custom domains; local builds use source books', () => {
  for (const course of ['sl', 'hl']) {
    assert.equal(
      pdfSourceForCourse(course, false, 'cloudflare').useChunks,
      true,
    );
    assert.equal(pdfSourceForCourse(course, false, 'local').useChunks, false);
    assert.equal(pdfSourceForCourse(course, true, 'local').useChunks, true);
    assert.match(pdfSourceForCourse(course, false, 'local').localPdf, /\.pdf$/);
  }
});

test('explicit course selection takes priority and blocked storage is tolerated', () => {
  assert.deepEqual(resolveCourse('?course=sl', { getItem: () => 'hl' }), {
    course: 'sl',
    explicit: true,
  });
  assert.deepEqual(
    resolveCourse('', {
      getItem: () => {
        throw new Error('blocked');
      },
    }),
    { course: null, explicit: false },
  );
});
