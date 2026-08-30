// Covers the `<style>` block support in compileSfc (registerRules injection). The rest of the
// transformer (script/template inlining, `vue` import rewrite) is exercised by the canary build
// itself; this file only guards the CSS-parsing addition.
//
// N/A, deliberately not covered here: compileSfc's SFC-parse-error and missing-<script> throws
// (`descriptor.errors`, `scriptSetup == null && script == null`) are @vue/compiler-sfc's own
// input-validation surface, not the CSS-parsing addition this file exists to guard — and
// `transform`/`getCacheKey` (the Metro entry points wrapping compileSfc) are integration-only,
// exercised by the canary build, not unit-testable without a real Metro worker.
//
// No throwing-vs-non-throwing split by describe group: each nested describe below groups by
// SFC feature (plain <style>, `scoped`, `module`, kebab-case classes); the one throwing case
// (unsupported lang) sits inside its feature's describe, asserting the specific error message.
import { describe, expect, it } from 'vitest';
import metroVueTransformer from './metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

// One entry of the emitted `registerRules([...])` array: the selector's own token set, not a name
// collapsed out of it. `combinators` is stripped at emit (compile-time-only), so the emitted shape
// is exactly these four fields.
interface IEmittedRule {
  tokens: string[];
  specificity: [number, number, number];
  order: number;
  style: Record<string, unknown>;
}

function extractRegisterRulesArg(code: string): IEmittedRule[] {
  const match = code.match(/registerRules\((\[[\s\S]*?\])\);/);
  if (!match?.[1])
    throw new Error('no registerRules(...) call found in compiled output');
  return JSON.parse(match[1]) as IEmittedRule[];
}

const SFC_WITH_ONE_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style>
.card { padding: 10px; background-color: red; }
</style>
`;

const SFC_WITH_TWO_STYLE_BLOCKS = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style>
.card { padding: 10px; background-color: red; }
</style>
<style>
.card { background-color: blue; }
</style>
`;

const SFC_WITHOUT_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View><Text>{{ label }}</Text></View>
</template>
`;

const SFC_WITH_SCSS_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="scss">
$spacing: 10px;

@mixin padded($amount) {
  padding: $amount;
}

.card {
  @include padded($spacing);

  .title {
    font-weight: bold;
  }
}
</style>
`;

// Indented syntax (no braces/semicolons) — distinct from SCSS at the SYNTAX level, but
// SFC_STYLE_LANG_TO_PREPROCESSOR routes both `lang="scss"` and `lang="sass"` through the same
// compilePreprocessor('scss', ...) entry point, disambiguated only by a synthetic `${filename}.sass`
// path (compileStyleBlockContent). A wrong synthetic path would hand indented text to the
// brace-expecting SCSS parser and fail outright — this proves the SFC-level wiring picks the right
// syntax, not the preprocessor itself (that unit is core/css-parser/src/preprocessors's own job).
const SFC_WITH_SASS_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="sass">
$spacing: 10px

.card
  padding: $spacing

  .title
    font-weight: bold
</style>
`;

const SFC_WITH_LESS_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="less">
@spacing: 10px;

.padded(@amount) {
  padding: @amount;
}

.card {
  .padded(@spacing);

  .title {
    font-weight: bold;
  }
}
</style>
`;

const SFC_WITH_STYLUS_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="stylus">
spacing = 10px

padded(amount)
  padding amount

.card
  padded(spacing)

  .title
    font-weight bold
</style>
`;

const SFC_WITH_UNSUPPORTED_STYLE_LANG = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="typo">
.card { padding: 10px; }
</style>
`;

const SFC_WITH_SCOPED_STYLE_BLOCK = `
<script setup lang="ts">
const isActive = true
</script>
<template>
  <View class="card">
    <View :class="{ active: isActive }" />
  </View>
</template>
<style scoped>
.card { padding: 10px; }
.active { opacity: 1; }
</style>
`;

