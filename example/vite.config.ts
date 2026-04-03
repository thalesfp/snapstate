import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
const snapstate = path.resolve(__dirname, '..')

export default defineConfig({
  resolve: {
    alias: {
      '@thalesfp/snapstate': path.join(snapstate, 'dist/index.js'),
      'snapstate/react': path.join(snapstate, 'dist/react/index.js'),
      'snapstate/form': path.join(snapstate, 'dist/form/index.js'),
      'snapstate/url': path.join(snapstate, 'dist/url/index.js'),
      'snapstate': path.join(snapstate, 'dist/index.js'),
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
