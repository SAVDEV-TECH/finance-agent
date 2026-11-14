export type SupportedUploadFileType = 'csv' | 'xlsx' | 'docx' | 'pdf';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK..
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

function startsWithBytes(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, idx) => buffer[idx] === byte);
}

/**
 * Validates that an uploaded file buffer matches the expected format signature
 * and does not contain malformed or corrupted binary payloads.
 */
export function validateUploadedFile(
  fileType: SupportedUploadFileType,
  fileBuffer: Buffer
): void {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }

  if (fileBuffer.length > 10 * 1024 * 1024) {
    throw new Error('File exceeds the 10MB maximum size limit.');
  }

  switch (fileType) {
    case 'pdf': {
      if (!startsWithBytes(fileBuffer, PDF_MAGIC)) {
        throw new Error('Invalid PDF file: missing %PDF header signature.');
      }
      break;
    }
    case 'xlsx':
    case 'docx': {
      // Both modern .xlsx and .docx are OpenXML ZIP containers (PK\x03\x04)
      // Legacy .xls (OLE2: D0 CF 11 E0) is also supported by SheetJS for xlsx
      const isZip = startsWithBytes(fileBuffer, ZIP_MAGIC);
      const isOle2 =
        fileType === 'xlsx' &&
        startsWithBytes(fileBuffer, [0xd0, 0xcf, 0x11, 0xe0]);
      if (!isZip && !isOle2) {
        throw new Error(
          `Invalid ${fileType.toUpperCase()} file: file signature does not match an Office OpenXML document.`
        );
      }
      break;
    }
    case 'csv': {
      // Ensure CSV does not contain binary null bytes in the first 4KB
      const sample = fileBuffer.subarray(0, Math.min(fileBuffer.length, 4096));
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0x00) {
          throw new Error('Invalid CSV file: binary content detected.');
        }
      }
      const text = fileBuffer.toString('utf8').trim();
      if (text.length === 0) {
        throw new Error('CSV file contains no readable text.');
      }
      break;
    }
    default:
      throw new Error(`Unsupported file type: ${String(fileType)}`);
  }
}
