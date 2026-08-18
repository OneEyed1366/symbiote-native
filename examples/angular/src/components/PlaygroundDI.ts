import {
  Component,
  DestroyRef,
  EnvironmentInjector,
  Injectable,
  InjectionToken,
  Injector,
  NgModule,
  importProvidersFrom,
  inject,
  runInInjectionContext,
  type EnvironmentProviders,
} from '@angular/core';
import { Text, View } from '@symbiote-native/angular';

export const PLAYGROUND_GREETING_PREFIX = new InjectionToken<string>(
  'PLAYGROUND_GREETING_PREFIX',
  {
    providedIn: 'root',
    factory: () => 'Hello',
  },
);
export const PLAYGROUND_GREETING_TAGS = new InjectionToken<string[]>(
  'PLAYGROUND_GREETING_TAGS',
);
export const PLAYGROUND_MISSING_TOKEN = new InjectionToken<string>(
  'PLAYGROUND_MISSING_TOKEN',
);
export const PLAYGROUND_LOCAL_PREFIX = new InjectionToken<string>(
  'PLAYGROUND_LOCAL_PREFIX',
);
export const PLAYGROUND_LOCAL_PREFIX_ALIAS = new InjectionToken<string>(
  'PLAYGROUND_LOCAL_PREFIX_ALIAS',
);

// @Injectable({ providedIn: 'root' }): tree-shakably registered with the ROOT injector scope -
// real since the angular-adapter-change-detection §3 INJECTOR_SCOPE:'root' fix made 'root' a
// real scope in this DOM-less bootstrap.
//
// DestroyRef.onDestroy: a cleanup hook usable outside ngOnDestroy (any injection context, e.g. a
// service's own constructor). Registered here rather than demoed with a visual toggle - firing it
// live would require tearing down the injector that owns this singleton, which for a root-scoped
// service means app teardown.
@Injectable({ providedIn: 'root' })
export class PlaygroundGreetingService {
  private readonly prefix = inject(PLAYGROUND_GREETING_PREFIX);
  private readonly destroyRef = inject(DestroyRef);
  wasDestroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.wasDestroyed = true;
    });
  }

  greet(name: string): string {
    return `${this.prefix}, ${name}!`;
  }
}

// @NgModule: legacy module decorator, superseded here by the standalone-component model
// (angular-adapter §2's bootstrap is built on createEnvironmentInjector directly, no root
// NgModule) - kept to exercise the decorator itself and to give importProvidersFrom() below a
// real module to aggregate providers from.
@NgModule({
  providers: [
    {
      provide: PLAYGROUND_LOCAL_PREFIX_ALIAS,
      useValue: 'legacy @NgModule provider',
    },
  ],
})
export class PlaygroundLegacyModule {}

// importProvidersFrom() returns EnvironmentProviders, consumable only by an ApplicationConfig's
// `providers` array (bootstrapApplication) or an NgModule's own `imports` - both APIs this
// project's DOM-less bootstrap never calls (angular-adapter §2). Injector.create()'s own
// `providers` option was tried here too and rejects EnvironmentProviders by its real type
// (checked against the installed @angular/core .d.ts, not assumed) - there is no
// EnvironmentProviders-accepting surface anywhere in this bootstrap shape. So this is exercised
// at the type level only: proof the call itself compiles, not a live, resolvable demo.
export const playgroundLegacyProviders: EnvironmentProviders =
  importProvidersFrom(PlaygroundLegacyModule);

