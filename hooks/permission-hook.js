#!/usr/bin/env node
// vibelink permission hook
// registered as a Claude Code PreToolUse hook
// forwards permission requests to the Bridge server for approval on phone/dashboard

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const LOG = '/tmp/vibelink-hook.log';
function log(msg) { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + msg + '\n'); }

log('hook invoked, env VIBELINK_SESSION_ID=' + (process.env.VIBELINK_SESSION_ID || 'unset'));

const SESSION_ID = process.env.VIBELINK_SESSION_ID;
const BRIDGE_PORT = parseInt(process.env.VIBELINK_BRIDGE_PORT || '3400', 10);
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// only handle vibelink sessions — exit silently for regular claude usage
if (!SESSION_ID) {
  log('no session id, exiting');
  process.exit(0);
}

// if skip permissions is on, auto-allow everything
if (process.env.VIBELINK_SKIP_PERMISSIONS === '1') {
  log('skip permissions on, auto-allowing');
  process.exit(0);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    // can't parse hook input — deny safely
    log('failed to parse hook input, denying');
    process.exit(2);
  }

  const requestId = crypto.randomUUID();
  const toolName = payload.tool_name || 'unknown';
  const toolInput = payload.tool_input || {};

  log('tool=' + toolName + ' requestId=' + requestId);

  const body = JSON.stringify({
    sessionId: SESSION_ID,
    requestId,
    toolName,
    toolInput,
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: BRIDGE_PORT,
    path: '/permissions/request',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: TIMEOUT_MS,
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        const behavior = result.behavior || 'deny';
        log('decision=' + behavior + (result.message ? ' msg=' + result.message : ''));
        if (behavior === 'allow') {
          process.exit(0);
        } else {
          process.exit(2);
        }
      } catch {
        log('invalid response from bridge, denying');
        process.exit(2);
      }
    });
  });

  req.on('error', () => {
    // bridge unreachable — deny safely
    log('bridge unreachable, denying');
    process.exit(2);
  });

  req.on('timeout', () => {
    req.destroy();
    log('approval timed out, denying');
    process.exit(2);
  });

  req.write(body);
  req.end();
});
