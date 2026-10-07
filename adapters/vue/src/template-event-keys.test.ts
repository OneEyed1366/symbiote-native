// Событие на нативном теге должно дойти до рендерера ключом `onXxx`, как бы его ни выдал компилятор
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import metroVueTransformer from '../metro-vue-transformer.cjs';
import { normalizeVueAttrKey } from './utils/normalize-attrs';

const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCANNED_DIRS = ['examples', 'packages', 'adapters'];
const SKIPPED_DIRS = new Set([
  'node_modules',
  'ios',
  'android',
  'build',
  'Pods',
]);
// Форма ключа, которую рендерер считает событием (`EVENT_PROP_NAME` в renderer/index.ts)
const EVENT_KEY = /^on[A-Z][A-Za-z]*$/;
// Эти ключи Vue ставит сам: `v-model` на компоненте и хуки жизненного цикла vnode
const VUE_OWN_KEY = /^(onUpdate:|onVnode)/;
const QUOTED_ON_KEY = /"(on[^"]+)"\s*:/g;
const ANY_ON_KEY = /"?\b(on[A-Za-z:-]+)"?\s*:/g;
const SCAN_TIMEOUT_MS = 120_000;

function sfcOf(template: string): string {
  return `<script setup lang="ts">\nconst f = () => {};\n</script>\n<template>${template}</template>\n`;
}

function keysIn(code: string, pattern: RegExp): string[] {
  return [...code.matchAll(pattern)].map(match => match[1]);
}

function vueFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (SKIPPED_DIRS.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return vueFilesUnder(path);
    return entry.name.endsWith('.vue') ? [path] : [];
  });
}

async function unreadableKeysIn(file: string): Promise<string[]> {
  const code = await compileSfc(readFileSync(file, 'utf8'), file);
  return keysIn(code, QUOTED_ON_KEY)
    .filter(
      key =>
        !VUE_OWN_KEY.test(key) && !EVENT_KEY.test(normalizeVueAttrKey(key)),
    )
    .map(key => `${file.slice(REPO_ROOT.length)}: ${key}`);
}

describe('event keys the SFC compiler emits', () => {
  describe('Positive', () => {
    // Тег `switch` и `text-input` в шаблоне получают то же имя события, что и в JSX
    it.each([
      ['<switch @valueChange="f" />', 'onValueChange'],
      ['<switch @value-change="f" />', 'onValueChange'],
      ['<text-input @valueChange="f" />', 'onValueChange'],
      ['<text-input @selectionChange="f" />', 'onSelectionChange'],
      ['<view @layout="f" />', 'onLayout'],
    ])('%s reaches the renderer as %s', async (template, expected) => {
      const code = await compileSfc(sfcOf(template), 'case.vue');

      expect(keysIn(code, ANY_ON_KEY).map(normalizeVueAttrKey)).toContain(
        expected,
      );
    });

    // Охрана от дрейфа: новый вид ключа в любом нашем `.vue` падает здесь, а не на устройстве
    it(
      'leaves no event key in the repo templates that the renderer would not read',
      async () => {
        const files = SCANNED_DIRS.flatMap(dir =>
          vueFilesUnder(join(REPO_ROOT, dir)),
        );
        const unreadable = (
          await Promise.all(files.map(unreadableKeysIn))
        ).flat();

        expect(unreadable).toEqual([]);
      },
      SCAN_TIMEOUT_MS,
    );
  });
});
