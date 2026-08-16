// §7 of svelte-adapter-dom-shim (DECIDED 2026-08-11): the constructs that compile cleanly and
// then silently do nothing under the DOM shim. Everything else in the original §4 table is
// already closed by "app code can't reach it" or "the TS/Svelte compiler already errors on it for
// free" (see the skill for the full reachability table). This preprocessor is the guard for what
// is left.
//
// Three families, one mechanism:
//   <svelte:head|window|document|body>  — compiler-level special elements with no RN meaning.
//   {@html expr}                        — compiles to $.html(), which either assigns to an
//     `innerHTML` that ShimElement does not define (a silent no-op producing zero nodes) or
//     reaches create_element('template'), a tag with no descriptorFor entry. There is no
//     meaningful HTML to render into a native tree, so it fails LOUDLY here instead.
//   browser-only IMPORTS from svelte's own subpackages — the same failure one level up. These
//     read browser globals React Native does not define, so every value they hand back is
//     permanently undefined/false with no error anywhere. Measured per subpackage (see §25):
//     `svelte/reactivity/window` and `MediaQuery` are the ONLY browser-dependent members —
//     `svelte/store`, `svelte/easing`, `svelte/motion`, `svelte/events`, `svelte/attachments`
//     and the rest of `svelte/reactivity` (SvelteMap/Set/Date/URL, createSubscriber) are pure
//     and must keep working, so this is a two-name list, not a subpackage ban.
//
// Registered in svelte.config.js's `preprocess`, NOT a standalone lint rule: `svelte-check`
// and the Svelte VS Code/language-server extension run the SAME preprocessor pipeline, so this
// one mechanism produces both an editor-time diagnostic and a build failure — no second
// mechanism needed.
//
// Verified against the installed svelte@5.56.8: `parse(content, {modern: true})` on throwaway
// markup confirmed `Root.fragment.nodes[].type` === 'SvelteHead' / 'SvelteWindow' /
// 'SvelteDocument' / 'SvelteBody' / 'HtmlTag', and running this preprocessor's `markup()`
// against forbidden vs. clean markup threw/passed as expected.

import { parse } from 'svelte/compiler';

interface IForbidden {
  readonly label: string;
  readonly advice: string;
}

const SPECIAL_ELEMENT_ADVICE =
  'has no meaning under React Native and is silently inert under the Symbiote DOM shim ' +
  '(svelte-adapter-dom-shim skill §4/§7). Use the matching runtime module instead ' +
  '(Dimensions / AppState / StatusBar / …).';

const FORBIDDEN: ReadonlyMap<string, IForbidden> = new Map([
  ['SvelteHead', { label: '<svelte:head>', advice: SPECIAL_ELEMENT_ADVICE }],
  ['SvelteWindow', { label: '<svelte:window>', advice: SPECIAL_ELEMENT_ADVICE }],
  ['SvelteDocument', { label: '<svelte:document>', advice: SPECIAL_ELEMENT_ADVICE }],
  ['SvelteBody', { label: '<svelte:body>', advice: SPECIAL_ELEMENT_ADVICE }],
  [
    'HtmlTag',
    {
      label: '{@html …}',
      advice:
        'renders an HTML string, and a native view tree has no HTML to render it into — it ' +
        'compiles and then paints nothing (svelte-adapter-dom-shim skill §4/§7). Build the ' +
        'content out of <View>/<Text> from @symbiote-native/svelte instead; for rich text from ' +
        'a remote source, parse it yourself and map each node onto those primitives.',
    },
  ],
]);

// The real AST shape isn't pinned here (see the VERIFY note above), so this reads it through
// runtime guards on `unknown` rather than trusting an unverified type — narrower and safer
// than casting past whatever `parse()`'s declared return type turns out to be.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nodeType(node: unknown): string | undefined {
  if (!isRecord(node)) return undefined;
  const type = node.type;
  return typeof type === 'string' ? type : undefined;
}

function childNodes(node: unknown): unknown[] {
  if (!isRecord(node)) return [];
  const fragment = node.fragment;
  if (!isRecord(fragment)) return [];
  const nodes = fragment.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

// `{@html}` can sit anywhere a node can — inside an {#if}/{#each} branch, a snippet body, an
// element's children — and those hang off different keys than `fragment.nodes`, so the walk
// descends through every child value rather than the one fragment field the special elements
// happen to live under.
function nestedNodes(node: unknown): unknown[] {
  if (!isRecord(node)) return [];
  const nested: unknown[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) nested.push(...value);
    else if (isRecord(value)) nested.push(value);
  }
  return nested;
}

function walk(nodes: unknown[], filename: string, seen: Set<object>): void {
  for (const node of nodes) {
    if (!isRecord(node) || seen.has(node)) continue;
    seen.add(node);
    const type = nodeType(node);
    const forbidden = type === undefined ? undefined : FORBIDDEN.get(type);
    if (forbidden !== undefined) {
      throw new Error(`${filename}: ${forbidden.label} ${forbidden.advice}`);
    }
    walk([...childNodes(node), ...nestedNodes(node)], filename, seen);
  }
}

