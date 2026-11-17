import path from 'node:path';
import { defineConfig } from 'vite';

const dir = import.meta.dirname;

export default defineConfig({
  envDir: path.resolve(dir, '../..'),
});
