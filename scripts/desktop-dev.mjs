// Runs the Electron shell against the Vite dev server, so game code hot-reloads as usual.
// `pnpm desktop:dev` compiles desktop/ first; restart this after editing desktop/*.ts.
import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('Vite did not report a local URL');
server.printUrls();

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, SUPERBREAKER_DEV_URL: url },
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
