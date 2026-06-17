import { ClassAttributor, Scope } from 'parchment'
import Quill from 'quill'

/** 行高可选值 */
export const LINEHEIGHT_VALUES = ['1', '1_5', '1_75', '2', '2_5', '3']

/** 字符间距可选值 */
export const LETTERSPACING_VALUES = ['0', '0_5', '1', '2', '3']

/** 防止重复注册的标记 */
let registered = false

/**
 * 向 Quill 注册自定义的行高和字符间距格式。
 *
 * - lineheight：段落级 ClassAttributor，whitelist 为预设行高值
 * - letterspacing：内联级 ClassAttributor，whitelist 为预设间距值
 *
 * 仅首次调用生效，重复调用会被跳过。
 */
export function registerCustomFormats(): void {
  if (registered)
    return

  const LineheightClass = new ClassAttributor('lineheight', 'ql-lineheight', {
    scope: Scope.BLOCK,
    whitelist: LINEHEIGHT_VALUES,
  })

  const LetterspacingClass = new ClassAttributor('letterspacing', 'ql-letterspacing', {
    scope: Scope.INLINE,
    whitelist: LETTERSPACING_VALUES,
  })

  Quill.register({
    'formats/lineheight': LineheightClass,
    'formats/letterspacing': LetterspacingClass,
  }, true)

  registered = true
}
