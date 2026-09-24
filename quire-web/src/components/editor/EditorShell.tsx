import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { COLLAB_FIELD, schemaExtensions } from '@quire/editor'
import clsx from 'clsx'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, CloudOff, Loader2 } from 'lucide-react'
import type { PageDto, PageTreeDto, WIDTH_MODES } from '@quire/shared'
import { useUIStore } from '../../store/uiStore'
import { useCurrentUser } from '../../hooks/useSession'
import { ApiError } from '../../lib/apiClient'
import { api } from '../../lib/apiClient'
import { pageKeys, refreshPage, saveDraft, usePatchPage, usePublish } from '../../queries/pages'
import { useSpace } from '../../queries/spaces'
import { useUserLookup } from '../../queries/users'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Menu'
import { Modal } from '../ui/Modal'
import { usePageRoute } from '../page/usePageRoute'
import { EditorToolbar } from './EditorToolbar'
import { SlashMenu } from './SlashMenu'
import { useSlashMenu } from './useSlashMenu'
import { BubbleToolbar } from './BubbleToolbar'
import { Callout } from './extensions/callout'
import { Expand } from './extensions/expand'
import { collabEnabled, useCollabSession, whenSynced, type CollabSession } from './useCollab'
import { avatarColor } from '../../lib/avatarColor'
import { PageSkeleton } from '../ui/Skeleton'
import { EditorShortcuts } from './extensions/editorShortcuts'
import { SmartLinks } from './extensions/smartLinks'
import { promptForLink } from './linkPrompt'
import type { Page, WidthMode } from '../../types'
import { Forbidden } from '../../routes/Forbidden'

/**
 * `conflict`: someone else saved or published since this editor loaded; nothing more is sent until
 * the person reloads or copies their changes out (design.md §9.3).
 */
type SaveState = 'saved' | 'saving' | 'offline' | 'error' | 'conflict'

/** A page title from the cached trees, for turning pasted page links into titled links. */
function cachedTitle(qc: ReturnType<typeof useQueryClient>, spaceId: string, pageId: string): string | null {
  const walk = (nodes: PageTreeDto[] | undefined): string | null => {
    for (const n of nodes ?? []) {
      if (n.id === pageId) return n.title
      const inner = walk(n.children)
      if (inner) return inner
    }
    return null
  }
  return walk(qc.getQueryData<PageTreeDto[]>(pageKeys.tree(spaceId)))
}

export function EditorShell() {
  const { pageId } = useParams()
  const { page, fallback } = usePageRoute(pageId)
  const userById = useUserLookup()
  const me = useCurrentUser()
  const qc = useQueryClient()
  // Bumped by Reload after a conflict: remounts the editor on what the server has now.
  const [generation, setGeneration] = useState(0)
  const collaborative = collabEnabled() && Boolean(page?.access?.edit)
  const collab = useCollabSession(pageId ?? '', me, collaborative)

  if (!page) return fallback
  if (!page.access?.edit) return <Forbidden action="edit" ownerName={userById(page.ownerId).name} />
  if (collaborative && !collab) return <PageSkeleton />

  async function reload() {
    await qc.refetchQueries({ queryKey: pageKeys.page(page!.id), exact: true })
    setGeneration((g) => g + 1)
  }

  return <EditorWorkspace key={`${page.id}:${generation}:${collab ? 'collab' : 'rest'}`} page={page} collab={collab} onReload={reload} />
}

/** What another person just did to the page, as editors see it. */
function eventMessage(type: string, name: string) {
  switch (type) {
    case 'published':
      return `${name} published this page.`
    case 'moved':
      return `${name} moved this page.`
    case 'archived':
      return `${name} archived this page. Your changes are kept in its draft.`
    case 'deleted':
      return `${name} deleted this page. Your changes are kept in its draft.`
    case 'restored':
      return `${name} restored this page.`
    case 'discarded':
      return `${name} discarded the unpublished changes, so this is the published version again.`
    default:
      return `${name} changed who can see or edit this page.`
  }
}

