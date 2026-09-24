import { describe, expect, it } from 'vitest'
import { sanitizeBody } from '../src/lib/sanitize.ts'

describe('sanitizeBody', () => {
  it('drops scripts, handlers, frames and unsafe URLs', () => {
    expect(sanitizeBody('<p onclick="x()">Hi<script>alert(1)</script></p><iframe src="https://e.vil"></iframe>')).toBe('<p>Hi</p>')
    expect(sanitizeBody('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeBody('<img src="javascript:alert(1)" onerror="x()">')).toBe('<img />')
    expect(sanitizeBody('<p style="color:red;width:10px">x</p>')).toBe('<p>x</p>')
    expect(sanitizeBody('<a href="//e.vil/x">x</a>')).toBe('<a>x</a>')
  })

  it('keeps what the editor produces', () => {
    const html = [
      '<h2>Title</h2>',
      '<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <code>c</code> <mark data-color="#ff0">m</mark></p>',
      '<div data-callout="warning"><p>Careful</p></div>',
      '<details data-expand="true"><summary>More</summary><div><p>Inside</p></div></details>',
      '<p><span class="mention" data-mention="u.1" userid="u.1" name="Ada">@Ada</span></p>',
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked" /></label><div><p>Done</p></div></li></ul>',
      '<table style="min-width:50px"><colgroup><col style="width:120px" /></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>H</p></th></tr></tbody></table>',
      '<pre><code class="language-ts">let x = 1</code></pre>',
      '<p><a href="/spaces/ENG/pages/pg.1" class="smart-link">Link</a> <a href="https://example.com">out</a></p>',
      '<img src="https://example.com/a.png" alt="A" />',
    ].join('')
    expect(sanitizeBody(html)).toBe(html)
  })

  it('hardens new-tab links and non-checkbox inputs', () => {
    expect(sanitizeBody('<a href="https://x.dev" target="_blank">x</a>')).toBe('<a href="https://x.dev" target="_blank" rel="noopener noreferrer nofollow">x</a>')
    expect(sanitizeBody('<input type="text" value="x" />')).toBe('<span></span>')
    expect(sanitizeBody('<span class="evil mention">x</span>')).toBe('<span class="mention">x</span>')
  })

  it('never stores an empty body', () => {
    expect(sanitizeBody('')).toBe('<p></p>')
    expect(sanitizeBody('<script>x</script>')).toBe('<p></p>')
  })
})
