import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
const root = path.resolve(__dirname, '..')

export default defineConfig({
  resolve: {
    alias: {
      '@snapstore/core': path.join(root, 'packages/core/dist/index.js'),
      '@snapstore/url': path.join(root, 'packages/url/dist/index.js'),
      '@snapstore/react': path.join(root, 'packages/react/dist/index.js'),
      '@snapstore/form': path.join(root, 'packages/form/dist/index.js'),
    },
  },
  plugins: [react({
    useAtYourOwnRisk_mutateSwcOptions(options) {
      options.jsc ??= {};
      options.jsc.parser ??= { syntax: "typescript", tsx: true };
      options.jsc.parser.decorators = true;
      options.jsc.transform ??= {};
      options.jsc.transform.decoratorVersion = '2022-03';
    },
  })],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
