import { BriefcaseBusiness, GraduationCap, UserRound } from 'lucide-react'
import type { Category } from '../types'

export const areas: Record<Category, { label: string; icon: typeof UserRound }> = {
  personal: { label: 'Personal', icon: UserRound },
  work: { label: 'Work', icon: BriefcaseBusiness },
  school: { label: 'School', icon: GraduationCap }
}

export const areaKeys = Object.keys(areas) as Category[]
