#!/usr/bin/env node
// vibelink permission hook
// registered as a Claude Code PermissionRequest hook
// forwards permission requests to the Bridge server for approval on phone/dashboard

const http = require('http');
const crypto = require('crypto');

const SESSION_ID = process.env.VIBELINK_SESSION_ID;
const BRIDGE_PORT = parseInt(process.env.VIBELINK_BRIDGE_PORT || '3400', 10);
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// only handle vibelink sessions — exit silently for regular claude usage
if (!SESSION_ID) {
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
    printDecision('deny', 'Failed to parse hook input');
    process.exit(0);
  }

  const requestId = crypto.randomUUID();
  const toolName = payload.tool_name || 'unknown';
  const toolInput = payload.tool_input || {};

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
        printDecision(result.behavior || 'deny', result.message);
      } catch {
        printDecision('deny', 'Invalid response from bridge');
      }
    });
  });

  req.on('error', () => {
    // bridge unreachable — deny safely
    printDecision('deny', 'Bridge unreachable');
  });

  req.on('timeout', () => {
    req.destroy();
    printDecision('deny', 'Approval timed out');
  });

  req.write(body);
  req.end();
});

function printDecision(behavior, message) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior },
    },
  };
  if (message) {
    output.hookSpecificOutput.decision.message = message;
  }
  process.stdout.write(JSON.stringify(output) + '\n');
}
