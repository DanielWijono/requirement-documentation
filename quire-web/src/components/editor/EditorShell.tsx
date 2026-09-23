import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import ImageExt from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import clsx from 'clsx'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, CloudOff, Loader2 } from 'lucide-react'
import { canView, usePage, useContentStore, ancestorChainIn, usePageTree, useSpace } from '../../store/contentStore'
import { useUIStore } from '../../store/uiStore'
import { currentUser, users } from '../../data/mockData'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Menu'
import { Modal } from '../ui/Modal'
import { EditorToolbar } from './EditorToolbar'
import { SlashMenu } from './SlashMenu'
import { useSlashMenu } from './useSlashMenu'
import { BubbleToolbar } from './BubbleToolbar'
import { Callout } from './extensions/callout'
import { Expand } from './extensions/expand'
import { Mention } from './extensions/mention'
import type { WidthMode } from '../../types'
import { NotFound } from '../../routes/NotFound'
import { Forbidden } from '../../routes/Forbidden'

type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

export function EditorShell() {
  const { pageId, spaceId } = useParams()
  const navigate = useNavigate()
  const page = usePage(pageId)
  const space = useSpace(spaceId)
  const tree = usePageTree(spaceId)
  const saveContent = useContentStore((s) => s.saveContent)
  const updatePageMeta = useContentStore((s) => s.updatePageMeta)
  const pushToast = useUIStore((s) => s.pushToast)
  const setPendingCommentAnchor = useUIStore((s) => s.setPendingCommentAnchor)
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  const [title, setTitle] = useState(page?.title === 'Untitled' ? '' : page?.title ?? '')
  const [widthMode, setWidthMode] = useState<WidthMode>(page?.widthMode ?? 'reading')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = useState(Date.now())
  const [, tick] = useState(0)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [versionComment, setVersionComment] = useState('')
  const [notifyWatchers, setNotifyWatchers] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Highlight,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Body… type / to insert' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ImageExt,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Callout,
      Expand,
      Mention,
    ],
    content: page?.contentHtml ?? '<p></p>',
    editorProps: { attributes: { class: 'prose max-w-none' } },
    onUpdate: () => scheduleSave(),
  })

  const slash = useSlashMenu(editor ?? null)

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (!navigator.onLine) {
      setSaveState('offline')
      return
    }
    setSaveState('saving')
    saveTimer.current = setTimeout(() => {
      if (!page || !editor || editor.isDestroyed) return
      saveContent(page.id, editor.getHTML(), { publish: false })
      setSaveState('saved')
      setLastSavedAt(Date.now())
    }, 700)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    function goOffline() {
      setSaveState('offline')
    }
    function goOnline() {
      scheduleSave()
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!page) return
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        pushToast({ message: 'Saved', tone: 'success' })
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handlePrimaryAction()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, editor])

  const chain = useMemo(() => (page ? ancestorChainIn(tree, page.id).slice(0, -1) : []), [tree, page])

  if (!page) return <NotFound />
  if (!canView(page)) return <Forbidden page={page} />
  if (!editor) return null

  const isNeverPublished = page.versions.length === 0
  const primaryLabel = isNeverPublished ? 'Publish' : 'Update'

  function handlePrimaryAction(comment?: string) {
    if (!page || !editor) return
    updatePageMeta(page.id, { title: title.trim() || 'Untitled' })
    saveContent(page.id, editor.getHTML(), { publish: true, comment })
    setPublishOpen(false)
    pushToast({ message: isNeverPublished ? 'Published' : 'Updated', tone: 'success' })
    navigate(`/spaces/${spaceId}/pages/${page.id}`)
  }

  function handleSaveAsDraft() {
    if (!page || !editor) return
    updatePageMeta(page.id, { title: title.trim() || 'Untitled' })
    saveContent(page.id, editor.getHTML(), { publish: false })
    pushToast({ message: 'Saved as draft', tone: 'info' })
    navigate(`/spaces/${spaceId}/pages/${page.id}`)
  }

  function handleClose() {
    if (!page) return
    if (saveState === 'saving' || saveState === 'offline' || saveState === 'error') {
      setCloseConfirmOpen(true)
      return
    }
    updatePageMeta(page.id, { title: title.trim() || 'Untitled' })
    navigate(`/spaces/${spaceId}/pages/${page.id}`)
  }

  function handleComment(selectedText: string) {
    setPendingCommentAnchor(selectedText)
    openRightPanel('comments')
  }

  const secondsAgo = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000))

  return (
    <div className="flex-1 flex flex-col min-w-0 editor-canvas">
      <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-(--color-border-default) bg-(--color-bg-canvas)">
        <Button variant="subtle" iconOnly icon={<ChevronLeft strokeWidth={1.5} />} onClick={handleClose} aria-label="Close editor" />
        <span className="t-ui-md-medium truncate">
          Editing &middot; {space?.key} {chain.length > 0 && `/ ${chain.map((c) => c.title).join(' / ')}`}
        </span>
        <SaveIndicator state={saveState} secondsAgo={secondsAgo} onRetry={scheduleSave} />
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <div className="flex -space-x-2">
            <Avatar user={currentUser} size={24} presence />
            <Avatar user={users[1]} size={24} presence />
          </div>
          <div className="flex items-center">
            <Button variant="primary" className="rounded-r-none" onClick={() => handlePrimaryAction()}>
              {primaryLabel}
            </Button>
            <Menu
              align="end"
              trigger={
                <Button variant="primary" iconOnly className="rounded-l-none border-l border-white/30" icon={<ChevronDown strokeWidth={1.5} />} aria-label="Publish options" />
              }
              items={[
                { label: 'Publish options…', onSelect: () => setPublishOpen(true) },
                ...(isNeverPublished ? [{ label: 'Save as draft', onSelect: handleSaveAsDraft }] : []),
              ]}
            />
          </div>
        </div>
      </header>

      <EditorToolbar editor={editor} widthMode={widthMode} onWidthModeChange={(m) => { setWidthMode(m); updatePageMeta(page.id, { widthMode: m }) }} />

      <div className="flex-1 overflow-y-auto">
        <div
          className={clsx(
            'mx-auto px-6 py-8',
            widthMode === 'reading' && 'max-w-[760px]',
            widthMode === 'wide' && 'max-w-[960px]',
            widthMode === 'full' && 'max-w-none',
          )}
        >
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => updatePageMeta(page.id, { title: title.trim() || 'Untitled' })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.chain().focus('start').run()
              }
            }}
            placeholder="Give this page a title"
            rows={1}
            ref={(el) => {
              if (el) {
                el.style.height = 'auto'
                el.style.height = `${el.scrollHeight}px`
              }
            }}
            className="t-content-title w-full outline-none bg-transparent mb-4 placeholder:text-(--color-text-disabled) resize-none overflow-hidden block"
          />
          <EditorContent editor={editor} />
        </div>
      </div>

      <SlashMenu key={`${slash.open}-${slash.query}`} editor={editor} open={slash.open} query={slash.query} rect={slash.rect} onCommit={slash.commit} onClose={slash.close} />
      <BubbleToolbar editor={editor} onComment={handleComment} />

      <Modal
        open={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        title="Leave without saving?"
        width="confirm"
        initialFocusDangerous
        footer={
          <>
            <Button variant="default" data-cancel onClick={() => setCloseConfirmOpen(false)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => navigate(`/spaces/${spaceId}/pages/${page.id}`)}>
              Discard and leave
            </Button>
          </>
        }
      >
        <p className="t-ui-md flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-(--status-warning-bold) shrink-0" strokeWidth={1.5} />
          Your latest changes haven&rsquo;t reached the server yet. Leaving now may lose them.
        </p>
      </Modal>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish options"
        width="confirm"
        footer={
          <>
            <Button variant="default" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => handlePrimaryAction(versionComment)}>
              {primaryLabel}
            </Button>
          </>
        }
      >
        <label className="t-ui-md flex items-center gap-2 mb-3">
          <input type="checkbox" checked={notifyWatchers} onChange={(e) => setNotifyWatchers(e.target.checked)} className="accent-(--color-bg-accent)" />
          Notify watchers
        </label>
        <label className="t-ui-md-medium block mb-1">Version comment</label>
        <input
          value={versionComment}
          onChange={(e) => setVersionComment(e.target.value)}
          placeholder="What changed?"
          className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
        />
      </Modal>
    </div>
  )
}

function SaveIndicator({ state, secondsAgo, onRetry }: { state: SaveState; secondsAgo: number; onRetry: () => void }) {
  if (state === 'saving') {
    return (
      <span className="t-ui-sm flex items-center gap-1.5 text-(--color-text-secondary)" aria-live="polite">
        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> Saving…
      </span>
    )
  }
  if (state === 'offline') {
    return (
      <span className="t-ui-sm flex items-center gap-1.5 text-(--status-warning-text)" aria-live="polite">
        <CloudOff className="w-3.5 h-3.5" strokeWidth={1.5} /> Offline &mdash; changes stored locally
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="t-ui-sm flex items-center gap-1.5 text-(--status-danger-text)" role="alert">
        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} /> Couldn&rsquo;t save
        <button onClick={onRetry} className="underline font-medium">
          Retry
        </button>
      </span>
    )
  }
  return (
    <span className="t-ui-sm flex items-center gap-1.5 text-(--color-text-secondary)" aria-live="polite">
      <Check className="w-3.5 h-3.5 text-(--status-success-bold)" strokeWidth={1.5} /> Saved {secondsAgo}s ago
    </span>
  )
}
