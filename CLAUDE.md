# Athena DeepCite Development Guide

## Build & Development Commands
- Build: `npm run build` (compiles TS to JS)
- Install dependencies: `npm install`
- Load extension: Load unpacked from `chrome://extensions/` (dev mode enabled)
- After changes: Run build and refresh extension in Chrome

## Code Style Guidelines
- TypeScript with strict typing, defining interfaces for all data structures
- Interfaces defined in `types.ts` when shared between files
- Error handling with try/catch blocks and console.error for logging
- Asynchronous code using async/await pattern
- Class-based components with private/public method designation
- Prefer const over let, avoid var
- 2-space indentation, single quotes for strings
- Use camelCase for variables/functions, PascalCase for classes/interfaces
- Comments for complex logic and public method documentation
- Avoid hardcoded values (except during development)

## Extension Architecture
- Content script: DOM interactions, UI management (contentScript.ts)
- Background script: API calls, message handling (background.ts)
- PDF handling via pdf.js library
- Message passing between scripts with chrome.runtime.sendMessage