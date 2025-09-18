#!/usr/bin/env node
const { spawn } = require('child_process');

const model = process.env.OLLAMA_MODEL || 'mistral';
console.log(`[ollama] Pulling model: ${model}`);

const cmd = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
const child = spawn(cmd, ['pull', model], { stdio: 'inherit' });

child.on('error', (e) => {
  console.error(`Failed to start Ollama pull. Is Ollama installed? Error: ${e.message}`);
  process.exit(1);
});
child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Ollama pull exited with code ${code}`);
    process.exit(code || 1);
  }
  console.log(`[ollama] Model ${model} ready.`);
});
