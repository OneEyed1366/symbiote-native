import { Component } from '@angular/core';
import {
  ActivityIndicator,
  AnimatedView,
  Button,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  VirtualizedList,
  VirtualizedSectionList,
  VListItemDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  type ISection,
} from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
// static look compiled at build time by @symbiote-native/css-parser
import './ReactiveStyleScreen.css';

// Does a component's look still track its `class`/`[style]` AFTER mount?
//
// One tap repaints every tile. PASS is the whole grid flipping red -> blue. FAIL is a CHECKERBOARD,
// and the captions name which components to fix.
//
// `class=` and `[style]` do not reach a composed component the way an ordinary @Input does: Angular
// compiles them to its styling instructions, which write onto the non-painting anchor host, never
// appear in SimpleChanges, and dirty nothing. Full mechanism in the
// angular-adapter-change-detection skill.
//
// The two axes are separate rows on purpose - several components are frozen on ONE of them only, so
// a tile carrying both would flip on its live axis and read as healthy. Pressable,
// TouchableHighlight and ScrollView are the controls: if they don't flip, the screen is dead and
// nothing else here means anything. Ordinary inputs are absent deliberately - they propagate
// correctly everywhere and would only dilute the signal.

const ANGULAR_LOGO_URI = 'https://angular.io/assets/images/logos/angular/angular.png';

// The two themes differ in one declaration each, and the class pair and the style pair carry the
// SAME two colours - so a tile frozen on one axis is visibly out of step with its twin in the
// other row, not merely "a different shade".
const TILE_CLASS = {
  a: 'rstyle-tile rstyle-a',
  b: 'rstyle-tile rstyle-b',
} as const;

// Frozen module constants rather than fresh literals per pass: a new object every change-detection
// pass would churn every tile's prop bag and muddy what this screen measures.
const TILE_STYLE = {
  a: { backgroundColor: '#d94a4a' },
  b: { backgroundColor: '#3d8bd9' },
} as const;

type IRow = {
  id: string;
  label: string;
};

function isRow(value: unknown): value is IRow {
  return typeof value === 'object' && value !== null && 'label' in value;
}

const ROW: IRow = { id: 'row-0', label: 'row' };
const ROWS: readonly IRow[] = [ROW];
const SECTIONS: ISection<IRow>[] = [{ title: 'sec', data: [ROW] }];

