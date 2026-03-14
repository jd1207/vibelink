# Contributing to VibeLink

Thanks for your interest in contributing. VibeLink is an open-source, self-hosted mobile companion for Claude Code.

## Getting Started

1. Fork and clone the repo
2. Install dependencies for each package:

```bash
cd bridge && npm install && cd ..
cd mcp-server && npm install && cd ..
cd mobile && npm install && cd ..
```

3. Set up the bridge:

```bash
cp bridge/.env.example bridge/.env
# edit bridge/.env — at minimum set AUTH_TOKEN (run: openssl rand -hex 32)
```

4. Build the server packages:

```bash
cd bridge && npm run build && cd ..
cd mcp-server && npm run build && cd ..
```

5. Register the MCP server with Claude Code:

```bash
claude mcp add vibelink --scope user -- node $(pwd)/mcp-server/dist/index.js
```

6. Start the bridge:

```bash
cd bridge && npm start
```

7. Start the mobile app (requires Expo Go on your phone):

```bash
cd mobile && npx expo start
```

## Project Structure

```
vibelink/
  bridge/       Node.js bridge server (Express + WebSocket + IPC)
  mcp-server/   MCP server for Claude Code (render_ui, create_tab, etc.)
  mobile/       React Native app (Expo + NativeWind)
  setup.sh      One-command setup script
```

## Development

### Bridge Server

```bash
cd bridge
npm run dev      # start with hot reload (tsx watch)
npm test         # run tests
npm run build    # compile TypeScript
```

### MCP Server

```bash
cd mcp-server
npm run dev      # start with hot reload
npm test         # run tests
npm run build    # compile TypeScript
```

### Mobile App

```bash
cd mobile
npx expo start   # start Expo dev server
```

The mobile app uses Expo Go for development. For a standalone APK, see the README.

## Testing

Bridge and MCP server have test suites using vitest:

```bash
cd bridge && npm test
cd mcp-server && npm test
```

## Code Style

- TypeScript strict mode
- All lowercase comments
- No emojis in code or logs
- Meaningful variable names, early returns
- Each file under 150 lines
- ESM imports with .js extensions (bridge and mcp-server)

## Pull Requests

- One feature or fix per PR
- Include tests for new functionality
- Make sure all existing tests pass
- Keep PRs focused and reviewable

## iOS Builds

The mobile app is cross-platform but we currently only build for Android. If you have a Mac with Xcode, you can build for iOS:

```bash
cd mobile
npx expo prebuild --platform ios
npx expo run:ios --device --configuration Release
```

We welcome contributions to improve the iOS build experience.

## Reporting Issues

Please include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS and Node.js version
- Bridge logs if relevant (`curl http://localhost:3400/debug`)
