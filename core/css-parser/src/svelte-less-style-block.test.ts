// The one `<style lang>` language the Svelte adapter's own conformance suite CANNOT drive, run
// here instead — same preprocessor, same call, different vitest project.
//
// `adapters/svelte/**` runs in the `svelte` project, which sets the `browser` resolve condition
// (svelte's "." export splits SSR vs client on it — see vitest.config.ts). `less` declares
// `"browser": "./dist/less.cjs"` FIRST in its own exports, so under that condition Node loads the
// browser bundle and it throws `window is not defined`; the loader's catch reports it as "less is
// required for .less files", which reads like a missing install and is not one. sass and stylus
// have no such split and are covered in style-forms-conformance.test.ts.
//
// Metro never sets that condition, so Less is fine on a real build; the gap is the harness's.
import { describe, expect, it } from 'vitest';
import { scopedStyles } from '../../../adapters/svelte/src/preprocessor/scoped-styles.ts';

const FILENAME = '/repo/src/Card.svelte';

describe('svelte <style lang="less">', () => {
  it('compiles a Less variable and registers it under the scoped name', async () => {
    const { code } = await scopedStyles().markup({
      content:
        '<View class="card" />\n<style lang="less">\n@pad: 5px;\n.card { padding: @pad; }\n</style>\n',
      filename: FILENAME,
    });

    expect(code).toMatch(
      /"tokens":\["card__svelte-[a-z0-9]+"\].*"style":\{"padding":5\}/,
    );
    expect(code).toMatch(/class="card__svelte-[a-z0-9]+"/);
  });
});
