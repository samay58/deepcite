# Athena DeepCite Development Guide

## Build & Development Commands
- Build: `npm run build` (compiles TS to JS in dist/)
- Lint: `npm run lint` (runs ESLint checks)
- Watch mode: Not set up yet, consider adding `tsc --watch` script
- Test extension: Load unpacked extension, navigate to webpage and click "Analyze Webpage"
- Test PDFs: Open PDF in Chrome and click "Analyze PDF" button
- Load extension: Use `chrome://extensions/` → Enable dev mode → "Load unpacked"
- Debug: Console logs (filter by "DeepCite" in background/content scripts)
- Troubleshoot: Check `chrome://extensions/` → "Errors" tab if extension fails

## Code Style Guidelines
- TypeScript with strict typing (`strict: true` in tsconfig.json)
- Import order: built-ins → libraries → local modules
- Format: 2-space indent, Unix line endings, single quotes, camelCase variables, PascalCase types
- Path aliases: Use @handlers/*, @extractors/*, @utils/*, @types (see tsconfig.json)
- API keys: Store in extension options, NEVER hardcode in source
- Error handling: Always wrap API calls in try/catch with detailed logging
- Async: Use async/await pattern with proper error handling
- Message pattern: Use typed messages between scripts (`{ type: 'ACTION_TYPE', payload }`)
- Modern JS: ES2020+ syntax, functional programming style, arrow functions
- Performance: Batch async calls, debounce UI updates, use caching
- UI: Use CSS classes over inline styles; inject stylesheets instead of inline CSS

## Extension Architecture
- contentScript.ts: DOM interactions, UI overlays, claim highlighting
- background.ts: API calls, message handling, source verification  
- extractors/: Rule-based and AI-powered claim extraction strategies (IClaimExtractor interface)
- handlers/: Document-specific processing (PDF, webpage)
- utils/: Shared utilities for settings management and caching
- types.ts: Shared interfaces for data structures and messages

## Security Notes
- Never expose API keys in content scripts; store in background scripts only
- Sanitize any dynamic DOM insertion to prevent XSS vulnerabilities
- Follow Chrome Manifest V3 rules for extension security
- Use proper content security policies