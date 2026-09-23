/** Offer `content` to the viewer as a file download. No-op where Blob URLs are unavailable. */
export function downloadFile(filename: string, content: string, type = 'application/json') {
  if (typeof URL.createObjectURL !== 'function') return false
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return true
}
