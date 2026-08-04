import React, { useEffect, useRef } from 'react';
import { GridStack } from 'gridstack';

// Desktop-only freeform drag/resize dashboard grid (see MASTER_IMPLEMENTATION_PLAN.md
// Phase 4 follow-up). GridStack owns position/size once mounted; React only owns
// each item's *content*. Column count is fixed for the life of one mount — app.jsx
// remounts this component (via `key`) when the effective column count changes,
// so "switch column count" always means "load that count's own saved layout"
// rather than GridStack's own column()/moveScale reflow of the old one.
export const GRID_ROW_PX = 32;
export const GRID_MARGIN = 5;

export function computeColumnCount(mode, width) {
  if (mode === 1 || mode === 2 || mode === 3 || mode === 4) return mode;
  if (width >= 1800) return 4;
  if (width >= 1380) return 3;
  if (width >= 900) return 2;
  return 1;
}

// Starting size for an item that has no saved position yet (first time this
// column count is used, or a newly-unhidden panel/widget) — item.w/item.h
// are the caller's own best guess (app.jsx derives them from panel state /
// MICRO_WIDGET_UNITS). Not meant to fit content exactly: the whole point of
// auto-compact is that a wrong guess here just gets squeezed by its
// neighbours, not that this has to be right.
export function defaultItemSize(item, cols) {
  return { w: Math.min(cols, item.w || 1), h: item.h || 8 };
}

export function DashboardGrid({ items, columnCount, savedLayout, editMode, onLayoutChange }) {
  const rootRef = useRef(null);
  const gridRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const grid = GridStack.init({
      column: columnCount,
      cellHeight: GRID_ROW_PX,
      margin: GRID_MARGIN,
      float: false,
      staticGrid: !editMode,
      animate: false,
      alwaysShowResizeHandle: false,
    }, root);
    gridRef.current = grid;

    // Fires on drag/resize stop, and on any add/remove — grid.save(false)
    // omits each item's rendered content, we only want positions.
    const persist = () => onLayoutChange(grid.save(false));
    grid.on('change added removed', persist);

    return () => {
      grid.off('change added removed');
      grid.destroy(false); // false: leave the DOM to React, GridStack only unwires itself
      gridRef.current = null;
    };
    // columnCount intentionally not re-run without a remount — see file header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gridRef.current?.setStatic(!editMode);
  }, [editMode]);

  const savedById = new Map((savedLayout || []).map(it => [it.id, it]));

  return (
    <div className={`grid-stack press-grid${editMode ? ' editing' : ''}`} id="press-scroll" ref={rootRef}>
      {items.map(item => {
        const pos = savedById.get(item.id);
        const size = defaultItemSize(item, columnCount);
        return (
          <div key={item.id} className="grid-stack-item" gs-id={item.id}
            gs-w={pos?.w ?? size.w} gs-h={pos?.h ?? size.h}
            gs-x={pos?.x} gs-y={pos?.y}
            gs-auto-position={pos ? undefined : 'true'}>
            <div className="grid-stack-item-content">{item.element}</div>
          </div>
        );
      })}
    </div>
  );
}
