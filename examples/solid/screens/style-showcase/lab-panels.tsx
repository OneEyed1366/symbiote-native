import { createSignal, onCleanup, onMount, useContext } from 'solid-js';
import {
  RootTagContext,
  getComputedVariable,
  matchMedia,
  setVariable,
  type IHostInstance,
  type ISymbioteEvent,
} from '@symbiote-native/solid';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

// The device lab: the e2e test reads the text readouts and counts the pixels of the swatches,
// whose colours no other rule of the app uses (StyleShowcase.lab.css)
const WIDE_QUERY = '(min-width: 600px)';
const LANDSCAPE_QUERY = '(orientation: landscape)';
const SCHEME_QUERY = '(prefers-color-scheme: dark)';
const NARROW_WIDTH = 200;
const WIDE_WIDTH = 320;
const NOT_LAID_OUT = '-';
const ACCENT_NAME = '--lab-accent';
const ACCENT_OVERRIDE = '#ffbe0b';
const PRECEDENCE_NAME = '--lab-prec';
const PRECEDENCE_SURFACE_VALUE = '#f72585';

type IMatchState = { matches: boolean; changes: number };

// The answer of a list and a count of its own `change` events, so a flip that never arrives
// shows as a count that stays put. Listening starts at mount and a flip since the read is
// taken in without counting it, so a fresh mount counts only its own changes
function useWindowQuery(query: string) {
  const list = matchMedia(query);
  const [state, setState] = createSignal<IMatchState>({
    matches: list.matches,
    changes: 0,
  });
  onMount(() => {
    list.onchange = event => {
      setState(previous => ({
        matches: event.matches,
        changes: previous.changes + 1,
      }));
    };
    if (list.matches !== state().matches) {
      setState(previous => ({ ...previous, matches: list.matches }));
    }
  });
  onCleanup(() => {
    list.onchange = null;
  });
  return state;
}

export function MediaLab() {
  const wide = useWindowQuery(WIDE_QUERY);
  const landscape = useWindowQuery(LANDSCAPE_QUERY);
  const dark = useWindowQuery(SCHEME_QUERY);

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">10 · Device lab: @media, matchMedia</text>
      <text class="sc-tile-label">WINDOW 600 WIDE · ORIENTATION</text>
      <view class="lab-row">
        <view class="lab-media-swatch" testID="lab-media-swatch" />
        <text class="lab-readout" testID="lab-media-readout">
          {`wide=${wide().matches} landscape=${landscape().matches} changes=${wide().changes + landscape().changes}`}
        </text>
      </view>
      <text class="sc-tile-caption">
        Rose in a narrow window, teal from 600 wide. The readout comes from
        matchMedia and counts its change events.
      </text>
      <text class="sc-tile-label">COLOR SCHEME OF THE DEVICE</text>
      <view class="lab-row">
        <view class="lab-scheme-swatch" testID="lab-scheme-swatch" />
        <text class="lab-readout" testID="lab-scheme-readout">
          {`dark=${dark().matches} changes=${dark().changes}`}
        </text>
      </view>
      <text class="sc-tile-caption">
        Orange on a light device, indigo on a dark one. Its own change count,
        apart from the window readout above.
      </text>
    </view>
  );
}

// `nativeEvent` is a bag, so the width is narrowed out of it rather than cast
function layoutWidth(event: ISymbioteEvent): number | undefined {
  const layout = event.nativeEvent.layout;
  if (typeof layout !== 'object' || layout === null) return undefined;
  if (!('width' in layout)) return undefined;
  return typeof layout.width === 'number' ? layout.width : undefined;
}

