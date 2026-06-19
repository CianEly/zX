const { spawn } = require('node:child_process');
const path = require('node:path');

const executable = '/Users/cianely/zX/release/mac-arm64/zX.app/Contents/Resources/zx-backend';
console.log('Spawning', executable);

const proc = spawn(executable, [], {
  cwd: '/Users/cianely/zX/release/mac-arm64/zX.app/Contents/Resources',
  env: process.env
});

proc.on('error', (err) => {
  console.error('Spawn error:', err);
});

proc.stdout.on('data', (d) => console.log('STDOUT:', d.toString()));
proc.stderr.on('data', (d) => console.log('STDERR:', d.toString()));

proc.on('close', (code) => {
  console.log('Exited with code', code);
});
