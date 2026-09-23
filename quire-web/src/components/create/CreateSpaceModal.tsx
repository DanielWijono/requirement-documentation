import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useContentStore } from '../../store/contentStore'

export function CreateSpaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const createSpace = useContentStore((s) => s.createSpace)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('\u{1F4C1}')

  function handleCreate() {
    if (!name.trim()) return
    const id = createSpace({ name: name.trim(), key: key.trim() || name.slice(0, 4), description, icon })
    setName('')
    setKey('')
    setDescription('')
    onClose()
    navigate(`/spaces/${id}`)
  }

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
          <Button variant="primary" onClick={handleCreate} disabled={!name.trim()}>
            Create space
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div>
            <label className="t-ui-md-medium block mb-1.5">Icon</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="t-ui-md w-14 h-8 text-center rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            />
          </div>
          <div className="grow">
            <label className="t-ui-md-medium block mb-1.5">Name</label>
            <input
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Design"
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            />
          </div>
          <div className="w-24">
            <label className="t-ui-md-medium block mb-1.5">Key</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="DES"
              className="t-ui-md w-full h-8 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)"
            />
          </div>
        </div>
        <div>
          <label className="t-ui-md-medium block mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What's this space for?"
            className="t-ui-md w-full resize-none rounded-(--radius-sm) border border-(--color-border-strong) p-2 bg-(--color-bg-canvas)"
          />
        </div>
      </div>
    </Modal>
  )
}
