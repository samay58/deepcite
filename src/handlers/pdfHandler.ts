// PDF handling types and interfaces for PDF document processing

/**
 * Represents the content of a PDF page including text and viewport information
 */
export interface PDFPageContent {
  text: string;
  viewport: any;
  pageNum: number;
}

/**
 * Represents a text item within a PDF document with position information
 */
export interface PDFTextItem {
  str: string;
  transform: number[];
  pageNum?: number;
  paragraph?: number;
}

/**
 * Represents a stored text item with page and paragraph information
 */
export interface StoredTextItem {
  str: string;
  pageNum: number;
  paragraph: number;
}

/**
 * Handles PDF document loading, parsing, and text extraction
 * Provides methods to navigate and search within PDF documents
 */
export class PDFHandler {
  private url: string;
  private pdfDoc: any = null;
  private textItems: StoredTextItem[] = [];
  
  /**
   * Create a new PDF handler for the given URL
   * @param url URL of the PDF document to load
   */
  constructor(url: string) {
    this.url = url;
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
  }

  /**
   * Initialize the PDF document by loading it from the URL
   */
  async init(): Promise<void> {
    try {
      // @ts-ignore
      const loadingTask = pdfjsLib.getDocument(this.url);
      this.pdfDoc = await loadingTask.promise;
    } catch (error) {
      console.error('Error loading PDF:', error);
      throw error;
    }
  }

  /**
   * Get the content of a specific page in the PDF
   * Organizes text into paragraphs based on vertical position
   * @param pageNum Page number to extract (1-based index)
   */
  async getPageContent(pageNum: number): Promise<PDFPageContent> {
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    
    let currentParagraph = 0;
    let lastY: number | undefined;
    
    textContent.items.forEach((item: PDFTextItem) => {
      if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 15) {
        currentParagraph++;
      }
      lastY = item.transform[5];
      
      this.textItems.push({
        str: item.str,
        pageNum,
        paragraph: currentParagraph
      });
    });

    const text = textContent.items.map((item: PDFTextItem) => item.str).join(' ');
    return { text, viewport, pageNum };
  }

  /**
   * Get all the text content from the PDF document
   * @returns Promise resolving to the concatenated text of all pages
   */
  async getAllContent(): Promise<string> {
    const numPages = this.pdfDoc.numPages;
    const pageTexts: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const { text } = await this.getPageContent(i);
      pageTexts.push(text);
    }

    return pageTexts.join('\n\n');
  }

  /**
   * Find the location of a specific text in the PDF document
   * Uses a sliding window approach to handle text across multiple items
   * @param text The text to search for
   * @returns The location of the text or null if not found
   */
  findTextLocation(text: string): StoredTextItem | null {
    for (let i = 0; i < this.textItems.length; i++) {
      const windowSize = 100;
      const chunk = this.textItems.slice(i, i + windowSize)
        .map(item => item.str)
        .join(' ');
      
      if (chunk.includes(text)) {
        return this.textItems[i];
      }
    }
    return null;
  }
}