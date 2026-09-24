/** People's colours: avatars, and their cursors while co-editing. */
const PALETTE = [
  '#0E6B70',
  '#5B4FC4',
  '#B7791F',
  '#2E7A4E',
  '#B83A2A',
  '#56606E',
  '#6B4FA0',
  '#3A6EA5',
]

export function avatarColor(seed: number) {
  return PALETTE[Math.abs(seed) % PALETTE.length]
}
