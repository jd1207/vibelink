#!/usr/bin/env node
// generates a terminal QR code for vibelink connection
const path = require('path');
const qrcode = require(path.join(__dirname, '..', 'bridge', 'node_modules', 'qrcode-terminal'));

const host = process.argv[2];
const port = process.argv[3] || '3400';
const token = process.argv[4] || '';

if (!host) {
  console.error('usage: show-qr.js <host> [port] [token]');
  process.exit(1);
}

const uri = `vibelink://connect?host=${host}&port=${port}&token=${token}`;

console.log('');
console.log('  scan this QR code with the VibeLink app to connect:');
console.log('');
qrcode.generate(uri, { small: true }, (code) => {
  // indent each line for nicer formatting
  const indented = code.split('\n').map(l => '  ' + l).join('\n');
  console.log(indented);
});

console.log('');
console.log('  or enter manually in the app:');
console.log(`    bridge: ${host}:${port}`);
if (token) {
  console.log(`    token:  ${token}`);
}
console.log('');
