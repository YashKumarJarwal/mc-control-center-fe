// composables/useApiClient.ts (NO AUTH)

// Define the shape of a successful and failed API response
export type ApiOkResponse<T> = {
    ok: true
    data: T
}
export type ApiErrorResponse = {
    ok: false
    status: number
    error: string
    details: any
}
export type ApiResponse<T> = ApiOkResponse<T> | ApiErrorResponse

/**
 * Creates a reusable, non-authenticated API client for Nuxt 3.
 */
export const useApiClient = () => {
    // We no longer need useAuth()
    const config = useRuntimeConfig() // From nuxt.config.ts

    const apiFetch = $fetch.create({
        baseURL: config.public.apiUrl, // e.g., 'http://feet-confirm.gl.at.ply.gg:51429'

        // The 'onRequest' interceptor for auth has been removed.

        // This interceptor runs ONLY on errors
        async onResponseError({ response }) {
            const errorData: ApiErrorResponse = {
                ok: false,
                status: response.status,
                error: response._data?.error || response.statusText,
                details: response._data?.details || 'No error details provided by backend.',
            }
            return Promise.reject(errorData)
        },
    })

    // --- Helper function to make POST requests and handle errors ---
    async function post<T = any>(endpoint: string): Promise<ApiResponse<T>> {
        try {
            const data = await apiFetch<T>(endpoint, { method: 'POST' })
            return { ok: true, data }
        } catch (err: any) {
            return err as ApiErrorResponse
        }
    }

    // --- API Methods ---
    const getStatus = async (): Promise<ApiResponse<{ status: string }>> => {
        try {
            const data = await apiFetch<{ status: string }>('/api/status', { method: 'GET' })
            return { ok: true, data }
        } catch (err: any) {
            return err as ApiErrorResponse
        }
    }

    // Return all the methods
    return {
        getStatus,
        start: () => post('/api/start'),
        stop: () => post('/api/stop'),
        restart: () => post('/api/restart'),
        update: () => post('/api/update'),
        revert: () => post('/api/revert'),
        clean: () => post('/api/clean'),
    }
}