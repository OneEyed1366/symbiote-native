import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
    'screens/style-showcase/compiler-panels',
    'screens/style-showcase/lab-panels',
    'screens/style-showcase/limits-panels',
    'screens/style-showcase/mixing-panels',
    'screens/style-showcase/parts',
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

// Markup only: the lab stylesheet carries the same names as selectors and must not count
const MARKUP_FILE = /\.(tsx|ts|vue|svelte)$/;
const LAB_PANELS = ['MediaLab', 'ContainerLab', 'VarLab'] as const;
const LAB_TEST_ID = /testID="(lab-[a-z-]+)"/g;
const LIMITS_PANEL_FILE =
  /(^|\/)(limits-panels\.(tsx|ts)|LimitsPanel\.(vue|svelte))$/;
// Phrases the limits panel now carries, whitespace folded so a wrapped line still matches
const LIMITS_COPY = [
  'Limits: dropped, held behind a condition, and one that is wrong',
  'The dropped and wrong ones print a warning',
  'NO @SUPPORTS · @CONTAINER NEEDS A CONTAINER',
  '@container is kept, but it holds only below an ancestor',
] as const;

const LAB_E2E_FILES = [
  'color-scheme.test.ts',
  'container-axis.test.ts',
  'media-vars.test.ts',
  'remount.test.ts',
  'var-precedence.test.ts',
  'lab-device.ts',
  'lab-colors.ts',
  'pixel.ts',
  'pngjs.d.ts',
] as const;
// The journeys and the probe look ids up by template too, so only their code is compared
const E2E_PARITY_FILES = [
  ...LAB_E2E_FILES,
  'canary-journeys.test.ts',
  'probe.test.ts',
] as const;
const COMMENT_LINE = /^\s*\/\//;

// A comment may name the flavor's own panel file, so only the code lines must match
function codeLines(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => !COMMENT_LINE.test(line))
    .join('\n');
}

