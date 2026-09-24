import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useCreateSpace } from '../../queries/spaces'
import { ApiError } from '../../lib/apiClient'

/** A key from the name when none is typed: its first letters and digits, starting with a letter. */
function keyFromName(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^[0-9]+/, '')
  return letters.length >= 2 ? letters.slice(0, 4) : 'SPACE'
}

export function CreateSpaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const createSpace = useCreateSpace()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('\u{1F4C1}')

  function handleCreate() {
    if (!name.trim()) return
    createSpace.mutate(
      { name: name.trim(), key: key.trim() || keyFromName(name), description, icon },
      {
        onSuccess: (space) => {
          setName('')
          setKey('')
          setDescription('')
          createSpace.reset()
          onClose()
          navigate(`/spaces/${space.id}`)
        },
      },
    )
  }

  const error = createSpace.error instanceof ApiError ? createSpace.error : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a space"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={!name.trim()} loading={createSpace.isPending}>
            Create space
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div>
            <label htmlFor="space-icon" className="t-ui-md-medium block mb-1.5">Icon</label>
            <input id="space-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="t-ui-md w-14 h-8 text-center rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            />
          </div>
          <div className="grow">
            <label htmlFor="space-name-new" className="t-ui-md-medium block mb-1.5">Name</label>
            <input id="space-name-new"
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Design"
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            />
          </div>
          <div className="w-24">
            <label htmlFor="space-key-new" className="t-ui-md-medium block mb-1.5">Key</label>
            <input id="space-key-new"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="DES"
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            />
          </div>
        </div>
        <div>
          <label htmlFor="space-description-new" className="t-ui-md-medium block mb-1.5">Description</label>
          <textarea id="space-description-new"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What's this space for?"
            className="t-ui-md w-full resize-none rounded-(--radius-sm) border border-(--color-border-strong) p-2 bg-(--color-bg-canvas)"
          />
        </div>
        {error && (
          <p role="alert" className="t-ui-sm text-(--status-danger-text)">
            {error.code === 'key_taken' ? 'Another space already uses that key.' : error.offline ? error.message : `Couldn’t create the space: ${error.message}`}
          </p>
        )}
      </div>
    </Modal>
  )
}
