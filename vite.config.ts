import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: these change far less often than app code, so
        // splitting them out keeps browser caches warm across deploys. The PDF
        // libraries are only reached through a dynamic import() and stay lazy.
        codeSplitting: {
          // Without this, shared transitive deps get pulled into the lazy groups
          // and the entry ends up statically importing (preloading) jspdf/charts.
          includeDependenciesRecursively: false,
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'clerk', test: /node_modules[\\/]@clerk[\\/]/ },
            { name: 'charts', test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|@reduxjs|redux|immer|reselect)[\\/]/ },
            { name: 'jspdf', test: /node_modules[\\/](jspdf|fflate|fast-png|iobuffer|pako)[\\/]/ },
            { name: 'html2canvas', test: /node_modules[\\/]html2canvas[\\/]/ },
          ],
        },
      },
    },
  },
})
