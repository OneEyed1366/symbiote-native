// Covers the `<style>` block support in `compileSfc` (`registerRules` injection)
// Script inlining, the `vue` import rewrite and `transform` are exercised by the canary build
import { describe, expect, it } from 'vitest';
import metroVueTransformer from './metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

// One entry of the emitted `registerRules([...])` array, with the selector's own token set
// `combinators` is compile-time-only and stripped at emit, so these four fields are the shape
type IEmittedRule = {
  tokens: string[];
  specificity: [number, number, number];
  order: number;
  style: Record<string, unknown>;
};

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

// Indented syntax goes through the same `scss` entry as `lang="scss"`
// Only the synthetic `${filename}.sass` path from `compileStyleBlockContent` picks the syntax
// This proves the SFC wiring, the preprocessor itself is covered in core/css-parser
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

// `.big` has no standalone rule and is only named inside a compound selector
// `lightningcss` renames it anyway, which keeps the template's `big` token and the key aligned
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

// `.legacy` sits in a `:global()` that covers only part of its selector
// The rule hangs off this file's `.card`, but `legacy` names foreign markup and stays unsuffixed
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

// Read off a renamed name: the scope id exists only inside the names `lightningcss` produced
// A test that recomputed it would be a second implementation of the same rule
function scopeIdOf(code: string): string {
  const match = code.match(/__(data-v-[0-9a-z]+)/);
  if (!match?.[1])
    throw new Error('no scoped class name found in compiled output');
  return match[1];
}

// Every preprocessor fixture authors `.card` with a nested `.title`, so they share one constant
// The nested rule is a descendant selector, matched like a compound one: two tokens, [0, 2, 0]
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
    // `#f00`, not `red`: `lightningcss` normalizes a colour keyword
    // Fabric sees the same colour
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10, backgroundColor: '#f00' },
      },
    ]);
  });

  // Each block contributes its own rule and the cascade decides at resolve time
  // This guards `order`: the second block restarts at 0, so `appendRules` has to renumber it to 1
  // Without that the tie-break between two equally specific `.card` rules is undefined
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

  // `lang="sass"` and `lang="scss"` share one `compilePreprocessor` entry
  // Only the synthetic file path tells it which syntax to parse
  // A regression makes every indented-syntax block throw a brace-expected parse error
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
    // The runtime half reads the renamed name from the same map the styles registered under
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
    // Static `class="card highlight"`: only the scoped token is suffixed
    // The global one from the sibling unscoped block passes through unchanged
    expect(code).toContain(`class: "card__${scopeId} highlight"`);
  });

  it('scopes both tokens of a compound selector whose parts have no standalone rule', async () => {
    const code = await compileSfc(
      SFC_WITH_COMPOUND_SCOPED_SELECTOR,
      'Card.vue',
    );
    const scopeId = scopeIdOf(code);

    // A compound rule carries both renamed tokens, so the registry has nothing to reverse
    // It matches the element whose token list is a superset, and the markup carries the same tokens
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

  // `:global()` around part of a selector reaches markup this file does not own
  // `lightningcss` leaves a name it did not rename global, so `legacy` never enters the rename map
  it('leaves a partial :global() token unsuffixed while the rest of its chain is suffixed', async () => {
    const code = await compileSfc(
      SFC_WITH_PARTIAL_GLOBAL_IN_SCOPED_BLOCK,
      'Card.vue',
    );
    const scopeId = scopeIdOf(code);

    // Both rules survive registration: the two-token rule layers over `.card`, not replacing it
    expect(extractRegisterRulesArg(code)).toEqual([
      {
        tokens: [`card__${scopeId}`],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      // The `card` half carries the scope, the `:global()` half does not
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

  // The exemption must be surgical: a fully global selector keeps its plain name
  // An ordinary scoped class in the same block still gets its suffix
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
    // Unlike `<style scoped>`, module classes stay out of `__scopedClassNames`
    // so a literal `class="card"` elsewhere in the file stays unsuffixed
    expect(code).not.toContain('__scopedClassNames');
  });

  it('does not collide with a <style scoped> block that shares the same class name', async () => {
    const code = await compileSfc(
      SFC_WITH_SCOPED_AND_MODULE_BLOCKS_SHARING_A_CLASS_NAME,
      'Card.vue',
    );
    // A module tail is the bare hash, as in a standalone `.module.css`
    // A scoped tail is `data-v-<hash>`, so one hash in two shapes never collides
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

// A kebab class is registered as authored: nothing in the pipeline `camelCases` it
// So `.section-label` is the token `section-label` on both sides, with no fallback involved
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
    // The raw `class="section-label"` passes through unrewritten, as no scoped block installs
    // the `nodeTransform`, and it matches the rule's token exactly
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
    // One entry per authored class, with no `camelCase` alias
    expect(code).toContain(
      `const __scopedClassNames = {"is-active":"is-active__${scopeId}","section-label":"section-label__${scopeId}"};`,
    );
  });

  it('leaves a kebab-case key inside a dynamic :class toggle-map object literal alone', async () => {
    const code = await compileSfc(SFC_WITH_KEBAB_CLASS_SCOPED, 'Card.vue');
    // The toggle-map key stays kebab in the source expression, and `renameClassTokens` looks it
    // up under that spelling at runtime, so the call site must wrap the expression unchanged
    expect(code).toContain(
      "__scopeClass({ 'is-active': isActive }, __scopedClassNames)",
    );
  });
});

const SFC_WITH_BARE_ATTRIBUTES = `
<script setup lang="ts">
import { Animated, FlatList } from '@symbiote-native/vue';
import Own from './Own.vue';
const rows = ['a'];
</script>
<template>
  <view>
    <scroll-view nested-scroll-enabled />
    <FlatList :data="rows" inverted />
    <Animated.ScrollView scroll-enabled />
    <Own flag />
    <text-input placeholder="" />
  </view>
</template>
`;

describe('metro-vue-transformer bare boolean attributes', () => {
  // Vue casts a bare attribute to `true` only for a declared Boolean prop, and our tags declare
  // none, so it reached native as "" and Android threw `String cannot be cast to Boolean`
  it('passes true for a bare attribute on an intrinsic tag', async () => {
    const code = await compileSfc(SFC_WITH_BARE_ATTRIBUTES, 'Screen.vue');
    expect(code).toContain('"nested-scroll-enabled": true');
  });

  it('passes true for a bare attribute on a component imported from @symbiote-native', async () => {
    const code = await compileSfc(SFC_WITH_BARE_ATTRIBUTES, 'Screen.vue');
    expect(code).toContain('inverted: true');
    expect(code).toContain('"scroll-enabled": true');
  });

  // The app's own component keeps Vue's semantics: a bare attribute on a String prop is `""`
  it("leaves a bare attribute on the app's own component to Vue", async () => {
    const code = await compileSfc(SFC_WITH_BARE_ATTRIBUTES, 'Screen.vue');
    expect(code).toContain('flag: ""');
  });

  // An explicit empty value is a string, not the shorthand
  it('keeps an explicit empty string', async () => {
    const code = await compileSfc(SFC_WITH_BARE_ATTRIBUTES, 'Screen.vue');
    expect(code).toContain('placeholder: ""');
  });
});
