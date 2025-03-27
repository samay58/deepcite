# Deep Research Citation Verifier (Athena DeepCite)

A Chrome extension that helps users verify factual claims on webpages and PDFs. 
It combines AI-powered claim detection with Exa's neural search technology to provide source verification and confidence scores for factual statements.

## Features
- Detects factual claims in web pages and PDFs on demand
- Uses AI-powered claim extraction with confidence scoring
- Highlights claims with a subtle blue background
- Shows multiple sources on hover with confidence scores
- Provides direct links to original source documents
- Supports dark mode through CSS variables
- Works with both web pages and PDF documents

## Installation

1. **Clone the repository**
```bash
git clone [repository-url]
cd athena-deepcite
```

2. **Install dependencies**
```bash
npm install
```

3. **Build the extension**
```bash
npm run build
```

4. **Load in Chrome**
- Open Chrome and go to `chrome://extensions/`
- Enable "Developer mode" in the top right
- Click "Load unpacked"
- Select the extension directory containing `manifest.json`

## Project Structure

The project follows a modular architecture with clear separation of concerns:

```
├── src/                   # Source TypeScript code
│   ├── extractors/        # Claim extraction strategies
│   │   ├── contentExtractor.ts # Rule-based extraction
│   │   └── llmExtractor.ts     # AI-powered extraction
│   ├── handlers/          # Document-specific processing
│   │   ├── pdfHandler.ts      # PDF document handling
│   │   └── webPageHandler.ts  # Web UI components
│   ├── utils/             # Shared utilities
│   │   └── settingsManager.ts # Storage and settings mgmt
│   ├── background.ts      # Background service worker
│   ├── contentScript.ts   # Main content script
│   ├── options.ts         # Options page functionality
│   ├── popup.ts           # Popup UI functionality
│   └── types.ts           # Shared TypeScript interfaces
├── dist/                  # Compiled JavaScript
├── lib/                   # Third-party libraries (pdf.js)
├── styles/                # CSS styles with variables
│   └── pdf-overlay.css    # Styling for web and PDF overlays
├── options.html           # Settings page UI
├── popup.html             # Popup UI
└── manifest.json          # Extension config and permissions
```

## Usage

1. **Visit any webpage** with factual content (e.g., news articles, Wikipedia, research blogs)

2. **Click the DeepCite button** in the toolbar to open the popup menu

3. **Select "Analyze Current Page"** to detect and highlight claims.

4. **The extension will:**
   - Find factual claims in the text using either AI or rule-based analysis
   - Highlight them with a subtle blue background
   - Connect to Exa's API to verify sources
   - Show a sidebar with all detected claims

5. **Interact with highlights:**
   - Hover over any highlighted text
   - See source information and confidence scores in a tooltip
   - Click "View source" to open the original reference

## Development

### Building and Watching

```bash
# Build once
npm run build

# Watch for changes during development
npm run dev

# Run linting
npm run lint

# Clean build output
npm run clean
```

### API Keys Configuration

The extension stores API keys securely in Chrome's storage API. Keys can be configured in the options page:

1. **Exa API**: Used for retrieving source information for claims
   - Create an account at https://exa.ai to get your API key
   - Enter your key in the options page

2. **OpenAI API** (Optional): Used for improved claim detection and confidence scoring
   - Create an account at https://platform.openai.com to get your API key
   - Enter your key in the options page to enable AI-powered extraction
   - Without this key, the extension will use rule-based extraction instead

### TypeScript Path Aliases

The project uses TypeScript path aliases for cleaner imports:

- `@extractors/*` - Points to src/extractors/
- `@handlers/*` - Points to src/handlers/
- `@utils/*` - Points to src/utils/
- `@types` - Points to src/types.ts

### Key Components

- **Claim Detection**: Uses heuristics or LLM to find factual statements
- **Source Verification**: Calls Exa API to find supporting sources
- **UI**: Highlights + tooltips + sidebar showing source info
- **Settings Management**: Secure storage and configuration

### Testing on Different Sites

Works best on:
- Wikipedia articles
- News sites
- Research blogs
- Technical documentation
- PDF documents (research papers, reports)

## Next Steps

- [x] Add manual analysis button to respect user privacy
- [x] Support multiple claim highlights
- [x] Improve UI with modern design elements
- [x] Add confidence scores from LLM analysis
- [x] Refactor code for better maintainability
- [ ] Improve cross-site compatibility for highlighting
- [ ] Add error handling for API failures
- [ ] Add browser dark mode support
- [ ] Package for Chrome Web Store

## Development Documentation

For developers working on this extension, please see the following documentation:

- [Current Status](docs/CURRENT_STATUS.md)
- [Testing Guide](docs/TESTING.md)
- [Refactoring Plan](docs/REFACTORING.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)