# Athena DeepCite Source Directory

This directory contains the modular TypeScript source code for the Athena DeepCite Chrome extension.

## Directory Structure

- `src/` - Main source directory
  - `extractors/` - Claim extraction strategies
    - `contentExtractor.ts` - Rule-based extraction from webpage content
    - `llmExtractor.ts` - AI-powered extraction using LLMs
  - `handlers/` - Document-specific processing
    - `pdfHandler.ts` - PDF document processing and display
    - `webPageHandler.ts` - Webpage UI components and interactions
  - `utils/` - Shared utilities
    - `settingsManager.ts` - Centralized storage and settings management
  - `types.ts` - Shared TypeScript interfaces and types
  - `background.ts` - Background service worker for API calls
  - `contentScript.ts` - Main content script for DOM interactions
  - `options.ts` - Options page functionality
  - `popup.ts` - Popup UI functionality

## TypeScript Path Aliases

This project uses TypeScript path aliases for cleaner imports:

- `@extractors/*` - Points to src/extractors/
- `@handlers/*` - Points to src/handlers/
- `@utils/*` - Points to src/utils/
- `@types` - Points to src/types.ts

## Build Process

The TypeScript compiler processes the source files and outputs JavaScript to the `dist/` directory, which is then referenced by the extension manifest.

To build the extension:

```bash
npm run build
```

To watch for changes during development:

```bash
npm run dev
```