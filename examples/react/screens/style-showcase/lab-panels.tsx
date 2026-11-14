import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  RootTagContext,
  getComputedVariable,
  matchMedia,
  setVariable,
  type IHostInstance,
  type ISymbioteEvent,
} from '@symbiote-native/react';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

// The device lab for issue #54: the e2e test reads the text readouts and counts the pixels of the
// swatches, whose colours no other rule of the app uses (StyleShowcase.lab.css)
const WIDE_QUERY = '(min-width: 600px)';
const LANDSCAPE_QUERY = '(orientation: landscape)';
const SCHEME_QUERY = '(prefers-color-scheme: dark)';
const NARROW_WIDTH = 200;
const WIDE_WIDTH = 320;
const ACCENT_NAME = '--lab-accent';
const ACCENT_OVERRIDE = '#ffbe0b';
const PRECEDENCE_NAME = '--lab-prec';
const PRECEDENCE_SURFACE_VALUE = '#f72585';
const NOT_LAID_OUT = '-';

type IMatchState = { matches: boolean; changes: number };

// A list is an external store: its answer and a count of its own `change` events, so a flip that
// never arrives shows as a count that stays put
function createMatchStore(query: string) {
  const list = matchMedia(query);
  let snapshot: IMatchState = { matches: list.matches, changes: 0 };
  return {
    getSnapshot: () => snapshot,
    subscribe: (notify: () => void) => {
      list.onchange = event => {
        snapshot = { matches: event.matches, changes: snapshot.changes + 1 };
        notify();
      };
      if (list.matches !== snapshot.matches) {
        snapshot = { ...snapshot, matches: list.matches };
        notify();
      }
      return () => {
        list.onchange = null;
      };
    },
  };
}