// The two browser-dependent members of svelte's own runtime, and what to reach for instead.
// Keyed by module specifier; `named` restricts the ban to specific exports of a module whose
// other exports are fine (all of `svelte/reactivity` except MediaQuery is pure).
const FORBIDDEN_IMPORT: ReadonlyMap<
  string,
  { readonly named?: ReadonlySet<string>; readonly advice: string }
> = new Map([
  [
    'svelte/reactivity/window',
    {
      advice:
        'reads browser globals (window.innerWidth / scrollY / navigator.onLine …) that React ' +
        'Native never defines, so every value it hands back stays undefined with no error. ' +
        'Import innerWidth / innerHeight / outerWidth / outerHeight / devicePixelRatio from ' +
        '@symbiote-native/svelte instead (svelte-adapter-dom-shim skill §25). There is no ' +
        'equivalent for scrollX/scrollY/screenLeft/screenTop — a native app has no window-level ' +
        'scroll offset and no position in a window manager; read scroll from a ScrollView.',
    },
  ],
  [
    'svelte/reactivity',
    {
      named: new Set(['MediaQuery']),
      advice:
        'is built on window.matchMedia, which React Native does not have, so every query ' +
        'answers false — indistinguishable from a legitimate no. Use orientation or ' +
        'createWidthQuery from @symbiote-native/svelte, or useColorScheme for ' +
        'prefers-color-scheme (svelte-adapter-dom-shim skill §25). The rest of this module ' +
        '(SvelteMap / SvelteSet / SvelteDate / SvelteURL / createSubscriber) is pure and fine.',
    },
  ],
]);

// The parsed script halves, read through runtime guards on `unknown` rather than a cast — the
// same discipline the fragment walk above uses on the same parse() output.
function scriptBodies(ast: unknown): unknown[] {
  if (!isRecord(ast)) return [];
  return ['instance', 'module'].flatMap(half => {
    const script = ast[half];
    if (!isRecord(script)) return [];
    const scriptContent = script.content;
    if (!isRecord(scriptContent)) return [];
    return Array.isArray(scriptContent.body) ? scriptContent.body : [];
  });
}

function importSpecifiers(node: Record<string, unknown>): Record<string, unknown>[] {
  const specifiers = node.specifiers;
  if (!Array.isArray(specifiers)) return [];
  return specifiers.filter(isRecord);
}

// Only an ImportSpecifier carries `imported`; a namespace or default specifier has no member
// name to read, which is why they are handled separately below.
function importedNames(node: Record<string, unknown>): string[] {
  return importSpecifiers(node).flatMap(specifier => {
    const imported = specifier.imported;
    if (!isRecord(imported)) return [];
    return typeof imported.name === 'string' ? [imported.name] : [];
  });
}

// A default specifier is deliberately NOT treated as a dodge: none of these svelte subpackages
// has a default export, and a default binding cannot reach a named member anyway.
function hasNamespaceSpecifier(node: Record<string, unknown>): boolean {
  return importSpecifiers(node).some(specifier => specifier.type === 'ImportNamespaceSpecifier');
}

function checkImports(ast: unknown, filename: string): void {
  for (const node of scriptBodies(ast)) {
    if (!isRecord(node) || node.type !== 'ImportDeclaration') continue;
    const source = node.source;
    if (!isRecord(source) || typeof source.value !== 'string') continue;
    const rule = FORBIDDEN_IMPORT.get(source.value);
    if (rule === undefined) continue;

    if (rule.named === undefined) {
      throw new Error(`${filename}: importing from '${source.value}' ${rule.advice}`);
    }
    // `import * as R from 'svelte/reactivity'` hands the whole module object over under one
    // local name, so whether app code reaches R.MediaQuery is decided at runtime and this check
    // can never see it. A named ban is only enforceable on named imports, so the namespace shape
    // is refused outright instead of being waved through.
    if (hasNamespaceSpecifier(node)) {
      const banned = [...rule.named].map(name => `'${name}'`).join(' / ');
      throw new Error(
        `${filename}: '${source.value}' is imported as a namespace, which cannot be checked — ` +
          `import the members you need by name so ${banned} is ruled out. ${banned} ` +
          rule.advice,
      );
    }
    for (const name of importedNames(node)) {
      if (rule.named.has(name)) {
        throw new Error(`${filename}: '${name}' from '${source.value}' ${rule.advice}`);
      }
    }
  }
}

export function forbidWebOnlyConstructs(): {
  markup(input: { content: string; filename?: string }): { code: string };
} {
  return {
    markup({ content, filename }) {
      const ast: unknown = parse(content, { filename, modern: true });
      const where = filename ?? '<svelte>';
      walk(childNodes(ast), where, new Set());
      // One parse serves both checks: the fragment walk above, and the script imports here.
      checkImports(ast, where);
      return { code: content };
    },
  };
}
