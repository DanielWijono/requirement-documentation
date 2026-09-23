import { useEffect } from 'react'

/**
 * While `active`, remember what had focus; when it turns inactive (or unmounts), give focus back.
 * Keeps focus from being lost when panels, palettes and dialogs close (design.md §11).
 */
export function useReturnFocus(active = true) {
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement as HTMLElement | null
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus()
    }
  }, [active])
}