@Component({
  selector: 'ReactiveStyleScreen',
  standalone: true,
  imports: [
    ActionButton,
    ActivityIndicator,
    AnimatedView,
    Button,
    FlatList,
    ImageBackground,
    KeyboardAvoidingView,
    Pressable,
    SafeAreaView,
    ScrollView,
    SectionList,
    Text,
    TextInput,
    TouchableHighlight,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    VirtualizedList,
    VirtualizedSectionList,
    VListItemDirective,
    VSectionHeaderDirective,
    VSectionItemDirective,
  ],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="rstyle-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">RS</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Reactive style</Text>
            <Text class="hero-body">
              One tap must repaint every tile. A tile left behind is a component whose class or
              style stopped tracking after mount.
            </Text>
          </View>
        </View>

        <ActionButton
          testID="rstyle-toggle"
          [title]="toggleTitle"
          [color]="lineColor"
          (press)="toggleTheme()"
        ></ActionButton>
        <Text testID="rstyle-readout" class="info-text">{{ readout }}</Text>
        <Text class="rstyle-legend">
          Pressable · TouchableHighlight · ScrollView are the controls - they must always flip.
        </Text>

        <Text class="section-label">class= axis</Text>
        <View class="rstyle-grid">
          <View class="rstyle-cell">
            <Pressable testID="rstyle-class-pressable" [class]="tileClass">
              <Text class="rstyle-tile-text">control</Text>
            </Pressable>
            <Text class="rstyle-caption">Pressable</Text>
          </View>
          <View class="rstyle-cell">
            <TouchableHighlight testID="rstyle-class-highlight" [class]="tileClass">
              <Text class="rstyle-tile-text">control</Text>
            </TouchableHighlight>
            <Text class="rstyle-caption">TouchableHighlight</Text>
          </View>
          <View class="rstyle-cell">
            <ScrollView testID="rstyle-class-scrollview" [class]="tileClass">
              <Text class="rstyle-tile-text">control</Text>
            </ScrollView>
            <Text class="rstyle-caption">ScrollView</Text>
          </View>
          <View class="rstyle-cell">
            <TouchableOpacity testID="rstyle-class-opacity" [class]="tileClass">
              <Text class="rstyle-tile-text">tile</Text>
            </TouchableOpacity>
            <Text class="rstyle-caption">TouchableOpacity</Text>
          </View>
          <View class="rstyle-cell">
            <TouchableWithoutFeedback testID="rstyle-class-plain" [class]="tileClass">
              <Text class="rstyle-tile-text">tile</Text>
            </TouchableWithoutFeedback>
            <Text class="rstyle-caption">TouchableWithoutFeedback</Text>
          </View>
          <View class="rstyle-cell">
            <Button
              testID="rstyle-class-button"
              title="tile"
              [color]="tileTextColor"
              [class]="tileClass"
            ></Button>
            <Text class="rstyle-caption">Button</Text>
          </View>
          <View class="rstyle-cell">
            <TextInput
              testID="rstyle-class-textinput"
              placeholder="tile"
              [placeholderTextColor]="tileTextColor"
              [class]="tileClass"
            />
            <Text class="rstyle-caption">TextInput</Text>
          </View>
          <View class="rstyle-cell">
            <!-- Spinning on purpose: the native animation has to survive a class swap. Keep
                 hidesWhenStopped false alongside it - a stopped indicator hides its view, and a
                 vanished tile reads as a pass. -->
            <ActivityIndicator
              testID="rstyle-class-spinner"
              [animating]="true"
              [hidesWhenStopped]="false"
              [class]="tileClass"
            />
            <Text class="rstyle-caption">ActivityIndicator</Text>
          </View>
          <View class="rstyle-cell">
            <ImageBackground
              testID="rstyle-class-imagebg"
              [src]="angularLogoUri"
              alt="Angular logo"
              resizeMode="contain"
              [class]="tileClass"
            >
              <Text class="rstyle-tile-text">tile</Text>
            </ImageBackground>
            <Text class="rstyle-caption">ImageBackground</Text>
          </View>
          <View class="rstyle-cell">
            <KeyboardAvoidingView testID="rstyle-class-kav" [class]="tileClass">
              <Text class="rstyle-tile-text">tile</Text>
            </KeyboardAvoidingView>
            <Text class="rstyle-caption">KeyboardAvoidingView</Text>
          </View>
          <View class="rstyle-cell">
            <AnimatedView testID="rstyle-class-animated" [class]="tileClass">
              <Text class="rstyle-tile-text">tile</Text>
            </AnimatedView>
            <Text class="rstyle-caption">AnimatedView</Text>
          </View>
          <View class="rstyle-cell">
            <FlatList
              testID="rstyle-class-flatlist"
              [data]="rows"
              [keyExtractor]="rowKey"
              [class]="tileClass"
            >
              <ng-template vListItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </FlatList>
            <Text class="rstyle-caption">FlatList</Text>
          </View>
          <View class="rstyle-cell">
            <SectionList
              testID="rstyle-class-sectionlist"
              [sections]="sections"
              [keyExtractor]="rowKey"
              [class]="tileClass"
            >
              <ng-template vSectionHeader let-section>
                <Text class="rstyle-tile-text">{{ section.title }}</Text>
              </ng-template>
              <ng-template vSectionItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </SectionList>
            <Text class="rstyle-caption">SectionList</Text>
          </View>
          <View class="rstyle-cell">
            <VirtualizedList
              testID="rstyle-class-vlist"
              [data]="rows"
              [getItem]="getRow"
              [getItemCount]="getRowCount"
              [keyExtractor]="rowKey"
              [class]="tileClass"
            >
              <ng-template vListItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </VirtualizedList>
            <Text class="rstyle-caption">VirtualizedList</Text>
          </View>
          <View class="rstyle-cell">
            <VirtualizedSectionList
              testID="rstyle-class-vsectionlist"
              [sections]="sections"
              [keyExtractor]="rowKey"
              [class]="tileClass"
            >
              <ng-template vSectionHeader let-section>
                <Text class="rstyle-tile-text">{{ section.title }}</Text>
              </ng-template>
              <ng-template vSectionItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </VirtualizedSectionList>
            <Text class="rstyle-caption">VirtualizedSectionList</Text>
          </View>
        </View>

        <Text class="section-label">[style] axis</Text>
        <View class="rstyle-grid">
          <View class="rstyle-cell">
            <Pressable testID="rstyle-style-pressable" class="rstyle-tile" [style]="tileStyle">
              <Text class="rstyle-tile-text">control</Text>
            </Pressable>
            <Text class="rstyle-caption">Pressable</Text>
          </View>
          <View class="rstyle-cell">
            <TouchableHighlight
              testID="rstyle-style-highlight"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <Text class="rstyle-tile-text">control</Text>
            </TouchableHighlight>
            <Text class="rstyle-caption">TouchableHighlight</Text>
          </View>
          <View class="rstyle-cell">
            <ScrollView testID="rstyle-style-scrollview" class="rstyle-tile" [style]="tileStyle">
              <Text class="rstyle-tile-text">control</Text>
            </ScrollView>
            <Text class="rstyle-caption">ScrollView</Text>
          </View>
          <View class="rstyle-cell">
            <TouchableOpacity
              testID="rstyle-style-opacity"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <Text class="rstyle-tile-text">tile</Text>
            </TouchableOpacity>
            <Text class="rstyle-caption">TouchableOpacity</Text>
          </View>
          <View class="rstyle-cell">
            <TouchableWithoutFeedback
              testID="rstyle-style-plain"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <Text class="rstyle-tile-text">tile</Text>
            </TouchableWithoutFeedback>
            <Text class="rstyle-caption">TouchableWithoutFeedback</Text>
          </View>
          <View class="rstyle-cell">
            <Button
              testID="rstyle-style-button"
              title="tile"
              [color]="tileTextColor"
              class="rstyle-tile"
              [style]="tileStyle"
            ></Button>
            <Text class="rstyle-caption">Button</Text>
          </View>
          <View class="rstyle-cell">
            <TextInput
              testID="rstyle-style-textinput"
              placeholder="tile"
              [placeholderTextColor]="tileTextColor"
              class="rstyle-tile"
              [style]="tileStyle"
            />
            <Text class="rstyle-caption">TextInput</Text>
          </View>
          <View class="rstyle-cell">
            <ActivityIndicator
              testID="rstyle-style-spinner"
              [animating]="true"
              [hidesWhenStopped]="false"
              class="rstyle-tile"
              [style]="tileStyle"
            />
            <Text class="rstyle-caption">ActivityIndicator</Text>
          </View>
          <View class="rstyle-cell">
            <ImageBackground
              testID="rstyle-style-imagebg"
              [src]="angularLogoUri"
              alt="Angular logo"
              resizeMode="contain"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <Text class="rstyle-tile-text">tile</Text>
            </ImageBackground>
            <Text class="rstyle-caption">ImageBackground</Text>
          </View>
          <View class="rstyle-cell">
            <KeyboardAvoidingView
              testID="rstyle-style-kav"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <Text class="rstyle-tile-text">tile</Text>
            </KeyboardAvoidingView>
            <Text class="rstyle-caption">KeyboardAvoidingView</Text>
          </View>
          <View class="rstyle-cell">
            <AnimatedView testID="rstyle-style-animated" class="rstyle-tile" [style]="tileStyle">
              <Text class="rstyle-tile-text">tile</Text>
            </AnimatedView>
            <Text class="rstyle-caption">AnimatedView</Text>
          </View>
          <View class="rstyle-cell">
            <FlatList
              testID="rstyle-style-flatlist"
              [data]="rows"
              [keyExtractor]="rowKey"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <ng-template vListItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </FlatList>
            <Text class="rstyle-caption">FlatList</Text>
          </View>
          <View class="rstyle-cell">
            <SectionList
              testID="rstyle-style-sectionlist"
              [sections]="sections"
              [keyExtractor]="rowKey"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <ng-template vSectionHeader let-section>
                <Text class="rstyle-tile-text">{{ section.title }}</Text>
              </ng-template>
              <ng-template vSectionItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </SectionList>
            <Text class="rstyle-caption">SectionList</Text>
          </View>
          <View class="rstyle-cell">
            <VirtualizedList
              testID="rstyle-style-vlist"
              [data]="rows"
              [getItem]="getRow"
              [getItemCount]="getRowCount"
              [keyExtractor]="rowKey"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <ng-template vListItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </VirtualizedList>
            <Text class="rstyle-caption">VirtualizedList</Text>
          </View>
          <View class="rstyle-cell">
            <VirtualizedSectionList
              testID="rstyle-style-vsectionlist"
              [sections]="sections"
              [keyExtractor]="rowKey"
              class="rstyle-tile"
              [style]="tileStyle"
            >
              <ng-template vSectionHeader let-section>
                <Text class="rstyle-tile-text">{{ section.title }}</Text>
              </ng-template>
              <ng-template vSectionItem let-item>
                <Text class="rstyle-tile-text">{{ rowLabel(item) }}</Text>
              </ng-template>
            </VirtualizedSectionList>
            <Text class="rstyle-caption">VirtualizedSectionList</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class ReactiveStyleScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ReactiveStyle];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly lineColor = LINE_COLOR.primitives;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.primitives };

  readonly angularLogoUri = ANGULAR_LOGO_URI;
  readonly tileTextColor = '#ffffff';
  readonly rows = ROWS;
  readonly sections = SECTIONS;

  isThemeB = false;

  get tileClass(): string {
    return this.isThemeB ? TILE_CLASS.b : TILE_CLASS.a;
  }

  get tileStyle(): Record<string, string> {
    return this.isThemeB ? TILE_STYLE.b : TILE_STYLE.a;
  }

  get toggleTitle(): string {
    return this.isThemeB ? 'Back to theme A (red)' : 'Switch to theme B (blue)';
  }

  get readout(): string {
    return this.isThemeB
      ? 'theme B · every tile must be blue'
      : 'theme A · every tile must be red';
  }

  // A list cell's template context arrives as `unknown` under strictTemplates (the list's item
  // generic doesn't flow into an <ng-template>), so narrow it here - same shape as ParityDemo's
  // parityRowNumber/sectionItemLabel.
  rowLabel(item: unknown): string {
    return isRow(item) ? item.label : '';
  }

  readonly rowKey = (item: IRow): string => item.id;
  readonly getRow = (): IRow => ROW;
  readonly getRowCount = (): number => ROWS.length;

  toggleTheme(): void {
    this.isThemeB = !this.isThemeB;
  }
}
