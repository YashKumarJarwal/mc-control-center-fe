// composables/useAuth.ts
import { computed } from 'vue'
import { useState } from '#app'

export const useAuth = () => {
    // --- THE FIX ---
    // This line was outside the function, now it's INSIDE.
    const token = useState<string | null>('auth-token', () => null)

    const setToken = (newToken: string) => {
        token.value = newToken
    }

    const isAuthenticated = computed(() => !!token.value)

    return {
        token: computed(() => token.value),
        setToken,
        isAuthenticated
    }
}