function EditorWorkspace({ page, collab, onReload }: { page: Page; collab: CollabSession | null; onReload: () => Promise<void> }) {
  const currentUser = useCurrentUser()
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const space = useSpace(spaceId)
  const publish = usePublish()
  const patchPage = usePatchPage()
  const pushToast = useUIStore((s) => s.pushToast)
  const setPendingCommentAnchor = useUIStore((s) => s.setPendingCommentAnchor)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const userById = useUserLookup()

  const [title, setTitle] = useState(page.title === 'Untitled' ? '' : page.title)
  const [widthMode, setWidthMode] = useState<WidthMode>(page.widthMode)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = useState(Date.now())
  const [, tick] = useState(0)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [versionComment, setVersionComment] = useState('')
  const [notifyWatchers, setNotifyWatchers] = useState(true)

  // What the server last acknowledged: the draft revision and the page's lock version (If-Match values).
  const revRef = useRef(page.draftRev)
  const lockRef = useRef(page.lockVersion ?? 0)
  const savedTitle = useRef(page.title)
  // Body changes the server hasn't acknowledged yet, and the save in flight (saves go one at a time).
  const dirty = useRef(false)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef<SaveState>('saved')
  const setState = (s: SaveState) => {
    stateRef.current = s
    setSaveState(s)
  }

  const editor = useEditor({
    extensions: [
      // The shared document schema, with the web's editing views for callouts and expands.
      ...schemaExtensions({ collaborative: Boolean(collab) }).map((ext) => (ext.name === 'callout' ? Callout : ext.name === 'expand' ? Expand : ext)),
      Placeholder.configure({ placeholder: 'Body… type / to insert' }),
      EditorShortcuts.configure({
        onLink: () => {
          if (editorRef.current) promptForLink(editorRef.current)
        },
        onEscape: () => document.querySelector<HTMLElement>('#editor-toolbar [tabindex="0"]')?.focus(),
      }),
      SmartLinks.configure({ resolveTitle: (linkSpaceId, linkPageId) => cachedTitle(qc, linkSpaceId, linkPageId) }),
      ...(collab
        ? [
            Collaboration.configure({ document: collab.document, field: COLLAB_FIELD }),
            CollaborationCaret.configure({ provider: collab.provider, user: { name: currentUser.name, color: avatarColor(currentUser.colorSeed) } }),
          ]
        : []),
    ],
    // Co-editing takes the body from the shared document; plain editing from the page.
    content: collab ? undefined : page.contentHtml,
    editorProps: { attributes: { class: 'prose max-w-none' } },
    onUpdate: () => {
      if (collab) return
      dirty.current = true
      scheduleSave()
    },
  })

  const slash = useSlashMenu(editor ?? null)
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  function onConflict() {
    setState('conflict')
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }

  function failed(err: unknown) {
    if (err instanceof ApiError && err.status === 409) onConflict()
    else setState(err instanceof ApiError && err.offline ? 'offline' : 'error')
  }

  /** Send the body if it changed; resolves true once the server has everything. */
  async function flush(): Promise<boolean> {
    if (collab) return stateRef.current !== 'conflict' && (await whenSynced(collab.provider))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    while (inFlight.current) await inFlight.current
    if (stateRef.current === 'conflict') return false
    const ed = editorRef.current
    if (!dirty.current || !ed || ed.isDestroyed) return stateRef.current === 'saved'
    const html = ed.getHTML()
    dirty.current = false
    setState('saving')
    const run = saveDraft(page.id, html, revRef.current)
      .then((draft) => {
        revRef.current = draft.rev
        setLastSavedAt(Date.now())
        if (!dirty.current) setState('saved')
        return true
      })
      .catch((err: unknown) => {
        dirty.current = true
        failed(err)
        return false
      })
      .finally(() => {
        inFlight.current = null
      })
    inFlight.current = run
    return run
  }

  function scheduleSave() {
    if (stateRef.current === 'conflict') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (!navigator.onLine) {
      setState('offline')
      return
    }
    setState('saving')
    saveTimer.current = setTimeout(() => void flush(), 700)
  }

  // Title and width saves run one after another: each needs the lock version the previous one returned.
  const metaQueue = useRef<Promise<unknown>>(Promise.resolve())

  /** Save the title (and width) if they changed; keeps the lock version current. */
  function saveMeta(patch: { title?: string; widthMode?: (typeof WIDTH_MODES)[number] }): Promise<boolean> {
    const run = metaQueue.current.then(async () => {
      const changes = { ...patch }
      // Checked when it runs: a save queued behind an identical one has nothing left to do.
      if (changes.title !== undefined && changes.title === savedTitle.current) delete changes.title
      if (Object.keys(changes).length === 0) return true
      if (stateRef.current === 'conflict') return false
      try {
        const dto: PageDto = await patchPage.mutateAsync({ page: { id: page.id, lockVersion: lockRef.current }, patch: changes })
        lockRef.current = dto.lockVersion
        savedTitle.current = dto.title
        return true
      } catch (err) {
        failed(err)
        return false
      }
    })
    metaQueue.current = run
    return run
  }

  const titleToSave = () => title.trim() || 'Untitled'

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    function goOffline() {
      if (stateRef.current !== 'conflict') setState('offline')
    }
    function goOnline() {
      if (dirty.current) scheduleSave()
      else if (stateRef.current === 'offline') setState('saved')
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While co-editing, the connection says whether the server has everything; title conflicts still win.
  const shownState: SaveState = collab && saveState !== 'conflict' && saveState !== 'error' ? collab.status : saveState
  useEffect(() => {
    if (collab && stateRef.current !== 'conflict' && stateRef.current !== 'error') stateRef.current = collab.status
  }, [collab, collab?.status])

  // Someone else published while we were here: take the new lock version so our next publish isn't a conflict.
  const events = collab?.events ?? []
  const lastEvent = [...events].reverse().find((e) => e.byUserId !== currentUser.id)
  useEffect(() => {
    if (lastEvent?.type !== 'published' && lastEvent?.type !== 'restored') return
    void qc.fetchQuery({ queryKey: pageKeys.page(page.id), queryFn: () => api.get<PageDto>(`/pages/${page.id}`), staleTime: 0 }).then((dto) => {
      lockRef.current = dto.lockVersion
      savedTitle.current = dto.title
    })
  }, [lastEvent, qc, page.id])

  // The browser's own "leave site?" prompt, only while something hasn't reached the server (§9.2).
  const unsent = shownState !== 'saved'
  useEffect(() => {
    if (!unsent) return
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsent])

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void flush().then((ok) => ok && pushToast({ message: 'Saved', tone: 'success' }))
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void handlePrimaryAction()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, title])

  if (!editor) return null

  const chain = page.ancestors ?? []
  const isNeverPublished = (page.publishedVersion ?? 0) === 0
  const primaryLabel = isNeverPublished ? 'Publish' : 'Update'
  const pagePath = `/spaces/${spaceId}/pages/${page.id}`

  async function handlePrimaryAction(comment?: string) {
    if (publishing) return
    setPublishing(true)
    try {
      if (!(await saveMeta({ title: titleToSave() })) || !(await flush())) {
        if (stateRef.current !== 'conflict') pushToast({ message: 'Couldn’t save your changes, so nothing was published. Try again.', tone: 'danger' })
        return
      }
      try {
        await publish.mutateAsync({ page: { id: page.id, lockVersion: lockRef.current }, comment })
      } catch (err) {
        if (err instanceof ApiError && err.code === 'nothing_to_publish') {
          // Nothing changed since the last publish: just go back to reading.
          navigate(pagePath)
          return
        }
        failed(err)
        if (stateRef.current !== 'conflict') pushToast({ message: `Couldn’t publish: ${err instanceof Error ? err.message : 'unknown error'}`, tone: 'danger' })
        return
      }
      setPublishOpen(false)
      pushToast({ message: isNeverPublished ? 'Published' : 'Updated', tone: 'success' })
      navigate(pagePath)
    } finally {
      setPublishing(false)
    }
  }

  async function handleSaveAsDraft() {
    if ((await saveMeta({ title: titleToSave() })) && (await flush())) {
      pushToast({ message: 'Saved as draft', tone: 'info' })
      navigate(pagePath)
    }
  }

  async function handleClose() {
    await saveMeta({ title: titleToSave() })
    if (collab) await whenSynced(collab.provider, 1500)
    if (shownState !== 'saved' || stateRef.current === 'conflict' || stateRef.current === 'error' || dirty.current || collab?.provider.hasUnsyncedChanges) {
      setCloseConfirmOpen(true)
      return
    }
    void refreshPage(qc, page.id, page.spaceId)
    navigate(pagePath)
  }

  async function copyMyChanges() {
    await navigator.clipboard?.writeText(editor?.getHTML() ?? '')
    pushToast({ message: 'Your version is on the clipboard', tone: 'success' })
  }

  function handleComment(selectedText: string) {
    setPendingCommentAnchor(selectedText)
    openRightPanel('comments')
  }

  const secondsAgo = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000))

  return (
    <div className="flex-1 flex flex-col min-w-0 editor-canvas">
      <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-(--color-border-default) bg-(--color-bg-canvas)">
        <Button variant="subtle" iconOnly icon={<ChevronLeft strokeWidth={1.5} />} onClick={() => void handleClose()} aria-label="Close editor" />
        <span className="t-ui-md-medium truncate">
          Editing &middot; {space?.key} {chain.length > 0 && `/ ${chain.map((c) => c.title).join(' / ')}`}
        </span>
        <SaveIndicator state={shownState} secondsAgo={secondsAgo} onRetry={() => void flush()} />
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <div className="flex -space-x-2" aria-label="People editing">
            <Avatar user={currentUser} size={24} presence />
            {(collab?.peers ?? []).slice(0, 3).map((p) => (
              <Avatar key={p.clientId} user={userById(p.userId)} size={24} presence />
            ))}
          </div>
          <div className="flex items-center">
            <Button variant="primary" className="rounded-r-none" loading={publishing} disabled={shownState === 'conflict'} onClick={() => void handlePrimaryAction()}>
              {primaryLabel}
            </Button>
            <Menu
              align="end"
              trigger={
                <Button variant="primary" iconOnly className="rounded-l-none border-l border-white/30" icon={<ChevronDown strokeWidth={1.5} />} aria-label="Publish options" />
              }
              items={[
                { label: 'Publish options…', onSelect: () => setPublishOpen(true) },
                ...(isNeverPublished ? [{ label: 'Save as draft', onSelect: () => void handleSaveAsDraft() }] : []),
              ]}
            />
          </div>
        </div>
      </header>

      {lastEvent && saveState !== 'conflict' && (
        <div role="status" className="shrink-0 flex items-center gap-2 px-4 py-2 bg-(--status-neutral-subtle) text-(--status-neutral-text) t-ui-md">
          {eventMessage(lastEvent.type, userById(lastEvent.byUserId).name)}
        </div>
      )}

      {saveState === 'conflict' && (
        <div role="alert" className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 bg-(--status-warning-subtle) text-(--status-warning-text) t-ui-md">
          <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span className="grow">Someone else changed this page while you were editing. Your version is still here, but it hasn’t been saved.</span>
          <Button variant="default" size="compact" onClick={() => void copyMyChanges()}>
            Copy my changes
          </Button>
          <Button variant="primary" size="compact" onClick={() => void onReload()}>
            Reload
          </Button>
        </div>
      )}

      <EditorToolbar
        editor={editor}
        widthMode={widthMode}
        onWidthModeChange={(m) => {
          setWidthMode(m)
          void saveMeta({ widthMode: m })
        }}
      />

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
            onBlur={() => void saveMeta({ title: titleToSave() })}
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
            <Button variant="danger" onClick={() => navigate(pagePath)}>
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
            <Button variant="primary" loading={publishing} onClick={() => void handlePrimaryAction(versionComment)}>
              {primaryLabel}
            </Button>
          </>
        }
      >
        <label className="t-ui-md flex items-center gap-2 mb-3">
          <input type="checkbox" checked={notifyWatchers} onChange={(e) => setNotifyWatchers(e.target.checked)} className="accent-(--color-bg-accent)" />
          Notify watchers
        </label>
        <label htmlFor="version-comment" className="t-ui-md-medium block mb-1">Version comment</label>
        <input id="version-comment"
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
        <CloudOff className="w-3.5 h-3.5" strokeWidth={1.5} /> Offline &mdash; not saved yet, keep this tab open
      </span>
    )
  }
  if (state === 'conflict') {
    return (
      <span className="t-ui-sm flex items-center gap-1.5 text-(--status-danger-text)">
        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} /> Not saved
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
