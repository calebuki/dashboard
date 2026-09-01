import { describe, expect, it } from 'vitest'
import { nextWeekend, parseFlexibleTime, parseQuickTask } from './quick-add'

describe('quick task entry', () => {
  const reference = new Date(2026, 8, 1, 9, 0, 0)

  it('extracts a conversational date and time from a task title', () => {
    expect(parseQuickTask('Call financial aid tomorrow at 10am', reference)).toEqual({
      title: 'Call financial aid',
      dueDate: '2026-09-02',
      dueTime: '10:00'
    })
  })

  it('defaults an unscheduled task to today', () => {
    expect(parseQuickTask('Review the outline', reference)).toEqual({
      title: 'Review the outline',
      dueDate: '2026-09-01',
      dueTime: ''
    })
  })

  it('accepts forgiving time formats', () => {
    expect(parseFlexibleTime('9')).toBe('09:00')
    expect(parseFlexibleTime('9am')).toBe('09:00')
    expect(parseFlexibleTime('6:15 pm')).toBe('18:15')
    expect(parseFlexibleTime('14:30')).toBe('14:30')
    expect(parseFlexibleTime('27:00')).toBeNull()
  })

  it('chooses the next Saturday for the weekend shortcut', () => {
    expect(nextWeekend('2026-09-01')).toBe('2026-09-05')
  })
})
