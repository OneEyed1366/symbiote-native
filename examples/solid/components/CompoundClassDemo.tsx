// The COMPOUND selector — `.badge.loud` applies only to an element carrying both tokens, layering
// OVER `.badge` rather than replacing it (symbiote-sfc-style-compiler skill §5b).

// plain: `.badge` alone, compound rule must NOT reach it. loud: static `class="badge loud"`,
// `.badge.loud` wins the two colours it restates. dynamic: same pair via a runtime-computed
// string the compiler can't read — both paths must agree.

// The dynamic badge's LABEL is deliberately constant: an e2e journey screenshot-diffs it across
// the toggle, and a label that changed with state would pass even with the rule dead.

// Solid has no SFC/scoped style block, so unlike its Svelte/Vue twins this canary covers only the
// compound half at global scope — the scope×compound half stays uncovered, not faked.

// `section-nested` / `section-label` / `row` come from App.css and pass through untouched, which
// is the other half of the rule.

import { createSignal } from 'solid-js';
import { ActionButton } from './ActionButton';
import './CompoundClassDemo.css';

export function CompoundClassDemo() {
  const [isLoud, setIsLoud] = createSignal(false);

  return (
    <view class="section-nested">
      <text class="section-label">
        Compound class · layered over the base rule
      </text>
      <view class="row">
        <view class="badge" testID="compound-badge-plain">
          <text class="badge-text">plain</text>
        </view>
        <view class="badge loud" testID="compound-badge-loud">
          <text class="badge-text">loud</text>
        </view>
        {/* One string rather than an array: IClassNameValue's array member is
            `string | IResolvedStyle`, so Svelte's `['badge', isLoud && 'loud']` shape has no
            type-safe spelling here — and a ternary is the same runtime-opaque input anyway. */}
        <view
          class={isLoud() ? 'badge loud' : 'badge'}
          testID="compound-badge-dynamic"
        >
          <text class="badge-text">dynamic</text>
        </view>
      </view>
      <text class="badge-readout" testID="compound-badge-readout">
        {isLoud()
          ? 'dynamic badge carries both tokens — blue border, same pill shape'
          : 'dynamic badge carries only .badge — grey border'}
      </text>
      <ActionButton
        testID="compound-badge-toggle"
        title={isLoud() ? 'Drop .loud' : 'Add .loud'}
        color="#7aa2e3"
        onPress={() => setIsLoud(loud => !loud)}
      />
    </view>
  );
}
