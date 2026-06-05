/**
 * Image resize handle module.
 *
 * Attaches 8 drag handles (4 corners + 4 edges) to `<edm-image>` containers
 * in the editor. Dragging any handle resizes the image while maintaining
 * aspect ratio. The image width is capped to the editor content area.
 *
 * Handles are stripped before HTML serialization so the output stays clean.
 */

const MIN_SIZE = 20;

// ---- Types ----

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  aspectRatio: number;
  handle: HTMLElement;
}

// ---- Constants ----

const HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const CURSOR: Record<HandleDir, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
};

// ---- Module state ----

let drag: DragState | null = null;

// ---- Handle DOM ----

function makeHandle(dir: HandleDir): HTMLElement {
  const el = document.createElement('div');
  el.className = `ql-edm-resize-handle ql-edm-resize-${dir}`;
  el.setAttribute('data-resize-handle', dir);
  el.style.cursor = CURSOR[dir];
  return el;
}

export function attachResizeHandles(container: HTMLElement): void {
  if (container.querySelector('[data-resize-handle]')) return; // already attached
  HANDLES.forEach((d) => container.appendChild(makeHandle(d)));
}

export function removeAllResizeHandles(root: HTMLElement): void {
  root.querySelectorAll('[data-resize-handle]').forEach((el) => el.remove());
}

// ---- Image helpers ----

function imgOf(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img');
}

function parsePx(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}

function readImageSize(img: HTMLImageElement): { width: number; height: number } {
  // Prefer explicit inline size → CSS layout size → natural file size.
  return {
    width:  parsePx(img.style.width)  || img.clientWidth  || img.naturalWidth  || 200,
    height: parsePx(img.style.height) || img.clientHeight || img.naturalHeight || 200,
  };
}

function writeImageSize(img: HTMLImageElement, w: number, h: number): void {
  Object.assign(img.style, {
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
    maxWidth: 'none',
  });
}

// ---- Editor content width ----

function getEditorContentWidth(container: HTMLElement, fallback: number): number {
  const editor = container.closest<HTMLElement>('.ql-editor');
  if (!editor) return fallback;
  const style = getComputedStyle(editor);
  return editor.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
}

// ---- Resize calculation ----

function calcResize(
  dir: HandleDir,
  dx: number,
  dy: number,
  startW: number,
  startH: number,
  aspect: number,
): { w: number; h: number } {
  let w: number;
  let h: number;

  if (dir.includes('e') || dir.includes('w')) {
    // Horizontal axis drives the resize.
    const scale = dir.includes('e')
      ? (startW + dx) / startW
      : (startW - dx) / startW;
    w = Math.max(MIN_SIZE, startW * scale);
    h = Math.max(MIN_SIZE, w / aspect);
  } else {
    // Vertical axis drives the resize.
    const scale = dir.includes('s')
      ? (startH + dy) / startH
      : (startH - dy) / startH;
    h = Math.max(MIN_SIZE, startH * scale);
    w = Math.max(MIN_SIZE, h * aspect);
  }

  // Clamp to editor content width.
  const maxW = getEditorContentWidth(drag!.handle.closest('[data-edm-type="image"]')!, startW);
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }

  return { w, h };
}

// ---- Drag event handlers ----

function onMouseMove(e: MouseEvent): void {
  if (!drag) return;

  const dir = drag.handle.getAttribute('data-resize-handle') as HandleDir;
  const container = drag.handle.closest<HTMLElement>('[data-edm-type="image"]');
  const img = container && imgOf(container);
  if (!img) return;

  const { w, h } = calcResize(
    dir,
    e.clientX - drag.startX,
    e.clientY - drag.startY,
    drag.startWidth,
    drag.startHeight,
    drag.aspectRatio,
  );

  writeImageSize(img, w, h);
}

function onMouseUp(): void {
  drag = null;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
}

function onHandleMouseDown(event: MouseEvent): void {
  const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-resize-handle]');
  if (!handle) return;

  const container = handle.closest<HTMLElement>('[data-edm-type="image"]');
  const img = container && imgOf(container);
  if (!img) return;

  event.preventDefault();
  event.stopPropagation();

  const { width, height } = readImageSize(img);
  drag = {
    startX: event.clientX,
    startY: event.clientY,
    startWidth: width,
    startHeight: height,
    aspectRatio: width / height,
    handle,
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ---- For each image embed ----

function forEachImageEmbed(root: HTMLElement, fn: (el: HTMLElement) => void): void {
  root.querySelectorAll<HTMLElement>('[data-edm-type="image"]').forEach(fn);
}

// ---- Bootstrap ----

let initialized = false;

export function initImageResize(editorRoot: HTMLElement): void {
  if (initialized) return;
  initialized = true;

  // Delegate mousedown so handles work on both existing and future embeds.
  editorRoot.addEventListener('mousedown', onHandleMouseDown);

  // Attach handles to current embeds.
  forEachImageEmbed(editorRoot, attachResizeHandles);

  // Watch for embeds added later by Quill.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.('[data-edm-type="image"]')) {
          attachResizeHandles(node);
        } else {
          forEachImageEmbed(node, attachResizeHandles);
        }
      }
    }
  });

  observer.observe(editorRoot, { childList: true, subtree: true });
}
