import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  type AfterViewInit,
  type Signal,
} from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  getComputedVariable,
  injectRootTag,
  matchMedia,
  setVariable,
  type IHostInstance,
} from '@symbiote-native/angular';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

// The device lab: the e2e test of the react example reads the text readouts and counts the pixels
// of the swatches, whose colours no other rule of the app uses (StyleShowcase.lab.css)
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
// shows as a count that stays put
function windowQuery(
  query: string,
  destroyRef: DestroyRef,
): Signal<IMatchState> {
  const list = matchMedia(query);
  const state = signal<IMatchState>({ matches: list.matches, changes: 0 });
  list.onchange = event => {
    state.update(previous => ({
      matches: event.matches,
      changes: previous.changes + 1,
    }));
  };
  destroyRef.onDestroy(() => {
    list.onchange = null;
  });
  return state;
}

@Component({
  selector: 'ShowcaseMediaLab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="sc-panel">
      <text class="sc-panel-title">10 · Device lab: @media, matchMedia</text>
      <text class="sc-tile-label">WINDOW 600 WIDE · ORIENTATION</text>
      <view class="lab-row">
        <view class="lab-media-swatch" testID="lab-media-swatch"></view>
        <text class="lab-readout" testID="lab-media-readout">{{
          mediaReadout()
        }}</text>
      </view>
      <text class="sc-tile-caption">
        Rose in a narrow window, teal from 600 wide. The readout comes from
        matchMedia and counts its change events.
      </text>
      <text class="sc-tile-label">COLOR SCHEME OF THE DEVICE</text>
      <view class="lab-row">
        <view class="lab-scheme-swatch" testID="lab-scheme-swatch"></view>
        <text class="lab-readout" testID="lab-scheme-readout">{{
          schemeReadout()
        }}</text>
      </view>
      <text class="sc-tile-caption">
        Orange on a light device, indigo on a dark one. Its own change count,
        apart from the window readout above.
      </text>
    </view>
  `,
})
export class ShowcaseMediaLab {
  private readonly destroyRef = inject(DestroyRef);
  private readonly wide = windowQuery(WIDE_QUERY, this.destroyRef);
  private readonly landscape = windowQuery(LANDSCAPE_QUERY, this.destroyRef);
  private readonly dark = windowQuery(SCHEME_QUERY, this.destroyRef);

  readonly mediaReadout = computed(
    () =>
      `wide=${this.wide().matches} landscape=${this.landscape().matches} changes=${this.wide().changes + this.landscape().changes}`,
  );
  readonly schemeReadout = computed(
    () => `dark=${this.dark().matches} changes=${this.dark().changes}`,
  );
}

// `nativeEvent` is a bag, so the width is narrowed out of it rather than cast
function layoutWidth(event: Event): number | undefined {
  const nativeEvent: unknown = Reflect.get(event, 'nativeEvent');
  if (typeof nativeEvent !== 'object' || nativeEvent === null) return undefined;
  const layout: unknown = Reflect.get(nativeEvent, 'layout');
  if (typeof layout !== 'object' || layout === null) return undefined;
  const width: unknown = Reflect.get(layout, 'width');
  return typeof width === 'number' ? width : undefined;
}

@Component({
  selector: 'ShowcaseContainerLab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="sc-panel">
      <text class="sc-panel-title">11 · Device lab: @container</text>
      <text class="sc-tile-label">A BOX THE BUTTON WIDENS PAST 240</text>
      <view
        class="lab-container"
        testID="lab-container"
        [style]="boxStyle()"
        (layout)="onLayout($event)"
      >
        <view class="lab-consumer-swatch"></view>
        <text class="lab-nested-outer">
          <text class="lab-nested-inner">Aa</text>
        </text>
      </view>
      <text class="lab-readout" testID="lab-container-readout">{{
        readout()
      }}</text>
      <ActionButton
        testID="lab-container-toggle"
        [title]="toggleTitle()"
        [color]="accent"
        (press)="onToggle()"
      />
      <text class="sc-tile-label">WIDE FROM THE FIRST FRAME</text>
      <view class="lab-container-first" testID="lab-container-first">
        <view class="lab-first-swatch"></view>
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
        <view class="lab-axis-width"></view>
        <view class="lab-axis-height"></view>
      </view>
      <text class="sc-tile-caption">
        Only the width query holds in an inline-size container: the first swatch
        changes colour, the second stays put. The box carries a query of its own
        and keeps its colour, since a container never styles itself.
      </text>
    </view>
  `,
})
export class ShowcaseContainerLab {
  readonly accent = LINE_COLOR.styling;
  private readonly width = signal(NARROW_WIDTH);
  private readonly laidOut = signal(NOT_LAID_OUT);
  private readonly isWide = computed(() => this.width() === WIDE_WIDTH);

