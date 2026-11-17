import type { Category } from '../types'

export const areas: Record<Category, { label: string }> = {
  personal: { label: 'Personal' },
  work: { label: 'Work' },
  school: { label: 'School' }
}

export const areaKeys = Object.keys(areas) as Category[]