const SFC_WITH_MIXED_GLOBAL_AND_SCOPED_BLOCKS = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card highlight" />
</template>
<style>
.highlight { color: red; }
</style>
<style scoped>
.card { padding: 10px; }
</style>
`;

// `.big` has no standalone rule of its own, so it is only ever named inside a compound selector.
// lightningcss renames it anyway (a class is a class), which is what keeps the template's `big`
// token and the registered key on one spelling.
const SFC_WITH_COMPOUND_SCOPED_SELECTOR = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card big" />
</template>
<style scoped>
.card { padding: 10px; }
.card.big { padding: 20px; }
</style>
`;

const SFC_WITH_GLOBAL_ESCAPE_IN_SCOPED_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="reset" />
</template>
<style scoped>
:global(.reset) { margin: 0; }
</style>
`;

// `.legacy` sits inside a `:global()` that is only PART of its selector: the rule as a whole is
// this file's own (it hangs off the file's `.card`), but the `legacy` half names markup this file
// does not own and must survive unsuffixed.
const SFC_WITH_PARTIAL_GLOBAL_IN_SCOPED_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card legacy" />
</template>
<style scoped>
.card { padding: 10px; }
.card :global(.legacy) { margin: 0; }
</style>
`;

const SFC_WITH_GLOBAL_AND_SCOPED_RULES_IN_ONE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card reset" />
</template>
<style scoped>
.card { padding: 10px; }
:global(.reset) { margin: 0; }
</style>
`;

const SFC_WITH_KEBAB_CLASS_UNSCOPED = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="section-label" />
</template>
<style>
.section-label { color: red; }
</style>
`;

const SFC_WITH_KEBAB_CLASS_SCOPED = `
<script setup lang="ts">
const isActive = true
</script>
<template>
  <View class="section-label">
    <View :class="{ 'is-active': isActive }" />
  </View>
</template>
<style scoped>
.section-label { padding: 10px; }
.is-active { opacity: 1; }
</style>
`;

const SFC_WITH_MODULE_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View :class="$style.card"><Text>{{ label }}</Text></View>
</template>
<style module>
.card { padding: 10px; }
</style>
`;

const SFC_WITH_NAMED_MODULE_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View :class="classes.card"><Text>{{ label }}</Text></View>
</template>
<style module="classes">
.card { padding: 10px; }
</style>
`;

const SFC_WITH_GLOBAL_ESCAPE_IN_MODULE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View :class="$style.reset" />
</template>
<style module>
:global(.reset) { margin: 0; }
</style>
`;

const SFC_WITH_SCOPED_AND_MODULE_BLOCKS_SHARING_A_CLASS_NAME = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card" />
  <View :class="$style.card" />
</template>
<style scoped>
.card { padding: 10px; }
</style>
<style module>
.card { padding: 20px; }
</style>
`;

// Read off a renamed name rather than a dedicated constant: since the scoping moved onto
// lightningcss (2026-08-20) the scope id exists only inside the names it produced, and reading it
// from one of those is what keeps these assertions honest — a test that recomputed it would be the
// second implementation this migration deleted.
function scopeIdOf(code: string): string {
  const match = code.match(/__(data-v-[0-9a-z]+)/);
  if (!match?.[1])
    throw new Error('no scoped class name found in compiled output');
  return match[1];
}

// Every preprocessor fixture below authors the same shape - `.card` with a nested `.title` - so
// the four of them assert one constant. The nested rule is a DESCENDANT selector, which the
// registry still matches like a compound one (trap 6): two tokens, specificity [0, 2, 0].
const NESTED_RULES = [
  {
    tokens: ['card'],
    specificity: [0, 1, 0],
    order: 0,
    style: { padding: 10 },
  },
  {
    tokens: ['card', 'title'],
    specificity: [0, 2, 0],
    order: 1,
    style: { fontWeight: 'bold' },
  },
];

