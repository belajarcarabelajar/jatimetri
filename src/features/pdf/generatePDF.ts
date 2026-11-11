import html2canvas from "html2canvas";
import jsPDF from "jspdf";

async function buildPDF(elementId: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`generatePDF: PDF container element "#${elementId}" was not found in the document.`);
  }

  const pages = element.querySelectorAll(".pdf-page");
  if (pages.length === 0) return;

  const pdf = new jsPDF("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();

  // Make the hidden container temporarily visible for capture (without breaking document flow)
  const originalDisplay = element.style.display;
  element.style.display = "block";

  try {
    for (let i = 0; i < pages.length; i++) {
      const pageElement = pages[i] as HTMLElement;

      const canvas = await html2canvas(pageElement, {
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
        scrollY: -window.scrollY,
        windowWidth: 1024,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.98);

      // Calculate aspect ratio to fit A4
      const imgProps = pdf.getImageProperties(imgData);
      const ratio = imgProps.width / imgProps.height;
      const height = pdfWidth / ratio;

      if (i > 0) {
        pdf.addPage();
      }

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, height);
    }
  } finally {
    // Always hide the container again, even if a capture fails
    element.style.display = originalDisplay;
  }

  return pdf;
}

/** Builds the PDF, downloads it as `filename` on the user's device, and returns it as a Blob. */
export async function generatePDF(elementId: string, filename: string) {
  const pdf = await buildPDF(elementId);
  if (!pdf) return;
  pdf.save(filename);
  return pdf.output("blob");
}

/** Builds the PDF and returns it as a Blob without downloading it. */
export async function renderPDFBlob(elementId: string) {
  const pdf = await buildPDF(elementId);
  return pdf?.output("blob");
}
