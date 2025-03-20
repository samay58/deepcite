# Athena DeepCite Development Guide

## Build & Development Commands
- Build: `npm run build` (compiles TS to JS in dist/)
- Lint: `npm run lint` (runs ESLint checks)
- Install dependencies: `npm install`
- Load extension: Load unpacked from `chrome://extensions/` (dev mode enabled)
- After code changes: Run build and refresh extension in Chrome
- Debug: Check Chrome console for logs in background/content script contexts

## Code Style Guidelines
- TypeScript with strict typing (`strict: true` in tsconfig.json)
- API keys should be managed via options.html, not hardcoded
- Interfaces defined in `types.ts` for shared data structures
- 2-space indentation, Unix line endings, single quotes (ESLint enforced)
- Use camelCase for variables/functions, PascalCase for classes/interfaces
- Error handling: try/catch with console.error for logging
- Async: Use async/await pattern rather than raw promises
- API calls: Check for API keys before making requests
- Keep components modular with clear separation of concerns
- Add detailed comments for complex logic and public methods

## Extension Architecture
- Content script: DOM interactions, UI management (`contentScript.ts`)
- Background script: API calls, message handling (`background.ts`)
- LLM Extractor: Handles OpenAI API interactions (`llmExtractor.ts`)
- Options page: Manages user settings and API keys (`options.ts`)
- PDF handling via pdf.js library
- Message passing between scripts with chrome.runtime.sendMessage