/**
 * 图片拖拽缩放模块。
 *
 * 在 `<edm-image>` 容器上附加 8 个拖拽把手（4 角 + 4 边），
 * 拖拽时保持宽高比缩放图片，宽度上限为编辑器内容区宽度。
 *
 * 序列化 HTML 前会移除把手，保证输出干净。
 */

/** 最小缩放尺寸（像素） */
const MIN_SIZE = 20;

// ---- 类型定义 ----

/** 把手方位 */
type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** 拖拽状态快照 */
interface DragState {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  aspectRatio: number;
  handle: HTMLElement;
}

// ---- 常量 ----

/** 所有把手方位 */
const HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** 方位 → 鼠标指针样式 */
const CURSOR: Record<HandleDir, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
};

// ---- 模块状态 ----

/** 当前拖拽状态，null 表示未激活 */
let drag: DragState | null = null;

// ---- 把手 DOM ----

/** 创建单个缩放把手元素 */
function makeHandle(dir: HandleDir): HTMLElement {
  const el = document.createElement('div');
  el.className = `ql-edm-resize-handle ql-edm-resize-${dir}`;
  el.setAttribute('data-resize-handle', dir);
  el.style.cursor = CURSOR[dir];
  return el;
}

/**
 * 为图片容器附加 8 个缩放把手。
 *
 * 如果已附加则跳过，防止重复。
 */
export function attachResizeHandles(container: HTMLElement): void {
  if (container.querySelector('[data-resize-handle]')) return;
  HANDLES.forEach((d) => container.appendChild(makeHandle(d)));
}

/** 移除根节点内所有缩放把手 */
export function removeAllResizeHandles(root: HTMLElement): void {
  root.querySelectorAll('[data-resize-handle]').forEach((el) => el.remove());
}

// ---- 图片尺寸工具 ----

/** 从容器中获取 `<img>` 元素 */
function imgOf(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img');
}

/** 将 CSS 像素值解析为数字，无效时返回 null */
function parsePx(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 读取图片当前显示尺寸。
 *
 * 优先级：inline style → CSS 布局尺寸 → 原始文件尺寸 → 200px 兜底。
 */
function readImageSize(img: HTMLImageElement): { width: number; height: number } {
  return {
    width:  parsePx(img.style.width)  || img.clientWidth  || img.naturalWidth  || 200,
    height: parsePx(img.style.height) || img.clientHeight || img.naturalHeight || 200,
  };
}

/** 写入 inline style 设置图片尺寸 */
function writeImageSize(img: HTMLImageElement, w: number, h: number): void {
  Object.assign(img.style, {
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
    maxWidth: 'none',
  });
}

// ---- 编辑器内容区宽度 ----

/** 获取编辑器内容区的可用宽度（减去 padding） */
function getEditorContentWidth(container: HTMLElement, fallback: number): number {
  const editor = container.closest<HTMLElement>('.ql-editor');
  if (!editor) return fallback;
  const style = getComputedStyle(editor);
  return editor.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
}

// ---- 缩放计算 ----

/**
 * 根据拖拽方向和鼠标位移计算新的图片尺寸。
 *
 * 沿 x 轴拖拽时以宽度为基准反算高度，沿 y 轴拖拽时以高度为基准反算宽度。
 * 结果不小于 MIN_SIZE，且宽度不超过编辑器内容区。
 */
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
    // 水平方向驱动缩放
    const scale = dir.includes('e')
      ? (startW + dx) / startW
      : (startW - dx) / startW;
    w = Math.max(MIN_SIZE, startW * scale);
    h = Math.max(MIN_SIZE, w / aspect);
  } else {
    // 垂直方向驱动缩放
    const scale = dir.includes('s')
      ? (startH + dy) / startH
      : (startH - dy) / startH;
    h = Math.max(MIN_SIZE, startH * scale);
    w = Math.max(MIN_SIZE, h * aspect);
  }

  // 宽度上限为编辑器内容区宽度
  const maxW = getEditorContentWidth(drag!.handle.closest('[data-edm-type="image"]')!, startW);
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }

  return { w, h };
}

// ---- 拖拽事件处理 ----

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

/**
 * 把手 mousedown 事件处理（在编辑器根节点上以事件委托方式监听）。
 *
 * 记录拖拽起始状态，绑定全局 mousemove/mouseup 监听。
 */
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

// ---- 遍历图片嵌入 ----

function forEachImageEmbed(root: HTMLElement, fn: (el: HTMLElement) => void): void {
  root.querySelectorAll<HTMLElement>('[data-edm-type="image"]').forEach(fn);
}

// ---- 启动 ----

/** 防止重复初始化的标记 */
let initialized = false;

/**
 * 初始化图片缩放功能。
 *
 * 在编辑器根节点上以事件委托方式监听 mousedown，
 * 并为现有的及后续新增的图片嵌入附加缩放把手。
 */
export function initImageResize(editorRoot: HTMLElement): void {
  if (initialized) return;
  initialized = true;

  // 事件委托：把手 mousedown 在编辑器根节点统一处理
  editorRoot.addEventListener('mousedown', onHandleMouseDown);

  // 为当前已存在的图片嵌入附加把手
  forEachImageEmbed(editorRoot, attachResizeHandles);

  // 监听 DOM 变化，为新插入的图片嵌入附加把手
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
