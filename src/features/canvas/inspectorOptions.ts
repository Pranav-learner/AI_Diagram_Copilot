import { FONT_FAMILY } from '@excalidraw/excalidraw';
import type { ArrowheadStyle } from './types/canvas';

/**
 * Option lists for the inspector's selects. Defined in the feature (not the UI)
 * because font-family *values* come from Excalidraw — keeping the inspector
 * component free of any Excalidraw import.
 */

export interface FontFamilyOption {
  label: string;
  value: number;
}

export const FONT_FAMILY_OPTIONS: readonly FontFamilyOption[] = [
  { label: 'Hand-drawn', value: FONT_FAMILY.Excalifont ?? FONT_FAMILY.Virgil },
  { label: 'Normal', value: FONT_FAMILY.Nunito ?? FONT_FAMILY.Helvetica },
  { label: 'Code', value: FONT_FAMILY.Cascadia },
];

export const ARROWHEAD_OPTIONS: readonly { label: string; value: ArrowheadStyle }[] =
  [
    { label: 'None', value: 'none' },
    { label: 'Arrow', value: 'arrow' },
    { label: 'Triangle', value: 'triangle' },
    { label: 'Dot', value: 'dot' },
    { label: 'Bar', value: 'bar' },
    { label: 'Diamond', value: 'diamond' },
  ];

/** Common font sizes offered as quick presets. */
export const FONT_SIZE_PRESETS: readonly number[] = [16, 20, 28, 36];
