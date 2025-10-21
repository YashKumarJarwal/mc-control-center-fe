<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useApiClient, type ApiResponse } from '~/composables/useApiClient'

// Import TYPES for xterm
import type { Terminal } from 'xterm'
import type { FitAddon } from 'xterm-addon-fit'

// --- Refs & State ---
const apiClient = useApiClient()
const config = useRuntimeConfig()
const ws = ref<WebSocket | null>(null)

const status = ref('unknown') // HTTP status: 'active', 'inactive', 'error'
const loadingAction = ref<string | null>(null) // For HTTP buttons
const lastResponse = ref<ApiResponse<any> | null>(null)
const isWsConnected = ref(false)

// 'idle' = connected, no process
// 'running' = pty (interactive) OR simple script is running
// 'exited' = last process finished
const sessionState = ref('idle')

// Terminal refs
const terminalContainer = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null

// --- API (HTTP) ---
const checkStatus = async () => {
  loadingAction.value = 'status'
  const response = await apiClient.getStatus()
  if (response.ok) {
    status.value = response.data.status
  } else {
    status.value = 'error'
    lastResponse.value = response
  }
  loadingAction.value = null
}

// --- WebSocket Logic ---
function connectWebSocket() {
  if (ws.value) ws.value.close()
  const wsUrl = config.public.apiUrl.replace(/^http/, 'ws') + `/ws/exec`
  if(term) term.writeln(`Connecting to ${wsUrl}...`);
  ws.value = new WebSocket(wsUrl)
  ws.value.onopen = () => {
    isWsConnected.value = true
    if(term) term.writeln('\r\n\x1B[32mWebSocket Connected.\x1B[0m');
  }
  ws.value.onclose = () => {
    isWsConnected.value = false
    sessionState.value = 'idle'
    if(term) term.writeln('\r\n\x1B[31mWebSocket Disconnected.\x1B[0m');
    checkStatus() // Re-check status on disconnect
  }
  ws.value.onerror = (event) => {
    console.error('WebSocket Error:', event)
    if(term) term.writeln('\r\n\x1B[31mWebSocket connection error.\x1B[0m');
  }
  ws.value.onmessage = (event) => {
    handleWsMessage(event.data)
  }
}

// --- Terminal & PTY Setup ---
async function initializeTerminal() {
  if (process.client && terminalContainer.value && !term) {
    const { Terminal } = await import('xterm')
    const { FitAddon } = await import('xterm-addon-fit')
    await import('xterm/css/xterm.css')

    term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'Courier New, monospace',
      theme: {
        background: '#282c34',
        foreground: '#abb2bf',
      }
    });
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalContainer.value);
    fitAddon.fit();
    window.addEventListener('resize', () => fitAddon?.fit())

    term.onData((data) => {
      // Only send stdin if the session is 'running' (interactive)
      if (sessionState.value === 'running' && isWsConnected.value) {
        sendWsMessage({ action: 'stdin', data: data })
      }
    })

    term.writeln('Welcome to the Minecraft Server Console!');
    term.writeln('Connecting to backend...');
  }
}

// --- WebSocket Protocol ---
function handleWsMessage(rawData: string) {
  let msg
  try {
    msg = JSON.parse(rawData)
  } catch (e) {
    term?.writeln(`\r\n\x1B[31m[ERROR] Failed to parse JSON: ${rawData}\x1B[0m`);
    return
  }

  switch (msg.type) {
    case 'ready':
      sessionState.value = 'idle'
      term?.writeln('\r\n\x1B[32mConsole is ready.\x1B[0m');
      break
    case 'started':
      sessionState.value = 'running'
      term?.writeln(`\r\n\x1B[33m--- Starting script: ${msg.script} ---\x1B[0m\r\n`);
      break
    case 'stdout':
      term?.write(msg.data)
      break
    case 'stderr':
      term?.write(`\x1B[31m${msg.data}\x1B[0m`)
      break
    case 'exit':
      sessionState.value = 'exited'
      term?.writeln(`\r\n\x1B[33m--- Process exited with code ${msg.code} ---\x1B[0m`);
      checkStatus() // Update the top-level status
      break
    case 'error':
      term?.writeln(`\r\n\x1B[31m[BACKEND ERROR] ${msg.message}\x1B[0m`);
      if(msg.detail) term?.writeln(`\x1B[31m  Detail: ${msg.detail}\x1B[0m`);
      sessionState.value = 'exited' // Treat error as an exit
      break
  }
}

function sendWsMessage(message: object) {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify(message))
  } else {
    term?.writeln('\r\n\x1B[31m[Error] WebSocket is not connected.\x1B[0m');
  }
}

// --- Button Click Handlers ---
const onStart = () => {
  // We can only start if we are idle
  if (sessionState.value === 'running') return;
  term?.reset();
  sendWsMessage({ action: 'start', script: 'start-interactive' })
  checkStatus()
}

