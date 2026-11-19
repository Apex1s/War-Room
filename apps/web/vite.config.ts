import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const dir = import.meta.dirname;
const transcriptsDir = path.resolve(dir, '../../docs/transcripts');

function saveTranscriptDevPlugin(): Plugin {
  return {
    name: 'warroom-save-transcript-dev',
    configureServer(server) {
      server.middlewares.use('/__dev/save-transcript', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            fs.mkdirSync(transcriptsDir, { recursive: true });
            const files = fs.readdirSync(transcriptsDir).filter((f) => f.endsWith('.json'));
            const completeIds: string[] = [];
            for (const file of files) {
              try {
                const raw = fs.readFileSync(path.join(transcriptsDir, file), 'utf8');
                const doc = JSON.parse(raw) as {
                  transcriptId?: string;
                  rounds?: { generalMoves?: unknown[] }[];
                };
                if (
                  doc.transcriptId &&
                  Array.isArray(doc.rounds) &&
                  doc.rounds.length === 3 &&
                  doc.rounds.every(
                    (r) => Array.isArray(r.generalMoves) && r.generalMoves.length === 3,
                  )
                ) {
                  completeIds.push(doc.transcriptId);
                }
              } catch {
                // ignore malformed file
              }
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, completeIds }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
          return;
        }
        if (req.method !== 'POST') {
          next();
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as {
              filename?: string;
              transcript?: unknown;
            };
            const safeName = path.basename(parsed.filename ?? 'transcript.json');
            fs.mkdirSync(transcriptsDir, { recursive: true });
            const targetPath = path.join(transcriptsDir, safeName);
            fs.writeFileSync(
              targetPath,
              JSON.stringify(parsed.transcript, null, 2) + '\n',
              'utf8',
            );
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: targetPath }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        });
      });
    },
  };
}

export default defineConfig({
  envDir: path.resolve(dir, '../..'),
  plugins: [tailwindcss(), saveTranscriptDevPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(dir, 'index.html'),
        bridge: path.resolve(dir, 'appcheck-bridge.html'),
      },
    },
  },
});
