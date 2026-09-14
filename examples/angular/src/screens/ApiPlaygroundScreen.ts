import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  QueryList,
  TemplateRef,
  ViewChild,
  ViewChildren,
  ViewContainerRef,
  computed,
  effect,
  inject,
  isSignal,
  isWritableSignal,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
  viewChildren,
  type AfterViewInit,
  type EffectRef,
  type Signal,
  type TrackByFunction,
} from '@angular/core';
import {
  AsyncPipe,
  CurrencyPipe,
  DatePipe,
  DecimalPipe,
  I18nPluralPipe,
  I18nSelectPipe,
  JsonPipe,
  KeyValuePipe,
  LowerCasePipe,
  NgClass,
  NgForOf,
  NgIf,
  NgStyle,
  NgSwitch,
  NgSwitchCase,
  NgSwitchDefault,
  NgTemplateOutlet,
  PercentPipe,
  SlicePipe,
  TitleCasePipe,
  UpperCasePipe,
} from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  outputToObservable,
  rxResource,
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { interval, map, timer } from 'rxjs';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  SymbioteHostPropsDirective,
  Text,
  TextInputElement,
  View,
} from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { PlaygroundCard } from '../components/PlaygroundCard';
import { PlaygroundCounterChild } from '../components/PlaygroundCounterChild';
import {
  PlaygroundHostMetaDirective,
  PlaygroundLayoutWatcherDirective,
  PlaygroundQueryItemDirective,
  type IPlaygroundLayoutSize,
} from '../components/PlaygroundDirectives';
import { PlaygroundDiConsumer } from '../components/PlaygroundDI';
import { PlaygroundHostBindingTile } from '../components/PlaygroundHostBindingTile';
import { PlaygroundLifecycleLogger } from '../components/PlaygroundLifecycleLogger';
import { PlaygroundShoutPipe } from '../components/PlaygroundShoutPipe';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
// static look compiled at build time by @symbiote-native/css-parser
import './ApiPlaygroundScreen.css';

type IPlaygroundStatus = 'idle' | 'loading' | 'error';
type IPlaygroundItem = { id: number; label: string };
type IPlaygroundLegacyMode = 'a' | 'b' | 'c';

const PLAYGROUND_ITEMS: readonly IPlaygroundItem[] = [
  { id: 1, label: 'signals' },
  { id: 2, label: 'control flow' },
  { id: 3, label: 'directives' },
];