describe('metro-vue-transformer compileSfc <style> support', () => {
  it('injects registerRules() with the compiled rules for a single <style> block', async () => {
    const code = await compileSfc(SFC_WITH_ONE_STYLE_BLOCK, 'Card.vue');
    expect(code).toContain('registerRules(');
    expect(code).toContain("from '@symbiote-native/engine'");
    // `#f00`, not `red`: lightningcss normalizes a colour keyword on the way through. Same colour
    // to Fabric.
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10, backgroundColor: '#f00' },
      },
    ]);
  });

  // Two blocks no longer MERGE into one entry per class - each contributes its own rule and the
  // cascade decides at resolve time. What this guards is `order`: the second block's rule restarts
  // at 0 inside its own compile, so appendRules has to renumber it to 1, or the tie-break between
  // two equally specific `.card` rules is undefined.
  it('concatenates multiple <style> blocks with order increasing across them', async () => {
    const code = await compileSfc(SFC_WITH_TWO_STYLE_BLOCKS, 'Card.vue');
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10, backgroundColor: '#f00' },
      },
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 1,
        style: { backgroundColor: '#00f' },
      },
    ]);
  });

  it('injects no registerRules() call when the SFC has no <style> block', async () => {
    const code = await compileSfc(SFC_WITHOUT_STYLE_BLOCK, 'Plain.vue');
    expect(code).not.toContain('registerRules(');
    expect(code).not.toContain("from '@symbiote-native/engine'");
  });

  it('compiles a lang="scss" block — nesting, a variable, and a mixin', async () => {
    const code = await compileSfc(SFC_WITH_SCSS_STYLE_BLOCK, 'Card.vue');
    expect(extractRegisterRulesArg(code)).toEqual(NESTED_RULES);
  });

  it('compiles a lang="less" block — nesting, a variable, and a mixin', async () => {
    const code = await compileSfc(SFC_WITH_LESS_STYLE_BLOCK, 'Card.vue');
    expect(extractRegisterRulesArg(code)).toEqual(NESTED_RULES);
  });

  it('compiles a lang="stylus" block — nesting, a variable, and a function', async () => {
    const code = await compileSfc(SFC_WITH_STYLUS_STYLE_BLOCK, 'Card.vue');
    expect(extractRegisterRulesArg(code)).toEqual(NESTED_RULES);
  });

  // why: lang="sass" (the indented syntax) and lang="scss" share ONE compiler entry point
  // (compilePreprocessor('scss', ...)); only the synthetic file path fed to it tells dart-sass
  // which syntax to parse. A regression here would make every indented-syntax SFC style block
  // throw a brace-expected parse error instead of compiling.
  it('compiles a lang="sass" (indented syntax) block via the synthetic .sass path', async () => {
    const code = await compileSfc(SFC_WITH_SASS_STYLE_BLOCK, 'Card.vue');
    expect(extractRegisterRulesArg(code)).toEqual(NESTED_RULES);
  });

  it('throws for a genuinely unsupported style lang', async () => {
    await expect(
      compileSfc(SFC_WITH_UNSUPPORTED_STYLE_LANG, 'Card.vue'),
    ).rejects.toThrow(/lang="typo" not supported yet/);
  });
});

