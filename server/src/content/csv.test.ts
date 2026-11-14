import assert from 'node:assert/strict';
import test from 'node:test';
import { CsvError, escapeCsvCell, parseCsv, parseCsvTable, serializeCsv } from './csv';

test('parseCsv handles plain rows, CRLF and trailing newline', () => {
  assert.deepEqual(parseCsv('a,b,c\r\n1,2,3\r\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
});

test('parseCsv handles quoted commas, quotes and embedded newlines', () => {
  assert.deepEqual(parseCsv('title,body\n"Hello, world","line one\nline two"\n'), [['title', 'body'], ['Hello, world', 'line one\nline two']]);
  assert.deepEqual(parseCsv('a\n"say ""hi"""\n'), [['a'], ['say "hi"']]);
  assert.deepEqual(parseCsv('a\r\n"x\r\ny"\r\n'), [['a'], ['x\r\ny']]);
});

test('parseCsv strips UTF-8 BOM and preserves unicode', () => {
  assert.deepEqual(parseCsv('\uFEFFword,category\nمرحبا,عام\néléphant,animal\n'), [['word', 'category'], ['مرحبا', 'عام'], ['éléphant', 'animal']]);
});

test('parseCsv rejects unterminated quotes', () => {
  assert.throws(() => parseCsv('a\n"unterminated'), CsvError);
});

test('serializeCsv escapes commas, quotes, newlines and leading spaces', () => {
  const csv = serializeCsv([['word', 'hint'], ['ice cream', 'cold, sweet'], ['say "hi"', 'line\nbreak'], [' padded ', '']]);
  assert.equal(csv, 'word,hint\r\nice cream,"cold, sweet"\r\n"say ""hi""","line\nbreak"\r\n" padded ",');
  assert.deepEqual(parseCsv(csv), [['word', 'hint'], ['ice cream', 'cold, sweet'], ['say "hi"', 'line\nbreak'], [' padded ', '']]);
});

test('serializeCsv protects against CSV formula injection by default', () => {
  const csv = serializeCsv([['=SUM(A1:A2)', '+cmd', '-1+1', '@evil', '\t tab', '\rcr', 'safe']]);
  const cells = parseCsv(csv)[0];
  assert.deepEqual(cells, ["'=SUM(A1:A2)", "'+cmd", "'-1+1", "'@evil", "'\t tab", "'\rcr", 'safe']);
  assert.equal(escapeCsvCell('=1+1', false), '=1+1');
});

test('serializeCsv preserves Arabic and French unicode round-trip', () => {
  const rows = [['word', 'category'], ['قطعة', 'عام'], ['château', 'bâtiment']];
  assert.deepEqual(parseCsv(serializeCsv(rows)), rows);
});

test('parseCsvTable maps headers to records and rejects malformed structure', () => {
  const table = parseCsvTable('word,category\nCat,Animals\nElephant,Animals\n');
  assert.deepEqual(table.headers, ['word', 'category']);
  assert.deepEqual(table.records, [{ word: 'Cat', category: 'Animals' }, { word: 'Elephant', category: 'Animals' }]);
  assert.throws(() => parseCsvTable(''), CsvError);
  assert.throws(() => parseCsvTable('word,\nCat,Animals'), CsvError);
  assert.throws(() => parseCsvTable('word,word\nCat,Animals'), CsvError);
  assert.throws(() => parseCsvTable('word,category\nCat,Animals,extra'), CsvError);
  assert.deepEqual(parseCsvTable('word,category\nCat\n').records, [{ word: 'Cat', category: '' }]);
});