// Angular's own idiomatic API surface, live, under Symbiote's custom Renderer2 seam. Every
// section below matches a `##` category of .docs/framework-api-surface/angular.md - the
// already-triaged checklist this screen builds against. `@if`/`@for`/`@switch` and the
// [style]/[class] change-detection gotcha are proven elsewhere already (every other screen,
// ReactiveStyleScreen.ts respectively); this screen covers the rest of the surface a working
// Angular developer reaches for day-to-day: signals beyond the basics, DI provider recipes,
// every lifecycle hook, pipes, and the legacy-but-still-real directive forms.
@Component({
  selector: 'ApiPlaygroundScreen',
  standalone: true,
  imports: [
    ActionButton,
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FormsModule,
    I18nPluralPipe,
    I18nSelectPipe,
    JsonPipe,
    KeyValuePipe,
    LowerCasePipe,
    NgClass,
    NgForOf,
    NgIf,
    NgStyle,
    NgSwitch,
    NgSwitchCase,
    NgSwitchDefault,
    NgTemplateOutlet,
    PercentPipe,
    PlaygroundCard,
    PlaygroundCounterChild,
    PlaygroundDiConsumer,
    PlaygroundHostBindingTile,
    PlaygroundHostMetaDirective,
    PlaygroundLayoutWatcherDirective,
    PlaygroundLifecycleLogger,
    PlaygroundQueryItemDirective,
    PlaygroundShoutPipe,
    SafeAreaViewElement,
    ScrollViewElement,
    SlicePipe,
    SymbioteHostPropsDirective,
    Text,
    TextInputElement,
    TitleCasePipe,
    UpperCasePipe,
    View,
  ],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="pg-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">AP</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">API Playground</text>
            <text class="hero-body">
              Angular's own idiomatic surface - signals, control flow, DI,
              lifecycle, pipes - live on Symbiote's custom Renderer2 seam.
            </text>
          </view>
        </view>

        <!-- ================= Signals — core ================= -->
        <text class="section-label">Signals — core</text>
        <view class="section-nested">
          <text class="pg-subsection-label"
            >signal() / effect() / untracked() / EffectRef</text
          >
          <text testID="pg-effect-log" class="info-text">{{
            'effect log: ' + effectLog().join(' | ')
          }}</text>
          <view class="row">
            <ActionButton
              testID="pg-ping-tracked"
              title="ping tracked"
              color="#dd0031"
              (press)="pingTracked()"
            ></ActionButton>
            <ActionButton
              testID="pg-ping-untracked"
              title="ping untracked"
              color="#5ec8f2"
              (press)="pingUntrackedSilently()"
            ></ActionButton>
            <ActionButton
              testID="pg-destroy-effect"
              title="destroy effect"
              color="#8fa3c4"
              (press)="destroyPingEffect()"
            ></ActionButton>
          </view>

          <text class="pg-subsection-label"
            >custom equal — signal({{ '{' }}x,y{{ '}' }}, {{ '{' }}equal{{
              '}'
            }})</text
          >
          <text testID="pg-point-readout" class="info-text">{{
            'point: ' +
              pointSignal().x +
              ',' +
              pointSignal().y +
              ' · update count: ' +
              pointUpdateCount()
          }}</text>
          <view class="row">
            <ActionButton
              testID="pg-point-equal"
              title="set equal value"
              color="#4fd1a5"
              (press)="setPointEqual()"
            ></ActionButton>
            <ActionButton
              testID="pg-point-different"
              title="set different value"
              color="#f2789a"
              (press)="setPointDifferent()"
            ></ActionButton>
          </view>

          <text class="pg-subsection-label"
            >linkedSignal() — resets on base change, still writable</text
          >
          <text testID="pg-linked-readout" class="info-text">{{
            'base: ' + linkedBase() + ' · linked: ' + linkedDerived()
          }}</text>
          <view class="row">
            <ActionButton
              testID="pg-linked-bump"
              title="bump base"
              color="#dd0031"
              (press)="bumpLinkedBase()"
            ></ActionButton>
            <ActionButton
              testID="pg-linked-override"
              title="manual override"
              color="#5ec8f2"
              (press)="overrideLinkedDerived()"
            ></ActionButton>
          </view>

          <text class="pg-subsection-label"
            >WritableSignal.set/update/asReadonly ·
            isSignal/isWritableSignal</text
          >
          <text testID="pg-manual-counter" class="info-text">{{
            'manualCounter: ' +
              manualCounter() +
              ' · readonly view: ' +
              manualCounterReadonly()
          }}</text>
          <text testID="pg-signal-guards" class="info-text">{{
            signalGuardReadout()
          }}</text>
          <ActionButton
            testID="pg-manual-counter-inc"
            title="increment"
            color="#4fd1a5"
            (press)="incrementManualCounter()"
          ></ActionButton>
        </view>

        <!-- ================= Signals — async data (resource) ================= -->
        <text class="section-label">Signals — async data (resource)</text>
        <view class="section-nested">
          <text testID="pg-resource-readout" class="info-text">{{
            'resource(): status=' +
              userResource.status() +
              ' loading=' +
              userResource.isLoading() +
              ' value=' +
              (userResource.value() ?? '—')
          }}</text>
          <text testID="pg-rxresource-readout" class="info-text">{{
            'rxResource(): status=' +
              userRxResource.status() +
              ' value=' +
              (userRxResource.value() ?? '—')
          }}</text>
          <text testID="pg-resource-cancelled" class="info-text">{{
            'AbortSignal cancellations: ' + cancelledLoads()
          }}</text>
          <view class="row">
            <ActionButton
              testID="pg-resource-reload"
              title="reload next id"
              color="#dd0031"
              (press)="reloadNextUser()"
            ></ActionButton>
            <ActionButton
              testID="pg-resource-burst"
              title="burst reload (cancels)"
              color="#f2789a"
              (press)="burstReloadUsers()"
            ></ActionButton>
          </view>
        </view>

        <!-- ================= Signals — RxJS interop ================= -->
        <text class="section-label">Signals — RxJS interop</text>
        <view class="section-nested">
          <text testID="pg-tosignal-readout" class="info-text">{{
            'toSignal(interval(1s)): ' + rxTick()
          }}</text>
          <text testID="pg-toobservable-readout" class="info-text">{{
            'toObservable(manualCounter) log: ' + toObservableLog().join(', ')
          }}</text>
          <text testID="pg-outputtoobservable-readout" class="info-text">{{
            'outputToObservable(counterChild.reset) log: ' +
              outputToObservableLog().join(', ')
          }}</text>
        </view>

        <!-- ================= Signals — inputs, models, outputs ================= -->
        <text class="section-label">Signals — inputs, models, outputs</text>
        <view class="section-nested">
          <text class="pg-subsection-label"
            >input.required() · input(transform) · model() · output() ·
            outputFromObservable()</text
          >
          <PlaygroundCounterChild
            label="Counter"
            step="2"
            [(count)]="counterValue"
            (reset)="onCounterReset()"
            (incremented)="onCounterIncremented($event)"
          ></PlaygroundCounterChild>
          <text testID="pg-counter-parent-readout" class="info-text">{{
            'parent-side count: ' +
              counterValue() +
              ' · resets: ' +
              counterResetCount() +
              ' · last incremented: ' +
              (lastIncrementedValue() ?? '—')
          }}</text>
          <text class="rstyle-caption"
            >model() (non-required) is the same mechanism as model.required()
            above, minus the compile-time-required initial binding.</text
          >
        </view>

        <!-- ================= Template control flow ================= -->
        <text class="section-label">Template control flow</text>
        <view class="section-nested">
          <text class="pg-subsection-label"
            >&#64;if / &#64;else if / &#64;else</text
          >
          <text testID="pg-if-readout" class="info-text">
            @if (score() > 66) {
              High ({{ score() }})
            } @else if (score() > 33) {
              Medium ({{ score() }})
            } @else {
              Low ({{ score() }})
            }
          </text>
          <ActionButton
            testID="pg-score-bump"
            title="bump score"
            color="#dd0031"
            (press)="bumpScore()"
          ></ActionButton>

          <text class="pg-subsection-label"
            >&#64;switch / &#64;case / &#64;default never · &#64;let</text
          >
          @let currentStatus = status();
          <view testID="pg-switch-readout" class="row">
            @switch (currentStatus) {
              @case ('idle') {
                <text class="info-text">switch: idle</text>
              }
              @case ('loading') {
                <text class="info-text">switch: loading…</text>
              }
              @case ('error') {
                <text class="info-text">switch: error</text>
              }
              @default never;
            }
          </view>
          <text testID="pg-switch-ts-readout" class="rstyle-caption">{{
            'describeStatus() — TS-level exhaustiveness twin: ' +
              describeStatus(currentStatus)
          }}</text>
          <ActionButton
            testID="pg-status-cycle"
            title="cycle status"
            color="#5ec8f2"
            (press)="cycleStatus()"
          ></ActionButton>

          <text class="pg-subsection-label"
            >&#64;for + $index/$first/$last/$even/$odd/$count · &#64;empty</text
          >
          @for (
            item of filteredItems();
            track item.id;
            let idx = $index;
            let isFirst = $first;
            let isLast = $last;
            let isEven = $even;
            let total = $count
          ) {
            <text class="list-row-text">{{
              idx +
                '/' +
                total +
                ' ' +
                item.label +
                (isFirst ? ' first' : '') +
                (isLast ? ' last' : '') +
                (isEven ? ' even' : ' odd')
            }}</text>
          } @empty {
            <text testID="pg-for-empty" class="list-row-text"
              >no items match the filter</text
            >
          }
          <ActionButton
            testID="pg-items-filter"
            title="toggle filter (proves @empty)"
            color="#4fd1a5"
            (press)="toggleItemsFilter()"
          ></ActionButton>

          <text class="pg-skip-note"
            >&#64;defer is deliberately skipped here (2026-08-17) — its payoff
            is shrinking a browser's pre-paint download, and a Symbiote app
            ships its whole Hermes bytecode bundle at install time, so the
            motivating use case doesn't transfer. See
            .docs/framework-api-surface/angular.md.</text
          >
        </view>

        <!-- ================= Structural / attribute directives ================= -->
        <text class="section-label">Structural / attribute directives</text>
        <view class="section-nested">
          <text class="pg-subsection-label"
            >*ngIf / *ngFor / [ngSwitch] (legacy — superseded by
            &#64;if/&#64;for/&#64;switch)</text
          >
          <text *ngIf="legacyVisible" testID="pg-legacy-ngif" class="info-text"
            >*ngIf (legacy): visible</text
          >
          <text
            *ngFor="let tag of legacyTags; trackBy: trackTag"
            class="list-row-text"
            >{{ '*ngFor (legacy): ' + tag }}</text
          >
          <view [ngSwitch]="legacyMode" class="row">
            <text *ngSwitchCase="'a'" class="info-text"
              >ngSwitchCase (legacy): a</text
            >
            <text *ngSwitchCase="'b'" class="info-text"
              >ngSwitchCase (legacy): b</text
            >
            <text *ngSwitchDefault class="info-text"
              >ngSwitchDefault (legacy)</text
            >
          </view>
          <view class="row">
            <ActionButton
              testID="pg-legacy-toggle"
              title="toggle *ngIf"
              color="#dd0031"
              (press)="toggleLegacyVisible()"
            ></ActionButton>
            <ActionButton
              testID="pg-legacy-mode-cycle"
              title="cycle ngSwitch"
              color="#5ec8f2"
              (press)="cycleLegacyMode()"
            ></ActionButton>
          </view>

          <text class="pg-subsection-label"
            >[ngClass] · [ngStyle] · [(ngModel)]</text
          >
          <view
            [ngClass]="{ 'pg-swatch': true, 'pg-hb-active': legacyVisible }"
            testID="pg-ngclass"
          ></view>
          <view
            [ngStyle]="{
              borderColor: legacyVisible ? '#3d8bd9' : '#41506a',
              borderWidth: 2,
            }"
            class="pg-swatch"
            testID="pg-ngstyle"
          ></view>
          <text-input
            testID="pg-ngmodel"
            placeholder="type here"
            [(ngModel)]="ngModelValue"
            class="text-input"
          ></text-input>
          <text testID="pg-ngmodel-readout" class="info-text">{{
            'ngModel value: ' + ngModelValue
          }}</text>

          <text class="pg-subsection-label"
            >[ngTemplateOutlet] + context · ngProjectAs</text
          >
          <ng-template #greetTpl let-name="name">
            <text testID="pg-templateoutlet" class="info-text">{{
              'templateOutlet says hi to ' + name
            }}</text>
          </ng-template>
          <ng-container
            *ngTemplateOutlet="greetTpl; context: { name: 'Angular' }"
          ></ng-container>

          <PlaygroundCard testID="pg-card-demo">
            <view card-header class="pg-row">
              <text class="section-label"
                >Card header (ngProjectAs-eligible slot)</text
              >
            </view>
            <view playgroundQueryItem label="card body item" class="pg-row">
              <text class="info-text"
                >default-slot body — also a content-projected query target</text
              >
            </view>
          </PlaygroundCard>

          <text class="pg-subsection-label"
            >Custom @Directive · exportAs · hostDirectives</text
          >
          <view
            #qi="queryItem"
            playgroundQueryItem
            label="ref demo"
            testID="pg-queryitem-ref"
            class="pg-row"
          >
            <text class="info-text">{{ 'exportAs + #ref: ' + qi.label }}</text>
          </view>
          <PlaygroundHostBindingTile
            testID="pg-hostbinding"
            tileLabel="HostBinding"
          ></PlaygroundHostBindingTile>
        </view>

        <!-- ================= Data binding & queries ================= -->
        <text class="section-label">Data binding & queries</text>
        <view class="section-nested">
          <text class="rstyle-caption"
            >Property binding, event binding, interpolation and two-way binding
            are used throughout this screen already. The full class=/[style]
            change-detection regression matrix lives on the "Reactive style"
            screen.</text
          >

          <text class="pg-subsection-label"
            >[attr.x] — undeclared prop trap → [symbioteHostProps]</text
          >
          @for (row of attrDemoRows; track row) {
            <view [symbioteHostProps]="attrRowProps(row)" class="pg-row">
              <text class="info-text">{{
                'row bound via symbioteHostProps: ' + row
              }}</text>
            </view>
          }

          <text class="pg-subsection-label">[class.x] · [style.x.px]</text>
          <view
            [class.pg-hb-active]="styleDotActive()"
            testID="pg-classdot"
            class="pg-swatch"
          ></view>
          <view
            [style.borderWidth.px]="styleDotActive() ? 4 : 1"
            class="pg-swatch"
            testID="pg-styledot"
          ></view>
          <ActionButton
            testID="pg-styledot-toggle"
            title="toggle"
            color="#4fd1a5"
            (press)="toggleStyleDot()"
          ></ActionButton>

          <text class="pg-subsection-label"
            >#ref template variable · @ViewChild/@ViewChildren +
            viewChild()/viewChildren()</text
          >
          <view class="row">
            <view
              playgroundQueryItem
              label="tile A"
              testID="pg-query-a"
              class="pg-swatch"
            ></view>
            <view
              playgroundQueryItem
              label="tile B"
              testID="pg-query-b"
              class="pg-swatch"
            ></view>
            <view
              playgroundQueryItem
              label="tile C"
              testID="pg-query-c"
              class="pg-swatch"
            ></view>
          </view>
          <text testID="pg-query-readout" class="info-text">{{
            queryReadout
          }}</text>
          <text class="rstyle-caption"
            >@ContentChild/@ContentChildren + contentChild()/contentChildren()
            live inside the "PlaygroundCard" above, querying its projected
            content.</text
          >
        </view>

        <!-- ================= Content projection ================= -->
        <text class="section-label">Content projection</text>
        <view class="section-nested">
          <text class="pg-subsection-label"
            >ViewContainerRef.createEmbeddedView(TemplateRef, context)</text
          >
          <ng-template #embeddedTpl let-value="value">
            <text testID="pg-embedded-view" class="info-text">{{
              'embedded view: ' + value
            }}</text>
          </ng-template>
          <ng-container #embeddedAnchor></ng-container>
          <ActionButton
            testID="pg-embedded-mount"
            title="mount embedded view"
            color="#dd0031"
            (press)="mountEmbeddedView()"
          ></ActionButton>
        </view>

        <!-- ================= Component decorators ================= -->
        <text class="section-label">Component decorators</text>
        <view class="section-nested">
          <text class="rstyle-caption"
            >@Component/standalone/@Directive/@Pipe are exercised by every
            screen and every component this section already uses.
            ViewEncapsulation has no effect here — this project's own build-time
            class registry replaces it (symbiote-sfc-style-compiler skill);
            CUSTOM_ELEMENTS_SCHEMA is already load-bearing infrastructure, see
            Button.ts.</text
          >
          <text class="pg-subsection-label"
            >@Input()/@Output() (legacy decorators, still real)</text
          >
          <ActionButton
            testID="pg-legacy-io"
            title="legacy @Input()/@Output()"
            color="#5ec8f2"
            (press)="pingTracked()"
          ></ActionButton>

          <text class="pg-subsection-label"
            >@HostBinding — see "Custom @Directive" tile above</text
          >

          <text class="pg-subsection-label"
            >@HostListener('layout') · host: {{ '{' }} (layout): ...
            {{ '}' }}</text
          >
          <view
            playgroundLayoutWatcher
            (playgroundLayout)="onPlaygroundLayout($event)"
            testID="pg-layout-watcher"
            class="pg-swatch"
          ></view>
          <text testID="pg-layout-readout" class="info-text">{{
            'layout: ' + layoutReadout
          }}</text>
          <view
            #hm="hostMeta"
            playgroundHostMeta
            testID="pg-hostmeta"
            class="pg-swatch"
          ></view>
          <text testID="pg-hostmeta-readout" class="info-text">{{
            'host: metadata active: ' + hm.active
          }}</text>

          <text class="pg-subsection-label"
            >@NgModule (legacy) + importProvidersFrom — see Dependency injection
            below</text
          >
        </view>

        <!-- ================= Dependency injection ================= -->
        <text class="section-label">Dependency injection</text>
        <view class="section-nested">
          <text class="rstyle-caption"
            >@Injectable(providedIn:'root') · inject() · InjectionToken ·
            provider recipes (useValue/useClass/useExisting/useFactory+deps,
            multi) · @Self()/@SkipSelf()/@Optional() (via inject()'s
            InjectOptions — see PlaygroundDI.ts for why not the
            parameter-decorator form) · EnvironmentInjector/Injector.create() ·
            runInInjectionContext() — all resolved below.</text
          >
          <PlaygroundDiConsumer></PlaygroundDiConsumer>
          <text class="pg-skip-note"
            >HostAttributeToken is skipped (2026-08-17) — too niche for this
            pass; it reads a static template attribute via compiler metadata
            rather than a live DOM read, so it likely works unmodified but that
            stays unconfirmed. bootstrapApplication() / ApplicationConfig are
            not applicable — angular-adapter §2's DOM-less bootstrap uses
            createEnvironmentInjector directly.
            provideZonelessChangeDetection()'s EFFECT is achieved via the
            private ɵprovideZonelessChangeDetectionInternal() +
            INJECTOR_SCOPE:'root' (angular-adapter-change-detection §3), not the
            public call itself. importProvidersFrom(@NgModule) (PlaygroundDI.ts)
            compiles and type-checks but has nowhere to resolve into — neither
            Injector.create() nor anything else in this bootstrap accepts
            EnvironmentProviders, so it stays a type-level proof, not a live
            readout.</text
          >
        </view>

        <!-- ================= Lifecycle hooks ================= -->
        <text class="section-label">Lifecycle hooks</text>
        <view class="section-nested">
          <text testID="pg-lifecycle-log" class="info-text">{{
            'log: ' + lifecycleLog().join(' → ')
          }}</text>
          <view class="row">
            <ActionButton
              testID="pg-lifecycle-tick"
              title="bump tick (ngOnChanges)"
              color="#dd0031"
              (press)="bumpLifecycleTick()"
            ></ActionButton>
            <ActionButton
              testID="pg-lifecycle-toggle"
              [title]="showLifecycleLogger ? 'destroy (ngOnDestroy)' : 'mount'"
              color="#5ec8f2"
              (press)="toggleLifecycleLogger()"
            ></ActionButton>
          </view>
          @if (showLifecycleLogger) {
            <PlaygroundLifecycleLogger
              [tick]="lifecycleTick"
              (hookFired)="onLifecycleHookFired($event)"
            >
              <text class="info-text"
                >projected content — triggers ngAfterContentInit/Checked</text
              >
            </PlaygroundLifecycleLogger>
          }
          <text class="pg-skip-note"
            >afterNextRender/afterEveryRender/afterRenderEffect are skipped
            (2026-08-17) — their own framing is "run after the DOM paints",
            which this DOM-less bootstrap has no equivalent of. This project's
            real answer to "run after the native commit" is whenCommitted(node,
            action) (core/engine/src/post-commit.ts,
            angular-adapter-change-detection §1) — already load-bearing for the
            native-driver Animated and sticky-header attach paths.</text
          >
        </view>

        <!-- ================= Pipes ================= -->
        <text class="section-label">Pipes</text>
        <view class="section-nested">
          <text testID="pg-pipe-async" class="info-text">{{
            'async: ' + (pipeGalleryAsync$ | async)
          }}</text>
          <text testID="pg-pipe-date" class="info-text">{{
            'date: ' + (pipeGalleryDate | date: 'short')
          }}</text>
          <text testID="pg-pipe-currency" class="info-text">{{
            'currency: ' + (pipeGalleryAmount | currency: 'USD')
          }}</text>
          <text testID="pg-pipe-number" class="info-text">{{
            'number: ' + (pipeGalleryAmount | number: '1.2-2')
          }}</text>
          <text testID="pg-pipe-percent" class="info-text">{{
            'percent: ' + (pipeGalleryPercent | percent)
          }}</text>
          <text testID="pg-pipe-json" class="info-text">{{
            'json: ' + (pipeGalleryJson | json)
          }}</text>
          <text testID="pg-pipe-case" class="info-text">{{
            (pipeGalleryText | uppercase) +
              ' · ' +
              (pipeGalleryText | lowercase) +
              ' · ' +
              (pipeGalleryText | titlecase)
          }}</text>
          <text testID="pg-pipe-slice" class="info-text">{{
            'slice(1,3): ' + (pipeGallerySlice | slice: 1 : 3)
          }}</text>
          @for (pair of pipeGalleryMap | keyvalue; track pair.key) {
            <text class="list-row-text">{{
              'keyvalue: ' + pair.key + ' → ' + pair.value
            }}</text>
          }
          <text testID="pg-pipe-plural" class="info-text">{{
            'i18nPlural: ' +
              (pipeGalleryPluralCount | i18nPlural: pipeGalleryPluralMapping)
          }}</text>
          <text testID="pg-pipe-select" class="info-text">{{
            'i18nSelect: ' +
              (pipeGallerySelectValue | i18nSelect: pipeGallerySelectMapping)
          }}</text>
          <text testID="pg-pipe-custom" class="info-text">{{
            'custom @Pipe: ' + (pipeGalleryText | playgroundShout: 2)
          }}</text>
          <text class="rstyle-caption"
            >CommonModule aggregates every built-in pipe above; this screen
            imports each one individually, matching the project's
            standalone-by-default convention.</text
          >
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class ApiPlaygroundScreen implements AfterViewInit {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.primitives };

  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  // ---- Signals — core primitives -----------------------------------------------------------
  readonly trackedPing = signal(0);
  readonly untrackedPing = signal(0);
  readonly effectLog = signal<string[]>([]);

  // effect(): re-runs whenever a TRACKED signal it reads changes. untracked(): reads a signal
  // without registering it as a dependency - pinging untrackedPing alone never adds a log line.
  // onCleanup + CreateEffectOptions' debugName are both exercised even though there is nothing
  // to tear down here.
  readonly pingEffectRef: EffectRef = effect(
    onCleanup => {
      const tracked = this.trackedPing();
      const silent = untracked(() => this.untrackedPing());
      this.effectLog.update(log => [
        ...log.slice(-4),
        `tracked=${tracked} untracked=${silent}`,
      ]);
      onCleanup(() => {});
    },
    { debugName: 'playgroundPingEffect' },
  );

  // Custom `equal`: a structurally-equal point never re-notifies; only a real coordinate change
  // does - pointUpdateCount only increments on the latter.
  readonly pointSignal = signal(
    { x: 0, y: 0 },
    { equal: (a, b) => a.x === b.x && a.y === b.y },
  );
  readonly pointUpdateCount = signal(0);
  private readonly pointEffectRef = effect(() => {
    this.pointSignal();
    untracked(() => this.pointUpdateCount.update(count => count + 1));
  });

  // linkedSignal(): resets to the computation whenever `linkedBase` changes, but `.set()` can
  // still manually override it in between resets - the one property plain computed() lacks.
  readonly linkedBase = signal(10);
  readonly linkedDerived = linkedSignal(() => this.linkedBase() * 2);

  readonly manualCounter = signal(0);
  // WritableSignal.asReadonly(): a read-only VIEW of the same signal, no deep-mutation guard.
  readonly manualCounterReadonly: Signal<number> =
    this.manualCounter.asReadonly();

  readonly signalGuardReadout = computed(
    () =>
      `isSignal=${isSignal(this.manualCounterReadonly)} · ` +
      `isWritableSignal(writable)=${isWritableSignal(this.manualCounter)} · ` +
      `isWritableSignal(readonly)=${isWritableSignal(this.manualCounterReadonly)}`,
  );

  pingTracked(): void {
    this.trackedPing.update(value => value + 1);
  }

  pingUntrackedSilently(): void {
    this.untrackedPing.update(value => value + 1);
  }

  destroyPingEffect(): void {
    this.pingEffectRef.destroy();
  }

  setPointEqual(): void {
    this.pointSignal.set({ x: this.pointSignal().x, y: this.pointSignal().y });
  }

  setPointDifferent(): void {
    this.pointSignal.update(point => ({ x: point.x + 1, y: point.y }));
  }

  bumpLinkedBase(): void {
    this.linkedBase.update(value => value + 1);
  }

  overrideLinkedDerived(): void {
    this.linkedDerived.set(999);
  }

  incrementManualCounter(): void {
    this.manualCounter.update(value => value + 1);
  }

  // ---- Signals — async data (resource) -----------------------------------------------------
  readonly userId = signal(1);
  readonly cancelledLoads = signal(0);

  // resource(): a reactive `params` computation feeding an async `loader`; value()/status()/
  // isLoading() are all signals. AbortSignal cancellation: bursting userId forward cancels every
  // in-flight load but the last.
  readonly userResource = resource({
    params: () => ({ id: this.userId() }),
    loader: async ({ params, abortSignal }) =>
      new Promise<string>((resolve, reject) => {
        const timeoutId = setTimeout(() => resolve(`user #${params.id}`), 400);
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          this.cancelledLoads.update(count => count + 1);
          reject(new DOMException('cancelled', 'AbortError'));
        });
      }),
  });

  // rxResource(): same reactive `params`, but the loader is an RxJS `stream` instead of an
  // async function.
  readonly userRxResource = rxResource({
    params: () => ({ id: this.userId() }),
    stream: ({ params }) =>
      timer(400).pipe(map(() => `user #${params.id} (rx)`)),
  });

  reloadNextUser(): void {
    this.userId.update(id => id + 1);
  }

  burstReloadUsers(): void {
    this.userId.update(id => id + 1);
    setTimeout(() => this.userId.update(id => id + 1), 40);
    setTimeout(() => this.userId.update(id => id + 1), 80);
  }

  // ---- Signals — RxJS interop ------------------------------------------------------------
  // toSignal(): an Observable read as a Signal.
  readonly rxTick = toSignal(interval(1000), { initialValue: -1 });

  readonly toObservableLog = signal<number[]>([]);
  readonly outputToObservableLog = signal<number[]>([]);

  constructor() {
    // toObservable(): the inverse direction - a Signal read as an Observable, subscribed here.
    // takeUntilDestroyed(this.destroyRef) (not the injection-context-only zero-arg form, since
    // ngAfterViewInit below is not one) unsubscribes when this screen is popped off the stack.
    const manualCounter$ = toObservable(this.manualCounter);
    manualCounter$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.toObservableLog.update(log => [...log.slice(-4), value]);
      });
  }

  // ---- Signals — inputs, models, outputs (component API) --------------------------------
  // model(): a writable model signal bound two-way via [(count)] below - PlaygroundCounterChild
  // reads/writes it, and this screen reads it back the same way.
  readonly counterValue = signal(5);
  readonly counterResetCount = signal(0);
  readonly lastIncrementedValue = signal<number | undefined>(undefined);

  @ViewChild(PlaygroundCounterChild)
  private counterChild?: PlaygroundCounterChild;

  onCounterReset(): void {
    this.counterResetCount.update(count => count + 1);
  }

  onCounterIncremented(value: number): void {
    this.lastIncrementedValue.set(value);
  }

  // ---- Template control flow ---------------------------------------------------------------
  readonly score = signal(50);
  readonly status = signal<IPlaygroundStatus>('idle');
  readonly items = signal(PLAYGROUND_ITEMS);
  readonly itemsFilterActive = signal(false);
  readonly filteredItems = computed(() =>
    this.itemsFilterActive() ? [] : this.items(),
  );

  bumpScore(): void {
    this.score.update(value => (value >= 100 ? 0 : value + 25));
  }

  cycleStatus(): void {
    const order: readonly IPlaygroundStatus[] = ['idle', 'loading', 'error'];
    const nextIndex = (order.indexOf(this.status()) + 1) % order.length;
    this.status.set(order[nextIndex]);
  }

  toggleItemsFilter(): void {
    this.itemsFilterActive.update(active => !active);
  }

  // @default never (in the template above): exhaustive over IPlaygroundStatus's exact 3
  // members - this TS-level twin proves the same exhaustiveness at the type level, since
  // `describeStatus` has no `default` branch and still compiles.
  describeStatus(status: IPlaygroundStatus): string {
    switch (status) {
      case 'idle':
        return 'idle';
      case 'loading':
        return 'loading…';
      case 'error':
        return 'error';
    }
  }

  // ---- Structural / attribute directives (legacy + built-in) -----------------------------
  legacyVisible = true;
  readonly legacyTags: readonly string[] = ['alpha', 'beta', 'gamma'];
  legacyMode: IPlaygroundLegacyMode = 'a';
  ngModelValue = 'edit me';

  // TrackByFunction<T>: the type *ngFor's legacy `trackBy` expects.
  readonly trackTag: TrackByFunction<string> = (_index, tag) => tag;

  toggleLegacyVisible(): void {
    this.legacyVisible = !this.legacyVisible;
  }

  cycleLegacyMode(): void {
    const order: readonly IPlaygroundLegacyMode[] = ['a', 'b', 'c'];
    const nextIndex = (order.indexOf(this.legacyMode) + 1) % order.length;
    this.legacyMode = order[nextIndex];
  }

  // ---- Data binding & queries ---------------------------------------------------------------
  readonly attrDemoRows: readonly number[] = [0, 1, 2];
  readonly styleDotActive = signal(false);

  attrRowProps(row: number): { testID: string } {
    return { testID: `pg-attr-row-${row}` };
  }

  toggleStyleDot(): void {
    this.styleDotActive.update(active => !active);
  }

  // View-local half of the query section - @ContentChild/@ContentChildren/contentChild()/
  // contentChildren() live on PlaygroundCard instead, querying PROJECTED content.
  @ViewChild(PlaygroundQueryItemDirective)
  private firstQueryItem?: PlaygroundQueryItemDirective;
  @ViewChildren(PlaygroundQueryItemDirective)
  private allQueryItems?: QueryList<PlaygroundQueryItemDirective>;
  readonly firstQueryItemSignal = viewChild(PlaygroundQueryItemDirective);
  readonly allQueryItemsSignal = viewChildren(PlaygroundQueryItemDirective);

  get queryReadout(): string {
    const decoratorCount = this.allQueryItems?.length ?? 0;
    const decoratorFirst = this.firstQueryItem?.label ?? '—';
    return (
      `decorator: ${decoratorCount} (first: ${decoratorFirst}) · ` +
      `signal: ${this.allQueryItemsSignal().length} (first: ${this.firstQueryItemSignal()?.label ?? '—'})`
    );
  }

  // ---- Content projection ---------------------------------------------------------------
  @ViewChild('embeddedAnchor', { read: ViewContainerRef })
  private embeddedAnchor?: ViewContainerRef;
  @ViewChild('embeddedTpl') private embeddedTpl?: TemplateRef<{
    value: string;
  }>;
  private embeddedViewMounts = 0;

  mountEmbeddedView(): void {
    if (this.embeddedAnchor === undefined || this.embeddedTpl === undefined)
      return;
    this.embeddedViewMounts += 1;
    this.embeddedAnchor.clear();
    this.embeddedAnchor.createEmbeddedView(this.embeddedTpl, {
      value: `mount #${this.embeddedViewMounts}`,
    });
  }

  // ---- Component decorators — @HostListener / host: metadata ----------------------------
  readonly layoutSize = signal<IPlaygroundLayoutSize | undefined>(undefined);

  onPlaygroundLayout(size: IPlaygroundLayoutSize): void {
    this.layoutSize.set(size);
  }

  get layoutReadout(): string {
    const size = this.layoutSize();
    return size === undefined ? 'measuring…' : `${size.width}×${size.height}`;
  }

  // ---- Lifecycle hooks --------------------------------------------------------------------
  showLifecycleLogger = true;
  lifecycleTick = 0;
  readonly lifecycleLog = signal<string[]>([]);

  onLifecycleHookFired(hookName: string): void {
    this.lifecycleLog.update(log => [...log.slice(-9), hookName]);
  }

  bumpLifecycleTick(): void {
    this.lifecycleTick += 1;
  }

  toggleLifecycleLogger(): void {
    this.showLifecycleLogger = !this.showLifecycleLogger;
  }

  // ---- Pipes — gallery --------------------------------------------------------------------
  readonly pipeGalleryDate = new Date(2026, 0, 1, 9, 30);
  readonly pipeGalleryAmount = 1234.5;
  readonly pipeGalleryPercent = 0.42;
  readonly pipeGalleryJson = { framework: 'angular', renderer: 'symbiote' };
  readonly pipeGalleryText = 'angular playground';
  readonly pipeGallerySlice: readonly number[] = [1, 2, 3, 4, 5];
  readonly pipeGalleryMap: Record<string, string> = {
    red: 'stop',
    green: 'go',
  };
  readonly pipeGalleryPluralCount = 3;
  readonly pipeGalleryPluralMapping: Record<string, string> = {
    '=0': 'no items',
    '=1': 'one item',
    other: '# items',
  };
  readonly pipeGallerySelectValue = 'cat';
  readonly pipeGallerySelectMapping: Record<string, string> = {
    cat: 'Meow',
    dog: 'Woof',
    other: '…',
  };
  readonly pipeGalleryAsync$ = interval(1000);

  ngAfterViewInit(): void {
    // @ViewChild results only resolve here - force one refresh so the query readouts and the
    // outputToObservable subscription below reflect them (RefApiDemo.ts's own precedent).
    if (this.counterChild !== undefined) {
      const reset$ = outputToObservable(this.counterChild.reset);
      reset$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.outputToObservableLog.update(log => [
          ...log.slice(-4),
          this.counterValue(),
        ]);
      });
    }
    this.changeDetector.detectChanges();
  }
}
