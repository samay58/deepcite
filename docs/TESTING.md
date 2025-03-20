# Testing the Current Extension

## Setting Up for Testing

To test the Athena DeepCite extension in its current state:

1. **Build the TypeScript files**:
   ```bash
   npm run build
   ```

2. **Load the extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top-right corner
   - Click "Load unpacked"
   - Select the root folder of the repository (`/Users/samaydhawan/athena-deepcite`)

3. **Verify the extension is loaded**:
   - You should see "Deep Research Citation Verifier" in your list of extensions
   - Make sure it's enabled (toggle should be on)

## Testing on Web Pages

1. Navigate to a webpage with factual content (e.g., a news article, Wikipedia page, etc.)
2. Look for the "Analyze Webpage" button in the top-right corner of the page
3. Click the button to begin analysis
4. Wait for the analysis to complete (the button will show "Analysis Complete")
5. A claims overlay panel will appear on the right side, showing all detected factual claims
6. Factual claims in the text should be highlighted with a subtle blue background
7. Only claims with a fact certainty score above 40% will be highlighted and included in the overlay
8. Hover over a highlighted claim to see a tooltip with source information and certainty score
9. Click on a claim in the overlay panel to jump to its location in the text
10. Click the close button (×) in the top right of the overlay to minimize the panel
11. Click on a source link to open the original source document

**Good test pages**:
- Wikipedia articles on scientific topics
- News articles from major publications
- Research blog posts

## Testing on PDF Documents

1. Open a PDF document in Chrome
2. Look for the "Analyze PDF" button in the top-right corner
3. Click the button to begin analysis
4. Wait for the claims overlay panel to appear on the right side
5. The panel will show detected claims with fact certainty scores and source information
6. Only claims with a fact certainty score above 40% will be included in the overlay
7. Each claim shows a visual meter indicating its certainty level
8. Click on a claim to navigate to its location in the PDF
9. Click the close button (×) in the top right of the overlay to minimize the panel

**Good test PDFs**:
- Academic papers
- Reports with factual information
- News articles saved as PDFs

## Known Issues

- The extension may not correctly highlight claims in all webpages due to varying DOM structures
- Some websites block content scripts or have complex formatting that interferes with highlighting
- Very large PDFs may take a long time to process

## Troubleshooting

If the extension isn't working correctly:

1. **Check for errors in the console**:
   - Right-click on the page and select "Inspect"
   - Go to the "Console" tab
   - Look for any error messages related to the extension

2. **Verify the extension is loaded properly**:
   - Go to `chrome://extensions/`
   - Make sure the extension is enabled
   - Click the "Errors" button to see if there are any loading errors

3. **Rebuild the extension**:
   - Run `npm run build`
   - Go to `chrome://extensions/`
   - Click the refresh icon on the extension card

4. **Check for content restrictions**:
   - Some websites block content scripts or iframe content
   - Try the extension on a different website

## Reporting Issues

When reporting issues, please include:

1. The URL of the page where the issue occurred
2. Steps to reproduce the issue
3. Any error messages from the console
4. Browser version and operating system information