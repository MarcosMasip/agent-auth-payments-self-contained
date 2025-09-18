#!/usr/bin/env node
/**
 * dev-self-contained.mjs
 * Starts the self-contained stack (agents + web) with automatic free port selection for the agents server.
 * - Finds a free port starting at 2025.
 * - Runs web setup (Prisma sync) before launching servers.
 * - Exports NEXT_PUBLIC_API_URL to the web app and passes --port to agents.
 * Ensures a single command works even if 2025 is already in use.
 */
import net from 'node:net';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

function checkPortOnce(port) {
  return new Promise((resolve) => {
    let ipv4Free = false;
    let ipv6Free = false;
    let completed = 0;

    const finalize = () => {
      completed += 1;
      if (completed === 2) {
        // If one family busy we still consider port busy
        resolve(ipv4Free && ipv6Free);
      }
    };

    const test = (family) => {
      const host = family === 'ipv4' ? '127.0.0.1' : '::1';
      const server = net.createServer();
      server.once('error', (err) => {
        if (family === 'ipv6' && (err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT')) {
          // Treat unsupported IPv6 as free for that family
          ipv6Free = true;
          finalize();
          return;
        }
        if (family === 'ipv4') ipv4Free = false; else ipv6Free = false;
        finalize();
      });
      server.once('listening', () => {
        server.close(() => {
          if (family === 'ipv4') ipv4Free = true; else ipv6Free = true;
          finalize();
        });
      });
      try { server.listen(port, host); } catch {
        if (family === 'ipv4') ipv4Free = false; else ipv6Free = false; finalize();
      }
    };
    test('ipv4');
    test('ipv6');
  });
}

async function findFreePort(start = 2025, max = 50) {
  for (let p = start; p <= start + max; p++) {
    if (await checkPortOnce(p)) return p;
  }
  throw new Error('No free port found');
}

async function main() {
  const port = await findFreePort(2025);
  console.log(`ℹ️  Using agents port: ${port}`);

  console.log('⏳ Ensuring web setup (Prisma)...');
  const setup = spawnSync('pnpm', ['--filter', 'web', 'setup:self-contained'], { stdio: 'inherit', cwd: repoRoot });
  if (setup.status !== 0) {
    console.error('❌ Web setup failed; aborting dev start.');
    process.exit(setup.status ?? 1);
  }

  // Environment variables for web process
  const apiUrl = `http://localhost:${port}`;

  console.log('🚀 Starting self-contained stack...');

  const webEnv = { ...process.env, LOCAL_MODE: 'true', NEXT_PUBLIC_LOCAL_MODE: 'true', NEXT_PUBLIC_API_URL: apiUrl };
  const agentsEnv = { ...process.env, LOCAL_MODE: 'true' };

  let currentPort = port;

  function startAgents(p) {
    console.log(`Starting agents on port ${p}`);
    return spawn('pnpm', ['--filter', 'agents', 'exec', 'langgraphjs', 'dev', '--no-browser', '--port', String(p)], {
    cwd: repoRoot,
    env: agentsEnv,
    stdio: 'inherit'
    });
  }

  let agents = startAgents(currentPort);

  const web = spawn('pnpm', ['--filter', 'web', 'exec', 'next', 'dev'], {
    cwd: repoRoot,
    env: webEnv,
    stdio: 'inherit'
  });

  function shutdown(code) {
    agents.kill();
    web.kill();
    process.exit(code ?? 0);
  }
  agents.on('exit', async (code) => {
    if (code !== 0) {
      // Retry a few times with next free port
      for (let attempt = 1; attempt <= 5; attempt++) {
        const candidate = await findFreePort(currentPort + 1, 0); // find next free
        if (candidate !== currentPort) {
          currentPort = candidate;
          console.log(`Retrying agents on free port ${currentPort} (attempt ${attempt})`);
          agents = startAgents(currentPort);
          agents.on('exit', (c) => {
            console.log(`Agents process exited with code ${c}`);
            shutdown(c);
          });
          return; // Let new handler manage future exits
        }
      }
    }
    console.log(`Agents process exited with code ${code}`);
    shutdown(code);
  });
  web.on('exit', (code) => {
    console.log(`Web process exited with code ${code}`);
    shutdown(code);
  });
}

main().catch(err => {
  console.error('Failed to start self-contained dev environment:', err);
  process.exit(1);
});
