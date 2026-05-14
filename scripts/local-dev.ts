import { spawn, type ChildProcess } from 'node:child_process';

function start(name: string, command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[${name}] exited with code ${code ?? 'null'}`);
      process.exit(code ?? 1);
    }
  });

  return child;
}

const api = start('api', 'npm', ['run', 'start:local']);
const workers = start('workers', 'npm', ['run', 'start:workers:local']);

function terminate(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  process.kill(child.pid, 'SIGTERM');
  setTimeout(() => {
    if (child.pid && !child.killed) process.kill(child.pid, 'SIGKILL');
  }, 5000).unref();
}

const shutdown = () => {
  terminate(api);
  terminate(workers);
  setTimeout(() => process.exit(0), 5500).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
