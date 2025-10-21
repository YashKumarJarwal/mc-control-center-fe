<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
// We no longer need useAuth
import Convert from 'ansi-to-html'

// --- Refs ---
// We no longer need token
const config = useRuntimeConfig()
const ws = ref<WebSocket | null>(null)
// ... (rest of refs are the same)
const logContainer = ref<HTMLElement | null>(null)
const stdinData = ref('')
const selectedScript = ref('start')

// --- Reactive State (all same) ---
const isConnected = ref(false)
const sessionState = ref('idle')
const scriptName = ref<string | null>(null)
const exitCode = ref<number | null>(null)
const lines = ref<{ type: 'stdout' | 'stderr' | 'info' | 'error', data: string }[]>([])
const ansiConverter = new Convert({ fg: '#abb2bf', bg: '#282c34' });

// --- WebSocket Logic ---

function connect() {
  // We no longer check for a token
  if (ws.value) {
    ws.value.close()
  }

  // The URL no longer has the ?token= query parameter
  const wsUrl = config.public.apiUrl.replace(/^http/, 'ws') + `/ws/exec`
  addLog('info', `Connecting to ${wsUrl}...`)

  try {
    ws.value = new WebSocket(wsUrl)

    ws.value.onopen = () => {
      isConnected.value = true
    }
    // ... (rest of connect function is the same) ...
    ws.value.onclose = () => {
      isConnected.value = false
      sessionState.value = 'idle'
      scriptName.value = null
      addLog('info', 'WebSocket Disconnected.')
    }
    ws.value.onerror = (event) => {
      console.error('WebSocket Error:', event)
      addLog('error', 'WebSocket connection error.')
    }
    ws.value.onmessage = (event) => {
      handleMessage(event.data)
    }
  } catch (error) {
    addLog('error', `Failed to connect: ${error}`)
  }
}

// ... (rest of the script is exactly the same as before) ...
function disconnect() {
  if (ws.value) {
    ws.value.close()
  }
}
function handleMessage(rawData: string) {
  let msg
  try {
    msg = JSON.parse(rawData)
  } catch (e) {
    addLog('error', `Failed to parse JSON: ${rawData}`)
    return
  }
  switch (msg.type) {
    case 'ready':
      sessionState.value = 'idle'
      addLog('info', 'Console ready. Select a script to start.')
      break
    case 'started':
      sessionState.value = 'running'
      scriptName.value = msg.script
      exitCode.value = null
      addLog('info', `--- Started script: ${msg.script} ---`)
      break
    case 'stdout':
      addLog('stdout', msg.data)
      break
    case 'stderr':
      addLog('stderr', msg.data)
      break
    case 'exit':
      sessionState.value = 'exited'
      exitCode.value = msg.code
      addLog('info', `--- Process exited with code ${msg.code} (Signal: ${msg.signal || 'none'}) ---`)
      break
    case 'error':
      addLog('error', `[BACKEND ERROR] ${msg.message}\nDetail: ${msg.detail || ''}`)
      break
    default:
      addLog('error', `Unknown message type: ${msg.type}`)
  }
}
function sendWsMessage(message: object) {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify(message))
  } else {
    addLog('error', 'WebSocket is not connected.')
  }
}
function startScript() {
  if (sessionState.value === 'running') {
    if (!confirm('A script is already running. Kill it first?')) return
    killProcess()
  }
  lines.value = [] // Clear logs
  sendWsMessage({ action: 'start', script: selectedScript.value })
}
function sendStdin() {
  if (sessionState.value !== 'running' || !stdinData.value) return
  const data = stdinData.value + '\n' // Add newline as per spec
  sendWsMessage({ action: 'stdin', data: data })
  addLog('info', `> ${stdinData.value}`) // Echo stdin to console
  stdinData.value = ''
}
function killProcess() {
  if (sessionState.value !== 'running') return
  addLog('info', 'Sending KILL signal...')
  sendWsMessage({ action: 'kill' })
}
function addLog(type: 'stdout' | 'stderr' | 'info' | 'error', data: string) {
  lines.value.push({ type, data })
}
watch(lines.value, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})
const allowedScripts = [
  'start', 'stop', 'restart', 'update', 'revert', 'clean', 'list-files'
]
</script>

