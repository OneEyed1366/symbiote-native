// Which cells of a list render and which collapse into spacers, RN's own `CellRenderMask`
// Regions are inclusive ranges that tile `0..numCells-1`, typed here because the source ships none
// @ts-expect-error - untyped Flow source
import { CellRenderMask as CellRenderMaskUpstream } from '@react-native/virtualized-lists/Lists/CellRenderMask';

export type ICellRegion = {
  first: number;
  last: number;
  isSpacer: boolean;
};

export type ICellRenderMask = {
  enumerateRegions(): readonly ICellRegion[];
  addCells(cells: { first: number; last: number }): void;
  numCells(): number;
  equals(other: ICellRenderMask): boolean;
};

export const CellRenderMask: new (numCells: number) => ICellRenderMask =
  CellRenderMaskUpstream;
