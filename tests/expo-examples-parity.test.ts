import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXAMPLES = join(__dirname, '..', 'examples');
const REFERENCE = join(EXAMPLES, 'expo-react');

type ITarget = {
  name: string;
  root: string;
  screenExt: string;
  importExts: readonly string[];
};

const TARGETS: readonly ITarget[] = [
  {
    name: 'expo-solid',
    root: '',
    screenExt: '.tsx',
    importExts: ['.tsx', '.ts'],
  },
  {
    name: 'expo-vue-tsx',
    root: '',
    screenExt: '.tsx',
    importExts: ['.tsx', '.ts'],
  },
  {
    name: 'expo-svelte',
    root: '',
    screenExt: '.svelte',
    importExts: ['.svelte', '.ts'],
  },
  {
    name: 'expo-vue-sfc',
    root: '',
    screenExt: '.vue',
    importExts: ['.vue', '.ts'],
  },
  { name: 'expo-angular', root: 'src', screenExt: '.ts', importExts: ['.ts'] },
];

const read = (file: string) => readFileSync(file, 'utf8');
const squash = (text: string) =>
  text.replace(/\\/g, '').replace(/\s+/g, ' ').trim();

// A route whose screen file does not carry the route's own name
const SCREEN_FILE_NAME: Record<string, string> = {
  StandardWebCrypto: 'WebCrypto',
};
const screenFileOf = (route: string) =>
  `${SCREEN_FILE_NAME[route] ?? route}Screen`;

const routeNames = [
  ...read(join(REFERENCE, 'routes.ts')).matchAll(/^ {2}(\w+): '/gm),
].map(match => match[1]);
const SCREEN_ROUTES = routeNames.filter(route => route !== 'Menu');

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const withoutImports = (source: string) =>
  withoutComments(source)
    .replace(/^import[\s\S]*?from\s+'[^']+';?$/gm, '')
    .replace(/^import\s+'[^']+';?$/gm, '');

// Литералы `testID` и `className` плюс текст для пользователя из атрибутов и JSX
function literalsOf(source: string): string[] {
  const code = withoutImports(source);
  const ids = [
    ...code.matchAll(/["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["'`]/g),
  ].map(m => m[1]);
  const prose = [...code.matchAll(/(["'])((?:\\.|(?!\1)[^\\\n])*)\1/g)]
    .map(m => m[2])
    .filter(
      text =>
        text.length >= 24 &&
        text.includes(' ') &&
        !/[{}]|=>/.test(text) &&
        !/^[a-z-]+( [a-z-]+)*$/.test(text),
    );
  const jsx = [...code.matchAll(/(?<!=)>\s*([A-Z][^<>{}=]{30,}?)\s*</g)].map(
    m => m[1],
  );
  return [...new Set([...ids, ...prose, ...jsx].map(squash))];
}

function isDirectory(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

function resolveSibling(
  dir: string,
  spec: string,
  exts: readonly string[],
): string | null {
  const base = join(dir, spec);
  const candidates = [base, ...exts.map(ext => base + ext)];
  return (
    candidates.find(file => existsSync(file) && !isDirectory(file)) ?? null
  );
}

function withSiblings(file: string, exts: readonly string[]): string {
  const seen = new Set<string>();
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const match of read(current).matchAll(
      /(?:from|import)\s+'(\.\/[^']+)'/g,
    )) {
      const sibling = resolveSibling(dirname(current), match[1], exts);
      if (sibling !== null) {
        queue.push(sibling);
      }
    }
  }
  return [...seen].map(read).join('\n');
}

const REF_SCREENS = join(REFERENCE, 'screens');
const REF_EXTS = ['.tsx', '.ts'] as const;

function dirCorpus(dir: string): string {
  return readdirSync(dir)
    .map(name => join(dir, name))
    .filter(file => !isDirectory(file))
    .map(read)
    .join('\n');
}

const cssClasses = (css: string) => [
  ...new Set(
    [...withoutComments(css).matchAll(/\.([a-z][a-z0-9-]*)/g)].map(m => m[1]),
  ),
];

describe.each(TARGETS)('$name mirrors expo-react', target => {
  const base = join(EXAMPLES, target.name, target.root);
  const screensDir = join(base, 'screens');

  it('registers the same routes', () => {
    const routes = read(join(base, 'routes.ts'));
    for (const route of routeNames) {
      expect(routes, route).toContain(`${route}: '${route}'`);
    }
  });

  it('registers every screen in the app shell', () => {
    const shell = readdirSync(base)
      .filter(name => /^(App|screen-table)\.(tsx?|svelte|vue)$/.test(name))
      .map(name => read(join(base, name)))
      .join('\n');
    for (const route of routeNames) {
      expect(shell, route).toMatch(
        new RegExp(`ROUTE_NAME\\.${route}\\b|${route}Screen\\b`),
      );
    }
  });

  it('keeps the same navigation lines', () => {
    const lines = read(join(base, 'navigation-lines.ts'));
    for (const route of SCREEN_ROUTES) {
      expect(lines, route).toMatch(
        new RegExp(`ROUTE_NAME\\.${route}\\]?\\s*:`),
      );
    }
  });

  it('has every stylesheet class', () => {
    const own = read(join(base, 'App.css'));
    const missing = cssClasses(read(join(REFERENCE, 'App.css'))).filter(
      cls => !own.includes(`.${cls}`),
    );
    expect(missing).toEqual([]);
  });

  it('has the shared component literals', () => {
    const own = squash(dirCorpus(join(base, 'components')));
    const missing = readdirSync(join(REFERENCE, 'components'))
      .flatMap(name => literalsOf(read(join(REFERENCE, 'components', name))))
      .filter(text => !own.includes(text));
    expect(missing).toEqual([]);
  });

  it.each(routeNames)('%s screen matches the reference', route => {
    const file = join(screensDir, `${screenFileOf(route)}${target.screenExt}`);
    expect(existsSync(file), `${file} missing`).toBe(true);
    const own = squash(withSiblings(file, target.importExts));
    const reference = withSiblings(
      join(REF_SCREENS, `${screenFileOf(route)}.tsx`),
      REF_EXTS,
    );
    const missing = literalsOf(reference).filter(text => !own.includes(text));
    expect(missing).toEqual([]);
  });
});
