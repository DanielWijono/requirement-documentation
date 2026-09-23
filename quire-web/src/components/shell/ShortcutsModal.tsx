import { Modal } from '../ui/Modal'

const GROUPS: { scope: string; rows: [string, string][] }[] = [
  {
    scope: 'Global',
    rows: [
      ['⌘K / Ctrl K', 'Command palette'],
      ['/', 'Command palette (outside editable)'],
      ['C', 'Create page'],
      ['[ / ]', 'Toggle space nav / right panel'],
      ['?', 'Shortcut reference'],
    ],
  },
  {
    scope: 'Read mode',
    rows: [
      ['E', 'Edit page'],
      ['M', 'Add comment on selection'],
      ['S', 'Star / unstar'],
    ],
  },
  {
    scope: 'Editor',
    rows: [
      ['⌘S', 'Force save'],
      ['⌘ Enter', 'Publish / Update'],
      ['⌘K', 'Insert / edit link'],
      ['⌘⌇1–4', 'Heading 1–4'],
      ['⌘⌇0', 'Normal text'],
      ['⌘⇧7 / 8 / 9', 'Numbered / bullet / task list'],
      ['` / ⌘⌥C', 'Inline code / code block'],
      ['Esc', 'Close menus'],
    ],
  },
]

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="form">
      <div className="flex flex-col gap-5">
        {GROUPS.map((g) => (
          <div key={g.scope}>
            <p className="t-ui-sm-medium text-(--color-text-secondary) mb-2">{g.scope}</p>
            <div className="flex flex-col gap-1.5">
              {g.rows.map(([key, action]) => (
                <div key={action} className="flex items-center justify-between t-ui-md">
                  <span>{action}</span>
                  <kbd className="t-ui-sm px-1.5 h-5 inline-flex items-center rounded-(--radius-sm) bg-(--color-bg-sunken) border border-(--color-border-default)">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
