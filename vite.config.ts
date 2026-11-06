import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // The Worker (wrangler dev, :8787) serves the API and the BCB login receiver.
    // Proxying keeps them same-origin in dev, so the session cookie just works.
    proxy: {
      '/api': 'http://localhost:8787',
      '/masuk-bcb': 'http://localhost:8787',
    },
  },
  build: {
    // generatePDF (jspdf + html2canvas, ~600 kB) is only loaded on download.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks for what every page needs: these change far less
        // often than app code, so splitting them keeps browser caches warm.
        // Lazy-only libraries (recharts, jspdf, html2canvas) are deliberately NOT
        // grouped: manual groups for them either got preloaded by the entry or,
        // with includeDependenciesRecursively off, broke module init order
        // ("f is not a function" at runtime). They stay in their route/PDF chunks.
        codeSplitting: {
          // Keep the groups to the matched packages only, not their dependencies.
          includeDependenciesRecursively: false,
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