describe('metro-vue-transformer compileSfc <style scoped> support', () => {
  it('suffixes a scoped class in both registerRules() and a static class= usage', async () => {
    const code = await compileSfc(SFC_WITH_SCOPED_STYLE_BLOCK, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`card__${scopeId}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      {
        tokens: [`active__${scopeId}`],
        specificity: [0, 1, 0],
        order: 1,
        style: { opacity: 1 },
      },
    ]);
    expect(code).toContain(`class: "card__${scopeId}"`);
  });

  it('wraps a dynamic :class expression with the rename map instead of leaving it unresolved', async () => {
    const code = await compileSfc(SFC_WITH_SCOPED_STYLE_BLOCK, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(code).toContain(
      "import { registerRules, renameClassTokens as __scopeClass } from '@symbiote-native/engine'",
    );
    // The runtime half now READS the renamed name out of the same map the styles registered
    // under, instead of rebuilding it from a name set plus a scope id.
    expect(code).toContain(
      `__scopeClass({ active: isActive }, __scopedClassNames)`,
    );
    expect(code).toContain(
      `const __scopedClassNames = {"active":"active__${scopeId}","card":"card__${scopeId}"};`,
    );
  });

  it('does not suffix a class from an unscoped block sharing the file with a scoped one', async () => {
    const code = await compileSfc(
      SFC_WITH_MIXED_GLOBAL_AND_SCOPED_BLOCKS,
      'Card.vue',
    );
    const scopeId = scopeIdOf(code);

    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: ['highlight'],
        specificity: [0, 1, 0],
        order: 0,
        style: { color: '#f00' },
      },
      {
        tokens: [`card__${scopeId}`],
        specificity: [0, 1, 0],
        order: 1,
        style: { padding: 10 },
      },
    ]);
    // static class="card highlight" — only the scoped token gets suffixed, the global one
    // that lives in the sibling unscoped block passes through unchanged in the same string.
    expect(code).toContain(`class: "card__${scopeId} highlight"`);
  });

  it('scopes both tokens of a compound selector whose parts have no standalone rule', async () => {
    const code = await compileSfc(
      SFC_WITH_COMPOUND_SCOPED_SELECTOR,
      'Card.vue',
    );
    const scopeId = scopeIdOf(code);

    // A compound rule carries BOTH renamed tokens rather than a name collapsed out of them, so
    // there is nothing left for the registry to reverse: it matches the element whose token list
    // is a superset. `cardBig__<scope>` and the per-token markup used to be two spellings that had
    // to be reconciled; now the rule names exactly the two tokens the markup carries.
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`card__${scopeId}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      {
        tokens: [`card__${scopeId}`, `big__${scopeId}`],
        specificity: [0, 2, 0],
        order: 1,
        style: { padding: 20 },
      },
    ]);
    expect(code).toContain(`class: "card__${scopeId} big__${scopeId}"`);
  });

  it('does not suffix a :global(...) selector inside a scoped block', async () => {
    const code = await compileSfc(
      SFC_WITH_GLOBAL_ESCAPE_IN_SCOPED_BLOCK,
      'Card.vue',
    );

    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: ['reset'],
        specificity: [0, 1, 0],
        order: 0,
        style: { margin: 0 },
      },
    ]);
    expect(code).toContain('class: "reset"');
    expect(code).not.toMatch(/reset__data-v-/);
  });

  // why: `:global()` around PART of a selector is the escape hatch for reaching markup this file
  // does not own. lightningcss answers this for free: a name it did not rename is global, so
  // `legacy` never enters the rename map and the escape hatch cannot be scope-mangled shut.
  it('leaves a partial :global() token unsuffixed while the rest of its chain is suffixed', async () => {
    const code = await compileSfc(
      SFC_WITH_PARTIAL_GLOBAL_IN_SCOPED_BLOCK,
      'Card.vue',
    );
    const scopeId = scopeIdOf(code);

    // Both rules survive registration: the two-token rule LAYERS over `.card` rather than
    // replacing it, so `.card`'s own declarations must still be there to layer under.
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`card__${scopeId}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      // Per-token renaming again: the `card` half carries the scope, the `:global()` half does
      // not, and the rule names them exactly as they now read.
      {
        tokens: [`card__${scopeId}`, 'legacy'],
        specificity: [0, 2, 0],
        order: 1,
        style: { margin: 0 },
      },
    ]);
    expect(code).toContain(`class: "card__${scopeId} legacy"`);
    expect(code).not.toContain(`legacy__${scopeId}`);
  });

  // why: the exemption must be surgical — a fully global selector still registers under its plain
  // name and an ordinary scoped one in the SAME block still gets its suffix. Widening the token
  // exemption into either of those would unscope the whole file.
  it('still suffixes an ordinary scoped class beside a fully global one in the same block', async () => {
    const code = await compileSfc(
      SFC_WITH_GLOBAL_AND_SCOPED_RULES_IN_ONE_BLOCK,
      'Card.vue',
    );
    const scopeId = scopeIdOf(code);

    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`card__${scopeId}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      {
        tokens: ['reset'],
        specificity: [0, 1, 0],
        order: 1,
        style: { margin: 0 },
      },
    ]);
    expect(code).toContain(`class: "card__${scopeId} reset"`);
  });

  it('adds no rename-helper import or nodeTransform overhead for a file with no scoped block', async () => {
    const code = await compileSfc(SFC_WITH_ONE_STYLE_BLOCK, 'Card.vue');
    expect(code).not.toContain('renameClassTokens');
    expect(code).not.toContain('__scopedClassNames');
  });
});

