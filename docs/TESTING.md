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
5. Factual claims should be highlighted with a subtle blue background
6. Hover over a highlighted claim to see source information and confidence scores
7. Click on a source link to open the original source document

**Good test pages**:
- Wikipedia articles on scientific topics
- News articles from major publications
- Research blog posts

## Testing on PDF Documents

1. Open a PDF document in Chrome
2. Look for the "Analyze PDF" button in the top-right corner
3. Click the button to begin analysis
4. Wait for the overlay panel to appear on the right side
5. The panel should show detected claims with source information
6. Click on a claim to navigate to its location in the PDF

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