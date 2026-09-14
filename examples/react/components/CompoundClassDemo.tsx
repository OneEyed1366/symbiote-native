import { useState } from 'react';
import { ActionButton } from './ActionButton';

// The compound-class rule, on screen. `.badge.loud` (App.css) restates only two colours, so
// `.badge`'s padding and radius must survive on an element carrying both tokens — a resolver
// that returned the compound rule alone instead of layering it over the single-class one would
// visibly blank the pill's shape here.
//
// What each badge proves:
//   plain    — `.badge` alone; the compound rule must NOT reach it.
//   loud     — static className="badge loud". `.loud` has no standalone rule of its own, so the
//              only thing that can change its look is `.badge.loud` resolving.
//   dynamic  — the same pair built at runtime, so the value the resolver sees is a string it
//              never saw at build time. Both paths must agree.
//
// The dynamic badge's LABEL is deliberately constant: the e2e journey proves the rule by
// screenshot-diffing that badge across the toggle, and a label that changed with the state
// would make the diff pass even with the compound rule dead.
//
// Twin of the Vue-SFC and Svelte canaries' CompoundClassDemo, which express the identical three
// rules inside a per-component scoped style block — same law, different scoping (see the
// symbiote-sfc-style-compiler skill §5b).
export function CompoundClassDemo() {
  const [isLoud, setIsLoud] = useState(false);

  return (
    <view className="section-nested">
      <text className="section-label">Compound class · App.css</text>
      <view className="row">
        <view className="badge" testID="compound-badge-plain">
          <text className="badge-text">plain</text>
        </view>
        <view className="badge loud" testID="compound-badge-loud">
          <text className="badge-text">loud</text>
        </view>
        <view
          className={isLoud ? 'badge loud' : 'badge'}
          testID="compound-badge-dynamic"
        >
          <text className="badge-text">dynamic</text>
        </view>
      </view>
      <text className="note-text" testID="compound-badge-readout">
        {isLoud
          ? 'dynamic badge carries both tokens — accent border, same pill shape'
          : 'dynamic badge carries only .badge — grey border'}
      </text>
      <ActionButton
        testID="compound-badge-toggle"
        title={isLoud ? 'Drop .loud' : 'Add .loud'}
        color="#149eca"
        onPress={() => setIsLoud(current => !current)}
      />
    </view>
  );
}
