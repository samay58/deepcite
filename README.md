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
bash
git clone [repository-url]
cd deep-research-citation-verifier

2. **Install dependencies**
bash
npm install

3. **Build the extension**
bash
npm run build


4. **Load in Chrome**
- Open Chrome and go to `chrome://extensions/`
- Enable "Developer mode" in the top right
- Click "Load unpacked"
- Select the extension directory containing `manifest.json`

## Project Structure

```
├── contentScript.ts     # DOM manipulation, highlighting, claim detection
├── background.ts        # API calls, service worker
├── llmExtractor.ts      # AI-powered claim extraction
├── types.ts             # TypeScript interfaces
├── dist/                # Compiled JavaScript
├── lib/                 # Third-party libraries (pdf.js)
├── styles/              # CSS styles with variables
│   └── pdf-overlay.css  # Styling for web and PDF overlays
├── manifest.json        # Extension config and permissions
└── options.html         # Settings page (future development)
```

## Usage

1. **Visit any webpage** with factual content (e.g., news articles, Wikipedia, research blogs)

2. **Click the "Analyze Webpage" button** (top-right) to detect and highlight claims.

3. **The extension will:**
   - Find factual claims in the text using either AI or rule-based analysis
   - Highlight them with a subtle blue background
   - Connect to Exa's API to verify sources

4. **Interact with highlights:**
   - Hover over any highlighted text
   - See source information and confidence scores in a tooltip
   - Click "View source" to open the original reference

## Current Limitations
- Uses developer API key (not for production)
- May highlight only partial paragraphs in some websites
- Requires manual activation via the "Analyze Webpage" button
- Limited to text content (no image analysis)
- Depends on OpenAI API for best results (falls back to rule-based analysis if unavailable)

## Development Notes

### Key Files
- `contentScript.ts`: Handles DOM manipulation, claim detection, and highlighting
- `background.ts`: Manages API calls to Exa for source verification
- `llmExtractor.ts`: Provides AI-powered claim detection with confidence scoring
- `styles/pdf-overlay.css`: Contains all styling with CSS variables for consistent UI
- `manifest.json`: Extension configuration and permissions

### API Keys
The extension relies on two API services:

1. **Exa API**: Used for retrieving source information for claims
   - Currently using a hardcoded demo key in `background.ts` (for development only)
   - Will be moved to the options page in a future update

2. **OpenAI API**: Used for improved claim detection and confidence scoring
   - Currently using a hardcoded key for demonstration
   - The extension will fall back to rule-based detection if the key is invalid or unavailable
   - Will be configurable in the options page in a future update

### Building 

bash
npm run build

This compiles TypeScript files to JavaScript in the `dist` directory.

### Reloading
After making changes:
1. Run build command
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension


### Key Components
- **Claim Detection**: Uses heuristics to find factual statements
- **Source Verification**: Calls Exa API to find supporting sources
- **UI**: Highlights + tooltips showing source info

### Current Limitations
- Uses hardcoded API key (in background.ts)
- Highlights one claim at a time
- Basic error handling
- Text-only analysis

### Making Changes
1. Edit TypeScript files in `src/`
2. Run `npm run build`
3. Refresh extension in Chrome

### Testing on Different Sites
Works best on:
- Wikipedia articles
- News sites
- Research blogs
- Technical documentation

## Next Steps
- [x] Add manual analysis button to respect user privacy
- [x] Support multiple claim highlights
- [x] Improve UI with modern design elements
- [x] Add confidence scores from LLM analysis
- [ ] Refactor code for better maintainability (see docs/IMPLEMENTATION_PLAN.md)
- [ ] Add API key configuration UI in options page
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
