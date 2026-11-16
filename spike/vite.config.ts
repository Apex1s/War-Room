import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const dir = import.meta.dirname;

export default defineConfig({
  envDir: fs.existsSync(path.resolve(dir, '.env'))
    ? dir
    : path.resolve(dir, '..'),
  resolve: {
    alias: {
      zod: path.resolve(dir, 'node_modules/zod'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(dir, '..')],
    },
  },
});
