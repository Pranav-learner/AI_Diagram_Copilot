import { memo, useCallback, useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Layers,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUIStore } from '@/store';
import { useCanvas } from '../hooks/useCanvas';
import { useCanvasSelection } from '../hooks/useCanvasState';
import {
  ARROWHEAD_OPTIONS,
  FONT_FAMILY_OPTIONS,
} from '../inspectorOptions';
import type {
  ArrowheadStyle,
  ElementStyleUpdate,
  SelectedElement,
  TextAlign,
} from '../types/canvas';
import {
  ColorField,
  InspectorRow,
  InspectorSection,
  NumberField,
  SliderField,
} from './inspector/InspectorControls';

type UpdateFn = (patch: ElementStyleUpdate) => void;

const TYPE_LABELS: Record<SelectedElement['type'], string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  arrow: 'Arrow',
  line: 'Line',
  freedraw: 'Draw',
  text: 'Text',
  image: 'Image',
  frame: 'Frame',
  embeddable: 'Embed',
  unknown: 'Element',
};

const ALIGN_ICONS: Record<TextAlign, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

/** Live-editing textarea for a text element's content. */
function TextContentField({
  element,
  onUpdate,
}: {
  element: SelectedElement;
  onUpdate: UpdateFn;
}) {
  const [draft, setDraft] = useState(element.text ?? '');
  // Re-seed only when a different element is selected.
  useEffect(() => setDraft(element.text ?? ''), [element.id, element.text]);

  return (
    <Textarea
      value={draft}
      aria-label="Text content"
      rows={2}
      onChange={(e) => {
        setDraft(e.target.value);
        onUpdate({ text: e.target.value });
      }}
      className="min-h-[3.5rem] text-xs"
    />
  );
}

/** Compact labeled number field for the transform grid (narrow label). */
function TransformField({
  label,
  value,
  ariaLabel,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  ariaLabel: string;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 shrink-0 text-center text-xs text-muted-foreground">
        {label}
      </span>
      <NumberField
        value={value}
        ariaLabel={ariaLabel}
        min={min}
        max={max}
        onCommit={onCommit}
      />
    </div>
  );
}

function ArrowheadSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: ArrowheadStyle;
  onChange: (v: ArrowheadStyle) => void;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ArrowheadStyle)}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ARROWHEAD_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Appearance controls shared by single- and multi-selection editors. */
function AppearanceControls({
  element,
  onUpdate,
  showFill,
  showRounded,
}: {
  element: SelectedElement;
  onUpdate: UpdateFn;
  showFill: boolean;
  showRounded: boolean;
}) {
  return (
    <InspectorSection title="Appearance">
      <InspectorRow label="Stroke">
        <ColorField
          value={element.strokeColor}
          ariaLabel="Stroke color"
          onChange={(strokeColor) => onUpdate({ strokeColor })}
        />
      </InspectorRow>
      {showFill && (
        <InspectorRow label="Fill">
          <ColorField
            value={element.backgroundColor}
            ariaLabel="Fill color"
            allowTransparent
            onChange={(backgroundColor) => onUpdate({ backgroundColor })}
          />
        </InspectorRow>
      )}
      <InspectorRow label="Stroke W">
        <NumberField
          value={element.strokeWidth}
          ariaLabel="Stroke width"
          min={0.5}
          max={64}
          step={0.5}
          suffix="px"
          onCommit={(strokeWidth) => onUpdate({ strokeWidth })}
        />
      </InspectorRow>
      {showRounded && (
        <InspectorRow label="Corners">
          <ToggleGroup
            type="single"
            value={element.rounded ? 'round' : 'sharp'}
            onValueChange={(v) => {
              if (v) onUpdate({ rounded: v === 'round' });
            }}
            className="w-fit"
            aria-label="Corner style"
          >
            <ToggleGroupItem value="sharp" className="h-7 w-auto px-2 text-[11px]">
              Sharp
            </ToggleGroupItem>
            <ToggleGroupItem value="round" className="h-7 w-auto px-2 text-[11px]">
              Round
            </ToggleGroupItem>
          </ToggleGroup>
        </InspectorRow>
      )}
      <InspectorRow label="Opacity">
        <SliderField
          value={element.opacity}
          ariaLabel="Opacity"
          onChange={(opacity) => onUpdate({ opacity })}
        />
      </InspectorRow>
    </InspectorSection>
  );
}

