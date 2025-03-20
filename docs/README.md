# Athena DeepCite Extension Development

## Current Status

The Athena DeepCite extension is a Chrome extension that:
- Detects factual claims in web pages and PDFs
- Highlights these claims for user interaction
- Uses Exa API to find supporting sources
- Provides confidence scores for claims and sources

During our work on Iteration 6 (Refactoring), we've created a plan for improving the codebase structure but haven't fully implemented it due to the specific requirements of Chrome extension architecture.

## Documentation Files

- **CURRENT_STATUS.md** - Describes the current state of the codebase
- **IMPLEMENTATION_PLAN.md** - Outlines the phased approach to refactoring
- **REFACTORING.md** - Details the architectural changes planned
- **TESTING.md** - Instructions for testing the extension

## Testing Instructions

To test the extension:

1. Make sure all files are in their original locations (not in src/ subdirectories)
2. Build the extension: `npm run build`
3. Load the unpacked extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked"
   - Select the extension directory

For detailed testing instructions, see `TESTING.md`.

## Technical Challenges

The main challenge in refactoring is that Chrome extensions have specific requirements:

1. **Module System**: Chrome extension content scripts run in a specific context that doesn't fully support ES modules
2. **Building**: We need a bundler like Webpack to properly handle the module dependencies
3. **Background/Content Script Communication**: Requires special handling for message passing

## Next Steps

1. Set up Webpack for bundling
2. Follow the implementation plan for refactoring
3. Test thoroughly after each phase

## Original Files

The core extension functionality is in these files:
- `contentScript.ts` - Main content script
- `background.ts` - Background service worker
- `llmExtractor.ts` - LLM-based extraction
- `types.ts` - Shared types

These files should remain in their original locations until we implement the bundling solution.