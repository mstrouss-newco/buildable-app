import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
        base: '/demo/',
        plugins: [react()],
        build: {
                    rollupOptions: {
                                    input: {
                                                        app: './index.html'
                                    }
                    }
        }
})