  readonly boxStyle = computed(() => ({ width: this.width() }));
  readonly readout = computed(
    () => `container=${this.width()} laid-out=${this.laidOut()}`,
  );
  readonly toggleTitle = computed(() =>
    this.isWide() ? 'Narrow the container' : 'Widen the container',
  );

  onLayout(event: Event): void {
    const measured = layoutWidth(event);
    if (measured !== undefined) this.laidOut.set(String(Math.round(measured)));
  }

  onToggle(): void {
    this.width.set(this.isWide() ? NARROW_WIDTH : WIDE_WIDTH);
  }
}

// The swatch declares the token itself while the first button is on, and the surface writes its
// own while the second is on. Only the pixels tell which of the two, and :root, the swatch took
@Component({
  selector: 'ShowcasePrecedenceTile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <text class="sc-tile-label">A NODE VALUE, THE SURFACE'S, :root</text>
    <view [class]="swatchClass()" testID="lab-prec-swatch"></view>
    <ActionButton
      testID="lab-prec-node-toggle"
      [title]="nodeTitle()"
      [color]="accent"
      (press)="onNode()"
    />
    <ActionButton
      testID="lab-prec-surface-toggle"
      [title]="surfaceTitle()"
      [color]="accent"
      (press)="onSurface()"
    />
    <text class="sc-tile-caption">
      Cyan from the :root token, pink once the surface writes it, lime once the
      node declares it. Each drop falls back to the next one down.
    </text>
  `,
})
export class ShowcasePrecedenceTile {
  readonly accent = LINE_COLOR.styling;
  private readonly surface = injectRootTag();
  private readonly hasNodeValue = signal(false);
  private readonly hasSurfaceValue = signal(false);

  readonly swatchClass = computed(() =>
    this.hasNodeValue() ? 'lab-prec-swatch lab-prec-node' : 'lab-prec-swatch',
  );
  readonly nodeTitle = computed(() =>
    this.hasNodeValue() ? 'Drop the node value' : 'Declare on the node',
  );
  readonly surfaceTitle = computed(() =>
    this.hasSurfaceValue() ? 'Drop the surface value' : 'Write to the surface',
  );

  constructor() {
    inject(DestroyRef).onDestroy(() =>
      setVariable(this.surface, PRECEDENCE_NAME, undefined),
    );
  }

  onNode(): void {
    this.hasNodeValue.update(current => !current);
  }

  onSurface(): void {
    setVariable(
      this.surface,
      PRECEDENCE_NAME,
      this.hasSurfaceValue() ? undefined : PRECEDENCE_SURFACE_VALUE,
    );
    this.hasSurfaceValue.update(current => !current);
  }
}

@Component({
  selector: 'ShowcaseVarLab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, ShowcasePrecedenceTile, SYMBIOTE_ELEMENTS],
  template: `
    <view class="sc-panel">
      <text class="sc-panel-title">12 · Device lab: var(), setVariable</text>
      <text class="sc-tile-label">A :root TOKEN, THEN THE SURFACE'S OWN</text>
      <view class="lab-row">
        <view #swatch class="lab-var-swatch" testID="lab-var-swatch"></view>
        <text class="lab-readout" testID="lab-var-readout">{{
          readout()
        }}</text>
      </view>
      <ActionButton
        testID="lab-var-toggle"
        [title]="toggleTitle()"
        [color]="accentColor"
        (press)="onToggle()"
      />
      <text class="sc-tile-caption">
        The swatch reads var(--lab-accent): violet from the :root token, amber
        once the surface writes its own. The readout is getComputedVariable.
      </text>
      <ShowcasePrecedenceTile />
    </view>
  `,
})
export class ShowcaseVarLab implements AfterViewInit {
  readonly accentColor = LINE_COLOR.styling;
  private readonly surface = injectRootTag();
  private readonly swatch = viewChild<ElementRef<IHostInstance>>('swatch');
  private readonly accent = signal('');
  private readonly isOverridden = signal(false);

  readonly readout = computed(() => `${ACCENT_NAME}=${this.accent()}`);
  readonly toggleTitle = computed(() =>
    this.isOverridden() ? 'Drop the surface value' : 'Write the surface value',
  );

  constructor() {
    // The write belongs to the surface, so leaving the screen takes it back
    inject(DestroyRef).onDestroy(() =>
      setVariable(this.surface, ACCENT_NAME, undefined),
    );
  }

  ngAfterViewInit(): void {
    this.accent.set(this.accentOf());
  }

  onToggle(): void {
    setVariable(
      this.surface,
      ACCENT_NAME,
      this.isOverridden() ? undefined : ACCENT_OVERRIDE,
    );
    this.isOverridden.update(current => !current);
    this.accent.set(this.accentOf());
  }

  private accentOf(): string {
    const node = this.swatch()?.nativeElement;
    return node === undefined ? '' : getComputedVariable(node, ACCENT_NAME);
  }
}
