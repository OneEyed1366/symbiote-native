import { Component, signal } from '@angular/core';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import { getBackgroundColorAsync, setBackgroundColorAsync } from '@symbiote-native/system-ui/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * @symbiote-native/system-ui canary demo: a live root-view background-color card, seeded via
 * getBackgroundColorAsync() and refreshed after every setBackgroundColorAsync() call. Every
 * function is a plain re-export off the core package — no service to inject(), same shape as
 * @symbiote-native/crypto's plain-function surface.
 */
@Component({
  selector: 'SystemUiScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="system-ui-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">System UI</Text>
            <Text class="hero-body">
              @symbiote-native/system-ui — get/set the root view's background color, the color
              painted behind the RN surface before any content mounts.
            </Text>
          </View>
        </View>

        <View testID="system-ui-background-card" class="capability-card">
          <Text class="capability-card-title">Root background color</Text>
          <View class="capability-row">
            <Text class="capability-label">Current color</Text>
            <Text testID="system-ui-color-result" class="value-text">{{ colorLabel() }}</Text>
          </View>
          <View class="button-row">
            <ActionButton
              testID="system-ui-set-red"
              title="Red"
              [color]="lineColor"
              (press)="handleSetColor('#ef4444')"
            ></ActionButton>
            <ActionButton
              testID="system-ui-set-blue"
              title="Blue"
              [color]="lineColor"
              (press)="handleSetColor('#3b82f6')"
            ></ActionButton>
            <ActionButton
              testID="system-ui-reset"
              title="Reset"
              [color]="lineColor"
              (press)="handleSetColor(null)"
            ></ActionButton>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class SystemUiScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly color = signal<string | null | 'checking'>('checking');

  constructor() {
    this.refreshColor();
  }

  handleSetColor(color: string | null): void {
    setBackgroundColorAsync(color).then(() => this.refreshColor());
  }

  colorLabel(): string {
    const value = this.color();
    if (value === 'checking') return 'checking…';
    return value ?? 'not set';
  }

  private refreshColor(): void {
    getBackgroundColorAsync().then(value => {
      this.color.set(typeof value === 'string' ? value : null);
    });
  }
}
