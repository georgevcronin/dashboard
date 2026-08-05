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
      // Top handles omitted per GridStack's own guidance (resizing from the
      // top can produce odd position/size interactions) — width from either
      // side, height/corner from the bottom.
      resizable: { handles: 'e, se, s, sw, w' },
    }, root);
    gridRef.current = grid;

    // Fires on drag/resize stop, and on any add/remove — grid.save(false)
    // omits each item's rendered content, we only want positions.
    const persist = () => onLayoutChange(grid.save(false));
    grid.on('change added removed', persist);

    // A panel's real content sets a FLOOR on its height (minH), not a fixed
    // value: dragging it shorter stops right at that floor, so it can never
    // end up smaller than what's actually in it (no internal scrollbar), but
    // dragging it taller for breathing room still works and sticks. Content
    // growing later (new data, a chart finishing its first render, a webfont
    // swap) raises the floor and pulls the box up if it's currently sitting
    // right on it; content shrinking lowers the floor but never yanks a
    // deliberately-taller box back down. GridStack's own minH is a drag
    // constraint only (doesn't retroactively fix an existing too-short box),
    // hence the manual bump — same measurement technique as its own
    // resizeToContent(), just grow-only instead of always-exact.
    const cell = grid.getCellHeight(true) || GRID_ROW_PX;
    const enforceFloor = el => {
      const node = el.gridstackNode;
      const contentBox = el.querySelector('.grid-stack-item-content');
      const child = contentBox?.firstElementChild;
      if (!node || !contentBox || !child) return;
      const margins = el.clientHeight - contentBox.clientHeight;
      const neededRows = Math.max(1, Math.ceil((child.getBoundingClientRect().height + margins) / cell));
      if (neededRows === node.minH && neededRows <= (node.h || 1)) return;
      const opt = { minH: neededRows };
      if ((node.h || 1) < neededRows) opt.h = neededRows;
      grid.update(el, opt);
    };
    // A live drag/resize reflows the dragged item's own width, which can
    // reflow its text and change the child's natural height, which fires
    // this same ResizeObserver mid-drag — calling grid.update() there fights
    // GridStack's own drag session for control of that node and was the
    // cause of the mouse getting "stuck"/glitching. Floor enforcement is
    // paused for the duration and runs once more right after release, which
    // both re-syncs anything skipped and applies the floor to whatever size
    // the user just chose.
    let interacting = false;
    grid.on('dragstart resizestart', () => { interacting = true; });
    grid.on('dragstop resizestop', () => { interacting = false; schedule(); });

    // Even a perfectly packed grid can end up with one column shorter than
    // the tallest one — a handful of items of fixed sizes just don't always
    // tile a rectangle with nothing left over, no packing order fixes that.
    // Whatever sits at the bottom of a shorter column, with nothing else
    // below it in any column it spans, gets stretched down to match the
    // tallest column's bottom edge instead of leaving that space blank.
    // NOTE: this is a single pass, not a loop — an earlier attempt to
    // "undo and re-settle" equalized stretches every tick fought compact()'s
    // own reordering and produced a diverging, chaotic layout (items
    // shrinking to h=1, jumping columns between passes). A single pass per
    // real content change is stable; it just means a stretch here is sticky
    // like a manual resize would be, not something later passes revisit.
    const equalizeBottom = () => {
      const nodes = grid.engine.nodes;
      if (!nodes.length) return;
      const maxBottom = Math.max(...nodes.map(n => n.y + n.h));
      nodes.forEach(n => {
        const bottom = n.y + n.h;
        if (bottom >= maxBottom || n.locked) return;
        const blockedBy = nodes.find(o => o !== n && o.x < n.x + n.w && o.x + o.w > n.x && o.y + o.h > bottom);
        if (!blockedBy) grid.update(n.el, { h: maxBottom - n.y });
      });
    };

    let frame = 0;
    const schedule = () => {
      if (interacting || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.querySelectorAll(':scope > .grid-stack-item').forEach(enforceFloor);
        // Bumping a node's h to its floor can open a gap below whatever used
        // to sit there (float:false keeps items from floating on their OWN
        // move, but doesn't retroactively re-pack everyone once several
        // heights change in one batch) -- compact is what actually closes it.
        grid.compact();
        equalizeBottom();
      });
    };
    const contentObserver = new ResizeObserver(schedule);
    root.querySelectorAll(':scope > .grid-stack-item > .grid-stack-item-content > *').forEach(el => contentObserver.observe(el));
    schedule();
    document.fonts?.ready.then(schedule).catch(() => {});

    return () => {
      contentObserver.disconnect();
      grid.off('change added removed');
      grid.off('dragstart resizestart dragstop resizestop');
      grid.destroy(false); // false: leave the DOM to React, GridStack only unwires itself
      gridRef.current = null;
      if (frame) cancelAnimationFrame(frame);
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