@Component({
  selector: 'PlaygroundDiConsumer',
  standalone: true,
  imports: [Text, View],
  // Provider-recipe shapes, all four: useClass (explicit), useValue, useExisting (aliases
  // PLAYGROUND_LOCAL_PREFIX onto PLAYGROUND_LOCAL_PREFIX_ALIAS without a second instance),
  // useFactory + deps. Registering PlaygroundGreetingService again HERE, component-scoped, is
  // what gives @Self()/@SkipSelf() below two distinct injectors to actually tell apart.
  providers: [
    { provide: PlaygroundGreetingService, useClass: PlaygroundGreetingService },
    { provide: PLAYGROUND_LOCAL_PREFIX, useValue: 'Bonjour' },
    {
      provide: PLAYGROUND_LOCAL_PREFIX_ALIAS,
      useExisting: PLAYGROUND_LOCAL_PREFIX,
    },
    {
      provide: PLAYGROUND_GREETING_TAGS,
      useFactory: (prefix: string) => [prefix, 'local'],
      deps: [PLAYGROUND_LOCAL_PREFIX],
      // multi: true - a second registration under the SAME token, collected into one array.
      multi: true,
    },
    { provide: PLAYGROUND_GREETING_TAGS, useValue: ['demo'], multi: true },
  ],
  template: `
    <View class="pg-row">
      <Text testID="pg-di-self" class="info-text">{{
        'component scope (@Self): ' + selfGreeting
      }}</Text>
      <Text testID="pg-di-skipself" class="info-text">{{
        'root scope (@SkipSelf): ' + skipSelfGreeting
      }}</Text>
      <Text testID="pg-di-distinct" class="info-text">{{
        'distinct injectors: ' + (selfIsDistinctFromSkipSelf ? 'yes' : 'no')
      }}</Text>
      <Text testID="pg-di-optional" class="info-text">{{
        'optional, unprovided token: ' + optionalReadout
      }}</Text>
      <Text testID="pg-di-tags" class="info-text">{{
        'multi providers: ' + tags.join(', ')
      }}</Text>
      <Text testID="pg-di-injector" class="info-text">{{
        'Injector.create() + runInInjectionContext: ' + standaloneGreeting
      }}</Text>
    </View>
  `,
})
export class PlaygroundDiConsumer {
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly tagsList = inject(PLAYGROUND_GREETING_TAGS);

  // Constructor PARAMETER decorators (@Self()/@SkipSelf()/@Host()/@Optional()) are the
  // documented legacy form, but this project's tsconfig (adapters/angular/tsconfig.angular.base.json)
  // targets ES2022 with no `experimentalDecorators` - i.e. TC39/"native" decorators, which the
  // spec supports only on classes/methods/fields/accessors, never constructor parameters
  // (TS1206 "Decorators are not valid here"). So every DI site in this codebase already uses
  // inject()'s InjectOptions instead - the row below is the one this project actually exercises.

  // @Self(): resolve ONLY off this component's own `providers` array above, never falling back
  // to the root-scoped singleton.
  private readonly selfGreetingService = inject(PlaygroundGreetingService, {
    self: true,
  });
  // @SkipSelf(): resolve starting from the PARENT injector, skipping this component's own
  // `providers` - lands on the `providedIn: 'root'` singleton instead.
  private readonly skipSelfGreetingService = inject(PlaygroundGreetingService, {
    skipSelf: true,
    optional: true,
  });
  // @Optional(): a token nothing provides - resolves to null instead of throwing NG0201.
  private readonly missingValue = inject(PLAYGROUND_MISSING_TOKEN, {
    optional: true,
  });

  readonly tags = this.tagsList;

  get selfGreeting(): string {
    return this.selfGreetingService.greet('component');
  }

  get skipSelfGreeting(): string {
    return this.skipSelfGreetingService === null
      ? 'unavailable'
      : this.skipSelfGreetingService.greet('root');
  }

  get selfIsDistinctFromSkipSelf(): boolean {
    const skipSelfService: PlaygroundGreetingService | null =
      this.skipSelfGreetingService;
    return (
      skipSelfService !== null && skipSelfService !== this.selfGreetingService
    );
  }

  get optionalReadout(): string {
    return this.missingValue === null
      ? 'null (as expected, none provided)'
      : this.missingValue;
  }

  // Injector.create(): a standalone injector built by hand; runInInjectionContext runs inject()
  // outside a constructor/field initializer, which it otherwise requires.
  get standaloneGreeting(): string {
    const standaloneInjector = Injector.create({
      providers: [
        { provide: PLAYGROUND_GREETING_PREFIX, useValue: 'Standalone hi' },
      ],
      parent: this.environmentInjector,
    });
    return runInInjectionContext(standaloneInjector, () =>
      inject(PlaygroundGreetingService).greet('injector'),
    );
  }
}