const SPEC_ID = /by\.id\('([^']+)'\)|'(lab-[a-z-]+|style-showcase-scroll)'/g;
const MENU_ROW_ID = /^menu-row-(.+)$/;
// The `testID` attribute itself takes the prefix, so a CSS class `menu-row-label` does not count
const MENU_ROW_TEST_ID = /testID\]?=[^\n]*menu-row-(?:\$\{|' \+)/;

// The ids the reference specs look up, which every flavor's screens must carry
function specIds(): string[] {
  const found = LAB_E2E_FILES.flatMap(file =>
    [
      ...readFileSync(join(REFERENCE, 'e2e', file), 'utf8').matchAll(SPEC_ID),
    ].map(match => match[1] ?? match[2]),
  );
  return [...new Set(found)];
}

// Where a `testID` or a route name can live: root files, `screens` and `components`
function flavorSource(target: ITarget): string {
  const base = join(EXAMPLES, target.name, target.root);
  const rootFiles = readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isFile() && MARKUP_FILE.test(entry.name))
    .map(entry => entry.name);
  const nested = ['screens', 'components'].flatMap(folder =>
    walk(join(base, folder)).map(file => join(folder, file)),
  );
  return [...rootFiles, ...nested]
    .filter(file => MARKUP_FILE.test(file))
    .map(file => readFileSync(join(base, file), 'utf8'))
    .join('\n');
}

// Every node the reference lab exposes to its e2e, read off the reference itself
function labTestIds(): string[] {
  const source = readFileSync(
    join(REFERENCE, 'screens', 'style-showcase', 'lab-panels.tsx'),
    'utf8',
  );
  return [...new Set([...source.matchAll(LAB_TEST_ID)].map(match => match[1]))];
}

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

    it(`${target.name} ships the device lab stylesheet as the reference has it`, () => {
      const sheet = join(
        EXAMPLES,
        target.name,
        target.root,
        'screens',
        'StyleShowcase.lab.css',
      );
      const reference = join(REFERENCE, 'screens', 'StyleShowcase.lab.css');
      expect(readFileSync(sheet, 'utf8')).toBe(readFileSync(reference, 'utf8'));
    });

    it(`${target.name} ships the limits stylesheet as the reference has it`, () => {
      const sheet = join(
        EXAMPLES,
        target.name,
        target.root,
        'screens',
        'StyleShowcase.limits.css',
      );
      const reference = join(REFERENCE, 'screens', 'StyleShowcase.limits.css');
      expect(readFileSync(sheet, 'utf8')).toBe(readFileSync(reference, 'utf8'));
    });

    it(`${target.name} words the limits panel as the reference does`, () => {
      const screens = join(EXAMPLES, target.name, target.root, 'screens');
      const panel = walk(screens).find(file => LIMITS_PANEL_FILE.test(file));
      const words = (path: string) =>
        readFileSync(path, 'utf8').replace(/\s+/g, ' ');
      const reference = words(
        join(REFERENCE, 'screens', 'style-showcase', 'limits-panels.tsx'),
      );
      const flavor = words(join(screens, panel ?? ''));
      const stale = LIMITS_COPY.filter(
        phrase => !reference.includes(phrase) || !flavor.includes(phrase),
      );
      expect(stale).toEqual([]);
    });

    it(`${target.name} renders every device lab node of the reference`, () => {
      const screens = join(EXAMPLES, target.name, target.root, 'screens');
      const markup = walk(screens)
        .filter(file => MARKUP_FILE.test(file))
        .map(file => readFileSync(join(screens, file), 'utf8'))
        .join('\n');
      const missing = labTestIds().filter(
        id => !markup.includes(`testID="${id}"`),
      );
      expect(missing).toEqual([]);
    });

    it(`${target.name} mounts every device lab panel on its showcase screen`, () => {
      const screens = join(EXAMPLES, target.name, target.root, 'screens');
      const screenFile = walk(screens).find(file =>
        /^StyleShowcaseScreen\.(tsx|vue|svelte|ts)$/.test(file),
      );
      const screen = readFileSync(join(screens, screenFile ?? ''), 'utf8');
      const unmounted = LAB_PANELS.filter(
        panel => !new RegExp(`<(Showcase)?${panel}[\\s/>]`).test(screen),
      );
      expect(unmounted).toEqual([]);
    });

    it(`${target.name} carries every id the device lab specs look up`, () => {
      const source = flavorSource(target);
      // A menu row id is built from its route, so the route name stands for the id
      const missing = specIds().filter(id => {
        const route = MENU_ROW_ID.exec(id)?.[1];
        return route === undefined
          ? !source.includes(id)
          : !MENU_ROW_TEST_ID.test(source) || !source.includes(route);
      });
      expect(missing).toEqual([]);
    });

    it(`${target.name} runs the device lab specs as the reference has them`, () => {
      const differing = E2E_PARITY_FILES.filter(
        file =>
          codeLines(join(EXAMPLES, target.name, 'e2e', file)) !==
          codeLines(join(REFERENCE, 'e2e', file)),
      );
      expect(differing).toEqual([]);
    });
  }
});

const LANDSCAPE_ORIENTATIONS = [
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
] as const;
const IPHONE_ORIENTATIONS =
  /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/;
const PLIST_STRING = /<string>([^<]+)<\/string>/g;

function iphoneOrientations(example: string): string[] {
  const plist = readFileSync(
    join(EXAMPLES, example, 'ios', 'Canary', 'Info.plist'),
    'utf8',
  );
  const block = IPHONE_ORIENTATIONS.exec(plist)?.[1] ?? '';
  return [...block.matchAll(PLIST_STRING)].map(match => match[1]);
}

// A rotation spec on a Portrait-only app reads `changes=0` and fails, with no hint at the plist
describe('the iOS apps can turn to landscape for the rotation specs', () => {
  for (const example of ['react', ...TARGETS.map(target => target.name)]) {
    it(`${example} lists both landscape orientations for the iPhone`, () => {
      const missing = LANDSCAPE_ORIENTATIONS.filter(
        orientation => !iphoneOrientations(example).includes(orientation),
      );
      expect(missing).toEqual([]);
    });
  }
});
