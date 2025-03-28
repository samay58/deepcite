# Athena DeepCite Development Guide

## Build & Development Commands
- Build: `npm run build` (compiles TS to JS in dist/)
- Dev: `npm run dev` (webpack in watch mode)
- Lint: `npm run lint` (runs ESLint checks)
- Clean: `npm run clean` (removes files in dist/)
- Test extension: Load unpacked extension, navigate to webpage, click "Analyze Webpage"
- Test PDFs: Open PDF in Chrome, click "Analyze PDF" button
- Debug: Filter console logs by "DeepCite" in browser DevTools

## Code Style Guidelines
- TypeScript with strict typing (`strict: true` in tsconfig.json)
- ES2020 target with ES modules
- Import order: built-ins → libraries → local modules
- Format: 2-space indent, Unix line endings, single quotes, semicolons
- Naming: camelCase for variables/functions, PascalCase for types/interfaces
- Path aliases: Use @handlers/*, @extractors/*, @utils/*, @types
- Error handling: Always wrap API calls in try/catch with detailed logging
- Message pattern: Use typed messages between scripts (`{ type: 'ACTION_TYPE', payload }`)
- Security: Never expose API keys in content scripts; sanitize DOM insertions
- Performance: Batch async calls, debounce UI updates, use caching

## Extension Architecture
- contentScript.ts: DOM interactions, UI overlays, claim highlighting
- background.ts: API calls, message handling, source verification  
- extractors/: Rule-based and AI-powered claim extraction
- handlers/: Document-specific processing (PDF, webpage)
- utils/: Shared utilities for settings management
- types.ts: Shared interfaces for data structures and messages