/** Full property editor for a single selected element. */
function SingleEditor({
  element,
  onUpdate,
}: {
  element: SelectedElement;
  onUpdate: UpdateFn;
}) {
  const isText = element.type === 'text';
  const isLinear = element.type === 'arrow' || element.type === 'line';
  const hasFill =
    element.type === 'rectangle' ||
    element.type === 'ellipse' ||
    element.type === 'diamond';
  const canRound = element.type === 'rectangle' || element.type === 'diamond';

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{TYPE_LABELS[element.type]}</span>
        <Badge variant="secondary" className="gap-1">
          <Layers className="size-3" />
          Layer {element.layer}
        </Badge>
      </div>

      {isText && (
        <>
          <InspectorSection title="Text">
            <TextContentField element={element} onUpdate={onUpdate} />
            <div className="mt-1.5 flex flex-col gap-0.5">
              <InspectorRow label="Font size">
                <NumberField
                  value={element.fontSize ?? 20}
                  ariaLabel="Font size"
                  min={4}
                  max={256}
                  suffix="px"
                  onCommit={(fontSize) => onUpdate({ fontSize })}
                />
              </InspectorRow>
              <InspectorRow label="Font">
                <Select
                  value={String(element.fontFamily ?? '')}
                  onValueChange={(v) => onUpdate({ fontFamily: Number(v) })}
                >
                  <SelectTrigger aria-label="Font family" className="h-8 text-xs">
                    <SelectValue placeholder="Font" />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILY_OPTIONS.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={String(o.value)}
                        className="text-xs"
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InspectorRow>
              <InspectorRow label="Align">
                <ToggleGroup
                  type="single"
                  value={element.textAlign ?? 'left'}
                  onValueChange={(v) => {
                    if (v) onUpdate({ textAlign: v as TextAlign });
                  }}
                  aria-label="Text alignment"
                  className="w-fit"
                >
                  {(Object.keys(ALIGN_ICONS) as TextAlign[]).map((align) => {
                    const Icon = ALIGN_ICONS[align];
                    return (
                      <ToggleGroupItem
                        key={align}
                        value={align}
                        aria-label={`Align ${align}`}
                      >
                        <Icon className="size-3.5" />
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </InspectorRow>
            </div>
          </InspectorSection>
          <Separator />
        </>
      )}

      {isLinear && (
        <>
          <InspectorSection title="Arrowheads">
            <InspectorRow label="Start">
              <ArrowheadSelect
                value={element.startArrowhead ?? 'none'}
                ariaLabel="Start arrowhead"
                onChange={(startArrowhead) => onUpdate({ startArrowhead })}
              />
            </InspectorRow>
            <InspectorRow label="End">
              <ArrowheadSelect
                value={element.endArrowhead ?? 'arrow'}
                ariaLabel="End arrowhead"
                onChange={(endArrowhead) => onUpdate({ endArrowhead })}
              />
            </InspectorRow>
          </InspectorSection>
          <Separator />
        </>
      )}

      {element.type !== 'image' && (
        <>
          <AppearanceControls
            element={element}
            onUpdate={onUpdate}
            showFill={hasFill}
            showRounded={canRound}
          />
          <Separator />
        </>
      )}

      <InspectorSection title="Transform">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <TransformField
            label="X"
            value={element.x}
            ariaLabel="Position X"
            onCommit={(x) => onUpdate({ x })}
          />
          <TransformField
            label="Y"
            value={element.y}
            ariaLabel="Position Y"
            onCommit={(y) => onUpdate({ y })}
          />
          <TransformField
            label="W"
            value={element.width}
            ariaLabel="Width"
            min={1}
            onCommit={(width) => onUpdate({ width })}
          />
          <TransformField
            label="H"
            value={element.height}
            ariaLabel="Height"
            min={1}
            onCommit={(height) => onUpdate({ height })}
          />
          <TransformField
            label="∠"
            value={element.rotation}
            ariaLabel="Rotation"
            min={0}
            max={360}
            onCommit={(rotation) => onUpdate({ rotation })}
          />
        </div>
      </InspectorSection>
    </div>
  );
}

/** Compact multi-selection editor — appearance changes apply to all. */
function MultiEditor({
  count,
  sample,
  onUpdate,
}: {
  count: number;
  sample: SelectedElement;
  onUpdate: UpdateFn;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Layers className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">{count} elements</p>
          <p className="text-xs text-muted-foreground">Edits apply to all</p>
        </div>
      </div>
      <AppearanceControls
        element={sample}
        onUpdate={onUpdate}
        showFill
        showRounded={false}
      />
    </div>
  );
}

function EmptySelection() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MousePointerClick className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No element selected</p>
        <p className="text-xs text-muted-foreground">
          Select an element on the canvas to edit its properties.
        </p>
      </div>
    </div>
  );
}

/**
 * Right inspector panel. Reads the normalized selection from the canvas store
 * and writes edits back through `CanvasEngine.updateSelected` — never touching
 * Excalidraw directly. Collapsible on desktop.
 */
export const CanvasInspector = memo(function CanvasInspector() {
  const engine = useCanvas();
  const selection = useCanvasSelection();
  const collapsed = useUIStore((s) => s.inspectorCollapsed);
  const toggle = useUIStore((s) => s.toggleInspector);

  const onUpdate = useCallback<UpdateFn>(
    (patch) => engine.updateSelected(patch),
    [engine],
  );

  if (collapsed) {
    return (
      <aside className="hidden w-10 shrink-0 flex-col items-center border-l bg-background py-2 xl:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label="Expand inspector"
            >
              <PanelRightOpen className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Expand inspector</TooltipContent>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l bg-background xl:flex">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3 pl-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal
            className="size-4 text-muted-foreground"
            aria-hidden
          />
          <h2 className="text-sm font-semibold">Inspector</h2>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label="Collapse inspector"
            >
              <PanelRightClose className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Collapse inspector</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {selection.length === 0 && <EmptySelection />}
        {selection.length === 1 && (
          <SingleEditor element={selection[0]!} onUpdate={onUpdate} />
        )}
        {selection.length > 1 && (
          <MultiEditor
            count={selection.length}
            sample={selection[0]!}
            onUpdate={onUpdate}
          />
        )}
      </div>
    </aside>
  );
});