const onStop = () => {
  if (sessionState.value === 'running') {
    // If we're attached, send 'stop' to the console
    sendWsMessage({ action: 'stdin', data: 'stop\n' })
  } else {
    // If we're not attached, run the fallback 'stop.sh' script
    term?.reset();
    sendWsMessage({ action: 'start', script: 'stop' })
  }
}

const onRestart = () => {
  // This button is *only* for running the restart.sh script
  // It should be disabled if we are attached to the server
  if (sessionState.value === 'running') return;
  term?.reset();
  sendWsMessage({ action: 'start', script: 'restart' })
}

const onUpdate = () => {
  // This button is *only* for running update.sh
  if (sessionState.value === 'running') return;
  term?.reset();
  sendWsMessage({ action: 'start', script: 'update' })
}

// --- Lifecycle ---
onMounted(async () => {
  await initializeTerminal()
  checkStatus()
  connectWebSocket()
})

onBeforeUnmount(() => {
  ws.value?.close()
  term?.dispose()
  window.removeEventListener('resize', () => fitAddon?.fit())
})
</script>

<template>
  <div class="panel-container">
    <h1>Minecraft Server Control</h1>

    <div class="status-box">
      Server Status:
      <span :class="`status-${status}`">{{ status }}</span>
    </div>

    <h2 class="section-heading">Server Controls</h2>
    <div class="actions-secondary">
      <button
          @click="onStart"
          :disabled="sessionState === 'running' || !isWsConnected"
          class="btn-start"
      >
        Start / Attach to Server
      </button>

      <button
          @click="onStop"
          :disabled="!isWsConnected"
          class="btn-warn"
      >
        Stop Server
      </button>

<!--      <button-->
<!--          @click="onRestart"-->
<!--          title="Restarts the server. Only works if server is stopped."-->
<!--          :disabled="!isWsConnected"-->
<!--          class="btn-warn"-->
<!--      >-->
<!--        Restart Server-->
<!--      </button>-->
    </div>

    <h2 class="section-heading">Maintenance</h2>
    <div class="actions-secondary">
      <button
          @click="onUpdate"
          title="Updates the server. Only works if server is stopped."
          :disabled="sessionState === 'running' || !isWsConnected"
          class="btn-danger"
      >
        Update Server
      </button>
    </div>

    <div v-if="lastResponse && !lastResponse.ok" class="output-box">
      <details open>
        <summary class="response-summary error">
          HTTP Action FAILED (Click to see details)
        </summary>
        <pre>{{ JSON.stringify(lastResponse, null, 2) }}</pre>
      </details>
    </div>

    <h2 class="section-heading">Live Console</h2>
    <div class="terminal-wrapper">
      <div id="terminal" ref="terminalContainer"></div>
    </div>

  </div>
</template>

<style>
/* Global styles */
body {
  background-color: #282c34;
  color: #abb2bf;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  margin: 0;
  padding: 20px;
}

button {
  padding: 12px;
  font-size: 16px;
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

/* Panel styles */
.panel-container {
  max-width: 800px; /* Wider for terminal */
  margin: 40px auto;
  padding: 20px;
  background-color: #3b4049;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
h1 {
  text-align: center;
  color: #61afef;
  border-bottom: 2px solid #61afef;
  padding-bottom: 10px;
}
.section-heading {
  color: #abb2bf;
  border-bottom: 1px solid #4b515c;
  padding-bottom: 5px;
  margin-top: 30px;
}
.actions-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin: 15px 0;
}
.btn-start { background-color: #98c379; }
.btn-warn { background-color: #e5c07b; }
.btn-danger { background-color: #e06c75; }
.btn-grey { background-color: #abb2bf; }

/* Status styles */
.status-box {
  font-size: 1.2em;
  text-align: center;
  padding: 15px;
  background-color: #4b515c;
  border-radius: 5px;
  font-weight: bold;
}
.status-active { color: #98c379; }
.status-inactive, .status-failed { color: #e06c75; }
.status-unknown, .status-checking... { color: #e5c07b; }
.status-error { color: #e06c75; text-transform: uppercase; }

/* Output/Error box styles */
.output-box {
  background-color: #21252b;
  padding: 15px;
  border-radius: 5px;
  margin-top: 20px;
  border: 1px solid #4b515c;
}
.output-box summary {
  cursor: pointer;
  font-weight: bold;
}
.output-box summary.error {
  color: #e06c75;
}
pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  color: #d19a66;
  margin-top: 10px;
}

/* Terminal Styles */
.terminal-wrapper {
  background: #282c34;
  border-radius: 5px;
  padding: 10px;
  min-height: 400px;
}
#terminal {
  width: 100%;
  height: 100%;
}
</style>