function moduleScopeIdOf(code: string): string {
  const match = code.match(/"card":"card__module__([^"]+)"/);
  if (!match?.[1])
    throw new Error('no module-scoped card class found in compiled output');
  return match[1];
}

describe('metro-vue-transformer compileSfc <style module> support', () => {
  it('scopes every class and exposes a $style name->scopedName map', async () => {
    const code = await compileSfc(SFC_WITH_MODULE_STYLE_BLOCK, 'Card.vue');
    const scopeId = moduleScopeIdOf(code);

    expect(code).toContain(
      `const $style = {"card":"card__module__${scopeId}"};`,
    );
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`card__module__${scopeId}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
    ]);
  });

  it('uses a custom binding name from module="classes"', async () => {
    const code = await compileSfc(
      SFC_WITH_NAMED_MODULE_STYLE_BLOCK,
      'Card.vue',
    );
    const scopeId = moduleScopeIdOf(code);

    expect(code).toContain(
      `const classes = {"card":"card__module__${scopeId}"};`,
    );
    expect(code).not.toContain('const $style');
  });

  it('does not scope a :global(...) selector inside a module block', async () => {
    const code = await compileSfc(
      SFC_WITH_GLOBAL_ESCAPE_IN_MODULE_BLOCK,
      'Card.vue',
    );

    expect(code).toContain('const $style = {"reset":"reset"};');
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: ['reset'],
        specificity: [0, 1, 0],
        order: 0,
        style: { margin: 0 },
      },
    ]);
  });

  it('never auto-applies a module class to a literal class= attribute (opt-in via $style.x only)', async () => {
    const code = await compileSfc(SFC_WITH_MODULE_STYLE_BLOCK, 'Card.vue');
    // Unlike <style scoped>, module classes must not be added to __scopedClassNames — a
    // literal class="card" elsewhere in the same file must stay unsuffixed.
    expect(code).not.toContain('__scopedClassNames');
  });

  it('does not collide with a <style scoped> block that shares the same class name', async () => {
    const code = await compileSfc(
      SFC_WITH_SCOPED_AND_MODULE_BLOCKS_SHARING_A_CLASS_NAME,
      'Card.vue',
    );
    // The two tails no longer share their spelling: a module tail is the bare hash, matching the
    // standalone `.module.css` form (and SCOPE_TAIL_PATTERN's `module__[0-9a-z]+`, which the old
    // `module__data-v-<hash>` never matched — that is why base layering and compound lookup were
    // dead in a Vue `<style module>`). Same hash, different shape, still no collision.
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`card__${scopeIdOf(code)}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      {
        tokens: [`card__module__${moduleScopeIdOf(code)}`],
        specificity: [0, 1, 0],
        order: 1,
        style: { padding: 20 },
      },
    ]);
  });
});

