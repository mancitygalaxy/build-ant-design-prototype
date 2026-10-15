export interface StarterCopy {
  title: string
  description: string
}

export function normalizeCount(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

