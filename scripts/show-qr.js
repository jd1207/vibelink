#!/usr/bin/env node
// generates a terminal QR code — either a plain URL or a vibelink connection URI
const path = require('path');
const qrcode = require(path.join(__dirname, '..', 'bridge', 'node_modules', 'qrcode-terminal'));

const arg1 = process.argv[2];
const arg2 = process.argv[3];
const arg3 = process.argv[4];

if (!arg1) {
  console.error('usage:');
  console.error('  show-qr.js <url>                    # QR for any URL');
  console.error('  show-qr.js <host> <port> <token>    # QR for vibelink connection');
  process.exit(1);
}

// if first arg looks like a URL, encode it directly
const isUrl = arg1.startsWith('http://') || arg1.startsWith('https://');

if (isUrl) {
  console.log('');
  console.log('  scan this QR code with your phone camera:');
  console.log('');
  qrcode.generate(arg1, { small: true }, (code) => {
    const indented = code.split('\n').map(l => '  ' + l).join('\n');
    console.log(indented);
  });
  console.log('');
  console.log(`  or open: ${arg1}`);
  console.log('');
} else {
  // vibelink connection mode: host port token
  const host = arg1;
  const port = arg2 || '3400';
  const token = arg3 || '';
  const uri = `vibelink://connect?host=${host}&port=${port}&token=${token}`;

  console.log('');
  console.log('  scan this QR code with the VibeLink app to connect:');
  console.log('');
  qrcode.generate(uri, { small: true }, (code) => {
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
}
