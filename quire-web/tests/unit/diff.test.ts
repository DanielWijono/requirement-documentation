import { describe, expect, it } from 'vitest'
import { diffHtml, hasChanges, htmlToBlocks } from '../../src/lib/diff'

describe('htmlToBlocks', () => {
  it('extracts innermost block text and collapses whitespace', () => {
    expect(htmlToBlocks('<h2>Title</h2><p>One\n   two</p><ul><li><p>item</p></li></ul>')).toEqual(['Title', 'One two', 'item'])
  })
})

describe('diffHtml', () => {
  it('marks word-level additions and removals per paragraph', () => {
    const paras = diffHtml('<p>six downstream consumers</p>', '<p>nine downstream consumers</p>')
    expect(paras).toHaveLength(1)
    expect(paras[0]).toEqual([
      { op: 'remove', text: 'six' },
      { op: 'add', text: 'nine' },
      { op: 'equal', text: ' downstream consumers' },
    ])
  })

  it('reports added paragraphs', () => {
    const paras = diffHtml('<p>a</p>', '<p>a</p><h2>New section</h2>')
    expect(paras.at(-1)).toEqual([{ op: 'add', text: 'New section' }])
    expect(hasChanges(paras)).toBe(true)
  })

  it('identical bodies have no changes', () => {
    expect(hasChanges(diffHtml('<p>same text</p>', '<p>same   text</p>'))).toBe(false)
  })
})
