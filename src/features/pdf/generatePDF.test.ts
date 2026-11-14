/**
 * Unit tests for src/features/pdf/generatePDF.ts
 *
 * Strategy: mock html2canvas-pro and jsPDF to remove canvas/browser dependencies.
 * We test generatePDF()'s own control flow only.
 *
 * Key pattern for jsPDF mocking:
 *   Each `new jsPDF()` call creates a new instance. The mock class delegates
 *   every method to shared spies stored on globalThis, so tests assert on
 *   `spies` regardless of which instance generatePDF created.
 *
 * Coverage targets:
 *   ✓ Throws a descriptive Error when elementId does not exist in DOM
 *   ✓ Returns undefined when element has no .pdf-page children
 *   ✓ Calls html2canvas once per .pdf-page child
 *   ✓ Calls pdf.addPage() only for pages after the first
 *   ✓ Calls pdf.save() with the provided filename
 *   ✓ Restores element.style.display to original value after completion (and on failure)
 *   ✓ Returns a Blob on successful completion
 *   ✓ Calls pdf.output("blob")
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared spy singletons – created once, reset between tests via vi.clearAllMocks()
// ---------------------------------------------------------------------------
const spies = {
  getImageProperties: vi.fn(() => ({ width: 210, height: 297 })),
  addPage: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
  output: vi.fn(() => new Blob(['%PDF-FAKE'], { type: 'application/pdf' })),
};

type PdfSpyHost = typeof globalThis & {
  __pdfSpies?: Record<keyof typeof spies, (...args: unknown[]) => unknown>;
};

// ---------------------------------------------------------------------------
// Mocks (hoisted – no outer-scope variable references allowed in factory)
// ---------------------------------------------------------------------------
vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => ({
    toDataURL: () => 'data:image/jpeg;base64,FAKE',
  })),
}));

vi.mock('jspdf', async () => {
  // Import the spy container via a dynamic import workaround.
  // Because vi.mock factories are hoisted, we cannot reference module-level
  // `spies` directly. Instead, define the class prototype methods as
  // plain functions that delegate to module-level spies exposed via a
  // module-scoped object that we access through globalThis.
  //
  // Simpler approach: define the mock class's method bodies to just call
  // through a stable reference stored on globalThis before each test.
  class JsPDFMock {
    internal = { pageSize: { getWidth: () => 210 } };
    getImageProperties(...args: unknown[]) { return (globalThis as PdfSpyHost).__pdfSpies?.getImageProperties(...args); }
    addPage(...args: unknown[]) { return (globalThis as PdfSpyHost).__pdfSpies?.addPage(...args); }
    addImage(...args: unknown[]) { return (globalThis as PdfSpyHost).__pdfSpies?.addImage(...args); }
    save(...args: unknown[]) { return (globalThis as PdfSpyHost).__pdfSpies?.save(...args); }
    output(...args: unknown[]) { return (globalThis as PdfSpyHost).__pdfSpies?.output(...args); }
  }
  return { default: JsPDFMock };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import html2canvasMod from 'html2canvas-pro';
import { generatePDF } from './generatePDF';

const mockHtml2canvas = vi.mocked(html2canvasMod);

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
function createPageContainer(id: string, pageCount: number): HTMLElement {
  const container = document.createElement('div');
  container.id = id;
  for (let i = 0; i < pageCount; i++) {
    const page = document.createElement('div');
    page.className = 'pdf-page';
    container.appendChild(page);
  }
  document.body.appendChild(container);
  return container;
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Reset spy call histories
  Object.values(spies).forEach(s => s.mockClear());
  // Reset output to return a fresh Blob each test
  spies.output.mockReturnValue(new Blob(['%PDF-FAKE'], { type: 'application/pdf' }));
  // Attach spies to globalThis so the mock class delegates to them
  (globalThis as PdfSpyHost).__pdfSpies = spies;
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePDF – missing element', () => {
  it('throws a descriptive Error when elementId is not found in the DOM', async () => {
    await expect(generatePDF('non-existent-id', 'output.pdf')).rejects.toThrow(
      /PDF container element "#non-existent-id" was not found/,
    );
  });

  it('never calls html2canvas when element is missing', async () => {
    await expect(generatePDF('ghost-element', 'output.pdf')).rejects.toThrow();
    expect(mockHtml2canvas).not.toHaveBeenCalled();
  });
});

describe('generatePDF – element with no .pdf-page children', () => {
  it('returns undefined', async () => {
    const el = document.createElement('div');
    el.id = 'empty-container';
    document.body.appendChild(el);
    expect(await generatePDF('empty-container', 'output.pdf')).toBeUndefined();
  });

  it('never calls html2canvas', async () => {
    const el = document.createElement('div');
    el.id = 'no-pages';
    document.body.appendChild(el);
    await generatePDF('no-pages', 'output.pdf');
    expect(mockHtml2canvas).not.toHaveBeenCalled();
  });
});

describe('generatePDF – single page', () => {
  it('calls html2canvas exactly once', async () => {
    createPageContainer('single-page', 1);
    await generatePDF('single-page', 'report.pdf');
    expect(mockHtml2canvas).toHaveBeenCalledTimes(1);
  });

  it('does NOT call addPage() for a single-page document', async () => {
    createPageContainer('single-no-addpage', 1);
    await generatePDF('single-no-addpage', 'report.pdf');
    expect(spies.addPage).not.toHaveBeenCalled();
  });

  it('calls pdf.save() with the provided filename', async () => {
    createPageContainer('single-save', 1);
    await generatePDF('single-save', 'MyReport.pdf');
    expect(spies.save).toHaveBeenCalledWith('MyReport.pdf');
  });

  it('calls pdf.output("blob")', async () => {
    createPageContainer('single-output', 1);
    await generatePDF('single-output', 'out.pdf');
    expect(spies.output).toHaveBeenCalledWith('blob');
  });

  it('returns a Blob', async () => {
    createPageContainer('single-blob', 1);
    const result = await generatePDF('single-blob', 'out.pdf');
    expect(result).toBeInstanceOf(Blob);
  });
});

describe('generatePDF – multi-page', () => {
  it('calls html2canvas once per page (3 pages)', async () => {
    createPageContainer('multi-3', 3);
    await generatePDF('multi-3', 'report.pdf');
    expect(mockHtml2canvas).toHaveBeenCalledTimes(3);
  });

  it('calls addPage() N-1 times for N pages', async () => {
    createPageContainer('multi-addpage', 4);
    await generatePDF('multi-addpage', 'report.pdf');
    expect(spies.addPage).toHaveBeenCalledTimes(3);
  });

  it('calls addImage() once per page', async () => {
    createPageContainer('multi-addimage', 2);
    await generatePDF('multi-addimage', 'report.pdf');
    expect(spies.addImage).toHaveBeenCalledTimes(2);
  });
});

describe('generatePDF – style restoration', () => {
  it('restores element.style.display to its original value after completion', async () => {
    const container = createPageContainer('style-restore', 1);
    container.style.display = 'none';
    await generatePDF('style-restore', 'out.pdf');
    expect(container.style.display).toBe('none');
  });

  it('sets element.style.display to "block" during html2canvas capture', async () => {
    const observedDisplays: string[] = [];
    mockHtml2canvas.mockImplementationOnce(async (el: HTMLElement) => {
      observedDisplays.push((el.parentElement as HTMLElement).style.display);
      return Object.assign(document.createElement('canvas'), {
        toDataURL: () => 'data:image/jpeg;base64,FAKE',
      });
    });

    const container = createPageContainer('style-block', 1);
    container.style.display = 'none';
    await generatePDF('style-block', 'out.pdf');

    expect(observedDisplays[0]).toBe('block');
  });

  it('restores element.style.display even when html2canvas throws', async () => {
    mockHtml2canvas.mockRejectedValueOnce(new Error('capture failed'));
    const container = createPageContainer('style-restore-error', 2);
    container.style.display = 'none';

    await expect(generatePDF('style-restore-error', 'out.pdf')).rejects.toThrow('capture failed');
    expect(container.style.display).toBe('none');
    expect(spies.save).not.toHaveBeenCalled();
  });
});
