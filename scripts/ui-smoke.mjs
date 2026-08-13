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

async function clickButton(label) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim().includes(${JSON.stringify(label)}));
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Could not find the ${label} button.`)
  await new Promise((resolve) => setTimeout(resolve, 120))
}

async function capture(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const outputPath = join(tmpdir(), `dashboard-${name}.png`)
  await writeFile(outputPath, Buffer.from(result.data, 'base64'))
  return outputPath
}

await send('Page.enable')
await send('Runtime.enable')

await clickButton('Today')
const todayTaskCount = await evaluate('document.querySelectorAll(".task-card").length')
if (todayTaskCount < 4) throw new Error(`Expected at least four today tasks, found ${todayTaskCount}.`)
const todayScreenshot = await capture('today-smoke')

let phaseCount = await evaluate('document.querySelectorAll(".phase-row").length')
if (phaseCount === 0) {
  await clickButton('Conversational Swedish')
  phaseCount = await evaluate('document.querySelectorAll(".phase-row").length')
}
if (phaseCount !== 4) throw new Error(`Expected four Swedish phases, found ${phaseCount}.`)

await clickButton('Calendar')
const calendarDayCount = await evaluate('document.querySelectorAll(".calendar-day").length')
if (calendarDayCount !== 42) throw new Error(`Expected 42 calendar cells, found ${calendarDayCount}.`)
const calendarScreenshot = await capture('calendar-smoke')

await clickButton('Add')
const composerVisible = await evaluate('Boolean(document.querySelector(".task-composer"))')
if (!composerVisible) throw new Error('The task composer did not open from the calendar.')
const composerScreenshot = await capture('composer-smoke')
await clickButton('Cancel')

await clickButton('Today')
const timerStarted = await evaluate(`(() => {
  const button = document.querySelector('.task-timer');
  if (!button) return false;
  button.click();
  return true;
})()`)
if (!timerStarted) throw new Error('A task timer could not be started.')
await new Promise((resolve) => setTimeout(resolve, 120))
const timerVisible = await evaluate('Boolean(document.querySelector(".timer-bar"))')
if (!timerVisible) throw new Error('The focused timer bar did not appear.')
await evaluate('document.querySelector(".timer-bar button:last-child").click()')

await clickButton('Settings')
const settingRowCount = await evaluate('document.querySelectorAll(".setting-row").length')
if (settingRowCount !== 5) throw new Error(`Expected five setting rows, found ${settingRowCount}.`)
const settingsScreenshot = await capture('settings-smoke')

socket.close()
console.log(JSON.stringify({
  todayTaskCount,
  phaseCount,
  calendarDayCount,
  timerVisible,
  settingRowCount,
  screenshots: [todayScreenshot, calendarScreenshot, composerScreenshot, settingsScreenshot]
}, null, 2))