// A kebab class is registered AS AUTHORED now. Nothing in the pipeline camelCases, so
// `.section-label` is the token `section-label` on both sides and the two spellings that used to
// have to be reconciled (and the registry's kebab->camel fallback that reconciled them) are gone.
describe('metro-vue-transformer compileSfc kebab-case class= support', () => {
  it('registers a kebab-case CSS selector under its authored name (unscoped)', async () => {
    const code = await compileSfc(SFC_WITH_KEBAB_CLASS_UNSCOPED, 'Card.vue');
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: ['section-label'],
        specificity: [0, 1, 0],
        order: 0,
        style: { color: '#f00' },
      },
    ]);
    // the raw kebab class="section-label" attribute passes through unrewritten (no scoped block
    // installs the nodeTransform) and now matches the rule's token exactly - no fallback involved.
    expect(code).toContain('class: "section-label"');
  });

  it('keeps the authored kebab spelling and suffixes it when scoped', async () => {
    const code = await compileSfc(SFC_WITH_KEBAB_CLASS_SCOPED, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`section-label__${scopeId}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      {
        tokens: [`is-active__${scopeId}`],
        specificity: [0, 1, 0],
        order: 1,
        style: { opacity: 1 },
      },
    ]);
    expect(code).toContain(`class: "section-label__${scopeId}"`);
    // ONE entry per authored class - the camelCase alias each used to carry is gone with the
    // camelCasing itself.
    expect(code).toContain(
      `const __scopedClassNames = {"is-active":"is-active__${scopeId}","section-label":"section-label__${scopeId}"};`,
    );
  });

  it('leaves a kebab-case key inside a dynamic :class toggle-map object literal alone', async () => {
    const code = await compileSfc(SFC_WITH_KEBAB_CLASS_SCOPED, 'Card.vue');
    // The toggle-map key stays kebab in the SOURCE expression (Vue reproduces it unchanged) and
    // renameClassTokens looks it up under that same spelling at runtime. Here we only confirm the
    // compiled call site wraps the original expression unchanged.
    expect(code).toContain(
      "__scopeClass({ 'is-active': isActive }, __scopedClassNames)",
    );
  });
});

// Host-primitive lowering: <View>/<Text> imported from us compile to their intrinsic TAG, so Vue
// mounts them as elements and skips a component instance each (measured 14.1% of Vue's create —
// see the comment on LOWERABLE_HOST_PRIMITIVES). The failure mode if the tagType flip is dropped
// is silent: codegen emits a component whose children are withCtx slots the element path never
// mounts, i.e. an empty subtree. So every assertion below pins BOTH halves — the element helper
// AND the absence of withCtx.
describe('metro-vue-transformer host-primitive lowering', () => {
  const sfc = (script: string, template: string): string =>
    `\n<script setup lang="ts">\n${script}\n</script>\n<template>\n${template}\n</template>\n`;

  it('lowers an imported View/Text to intrinsic element tags with real children', async () => {
    const code = await compileSfc(
      sfc(
        `import { View, Text } from '@symbiote-native/vue'\nconst label = 'hi'`,
        `<View class="row"><Text class="t">{{ label }}</Text></View>`,
      ),
      'lowered.vue',
    );
    expect(code).toContain('_createElementBlock("symbiote-view"');
    expect(code).toContain('"symbiote-text"');
    expect(code).not.toContain('_withCtx');
    expect(code).not.toContain('_unref(View)');
  });

  it('leaves a View that was NOT imported from us as a component', async () => {
    const code = await compileSfc(
      sfc(
        `import { View } from './my-own-view'`,
        `<View class="row">hello</View>`,
      ),
      'foreign.vue',
    );
    expect(code).toContain('_unref(View)');
    expect(code).not.toContain('symbiote-view');
  });

  it('follows an import alias and leaves the original name alone', async () => {
    const code = await compileSfc(
      sfc(
        `import { View as RNView } from '@symbiote-native/vue'\nimport { View } from './my-own-view'`,
        `<RNView><View>x</View></RNView>`,
      ),
      'aliased.vue',
    );
    expect(code).toContain('_createElementBlock("symbiote-view"');
    expect(code).toContain('_unref(View)');
  });

  // `Pressable` used to stand here as the un-lowered primitive; the spec gained it on 2026-08-23,
  // so the case moved onto ones that are genuinely absent from HOST_PRIMITIVES. What it guards is
  // unchanged: listing is what makes a tag lowerable, never the name looking like a primitive.
  it('does not lower a primitive that is more than a pass-through', async () => {
    const code = await compileSfc(
      sfc(
        `import { Switch, Image } from '@symbiote-native/vue'`,
        `<Switch><Image src="x" /></Switch>`,
      ),
      'stateful.vue',
    );
    expect(code).toContain('_unref(Switch)');
    expect(code).toContain('_unref(Image)');
  });

  it('still scopes a scoped class on a lowered element', async () => {
    const code = await compileSfc(
      `<script setup lang="ts">\nimport { View } from '@symbiote-native/vue'\n</script>\n` +
        `<template><View class="card" /></template>\n` +
        `<style scoped>.card { padding: 4px; }</style>\n`,
      'scoped-lowered.vue',
    );
    expect(code).toContain('_createElementBlock("symbiote-view"');
    expect(code).not.toMatch(/class:\s*"card"/);
  });
});

// Pressable OWNS state (`pressed`), so unlike View/Text it lowers only when the template does not
// read that state — a lowered element has no instance to read it from. Every case below runs
// through the real `compileSfc`, the same entry Metro calls, because a harness that builds the
// subject its own way proves nothing about the shipped path
// (`.claude/rules/test-harness-false-greens.md` §11).
//
// Each refusal is paired with the nearest LOWERING case, so a detector that simply refuses
// everything fails the pair rather than passing the half it was written for.
describe('Pressable lowering refusals', () => {
  const compilePressable = (inner: string): Promise<string> =>
    compileSfc(
      `<script setup lang="ts">\n` +
        `import { Pressable, Text } from '@symbiote-native/vue'\n` +
        `const fnStyle = () => ({})\nconst c = 'red'\nconst obj = {}\n` +
        `</script>\n<template>${inner}</template>\n`,
      'pressable.vue',
    );

  const LOWERED = 'symbiote-pressable';

  it('lowers a Pressable whose template reads no press state', async () => {
    const code = await compilePressable(
      '<Pressable class="a"><Text>x</Text></Pressable>',
    );
    expect(code).toContain(LOWERED);
  });

  // A functional :style USED to refuse — a compile-time pass cannot tell an object from a function,
  // so the only safe reading was to keep the component. It no longer has to tell them apart: the
  // expression is CALLED once per state, and a name that turns out to hold an object is handled by
  // a runtime typeof guard rather than by a compile-time proof. What still refuses is anything that
  // cannot be read twice — see the two cases below this one.
  it('lowers a hoisted :style behind a runtime typeof guard', async () => {
    const code = await compilePressable(
      '<Pressable :style="fnStyle"><Text>x</Text></Pressable>',
    );
    expect(code, 'a name can be read twice, so it can be called').toContain(
      LOWERED,
    );
    expect(code).toContain('activeStyle');
    expect(code, 'an object-valued name must survive the guard').toContain(
      'typeof',
    );
  });

  it('lowers an inline callback by applying it to each state', async () => {
    const code = await compilePressable(
      '<Pressable :style="({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })"><Text>x</Text></Pressable>',
    );
    expect(code).toContain(LOWERED);
    expect(code).toContain('{ pressed: false }');
    expect(code).toContain('{ pressed: true }');
  });

  it('lowers an object literal, which needs no pair at all', async () => {
    // The shape the ActionButton migration produces once `opacity` moves into
    // `.action-button:active`. It arrives as a COMPOUND expression, not a simple one, because
    // transformExpression rewrites `c` to `$setup.c` first — the detail the detector is built on.
    const lowered = await compilePressable(
      '<Pressable :style="{ borderColor: c }"><Text>x</Text></Pressable>',
    );
    expect(lowered).toContain(LOWERED);
    expect(lowered, 'an inert style has no active variant').not.toContain(
      'activeStyle',
    );
  });

  // An expression that can DO WORK when read lowers too, but through the runtime helper rather than
  // the inline guard — the guard prints it on both props, so `getStyle()` would run four times per
  // bag build. Briefly written as a refusal, which was wrong: the hazard belongs to the emit shape,
  // not to the expression. The COUNT is what pins it; the verdict alone would ratify either emit.
  it('routes a :style that cannot be read twice through the helper', async () => {
    const called = await compilePressable(
      '<Pressable :style="getStyle()"><Text>x</Text></Pressable>',
    );
    expect(called).toContain(LOWERED);
    expect(called).toContain('__symbioteStateStyle');
    expect(called.split('getStyle').length - 1, 'read exactly once').toBe(1);
  });

  it('keeps the cheap emission for a name, which needs no helper', async () => {
    const code = await compilePressable(
      '<Pressable :style="fnStyle"><Text>x</Text></Pressable>',
    );
    expect(code).toContain(LOWERED);
    expect(
      code,
      'a read cannot change meaning, so it keeps its patch flag',
    ).not.toContain('__symbioteStateStyle');
  });

  // `ref` on a component yields the instance, on an element the host node. Found by the shared
  // verdict table rather than by any Vue test.
  it('refuses an element whose ref binds the instance', async () => {
    const attribute = await compilePressable(
      '<Pressable ref="handle"><Text>x</Text></Pressable>',
    );
    expect(attribute).not.toContain(LOWERED);

    const bound = await compilePressable(
      '<Pressable :ref="handle"><Text>x</Text></Pressable>',
    );
    expect(
      bound,
      'the bound form is a directive, not an attribute',
    ).not.toContain(LOWERED);
  });

  it('lowers an object literal that needed no binding rewrite', async () => {
    const code = await compilePressable(
      '<Pressable :style="{ borderColor: 1 }"><Text>x</Text></Pressable>',
    );
    expect(code).toContain(LOWERED);
  });

  it('refuses a scoped v-slot', async () => {
    const code = await compilePressable(
      '<Pressable v-slot="{ pressed }"><Text>x</Text></Pressable>',
    );
    expect(code).not.toContain(LOWERED);
  });

  // Both template forms refuse, including the argument-less one. Lowering an element that has a
  // <template> child makes codegen throw `Codegen node is missing for element/if/for node`, so
  // this is not the spec's "zero-arity is not a refusal" case — that carve-out is about a JSX
  // function child. Found by probing compileSfc before any of these tests existed.
  it('refuses a <template> child with or without a slot argument', async () => {
    const withArg = await compilePressable(
      '<Pressable><template #default="{ pressed }"><Text>x</Text></template></Pressable>',
    );
    expect(withArg).not.toContain(LOWERED);

    const withoutArg = await compilePressable(
      '<Pressable><template #default><Text>x</Text></template></Pressable>',
    );
    expect(withoutArg, 'lowering this one makes codegen throw').not.toContain(
      LOWERED,
    );
  });

  it('refuses v-bind of a whole object, which could hide a style fn', async () => {
    const code = await compilePressable(
      '<Pressable v-bind="obj"><Text>x</Text></Pressable>',
    );
    expect(code).not.toContain(LOWERED);
  });

  it('still lowers View and Text in the same file', async () => {
    const code = await compilePressable(
      '<Pressable :style="fnStyle"><Text>x</Text></Pressable>',
    );
    expect(code, 'a Pressable refusal must not disable its siblings').toContain(
      'symbiote-text',
    );
  });
});
