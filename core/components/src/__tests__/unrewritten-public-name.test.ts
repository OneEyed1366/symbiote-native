// A primitive's PUBLIC name must never resolve to a Fabric view.
//
// Three of the five adapters rewrite `<View>` to `view` at build time, because their
// compilers decide host-vs-component by tag case and cannot be told otherwise. A missed call site
// therefore sends the string `"View"` into `descriptorFor`, which used to fall through to
// `{ component: 'View' }` — committing a Fabric view literally named `View`, with no error at any
// layer and a failure visible only on a device. That is the worst failure class this project has.
//
// The guard cannot be a name list, and the reason is measured rather than hypothetical: on iOS the
// switch's Fabric view IS called `Switch` and the safe area's IS called `SafeAreaView`. Blocking
// those by name would break an adapter's thin wrapper over a third-party native view, which
// resolves by view name through this same function.
import { describe, expect, it } from 'vitest';
import {
  buildDescriptors,
  makeDescriptorFor,
  type ISymbioteIntrinsic,
} from '../component-names/shared';

// The iOS table, inline rather than imported: `component-names/index.ios.ts` is platform-selected
// and vitest resolves the base file, so importing it would silently test the wrong table. These are
// the two names that collide, plus enough neighbours for the derivation to be exercised.
const IOS_NAMES: Record<ISymbioteIntrinsic, string> = {
  view: 'RCTView',
  pressable: 'RCTView',
  text: 'RCTText',
  image: 'RCTImageView',
  'scroll-view': 'RCTScrollView',
  'scroll-content': 'RCTScrollContentView',
  'horizontal-scroll-view': 'RCTScrollView',
  'horizontal-scroll-content': 'RCTScrollContentView',
  'text-input': 'RCTSinglelineTextInputView',
  'text-input-multiline': 'RCTMultilineTextInputView',
  'text-input-managed': 'RCTSinglelineTextInputView',
  'text-input-multiline-managed': 'RCTMultilineTextInputView',
  switch: 'Switch',
  'activity-indicator': 'ActivityIndicatorView',
  'safe-area-view': 'SafeAreaView',
  modal: 'ModalHostView',
  'refresh-control': 'PullToRefreshView',
  'input-accessory-view': 'RCTInputAccessoryView',
};

const descriptorFor = makeDescriptorFor(buildDescriptors(IOS_NAMES));

describe('an unrewritten public name never resolves', () => {
  describe('Positive', () => {
    // why: the control, and it is not decoration — every Negative row below asserts a THROW, and a
    // function that threw on everything would satisfy all of them.
    it('control: the intrinsic tags still resolve', () => {
      expect(descriptorFor('view').component).toBe('RCTView');
      expect(descriptorFor('text').isText).toBe(true);
    });

    // why: THE collision, measured off the real iOS table. `Switch` and `SafeAreaView` are genuine
    // Fabric view names, so they must keep falling through — a name-list guard would break an
    // adapter's wrapper over a third-party native view, which resolves by view name right here.
    it('lets a public name that IS a real view name through', () => {
      expect(descriptorFor('Switch')).toEqual({
        component: 'Switch',
        isText: false,
      });
      expect(descriptorFor('SafeAreaView').component).toBe('SafeAreaView');
    });

    // why: the fallthrough exists for third-party codegen components and must keep working.
    it('passes an ordinary third-party view name through', () => {
      expect(descriptorFor('RNSScreen')).toEqual({
        component: 'RNSScreen',
        isText: false,
      });
    });
  });

  describe('Negative', () => {
    // why: the whole point. Before this, `"View"` committed a Fabric view named `View`.
    it('rejects a single-word public name', () => {
      expect(() => descriptorFor('View')).toThrow(/PUBLIC name/);
      expect(() => descriptorFor('Text')).toThrow(/PUBLIC name/);
      expect(() => descriptorFor('Image')).toThrow(/PUBLIC name/);
    });

    // why: the derivation is kebab -> Pascal, and a multi-word name is the case a naive
    // capitalisation gets wrong. `.claude/rules/adapter-parity-audit.md` records a convention that
    // held only because every primitive it had ever seen was single-word.
    it('rejects a multi-word public name', () => {
      expect(() => descriptorFor('ScrollView')).toThrow(/PUBLIC name/);
      expect(() => descriptorFor('TextInput')).toThrow(/PUBLIC name/);
      expect(() => descriptorFor('ActivityIndicator')).toThrow(/PUBLIC name/);
    });

    // why: this used to assert the mirror-image throw — an unknown `symbiote-*` name was our own
    // typo and got its own message. The prefix WAS that discriminator, and dropping it took the
    // guard with it: a lowercase kebab name is just as likely an Angular app's own component
    // selector (`counter-child`, `app-root`), which reaches here and must resolve. Asserting the
    // throw would now break every Angular template — measured at 180 failures.
    //
    // So the contract flipped, and this pins the direction it flipped to. The typo protection moved
    // to the compiler: `ISymbioteIntrinsic` is a closed union, so a misspelled tag in our own source
    // cannot reach runtime at all.
    it('passes an unknown kebab name through as a view name, for an app selector', () => {
      expect(descriptorFor('counter-child')).toEqual({
        component: 'counter-child',
        isText: false,
      });
    });
  });
});
