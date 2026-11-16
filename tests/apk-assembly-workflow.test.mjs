import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/appsem-apk-assemble.yml', import.meta.url), 'utf8');

test('APK assembler only accepts its dedicated repository_dispatch event', () => {
  assert.match(workflow, /repository_dispatch:\s*\n\s*types:\s*\[appsem_apk_assemble\]/);
  assert.doesNotMatch(workflow, /^\s{2}(?:pull_request|push):/m);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/);
});

test('APK assembler validates the event release ID and refuses non-draft metadata', () => {
  assert.match(workflow, /re\.fullmatch\(r'\[0-9\]\{1,16\}', rid\)/);
  assert.match(workflow, /release\.get\('id'\) != int\(rid\)/);
  assert.match(workflow, /if not release\.get\('draft'\):[\s\S]*?APPSEM_SKIP=1/);
});

test('APK assembler validates slug, version, filename, size and exact part count', () => {
  assert.match(workflow, /\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*/);
  assert.match(workflow, /\[a-zA-Z0-9\]\[a-zA-Z0-9\._\+-\]\{0,50\}/);
  assert.match(workflow, /\{0,110\}\\\.apk/);
  assert.match(workflow, /1_900_000_000/);
  assert.match(workflow, /count != \(size \+ chunk_size - 1\) \/\/ chunk_size/);
  assert.match(workflow, /isinstance\(size, bool\)/);
  assert.match(workflow, /isinstance\(count, bool\)/);
});

test('APK assembler verifies every downloaded part and validates the final ZIP structure', () => {
  assert.match(workflow, /asset\.get\('state'\) != 'uploaded'/);
  assert.match(workflow, /output\.tell\(\) - start != expected/);
  assert.match(workflow, /'AndroidManifest\.xml' not in archive\.namelist\(\)/);
  assert.match(workflow, /archive\.testzip\(\) is not None/);
  assert.match(workflow, /gh release upload "\$APPSEM_TAG" "\$APPSEM_FILE"/);
  assert.match(workflow, /final_asset = by_name\.get\(file_name\)/);
  assert.match(workflow, /APPSEM_FINAL_EXISTS/);
  assert.match(workflow, /env\.APPSEM_FINAL_EXISTS != '1'/);
});
