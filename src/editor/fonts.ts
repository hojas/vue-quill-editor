import Quill from 'quill'

/** 自定义字体标识符 → 显示名称 */
const CUSTOM_FONTS: Record<string, string> = {
  'songti': '宋体',
  'heiti': '黑体',
  'weiruan-yahei': '微软雅黑',
  'kaiti': '楷体',
  'fangsong': '仿宋',
  'arial': 'Arial',
  'times-new-roman': 'Times New Roman',
  'sans-serif': 'sans-serif',
}

/** 防止重复注册的标记 */
let registered = false

/**
 * 向 Quill 注册自定义字体（中文 + 西文）。
 *
 * 扩展 Font ClassAttributor 的 whitelist，添加宋体、黑体、微软雅黑、楷体、仿宋、
 * Arial、Times New Roman、sans-serif，保留默认的 serif / monospace。
 *
 * 仅首次调用生效，重复调用会被跳过。
 */
export function registerFonts(): void {
  if (registered)
    return

  const FontClass = Quill.import('formats/font') as { whitelist: string[] }
  const defaultWhitelist = new Set(FontClass.whitelist)
  for (const key of Object.keys(CUSTOM_FONTS)) {
    if (!defaultWhitelist.has(key))
      FontClass.whitelist.push(key)
  }
  Quill.register(FontClass, true)

  registered = true
}

export { CUSTOM_FONTS }
