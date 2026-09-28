import { Injectable, Logger } from '@nestjs/common';

export interface ExtractionResult {
  /** Empty when the file is an image — there is nothing to extract from it. */
  text: string;
  /**
   * Set for photographs and scans. The bytes go straight into the vision
   * call rather than through a separate OCR step: one call reads and
   * translates, and the model keeps the page layout — the columns, the
   * reference ranges beside each value — which is what makes a lab report
   * readable at all.
   */
  imageBase64: string | null;
  imageMimeType: string | null;
  /** True when a text layer was absent and the image path was taken. */
  usedOcr: boolean;
  pageCount: number | null;
}

/**
 * Layer 1 of text extraction: read the text that is already inside the file.
 *
 * This is not OCR. Most government PDFs carry a text layer, and copying it is
 * free, instant and exact. Only a scan falls through to layer 2.
 *
 * Layer 2 for admin documents is Amazon Textract — deliberately not a vision
 * model. The text produced here becomes the chunks that grounding verifies
 * numbers against, so it has to be a faithful copy rather than a model's
 * reading of the page. A hallucinated figure at this stage would pass every
 * downstream check.
 */
@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  private static readonly SUPPORTED_IMAGES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  ];

  async extract(buffer: Buffer, contentType: string): Promise<ExtractionResult> {
    if (contentType === 'application/pdf') {
      return this.fromPdf(buffer);
    }

    if (contentType.startsWith('text/')) {
      return {
        text: buffer.toString('utf8'),
        imageBase64: null,
        imageMimeType: null,
        usedOcr: false,
        pageCount: null,
      };
    }

    if (ExtractionService.SUPPORTED_IMAGES.includes(contentType)) {
      // No text to pull out — hand the picture to the vision call as it is.
      return {
        text: '',
        imageBase64: buffer.toString('base64'),
        imageMimeType: contentType,
        usedOcr: true,
        pageCount: 1,
      };
    }

    throw new Error(
      `We cannot read ${contentType} files. Please upload a PDF, a text file, or a photo (JPEG, PNG or WebP).`,
    );
  }

  private async fromPdf(buffer: Buffer): Promise<ExtractionResult> {
    // Imported lazily: pdf-parse pulls in pdfjs, which is heavy and only
    // needed on the worker path.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      const text = (result.text ?? '').trim();

      if (text.length < 40) {
        // No usable text layer. Layer 2 — Amazon Textract — belongs here.
        throw new Error(
          'No readable text found. This looks like a scan, which needs OCR. ' +
            'Textract is not wired up yet.',
        );
      }

      return {
        text,
        imageBase64: null,
        imageMimeType: null,
        usedOcr: false,
        pageCount: result.pages?.length ?? null,
      };
    } finally {
      await parser.destroy();
    }
  }
}
