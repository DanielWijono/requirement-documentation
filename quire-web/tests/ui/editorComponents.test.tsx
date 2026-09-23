import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mountEditor } from '../editorHarness'
import { EditorToolbar } from '../../src/components/editor/EditorToolbar'
import { BubbleToolbar } from '../../src/components/editor/BubbleToolbar'
import { SlashMenu } from '../../src/components/editor/SlashMenu'
import { useSlashMenu } from '../../src/components/editor/useSlashMenu'
import { SLASH_ITEMS } from '../../src/components/editor/slashItems'

let cleanupEditor: (() => void) | null = null
afterEach(() => cleanupEditor?.())

function setup(content?: string) {
  const { editor, destroy } = mountEditor(content)
  cleanupEditor = destroy
  return editor
}

describe('EditorToolbar', () => {
  it('reflects formatting state as the selection changes, without waiting for a parent render', async () => {
    const editor = setup('<p><strong>bold</strong> plain</p>')
    render(<EditorToolbar editor={editor} widthMode="reading" onWidthModeChange={() => {}} />)
    act(() => {
      editor.commands.setTextSelection(2)
    })
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    act(() => {
      editor.commands.setTextSelection(8)
    })
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('buttons and the block select apply formatting', async () => {
    const user = userEvent.setup()
    const editor = setup()
    render(<EditorToolbar editor={editor} widthMode="reading" onWidthModeChange={() => {}} />)
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 })
    })
    await user.click(screen.getByRole('button', { name: 'Italic' }))
    expect(editor.getHTML()).toContain('<em>hello</em>')
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Block type' }), 'h2')
    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    expect(screen.getByRole('combobox', { name: 'Block type' })).toHaveValue('h2')

    await user.click(screen.getByRole('button', { name: 'Bulleted list' }))
    expect(editor.isActive('bulletList')).toBe(true)
  })

  it('width menu reports the chosen mode', async () => {
    const user = userEvent.setup()
    const onWidthModeChange = vi.fn()
    render(<EditorToolbar editor={setup()} widthMode="reading" onWidthModeChange={onWidthModeChange} />)
    await user.click(screen.getByRole('button', { name: /Reading/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Full width' }))
    expect(onWidthModeChange).toHaveBeenCalledWith('full')
  })

  it('link button prompts and applies the URL; empty removes it', async () => {
    const user = userEvent.setup()
    const editor = setup()
    render(<EditorToolbar editor={editor} widthMode="reading" onWidthModeChange={() => {}} />)
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 })
    })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('https://example.com').mockReturnValueOnce('')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(editor.getHTML()).toContain('href="https://example.com"')
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 })
    })
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(editor.getHTML()).not.toContain('href=')
    prompt.mockRestore()
  })
})

describe('BubbleToolbar', () => {
  it('appears for a focused non-empty selection and sends the selected text to comments', async () => {
    const user = userEvent.setup()
    const editor = setup()
    const onComment = vi.fn()
    render(<BubbleToolbar editor={editor} onComment={onComment} />)
    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument()

    act(() => {
      // Tiptap's focus command defers; focus the DOM node directly so isFocused is true at once.
      ;(editor.view.dom as HTMLElement).focus()
      editor.commands.setTextSelection({ from: 1, to: 6 })
    })
    await user.click(screen.getByRole('button', { name: 'Bold' }))
    expect(editor.getHTML()).toContain('<strong>hello</strong>')
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveClass('text-(--color-text-link)')

    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(onComment).toHaveBeenCalledWith('hello')
  })
})

describe('slash menu', () => {
  it('useSlashMenu opens on "/" with the typed query and commit replaces it with the block', () => {
    const editor = setup('<p></p>')
    const { result } = renderHook(() => useSlashMenu(editor))
    act(() => {
      editor.commands.focus('end')
      editor.commands.insertContent('/head')
    })
    expect(result.current).toMatchObject({ open: true, query: 'head' })
    act(() => result.current.commit(SLASH_ITEMS.find((i) => i.id === 'h2')!))
    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    expect(editor.getText()).not.toContain('/head')
    expect(result.current.open).toBe(false)
  })

  it('does not open for a slash inside a word', () => {
    const editor = setup('<p></p>')
    const { result } = renderHook(() => useSlashMenu(editor))
    act(() => {
      editor.commands.focus('end')
      editor.commands.insertContent('and/or')
    })
    expect(result.current.open).toBe(false)
  })

  it('SlashMenu filters by label and keyword, groups results and supports arrow keys, Enter and Escape', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const onClose = vi.fn()
    const editor = setup()
    const { rerender } = render(<SlashMenu editor={editor} open query="" rect={new DOMRect()} onCommit={onCommit} onClose={onClose} />)
    expect(screen.getByText('Basic')).toBeInTheDocument()
    expect(screen.getByText('Layout')).toBeInTheDocument()

    rerender(<SlashMenu editor={editor} open query="todo" rect={new DOMRect()} onCommit={onCommit} onClose={onClose} />)
    expect(screen.getByText('Task list')).toBeInTheDocument()
    expect(screen.queryByText('Heading 1')).not.toBeInTheDocument()

    rerender(<SlashMenu editor={editor} open query="heading" rect={new DOMRect()} onCommit={onCommit} onClose={onClose} />)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'h2' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()

    rerender(<SlashMenu editor={editor} open query="zzz" rect={new DOMRect()} onCommit={onCommit} onClose={onClose} />)
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })
})
