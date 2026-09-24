import { describe, expect, it } from 'vitest'
import { nextWeekend, parseFlexibleTime, parseQuickTask } from './quick-add'

describe('quick task entry', () => {
  const reference = new Date(2026, 8, 1, 9, 0, 0)

  it('extracts a conversational date and time from a task title', () => {
    expect(parseQuickTask('Call financial aid tomorrow at 10am', reference)).toMatchObject({
      title: 'Call financial aid',
      dueDate: '2026-09-02',
      dueTime: '10:00'
    })
  })

  it('defaults an unscheduled task to today', () => {
    expect(parseQuickTask('Review the outline', reference)).toEqual({
      title: 'Review the outline',
      dueDate: '2026-09-01',
      dueTime: '',
      tokens: []
    })
  })

  it('understands areas, repeats, and importance', () => {
    expect(parseQuickTask('Standup every weekday at 9:15 #work', reference)).toMatchObject({
      title: 'Standup',
      dueTime: '09:15',
      category: 'work',
      recurrence: 'weekdays'
    })
    expect(parseQuickTask('Stretch daily', reference)).toMatchObject({
      title: 'Stretch',
      recurrence: 'daily'
    })
    expect(parseQuickTask('Pay rent friday !', reference)).toMatchObject({
      title: 'Pay rent',
      dueDate: '2026-09-04',
      important: true
    })
  })

  it('repeats weekly on a named weekday', () => {
    expect(parseQuickTask('Piano every thursday 5pm', reference)).toMatchObject({
      title: 'Piano',
      dueDate: '2026-09-03',
      dueTime: '17:00',
      recurrence: 'weekly'
    })
  })

  it('leaves unknown hashtags in the title', () => {
    expect(parseQuickTask('Post #photos', reference).title).toBe('Post #photos')
  })

  it('accepts forgiving time formats', () => {
    expect(parseFlexibleTime('9')).toBe('09:00')
    expect(parseFlexibleTime('9am')).toBe('09:00')
    expect(parseFlexibleTime('6:15 pm')).toBe('18:15')
    expect(parseFlexibleTime('330p')).toBe('15:30')
    expect(parseFlexibleTime('14:30')).toBe('14:30')
    expect(parseFlexibleTime('noon')).toBe('12:00')
    expect(parseFlexibleTime('27:00')).toBeNull()
  })

  it('chooses the next Saturday for the weekend shortcut', () => {
    expect(nextWeekend('2026-09-01')).toBe('2026-09-05')
  })
})
