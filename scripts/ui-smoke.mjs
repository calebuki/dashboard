import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const targets = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json())
const pageTarget = targets.find((target) => target.type === 'page' && target.url.includes('localhost:5173'))

if (!pageTarget?.webSocketDebuggerUrl) {
  throw new Error('The Dashboard development renderer was not found on port 9222.')
}

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let requestId = 0
const pending = new Map()

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
})

function send(method, params = {}) {
  requestId += 1
  socket.send(JSON.stringify({ id: requestId, method, params }))
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }))
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}

async function click(selector, description = selector) {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not find ${description}.`)
  await new Promise((resolve) => setTimeout(resolve, 450))
}

const nav = (label) => click(`.nav button[aria-label="${label}"]`, `the ${label} tab`)

async function capture(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const outputPath = join(tmpdir(), `dashboard-${name}.png`)
  await writeFile(outputPath, Buffer.from(result.data, 'base64'))
  return outputPath
}

await send('Page.enable')
await send('Runtime.enable')

await nav('Today')
const todayTaskCount = await evaluate('document.querySelectorAll(".task").length')
if (todayTaskCount < 3) throw new Error(`Expected at least three tasks, found ${todayTaskCount}.`)
const todayScreenshot = await capture('today-smoke')

await nav('Goals')
const goalCount = await evaluate('document.querySelectorAll(".goal-card").length')
if (goalCount < 1) throw new Error('Expected at least one goal card.')
const goalDayCount = await evaluate('document.querySelectorAll(".goal-card:first-child .goal-day").length')
if (goalDayCount !== 7) throw new Error(`Expected a seven-day goal week, found ${goalDayCount}.`)
const goalsScreenshot = await capture('goals-smoke')

await nav('Calendar')
const calendarDayCount = await evaluate('document.querySelectorAll(".calendar-day").length')
if (calendarDayCount !== 42) throw new Error(`Expected 42 calendar cells, found ${calendarDayCount}.`)
const calendarScreenshot = await capture('calendar-smoke')

await click('.agenda-head .soft-button', 'the calendar Add button')
const composerVisible = await evaluate('Boolean(document.querySelector(".composer-form .day-strip"))')
if (!composerVisible) throw new Error('The task composer did not open from the calendar.')
await click('.composer-form .segmented button:last-child', 'the Set a time option')
const wheelCount = await evaluate('document.querySelectorAll(".composer-form .wheel").length')
if (wheelCount !== 3) throw new Error(`Expected three time wheels, found ${wheelCount}.`)
const composerScreenshot = await capture('composer-smoke')
await click('.composer-actions .ghost-button', 'the composer Cancel button')

await nav('Today')
await click('.task .task-actions button[aria-label^="Start"]', 'a task timer button')
const timerVisible = await evaluate('Boolean(document.querySelector(".focus-timer"))')
if (!timerVisible) throw new Error('The focus timer did not appear.')
await click('.focus-timer button[aria-label="Stop timer"]', 'the Stop timer button')

await nav('Settings')
const settingRowCount = await evaluate('document.querySelectorAll(".setting-row").length')
if (settingRowCount !== 6) throw new Error(`Expected six setting rows, found ${settingRowCount}.`)
const settingsScreenshot = await capture('settings-smoke')

socket.close()
console.log(JSON.stringify({
  todayTaskCount,
  goalCount,
  calendarDayCount,
  wheelCount,
  timerVisible,
  settingRowCount,
  screenshots: [todayScreenshot, goalsScreenshot, calendarScreenshot, composerScreenshot, settingsScreenshot]
}, null, 2))
