import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXAMPLES = join(__dirname, '..', 'examples');
const REFERENCE = join(EXAMPLES, 'react');

type ITarget = {
  name: string;
  // The folder holding `components`, `recipes` and `screens`
  root: string;
  // Stems this flavor cannot hold as one file, and why
  absent?: { stems: readonly string[]; reason: string };
};

// A single-file component holds one component, so a react file with two becomes two files
const ONE_COMPONENT_PER_FILE = {
  stems: [
    'screens/reanimated/DeviceBoxes',
    'screens/CanaryLists',
    'screens/CanaryOverlays',
    'screens/canary-parts',
  ],
  reason: 'each component of these files is a file of its own',
} as const;

// The expo-* examples and bare-rn are out on purpose: other products, other screens
const TARGETS: readonly ITarget[] = [
  { name: 'vue-tsx', root: '' },
  { name: 'vue-sfc', root: '', absent: ONE_COMPONENT_PER_FILE },
  { name: 'solid', root: '' },
  { name: 'svelte', root: '', absent: ONE_COMPONENT_PER_FILE },
  { name: 'angular', root: 'src' },
];

const VIEW_EXTENSIONS = ['.tsx', '.ts', '.vue', '.svelte'] as const;

// The navigation surface at the example root, one stem each
const ROOT_STEMS = [
  'routes',
  'navigation-lines',
  'navigation-linking',
  'navigation-recipes',
  'navigation-recipes.test',
  'menu-sections',
  'menu-sections.test',
] as const;

// Shared building blocks, the rest of `components` is React API demos
const COMPONENT_STEMS = [
  'ScreenHero',
  'Recipe',
  'ChoiceRow',
  'SwitchRow',
  'LabeledChoice',
  'ActionButton',
  'HeaderTapView',
] as const;

// Screens that stay as they are in every flavor, or belong to one flavor only
const NOT_PORTED = [
  /^screens\/(Stock)?Benchmark/,
  /^screens\/JsiNavigationCost/,
  /^screens\/ApiPlayground/,
  /^screens\/StyleShowcase/,
  /^screens\/showcase\./,
  /^screens\/Details/,
  /^screens\/native-dom/,
] as const;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)));
}

// `Foo.tsx`, `Foo.vue` and `Foo.svelte.ts` all become `Foo`, a test keeps its `.test`
function stemOf(file: string): string {
  let stem = file;
  for (const extension of VIEW_EXTENSIONS) {
    if (stem.endsWith(extension)) stem = stem.slice(0, -extension.length);
  }
  return stem.endsWith('.svelte') ? stem.slice(0, -'.svelte'.length) : stem;
}

function stemsIn(base: string, folder: string): string[] {
  return walk(join(base, folder))
    .filter(file => !file.endsWith('.d.ts'))
    .map(file => `${folder}/${stemOf(file)}`);
}

function isPorted(stem: string): boolean {
  return !NOT_PORTED.some(pattern => pattern.test(stem));
}

function stemsOf(base: string): Set<string> {
  const rootFiles = readdirSync(base).map(stemOf);
  return new Set([
    ...rootFiles.filter(stem => ROOT_STEMS.some(own => own === stem)),
    ...stemsIn(base, 'components').filter(stem =>
      COMPONENT_STEMS.some(own => stem === `components/${own}`),
    ),
    ...stemsIn(base, 'recipes'),
    ...stemsIn(base, 'screens').filter(isPorted),
  ]);
}

const REQUIRED = stemsOf(REFERENCE);

describe('navigation screens share one structure across flavors', () => {
  it('reads a reference to compare against', () => {
    expect(REQUIRED.size).toBeGreaterThan(100);
    expect(REQUIRED.has('screens/StackTransitionsScreen')).toBe(true);
    expect(REQUIRED.has('recipes/stack-recipes')).toBe(true);
  });

  for (const target of TARGETS) {
    it(`${target.name} has every file of the reference`, () => {
      const actual = stemsOf(join(EXAMPLES, target.name, target.root));
      const exempt = target.absent?.stems ?? [];
      const missing = [...REQUIRED]
        .filter(stem => !actual.has(stem) && !exempt.includes(stem))
        .sort();
      expect(missing).toEqual([]);
    });
  }
});
