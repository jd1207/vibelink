# Security

VibeLink is designed to be self-hosted and private. All traffic stays on your local network or Tailscale mesh.

## Architecture

- The Bridge server binds to your local network interface
- All WebSocket and REST traffic between your phone and Bridge is over your own network
- When using Tailscale, all traffic is E2E encrypted via WireGuard
- No data is sent to any external service (beyond Claude Code's own API calls to Anthropic)
- No telemetry, analytics, or tracking

## Auth Token

The Bridge uses a static bearer token for authentication. This token is generated during setup and stored in `bridge/.env` (which is gitignored).

- Generate a strong token: `openssl rand -hex 32`
- The token is sent with every REST and WebSocket request
- If someone has your token and network access, they can interact with your Claude sessions

## Claude Permissions

By default, VibeLink spawns Claude with `--dangerously-skip-permissions`, which means Claude can read/write files and run commands without asking for approval. This is appropriate for a personal self-hosted tool where you trust your own prompts.

If you want more restrictive permissions, modify the `DEFAULT_ARGS` in `bridge/src/claude-process.ts`.

## Reporting Security Issues

If you find a security vulnerability, please email the maintainers directly rather than opening a public issue.
