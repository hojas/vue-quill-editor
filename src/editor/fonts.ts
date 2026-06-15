import Quill from 'quill'

/** 中文字体标识符 → 中文显示名称 */
const CHINESE_FONTS: Record<string, string> = {
  'songti': '宋体',
  'heiti': '黑体',
  'weiruan-yahei': '微软雅黑',
  'kaiti': '楷体',
  'fangsong': '仿宋',
}

/** 防止重复注册的标记 */
let registered = false

/**
 * 向 Quill 注册中文字体。
 *
 * 扩展 Font ClassAttributor 的 whitelist，添加宋体、黑体、微软雅黑、楷体、仿宋，
 * 保留默认的 serif / monospace。
 *
 * 仅首次调用生效，重复调用会被跳过。
 */
export function registerFonts(): void {
  if (registered)
    return

  const FontClass = Quill.import('formats/font') as { whitelist: string[] }
  const defaultWhitelist = new Set(FontClass.whitelist)
  for (const key of Object.keys(CHINESE_FONTS)) {
    if (!defaultWhitelist.has(key))
      FontClass.whitelist.push(key)
  }
  Quill.register(FontClass, true)

  registered = true
}

export { CHINESE_FONTS }