function useWindowQuery(query: string): IMatchState {
  const store = useMemo(() => createMatchStore(query), [query]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function MediaLab() {
  const wide = useWindowQuery(WIDE_QUERY);
  const landscape = useWindowQuery(LANDSCAPE_QUERY);
  const dark = useWindowQuery(SCHEME_QUERY);
  const changes = wide.changes + landscape.changes;

  return (
    <view className="sc-panel">
      <text className="sc-panel-title">
        10 · Device lab: @media, matchMedia
      </text>
      <text className="sc-tile-label">WINDOW 600 WIDE · ORIENTATION</text>
      <view className="lab-row">
        <view className="lab-media-swatch" testID="lab-media-swatch" />
        <text className="lab-readout" testID="lab-media-readout">
          {`wide=${wide.matches} landscape=${landscape.matches} changes=${changes}`}
        </text>
      </view>
      <text className="sc-tile-caption">
        Rose in a narrow window, teal from 600 wide. The readout comes from
        matchMedia and counts its change events.
      </text>
      <text className="sc-tile-label">COLOR SCHEME OF THE DEVICE</text>
      <view className="lab-row">
        <view className="lab-scheme-swatch" testID="lab-scheme-swatch" />
        <text className="lab-readout" testID="lab-scheme-readout">
          {`dark=${dark.matches} changes=${dark.changes}`}
        </text>
      </view>
      <text className="sc-tile-caption">
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

type IWidthToggleProps = { width: number; onChange: (width: number) => void };

// Kept apart so the panel below reads as markup, with no derived value held across it
function WidthToggle({ width, onChange }: IWidthToggleProps) {
  const isWide = width === WIDE_WIDTH;
  return (
    <ActionButton
      testID="lab-container-toggle"
      title={isWide ? 'Narrow the container' : 'Widen the container'}
      color={LINE_COLOR.styling}
      onPress={() => onChange(isWide ? NARROW_WIDTH : WIDE_WIDTH)}
    />
  );
}

export function ContainerLab() {
  const [width, setWidth] = useState(NARROW_WIDTH);
  const [laidOut, setLaidOut] = useState(NOT_LAID_OUT);

  const onLayout = (event: ISymbioteEvent) => {
    const measured = layoutWidth(event);
    if (measured !== undefined) setLaidOut(String(Math.round(measured)));
  };

  return (
    <view className="sc-panel">
      <text className="sc-panel-title">11 · Device lab: @container</text>
      <text className="sc-tile-label">A BOX THE BUTTON WIDENS PAST 240</text>
      <view
        className="lab-container"
        testID="lab-container"
        style={{ width }}
        onLayout={onLayout}
      >
        <view className="lab-consumer-swatch" />
        <text className="lab-nested-outer">
          <text className="lab-nested-inner">Aa</text>
        </text>
      </view>
      <text className="lab-readout" testID="lab-container-readout">
        {`container=${width} laid-out=${laidOut}`}
      </text>
      <WidthToggle width={width} onChange={setWidth} />
      <text className="sc-tile-label">WIDE FROM THE FIRST FRAME</text>
      <view className="lab-container-first" testID="lab-container-first">
        <view className="lab-first-swatch" />
        <text className="lab-nested-outer">
          <text className="lab-first-nested-inner">Aa</text>
        </text>
      </view>
      <text className="sc-tile-caption">
        Both the swatch and the glyphs of the nested text change colour once the
        container is 240 wide or more. The laid-out width is what the device
        reported, not what the style asked for.
      </text>
      <text className="sc-tile-label">ONE AXIS, AND THE BOX ITSELF</text>
      <view className="lab-axis-box" testID="lab-axis-box">
        <view className="lab-axis-width" />
        <view className="lab-axis-height" />
      </view>
      <text className="sc-tile-caption">
        Only the width query holds in an inline-size container: the first swatch
        changes colour, the second stays put. The box carries a query of its own
        and keeps its colour, since a container never styles itself.
      </text>
    </view>
  );
}

function accentOf(node: IHostInstance | null): string {
  return node === null ? '' : getComputedVariable(node, ACCENT_NAME);
}

// The swatch declares the token itself while the first button is on, and the surface writes its
// own while the second is on. Only the pixels tell which of the two, and :root, the swatch took
function PrecedenceTile() {
  const surface = useContext(RootTagContext);
  const [hasNodeValue, setHasNodeValue] = useState(false);
  const [hasSurfaceValue, setHasSurfaceValue] = useState(false);

  useEffect(() => {
    return () => setVariable(surface, PRECEDENCE_NAME, undefined);
  }, [surface]);

  const onSurface = () => {
    setVariable(
      surface,
      PRECEDENCE_NAME,
      hasSurfaceValue ? undefined : PRECEDENCE_SURFACE_VALUE,
    );
    setHasSurfaceValue(!hasSurfaceValue);
  };

  return (
    <>
      <text className="sc-tile-label">A NODE VALUE, THE SURFACE'S, :root</text>
      <view
        className={
          hasNodeValue ? 'lab-prec-swatch lab-prec-node' : 'lab-prec-swatch'
        }
        testID="lab-prec-swatch"
      />
      <ActionButton
        testID="lab-prec-node-toggle"
        title={hasNodeValue ? 'Drop the node value' : 'Declare on the node'}
        color={LINE_COLOR.styling}
        onPress={() => setHasNodeValue(!hasNodeValue)}
      />
      <ActionButton
        testID="lab-prec-surface-toggle"
        title={
          hasSurfaceValue ? 'Drop the surface value' : 'Write to the surface'
        }
        color={LINE_COLOR.styling}
        onPress={onSurface}
      />
      <text className="sc-tile-caption">
        Cyan from the :root token, pink once the surface writes it, lime once
        the node declares it. Each drop falls back to the next one down.
      </text>
    </>
  );
}

export function VarLab() {
  const surface = useContext(RootTagContext);
  const [swatch, setSwatch] = useState<IHostInstance | null>(null);
  const [isOverridden, setIsOverridden] = useState(false);

  // The write belongs to the surface, so leaving the screen takes it back
  useEffect(() => {
    return () => setVariable(surface, ACCENT_NAME, undefined);
  }, [surface]);

  const onToggle = () => {
    setVariable(
      surface,
      ACCENT_NAME,
      isOverridden ? undefined : ACCENT_OVERRIDE,
    );
    setIsOverridden(!isOverridden);
  };

  return (
    <view className="sc-panel">
      <text className="sc-panel-title">
        12 · Device lab: var(), setVariable
      </text>
      <text className="sc-tile-label">
        A :root TOKEN, THEN THE SURFACE'S OWN
      </text>
      <view className="lab-row">
        <view
          className="lab-var-swatch"
          testID="lab-var-swatch"
          ref={setSwatch}
        />
        <text className="lab-readout" testID="lab-var-readout">
          {`${ACCENT_NAME}=${accentOf(swatch)}`}
        </text>
      </view>
      <ActionButton
        testID="lab-var-toggle"
        title={
          isOverridden ? 'Drop the surface value' : 'Write the surface value'
        }
        color={LINE_COLOR.styling}
        onPress={onToggle}
      />
      <text className="sc-tile-caption">
        The swatch reads var(--lab-accent): violet from the :root token, amber
        once the surface writes its own. The readout is getComputedVariable.
      </text>
      <PrecedenceTile />
    </view>
  );
}
