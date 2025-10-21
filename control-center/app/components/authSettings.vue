<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'

const { setToken } = useAuth()
// Pre-fill with 'hogwarts' for easier testing
const localToken = ref('hogwarts')

const saveToken = () => {
  if (localToken.value) {
    setToken(localToken.value)
    alert('Token set for this session!')
  }
}
</script>

<template>
  <div class="auth-settings">
    <input
        v-model="localToken"
        type="password"
        placeholder="Enter SECRET_KEY"
    />
    <button @click="saveToken">Set Auth Token</button>

    <div class="auth-notes">
      <p>
        <strong>For Local Dev:</strong> Set your backend's <code>SECRET_KEY</code> here.
        This is stored in memory for this browser tab.
      </p>
      <p>
        <strong>WebSocket Note:</strong> The Live Console will connect using
        <code>?token={{ localToken || '...' }}</code>. This is fine for
        local development, but in production, this token will appear in your
        server logs and browser history.
      </p>
      <p>
        <strong>For Production:</strong> The spec recommends using a
        proxy (like a Nuxt server route) to attach the
        <code>Authorization</code> header to the WebSocket upgrade request.
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-settings {
  background: #4b515c;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid #61afef;
}
.auth-notes {
  font-size: 0.9em;
  color: #abb2bf;
  margin-top: 15px;
}
.auth-notes code {
  color: #e5c07b;
  background: #282c34;
  padding: 2px 5px;
  border-radius: 4px;
}
input {
  margin-right: 10px;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #abb2bf;
}
</style>