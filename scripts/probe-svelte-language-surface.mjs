// Answers "does the Svelte adapter support construct X?" with the COMPILER, not from memory.
//
// Compiles one probe component per Svelte language construct with this adapter's own compiler
// options and reports (a) whether it compiles at all, (b) which svelte/internal/client runtime
// functions it emits, and (c) which raw DOM members those touch. Cross-reference the output
// against adapters/svelte/src/dom-shim/*'s implemented surface: a construct that emits a call
// reaching a member the shim does not define is unsupported, whether or not it typechecks.
//
// The single most load-bearing result here is the element-vs-component split: app code in this
// project never authors a DOM element (it composes <View>/<Text>/… from @symbiote-native/svelte),
// so every ELEMENT-only directive is unreachable by construction rather than unimplemented — the
// same reachability argument svelte-adapter-dom-shim skill §7 makes for dev warnings.
//
// Run:  node scripts/probe-svelte-language-surface.mjs
// Re-run on every `svelte` version bump (skill §8's checklist).

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// `svelte` is a devDependency of adapters/svelte, not of the repo root — under pnpm's isolated
// store there is no hoisted copy to import by bare specifier from here.
const require = createRequire(join(REPO_ROOT, 'adapters/svelte/package.json'));
const { compile } = require('svelte/compiler');
const svelteVersion = require('svelte/package.json').version;

// Mirrors adapters/svelte/svelte.config.js and metro-svelte-transformer.cjs.
const OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' };

// Emitted by every probe; carries no signal about the construct under test.
const UNIVERSAL = new Set(['from_tree', 'append', 'template_effect', 'push', 'pop', 'child', 'reset', 'next', 'sibling']);

const PROBES = [
  ['control flow', '{#if}', `<script>let a = $state(1)</script>{#if a}<Foo/>{:else}<Bar/>{/if}`],
  ['control flow', '{#each} keyed', `<script>let a = $state([])</script>{#each a as x (x.id)}<Foo/>{/each}`],
  ['control flow', '{#each} index', `<script>let a = $state([])</script>{#each a as x, i}<Foo/>{/each}`],
  ['control flow', '{#await}', `<script>let p = $state(Promise.resolve())</script>{#await p}<A/>{:then v}<B/>{:catch e}<C/>{/await}`],
  ['control flow', '{#key}', `<script>let k = $state(1)</script>{#key k}<Foo/>{/key}`],
  ['control flow', '{#snippet}/{@render}', `{#snippet row(x)}<Foo/>{/snippet}{@render row(1)}`],
  ['control flow', '{@const}', `{#each [1] as x}{@const y = x * 2}<Foo n={y}/>{/each}`],
  ['control flow', '{@html}', `<script>let s = $state('')</script>{@html s}`],
  ['control flow', '{@debug}', `<script>let a = $state(1)</script>{@debug a}<Foo/>`],

  ['special element', '<svelte:boundary>', `<svelte:boundary onerror={() => {}}><Foo/></svelte:boundary>`],
  ['special element', '<svelte:element>', `<script>let t = $state('span')</script><svelte:element this={t}/>`],
  ['special element', '<svelte:options>', `<svelte:options runes={true} /><Foo/>`],
  ['special element', '<svelte:head>', `<svelte:head><title>x</title></svelte:head>`],
  ['special element', '<svelte:window>', `<svelte:window onresize={() => {}} />`],

  ['component', 'bind:this', `<script>let r = $state(null)</script><Foo bind:this={r}/>`],
  ['component', 'bind:value', `<script>let v = $state(1)</script><Foo bind:value={v}/>`],
  ['component', 'spread {...props}', `<script>let p = $state({})</script><Foo {...p}/>`],
  ['component', 'dynamic <C/>', `<script>let C = $state(null)</script><C prop={1}/>`],
  ['component', '{@attach}', `<script>const fn = () => {}</script><Foo {@attach fn}/>`],
  ['component', 'class: directive', `<script>let a = $state(true)</script><Foo class:on={a}/>`],
  ['component', 'style: directive', `<script>let c = $state('red')</script><Foo style:color={c}/>`],
  ['component', 'use: action', `<script>const act = () => {}</script><Foo use:act/>`],
  ['component', 'transition:', `<script>import { fade } from 'svelte/transition'</script><Foo transition:fade/>`],

  ['element', 'class: directive', `<script>let a = $state(true)</script><div class:on={a}></div>`],
  ['element', 'style: directive', `<script>let c = $state('red')</script><div style:color={c}></div>`],
  ['element', 'use: action', `<script>const act = () => {}</script><div use:act></div>`],
  ['element', '{@attach}', `<script>const fn = () => {}</script><div {@attach fn}></div>`],
  ['element', 'transition:', `<script>import { fade } from 'svelte/transition'; let a = $state(true)</script>{#if a}<div transition:fade></div>{/if}`],
  ['element', 'animate:', `<script>import { flip } from 'svelte/animate'; let a = $state([])</script>{#each a as x (x)}<div animate:flip></div>{/each}`],
  ['element', 'bind:value', `<script>let v = $state('')</script><input bind:value={v}/>`],
  ['element', 'bind:this', `<script>let r = $state(null)</script><div bind:this={r}></div>`],

  ['host tag', 'object bag', `<script>let bag = $state({})</script><symbiote-view p={bag}></symbiote-view>`],
];

