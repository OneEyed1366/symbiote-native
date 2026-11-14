import { Tile } from './parts';

export function LimitsPanel() {
  return (
    <view className="sc-panel">
      <text className="sc-panel-title">
        8 · Limits: dropped, held behind a condition, and one that is wrong
      </text>
      <text className="sc-panel-note">
        The dropped and wrong ones print a warning into the Metro output under
        the [@symbiote-native/css-parser] prefix, naming this file (and, for a
        parse error, line:column). If a tile below misbehaves, that log is where
        the reason is.
      </text>

      <text className="sc-tile-label">
        NO @SUPPORTS · @CONTAINER NEEDS A CONTAINER
      </text>
      <view className="sc-limit-cond" testID="sc-limit-cond">
        <text className="sc-combo-text">must stay slate</text>
      </view>
      <text className="sc-tile-caption">
        @supports is dropped whole, rules included, since React Native has no
        feature query. @container is kept, but it holds only below an ancestor
        with container-type, and this tile has none. Each rule here would
        repaint this tile red. For @supports, branch in JS instead: Platform.
      </text>

      <text className="sc-tile-label">CALC() ACROSS UNIT FAMILIES</text>
      <view className="sc-limit-calc-wrap">
        <view className="sc-limit-calc-ok" testID="sc-limit-calc-ok">
          <text className="sc-limit-calc-text">width: 100% — fine</text>
        </view>
        <view className="sc-limit-calc-bad" testID="sc-limit-calc-bad">
          <text className="sc-limit-calc-text">
            width: calc(100% - 3rem) — dropped
          </text>
        </view>
      </view>
      <text className="sc-tile-caption">
        RN has no unit meaning "a percentage minus points", so the declaration
        is refused rather than approximated — the red box has no width at all
        and shrinks to its text. It used to become width: 100, which RN reads
        as 100 POINTS. Use flex or parent padding; calc() within one unit
        family still evaluates.
      </text>

      <text className="sc-tile-label">THE COMBINATOR — WRONG, NOT MISSING</text>
      <view className="sc-combo-parent" testID="sc-combo-parent">
        <view className="sc-combo-child" testID="sc-combo-nested-child">
          <text className="sc-combo-text">
            nested child · the web paints this red, here it stays plain
          </text>
        </view>
        <view
          className="sc-combo-parent sc-combo-child"
          testID="sc-combo-merged"
        >
          <text className="sc-combo-text">
            both names on ONE node · the web paints nothing, here it goes red
          </text>
        </view>
      </view>
      <text className="sc-tile-caption">
        `.sc-combo-parent .sc-combo-child` keeps only its class tokens, so it
        matches exactly like `.a.b`. A descendant rule therefore never fires
        where it was meant to and does fire where it was not. Give the child
        its own class; never write a descendant, child, or sibling rule.
      </text>

      <text className="sc-tile-label">VAR() ACROSS FILES</text>
      <view className="sc-pair">
        <Tile
          label="LOCAL TOKEN"
          caption="--sc-limit-lime is declared in this sheet"
        >
          <view
            className="sc-limit-var sc-limit-var-local"
            testID="sc-limit-var-local"
          >
            <text className="sc-combo-text">resolves</text>
          </view>
        </Tile>
        <Tile
          label="APP.CSS TOKEN"
          caption="--mist is a :root token of App.css, so the ring takes its colour"
        >
          <view
            className="sc-limit-var sc-limit-var-foreign"
            testID="sc-limit-var-foreign"
          >
            <text className="sc-combo-text">resolves</text>
          </view>
        </Tile>
      </view>
      <text className="sc-tile-caption">
        A `:root` token reaches every sheet through the global table, so a
        var() resolves at run time wherever its token is declared. A token
        nobody declares erases the declaration, as on the web.
      </text>
    </view>
  );
}

export function MediaPanel() {
  return (
    <view className="sc-panel">
      <text className="sc-panel-title">9 · @media — evaluated at runtime</text>
      <text className="sc-tile-label">WINDOW WIDTH AND ORIENTATION</text>
      <view className="sc-media-tile" testID="sc-media-tile">
        <text className="sc-media-text">
          green from 600 wide · amber border in landscape
        </text>
      </view>
      <text className="sc-tile-caption">
        Rotate the device or resize the window: the tile repaints with no
        re-render. Dark mode and the reduced-motion setting flip the same way.
        Query the state from JS with matchMedia.
      </text>
    </view>
  );
}
