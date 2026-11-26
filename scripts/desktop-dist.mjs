// Packages the desktop app with electron-builder, passing on any arguments (`--win`, `--mac`, ...).
// macOS's disk image service now and then refuses `hdiutil create` while it is busy ("Resource
// temporarily unavailable"), which fails the DMG on an otherwise good build; that one error is
// retried after a pause. Anything else fails at once.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ATTEMPTS = 3;
const PAUSE_MS = 5000;
const BUSY = /hdiutil: (create|attach|detach) failed - Resource (temporarily unavailable|busy)/;

function build() {
  return new Promise((resolve) => {
    const child = spawn('electron-builder', process.argv.slice(2), {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let output = '';
    const keep = (out) => (chunk) => {
      out.write(chunk);
      output = (output + chunk).slice(-20_000);
    };
    child.stdout.on('data', keep(process.stdout));
    child.stderr.on('data', keep(process.stderr));
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}

for (let attempt = 1; ; attempt++) {
  const { code, output } = await build();
  if (code === 0) process.exit(0);
  if (attempt >= ATTEMPTS || !BUSY.test(output)) process.exit(code);
  console.warn(
    `\nhdiutil was busy; packaging again in ${PAUSE_MS / 1000}s (attempt ${attempt + 1} of ${ATTEMPTS})\n`,
  );
  await sleep(PAUSE_MS);
}