const emitted = new Map();
let group = '';

console.log(`svelte ${svelteVersion} · options ${JSON.stringify(OPTIONS)}\n`);

for (const [probeGroup, name, source] of PROBES) {
  if (probeGroup !== group) {
    group = probeGroup;
    console.log(`\n[${group}]`);
  }
  try {
    const { js } = compile(source, { ...OPTIONS, filename: `${name}.svelte` });
    const calls = [...new Set(js.code.match(/\$\.[a-z_0-9]+/g) ?? [])]
      .map(call => call.slice(2))
      .filter(call => !UNIVERSAL.has(call))
      .sort();
    for (const call of calls) emitted.set(call, (emitted.get(call) ?? 0) + 1);
    const domMembers = [
      ...new Set(js.code.match(/\.(className|classList|style|innerHTML|textContent|value|checked)\b/g) ?? []),
    ];
    const dom = domMembers.length > 0 ? `   DOM${domMembers.join('')}` : '';
    console.log(`  ok    ${name.padEnd(22)} ${calls.join(' ')}${dom}`);
  } catch (error) {
    console.log(`  FAIL  ${name.padEnd(22)} ${String(error.message).split('\n')[0]}`);
  }
}

console.log('\n--- every runtime fn emitted above ---');
console.log([...emitted.keys()].sort().join(' '));

// The probe above runs the COMPILER only. A construct can compile perfectly and still be dead
// under the DOM shim ({@html} emits $.html(), which has nothing to render into on a native tree)
// — that is the shim's defining weakness, and the guard for it is a PREPROCESSOR, a separate
// stage svelte.config.js registers and `compile()` never invokes. Re-running the same sources
// through it here keeps the two verdicts side by side, so "ok" above is never mistaken for
// "supported".
const { forbidWebOnlyConstructs } = await import(
  new URL('../adapters/svelte/src/preprocessor/forbid-web-only-constructs.ts', import.meta.url)
);
const preprocessor = forbidWebOnlyConstructs();

console.log('\n--- preprocessor verdict (svelte.config.js `preprocess`, NOT compile()) ---');
for (const [, name, source] of PROBES) {
  try {
    preprocessor.markup({ content: source, filename: `${name}.svelte` });
  } catch (error) {
    console.log(`  REJECTED  ${name.padEnd(22)} ${String(error.message).replace(`${name}.svelte: `, '')}`);
  }
}
