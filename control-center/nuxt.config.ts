// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    devtools: { enabled: true },

    ssr: false,
    // We use runtimeConfig to store "secrets"
    // The 'public' block makes them available to the frontend.
    runtimeConfig: {
        public: {
            // IMPORTANT: Change this to your playit.gg URL
            apiUrl: 'http://feet-confirm.gl.at.ply.gg:51429',

            // IMPORTANT: Change this to the same key from your server.js
            secretKey: 'hogwarts'
        }
    }
})