export function ContainerLab() {
  const [width, setWidth] = createSignal(NARROW_WIDTH);
  const [laidOut, setLaidOut] = createSignal(NOT_LAID_OUT);
  const isWide = () => width() === WIDE_WIDTH;

  const onLayout = (event: ISymbioteEvent) => {
    const measured = layoutWidth(event);
    if (measured !== undefined) setLaidOut(String(Math.round(measured)));
  };

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">11 · Device lab: @container</text>
      <text class="sc-tile-label">A BOX THE BUTTON WIDENS PAST 240</text>
      <view
        class="lab-container"
        testID="lab-container"
        style={{ width: width() }}
        onLayout={onLayout}
      >
        <view class="lab-consumer-swatch" />
        <text class="lab-nested-outer">
          <text class="lab-nested-inner">Aa</text>
        </text>
      </view>
      <text class="lab-readout" testID="lab-container-readout">
        {`container=${width()} laid-out=${laidOut()}`}
      </text>
      <ActionButton
        testID="lab-container-toggle"
        title={isWide() ? 'Narrow the container' : 'Widen the container'}
        color={LINE_COLOR.styling}
        onPress={() => setWidth(isWide() ? NARROW_WIDTH : WIDE_WIDTH)}
      />
      <text class="sc-tile-label">WIDE FROM THE FIRST FRAME</text>
      <view class="lab-container-first" testID="lab-container-first">
        <view class="lab-first-swatch" />
        <text class="lab-nested-outer">
          <text class="lab-first-nested-inner">Aa</text>
        </text>
      </view>
      <text class="sc-tile-caption">
        Both the swatch and the glyphs of the nested text change colour once the
        container is 240 wide or more. The laid-out width is what the device
        reported, not what the style asked for.
      </text>
      <text class="sc-tile-label">ONE AXIS, AND THE BOX ITSELF</text>
      <view class="lab-axis-box" testID="lab-axis-box">
        <view class="lab-axis-width" />
        <view class="lab-axis-height" />
      </view>
      <text class="sc-tile-caption">
        Only the width query holds in an inline-size container: the first swatch
        changes colour, the second stays put. The box carries a query of its own
        and keeps its colour, since a container never styles itself.
      </text>
    </view>
  );
}

function accentOf(node: IHostInstance | undefined): string {
  return node === undefined ? '' : getComputedVariable(node, ACCENT_NAME);
}

// The swatch declares the token itself while the first button is on, and the surface writes its
// own while the second is on. Only the pixels tell which of the two, and :root, the swatch took
function PrecedenceTile() {
  const surface = useContext(RootTagContext);
  const [hasNodeValue, setHasNodeValue] = createSignal(false);
  const [hasSurfaceValue, setHasSurfaceValue] = createSignal(false);

  onCleanup(() => setVariable(surface, PRECEDENCE_NAME, undefined));

  const onSurface = () => {
    setVariable(
      surface,
      PRECEDENCE_NAME,
      hasSurfaceValue() ? undefined : PRECEDENCE_SURFACE_VALUE,
    );
    setHasSurfaceValue(!hasSurfaceValue());
  };

  return (
    <>
      <text class="sc-tile-label">A NODE VALUE, THE SURFACE'S, :root</text>
      <view
        class={
          hasNodeValue() ? 'lab-prec-swatch lab-prec-node' : 'lab-prec-swatch'
        }
        testID="lab-prec-swatch"
      />
      <ActionButton
        testID="lab-prec-node-toggle"
        title={hasNodeValue() ? 'Drop the node value' : 'Declare on the node'}
        color={LINE_COLOR.styling}
        onPress={() => setHasNodeValue(!hasNodeValue())}
      />
      <ActionButton
        testID="lab-prec-surface-toggle"
        title={
          hasSurfaceValue() ? 'Drop the surface value' : 'Write to the surface'
        }
        color={LINE_COLOR.styling}
        onPress={onSurface}
      />
      <text class="sc-tile-caption">
        Cyan from the :root token, pink once the surface writes it, lime once
        the node declares it. Each drop falls back to the next one down.
      </text>
    </>
  );
}

export function VarLab() {
  const surface = useContext(RootTagContext);
  const [swatch, setSwatch] = createSignal<IHostInstance>();
  const [accent, setAccent] = createSignal('');
  const [isOverridden, setIsOverridden] = createSignal(false);

  // The write belongs to the surface, so leaving the screen takes it back
  onCleanup(() => setVariable(surface, ACCENT_NAME, undefined));

  // A ref runs before the node is inserted, so the first read waits for the mount
  onMount(() => setAccent(accentOf(swatch())));

  const onToggle = () => {
    setVariable(
      surface,
      ACCENT_NAME,
      isOverridden() ? undefined : ACCENT_OVERRIDE,
    );
    setIsOverridden(!isOverridden());
    setAccent(accentOf(swatch()));
  };

  return (
    <view class="sc-panel">
      <text class="sc-panel-title">12 · Device lab: var(), setVariable</text>
      <text class="sc-tile-label">A :root TOKEN, THEN THE SURFACE'S OWN</text>
      <view class="lab-row">
        <view class="lab-var-swatch" testID="lab-var-swatch" ref={setSwatch} />
        <text class="lab-readout" testID="lab-var-readout">
          {`${ACCENT_NAME}=${accent()}`}
        </text>
      </view>
      <ActionButton
        testID="lab-var-toggle"
        title={
          isOverridden() ? 'Drop the surface value' : 'Write the surface value'
        }
        color={LINE_COLOR.styling}
        onPress={onToggle}
      />
      <text class="sc-tile-caption">
        The swatch reads var(--lab-accent): violet from the :root token, amber
        once the surface writes its own. The readout is getComputedVariable.
      </text>
      <PrecedenceTile />
    </view>
  );
}
