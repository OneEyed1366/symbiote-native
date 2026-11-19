import { createSignal } from 'solid-js';
import { Tile, Toggle, classList } from './parts';

export function DeclarationsPanel() {
  return (
    <view class="sc-panel">
      <text class="sc-panel-title">
        1 · Declarations, as the compiler emits them
      </text>
      <text class="sc-panel-note">
        lightningcss hands back a typed value tree, so a shorthand arrives
        already expanded into four sides and a corner longhand as the pair it
        really is. Neither was true of the hand-rolled evaluator this replaced.
      </text>

      <text class="sc-tile-label">SHORTHAND EXPANSION</text>
      <view class="sc-shorthand-box" testID="sc-shorthand-box">
        <view class="sc-shorthand-core" />
      </view>
      <text class="sc-tile-caption">
        padding: 6px 12px 26px 38px · border-width: 1px 4px 10px 20px — four
        different values on each. Uniform insets mean only the first value
        survived.
      </text>

      <view class="sc-pair">
        <Tile label="BORDER-RADIUS" caption="the shorthand — always worked">
          <view class="sc-corner-shorthand" testID="sc-corner-shorthand" />
        </Tile>
        <Tile
          label="FOUR LONGHANDS"
          caption="28 / 4 / 28 / 4 — a leaf. A square here is the bug this screen was built for."
        >
          <view class="sc-corner-longhand" testID="sc-corner-longhand" />
        </Tile>
      </view>

      <view class="sc-pair">
        <Tile label="BACKGROUND-IMAGE" caption="a real native Fabric prop">
          <view class="sc-gradient-tile" testID="sc-gradient-tile" />
        </Tile>
        <Tile
          label="+ FILTER"
          caption="same gradient, brighter. iOS paints only brightness and opacity — the grayscale half needs RN's enableSwiftUIBasedFilters flag. Identical twins mean filter stopped arriving entirely."
        >
          <view class="sc-filter-tile" testID="sc-filter-tile" />
        </Tile>
      </view>

      <view class="sc-pair">
        <Tile label="ROTATE, DEFAULT ORIGIN" caption="pivots about centre">
          <view class="sc-origin-frame">
            <view class="sc-origin-square" testID="sc-origin-centre" />
          </view>
        </Tile>
        <Tile
          label="+ TRANSFORM-ORIGIN"
          caption="top left — the same rotation, visibly offset"
        >
          <view class="sc-origin-frame">
            <view class="sc-origin-square-corner" testID="sc-origin-corner" />
          </view>
        </Tile>
      </view>

      <text class="sc-tile-label">BOX-SHADOW · TWO LAYERS</text>
      <view class="sc-shadow-tile" testID="sc-shadow-tile" />
      <text class="sc-tile-caption">
        Handed through as raw CSS text and parsed by the engine's own
        processBoxShadow port, so spread radius and multiple layers survive.
      </text>
    </view>
  );
}

export function SpecificityPanel() {
  const [isStrong, setIsStrong] = createSignal(false);
  const [hasOrderPair, setHasOrderPair] = createSignal(false);

  const specClass = () =>
    classList('sc-spec-tile', {
      'sc-spec-strong': isStrong(),
      'sc-spec-early': hasOrderPair(),
      'sc-spec-late': hasOrderPair(),
    });

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">
        2 · Specificity beats position; position breaks a tie
      </text>
      <text class="sc-panel-note">
        The file order is adversarial on purpose. `.sc-spec-tile.sc-spec-
        strong` is declared ABOVE the plain `.sc-spec-tile` and still wins the
        fill, because (0,2,0) outranks (0,1,0). `.sc-spec-early` and
        `.sc-spec-late` are equally specific, so the border goes to whichever
        is later in the file.
      </text>
      <view class={specClass()} testID="sc-spec-tile">
        <text class="sc-spec-text">
          {isStrong()
            ? 'green fill · compound rule won'
            : 'slate fill · base rule'}
        </text>
      </view>
      <text class="sc-readout" testID="sc-spec-readout">
        {specClass()}
      </text>
      <text class="sc-tile-caption">
        {hasOrderPair()
          ? 'border is sky blue — .sc-spec-late is the later line of the equal-specificity pair'
          : 'border is slate — neither of the equal-specificity pair is on the node'}
      </text>
      <Toggle
        testID="sc-spec-strong-toggle"
        label=".sc-spec-strong"
        active={isStrong()}
        onToggle={() => setIsStrong(current => !current)}
      />
      <Toggle
        testID="sc-spec-order-toggle"
        label=".sc-spec-early + .sc-spec-late"
        active={hasOrderPair()}
        onToggle={() => setHasOrderPair(current => !current)}
      />
    </view>
  );
}

export function CompoundPanel() {
  const [tokenA, setTokenA] = createSignal(false);
  const [tokenB, setTokenB] = createSignal(false);
  const [tokenC, setTokenC] = createSignal(false);

  const triClass = () =>
    classList('sc-tri', {
      'sc-t-a': tokenA(),
      'sc-t-b': tokenB(),
      'sc-t-c': tokenC(),
    });
  const tokenCount = () =>
    [tokenA(), tokenB(), tokenC()].filter(Boolean).length;

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">
        3 · Compound selectors — eight combinations, four tokens
      </text>
      <text class="sc-panel-note">
        Rules keyed on one, two, and all three modifiers over a shared base.
        With everything on, the node carries FOUR class tokens — the count at
        which the retired collapse-and-permute registry silently stopped
        matching. Each rule restates only what it changes, so the base's size
        and centring have to survive underneath all of them.
      </text>
      <view class={triClass()} testID="sc-tri-tile">
        <text class="sc-tri-text">
          {tokenA() && tokenB() && tokenC()
            ? 'three-token rule'
            : `${tokenCount()} modifier(s)`}
        </text>
      </view>
      <text class="sc-readout" testID="sc-tri-readout">
        {triClass()}
      </text>
      <Toggle
        testID="sc-tri-a-toggle"
        label=".sc-t-a · lime ring"
        active={tokenA()}
        onToggle={() => setTokenA(current => !current)}
      />
      <Toggle
        testID="sc-tri-b-toggle"
        label=".sc-t-b · blue fill"
        active={tokenB()}
        onToggle={() => setTokenB(current => !current)}
      />
      <Toggle
        testID="sc-tri-c-toggle"
        label=".sc-t-c · round"
        active={tokenC()}
        onToggle={() => setTokenC(current => !current)}
      />
    </view>
  );
}
