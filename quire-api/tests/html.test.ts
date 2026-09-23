import { describe, expect, it } from 'vitest'
import { countWords, htmlToText } from '../src/lib/html.ts'

describe('htmlToText', () => {
  it('drops tags and separates blocks', () => expect(htmlToText('<h1>Title</h1><p>One <b>two</b></p>')).toBe('Title One two'))
  it('drops script and style content', () => expect(htmlToText('<p>a</p><script>alert(1)</script><style>p{}</style>')).toBe('a'))
  it('decodes entities', () => expect(htmlToText('Tom &amp; Jerry &lt;3 &#39;hi&#39; &#x41; &nbsp;x &unknown;')).toBe("Tom & Jerry <3 'hi' A x &unknown;"))
  it('handles empty input', () => expect(htmlToText('<p></p>')).toBe(''))
})

describe('countWords', () => {
  it('counts words', () => expect(countWords('one two three')).toBe(3))
  it('counts nothing in empty text', () => expect(countWords('')).toBe(0))
})
