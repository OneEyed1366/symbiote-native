import { Component, model, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  Album,
  AssetField,
  MediaSubtype,
  MediaType,
  Query,
} from '@symbiote-native/media-library/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { optionalNumber } from './media-library-helpers';

const FIELDS = Object.values(AssetField).map(value => ({
  label: value,
  value,
}));
const OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;
const OPERATOR_CHOICES = OPERATORS.map(item => ({ label: item, value: item }));

const FIELD_TYPES_HINT = `Field types: ${Object.values(MediaType).join(', ')} for mediaType, and media subtypes ${Object.values(MediaSubtype).join(', ')}.`;

@Component({
  selector: 'MediaLibraryQuery',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <Card testID="media-library-query-card" title="Query builder">
      <ChoiceRow
        testID="media-library-field"
        label="filter field"
        [options]="fields"
        [(value)]="field"
        [color]="color"
      />
      <ChoiceRow
        testID="media-library-operator"
        label="operator (gt, gte, lt, lte)"
        [options]="operatorChoices"
        [(value)]="operator"
        [color]="color"
      />
      <Field
        testID="media-library-value-input"
        label="value"
        [(value)]="value"
      />
      <Field
        testID="media-library-limit-input"
        label="limit"
        [(value)]="limit"
      />
      <Field
        testID="media-library-offset-input"
        label="offset"
        [(value)]="offset"
      />
      <ChoiceRow
        testID="media-library-order-field"
        label="orderBy key"
        [options]="fields"
        [(value)]="orderField"
        [color]="color"
      />
      <ToggleRow
        testID="media-library-ascending-switch"
        label="orderBy ascending"
        [(value)]="isAscending"
        [color]="color"
      />
      <Field
        testID="media-library-album-title-input"
        label="album title (Query.album)"
        [(value)]="albumTitle"
      />
      <text class="info-text">{{ fieldTypesHint }}</text>
    </Card>
    <CallConsole
      prefix="media-library-query-calls"
      title="Query results"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class MediaLibraryQuery {
  readonly assetId = model.required<string>();

  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);
  readonly fields = FIELDS;
  readonly operatorChoices = OPERATOR_CHOICES;
  readonly fieldTypesHint = FIELD_TYPES_HINT;

  readonly field = signal(AssetField.CREATION_TIME);
  readonly operator = signal<(typeof OPERATORS)[number]>('gt');
  readonly value = signal('0');
  readonly limit = signal('5');
  readonly offset = signal('0');
  readonly orderField = signal(AssetField.CREATION_TIME);
  readonly isAscending = signal(false);
  readonly albumTitle = signal('');

  private async build(): Promise<Query> {
    const query = new Query();
    query[this.operator()](this.field(), Number(this.value()));
    const max = optionalNumber(this.limit());
    if (max !== undefined) {
      query.limit(max);
    }
    query.offset(optionalNumber(this.offset()) ?? 0);
    query.orderBy({ key: this.orderField(), ascending: this.isAscending() });
    const title = this.albumTitle().trim();
    if (title !== '') {
      const album = await Album.get(title);
      if (album === null) {
        throw new Error(`no album titled ${this.albumTitle()}`);
      }
      query.album(album);
    }
    return query;
  }

  readonly calls = [
    {
      label: 'exe',
      run: async () => {
        const assets = await (await this.build()).exe();
        this.assetId.set(assets[0]?.id ?? '');
        return assets.map(asset => asset.id);
      },
    },
    {
      label: 'exeForMetadata',
      run: async () => (await this.build()).exeForMetadata(),
    },
  ];
}
