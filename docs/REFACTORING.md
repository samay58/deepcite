# Athena DeepCite Refactoring Guide

## Overview

This document outlines the approach to refactoring the Athena DeepCite codebase to improve maintainability, extensibility, and organization. Due to the Chrome extension architecture constraints, we have to carefully plan the refactoring to ensure it works in the browser environment.

## Recommended Architecture

### Directory Structure

```
/athena-deepcite/
├── src/
│   ├── extractors/
│   │   ├── contentExtractor.ts     # Rule-based claim extraction
│   │   └── llmExtractor.ts         # AI-powered claim extraction
│   ├── handlers/
│   │   ├── pdfHandler.ts           # PDF document processing
│   │   ├── pdfAnalyzer.ts          # PDF UI and analysis
│   │   └── webPageHandler.ts       # Web page UI and analysis
│   ├── utils/
│   │   └── settingsManager.ts      # API key and settings management
│   ├── types.ts                    # Shared type definitions
│   ├── contentScript.ts            # Main content script entry point
│   └── background.ts               # Background service worker
├── dist/                           # Compiled JavaScript
├── styles/                         # CSS styles
└── lib/                            # Third-party libraries
```

### Module Pattern

Because Chrome extensions in Manifest V3 have limitations with ES modules, we recommend using a module pattern:

```typescript
// Example for an extractor
namespace Extractors {
  export interface IClaimExtractor {
    extractClaims(text: string, maxClaims?: number): Promise<Types.ClaimDetectionResult>;
  }

  export class ContentExtractor implements IClaimExtractor {
    // Implementation
  }
}
```

This approach provides modularity while maintaining compatibility with Chrome extension architecture.

## Building the Extension

To build the extension with the new architecture:

1. Set up a bundler like Webpack or Rollup to handle module imports
2. Configure the bundler to output files in the format Chrome extensions expect
3. Use the `tsconfig.json` path mappings to maintain clean imports

Example Webpack configuration:

```javascript
module.exports = {
  entry: {
    contentScript: './src/contentScript.ts',
    background: './src/background.ts',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
  // More configuration...
};
```

## Testing the Extension

For testing during development:

1. Build the extension: `npm run build`
2. Load the unpacked extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" 
   - Click "Load unpacked"
   - Select the extension directory

Test both web pages and PDF documents to ensure all functionality works correctly.

## Implementation Notes

### Module Dependencies

Organize your dependencies carefully to avoid circular dependencies:

1. `types.ts` should have no imports
2. Modules should only import from modules "below" them in the dependency graph
3. Utility modules should be at the bottom of the graph

### Background/Content Script Communication

Use a structured message passing approach:

```typescript
// In content script
chrome.runtime.sendMessage({ 
  type: 'VERIFY_CLAIM', 
  claim 
}, response => {
  // Handle response
});

// In background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'VERIFY_CLAIM':
      handleVerifyClaim(request, sendResponse);
      break;
    // Other cases...
  }
  return true; // Will respond asynchronously
});
```

## Migration Strategy

To migrate the codebase:

1. Create the new directory structure
2. Move functionality into appropriate modules
3. Refactor interdependent code to use the new structure
4. Update imports and references
5. Test thoroughly after each significant change

## Known Limitations

- Chrome extensions have limited ESM support
- TypeScript path mappings work for development but need bundling for production
- Chrome extensions need careful handling of async operations

## Next Steps

1. Set up a bundler (Webpack or Rollup)
2. Implement the module pattern
3. Migrate code incrementally
4. Add automated testing