<template>
  <div class="console-wrapper">
    <h2 class="section-heading">Live Console (WebSocket)</h2>
    <div class="console-controls">
      <button @click="connect" :disabled="isConnected">Connect</button>
      <button @click="disconnect" :disabled="!isConnected">Disconnect</button>
      <span :class="['connection-status', isConnected ? 'connected' : 'disconnected']">
        {{ isConnected ? 'CONNECTED' : 'DISCONNECTED' }}
      </span>
    </div>
    <div class="script-controls" v-if="isConnected">
      <select v-model="selectedScript" :disabled="sessionState === 'running'">
        <option v-for="script in allowedScripts" :key="script" :value="script">
          {{ script }}
        </option>
      </select>
      <button
          @click="startScript"
          :disabled="sessionState === 'running'"
          class="btn-start"
      >
        Start Script
      </button>
      <button
          @click="killProcess"
          :disabled="sessionState !== 'running'"
          class="btn-danger"
      >
        Kill Process (SIGTERM)
      </button>
    </div>
    <div v-if="isConnected" class="session-state">
      State: <strong>{{ sessionState }}</strong>
      <span v-if="scriptName"> | Script: <strong>{{ scriptName }}</strong></span>
      <span v-if="exitCode !== null"> | Exit Code: <strong>{{ exitCode }}</strong></span>
    </div>
    <div class="log-container" ref="logContainer">
      <pre
          v-for="(line, index) in lines"
          :key="index"
          :class="line.type"
          v-html="ansiConverter.toHtml(line.data.replace(/\\n/g, '\n'))"
      ></pre>
    </div>
    <div class="stdin-bar">
      <input
          v-model="stdinData"
          @keydown.enter="sendStdin"
          :disabled="sessionState !== 'running' || !isConnected"
          placeholder="Type here to send to stdin and press Enter..."
      />
    </div>
  </div>
</template>

<style scoped>
/* All styles are exactly the same, no changes needed. */
.console-wrapper {
  background: #21252b;
  border: 1px solid #4b515c;
  border-radius: 8px;
  padding: 15px;
  margin-top: 20px;
}
.section-heading {
  color: #abb2bf;
  border-bottom: 1px solid #4b515c;
  padding-bottom: 5px;
  margin-top: 0;
}
.console-controls, .script-controls, .session-state {
  margin-bottom: 15px;
  display: flex;
  gap: 10px;
  align-items: center;
}
.connection-status {
  font-weight: bold;
}
.connected { color: #98c379; }
.disconnected { color: #e06c75; }

.log-container {
  background: #282c34;
  height: 400px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 5px;
  font-family: 'Courier New', Courier, monospace;
}
.log-container pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.stdout { color: #abb2bf; }
.stderr { color: #e06c75; }
.error { color: #e06c75; font-weight: bold; }
.info { color: #61afef; }

.stdin-bar {
  margin-top: 10px;
}
.stdin-bar input {
  width: -webkit-fill-available;
  padding: 8px;
  background: #4b515c;
  border: 1px solid #abb2bf;
  color: white;
  border-radius: 4px;
}
.stdin-bar input:disabled {
  opacity: 0.5;
}

button {
  padding: 8px 12px;
  font-size: 14px;
  font-weight: bold;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background-color: #61afef;
  color: #282c34;
  transition: all 0.2s ease;
}
button:hover { opacity: 0.8; }
button:disabled { cursor: not-allowed; opacity: 0.4; }
.btn-start { background-color: #98c379; }
.btn-danger { background-color: #e06c75; }
</style>