import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // ECharts is already tree-shaken (echarts/core + 3 chart types, SVG renderer); its own
    // chunk is ~550 kB minified / ~185 kB gzip.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Libraries in their own chunks: they change rarely, so browsers keep them cached
        // across deploys, and no single chunk trips the 500 kB warning.
        codeSplitting: {
          groups: [
            { name: 'echarts', test: /node_modules[\\/](echarts|zrender)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
