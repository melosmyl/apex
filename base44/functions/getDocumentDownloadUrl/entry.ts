// getDocumentDownloadUrl — verifies permissions, checks file existence,
// returns a secure download URL with the correct filename and MIME type.
// Files are stored via UploadFile (public storage URLs), so no signed URL
// is needed — the function acts as a permission gate and filename resolver.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { waitUntil } from 'base44:runtime';

const MIME_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  csv: 'text/csv',
};

const FORMAT_LABELS: Record<string, string> = {
  xlsx: 'Excel',
  docx: 'Word',
  pptx: 'PowerPoint',
  pdf: 'PDF',
  csv: 'CSV',
};

function cleanFileName(str: string): string {
  return (str || 'Document')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function buildFilename(doc: any, format: string): string {
  const version = doc.version_number || 1;
  const storedName = doc.file_name;
  const nativeFmt = doc.native_file_format || deriveNativeFormat(doc);

  // If the stored file_name matches the requested format, use it directly
  if (storedName && format === nativeFmt) {
    return storedName;
  }

  // Derive a clean base name from the stored file_name or the title
  let base: string;
  if (storedName) {
    base = storedName.replace(/\.[^.]+$/, '');
  } else {
    base = cleanFileName(doc.title || 'Document') + `_v${version}.0`;
  }

  // For PDF summary of a financial model, append _Summary
  if (format === 'pdf') {
    if (doc.native_file_format === 'xlsx' && !base.toLowerCase().includes('summary')) {
      return base + '_Summary.pdf';
    }
    return base + '.pdf';
  }

  return base + '.' + format;
}

function deriveNativeFormat(doc: any): string | null {
  if (doc.native_file_format) return doc.native_file_format;
  if (!doc.native_file_url) return null;
  const FINANCIAL_TYPES = ['Financial Model', 'Budget', 'Forecast', 'Spreadsheet'];
  const PRESENTATION_TYPES = ['Pitch Deck', 'Presentation'];
  if (FINANCIAL_TYPES.includes(doc.document_type)) return 'xlsx';
  if (PRESENTATION_TYPES.includes(doc.document_type)) return 'pptx';
  // Try to infer from file extension
  const ext = (doc.file_name || '').split('.').pop()?.toLowerCase();
  if (ext && MIME_TYPES[ext]) return ext;
  return 'docx';
}

function getAvailableFormats(doc: any): string[] {
  const formats: string[] = [];
  const nativeFmt = deriveNativeFormat(doc);
  if (doc.native_file_url && nativeFmt) {
    formats.push(nativeFmt);
  }
  if (doc.pdf_file_url) {
    formats.push('pdf');
  }
  return formats;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { document_id, requested_format } = body;
    if (!document_id || !requested_format) {
      return Response.json({ error: 'document_id and requested_format are required' }, { status: 400 });
    }

    // Fetch the document
    const doc = await base44.entities.Document.get(document_id);
    if (!doc) {
      return Response.json({ error: 'Document not found.' }, { status: 404 });
    }

    // Verify company access — user must own the company or be an admin
    const company = await base44.entities.Company.get(doc.company_id);
    if (!company) {
      return Response.json({ error: 'Company not found.' }, { status: 404 });
    }
    if (company.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'You do not have permission to download this document.' }, { status: 403 });
    }

    // Resolve the file URL based on the requested format
    const fmt = requested_format.toLowerCase();
    const nativeFormat = deriveNativeFormat(doc);
    let fileUrl: string | null = null;

    if (fmt === 'pdf') {
      fileUrl = doc.pdf_file_url;
    } else if (fmt === nativeFormat) {
      fileUrl = doc.native_file_url;
    } else if (fmt === 'native' && doc.native_file_url) {
      fileUrl = doc.native_file_url;
    }

    if (!fileUrl) {
      const label = FORMAT_LABELS[fmt] || fmt.toUpperCase();
      const available = getAvailableFormats(doc);
      const hint = available.length > 0
        ? `Available format${available.length > 1 ? 's' : ''}: ${available.map((f) => FORMAT_LABELS[f] || f.toUpperCase()).join(', ')}.`
        : 'No files have been generated for this document yet.';
      return Response.json({
        error: `${label} file has not been generated for this document. ${hint}`,
        available_formats: available,
      }, { status: 404 });
    }

    const resolvedFormat = fmt === 'native' ? (nativeFormat || 'file') : fmt;
    const filename = buildFilename(doc, resolvedFormat);
    const mimeType = MIME_TYPES[resolvedFormat] || 'application/octet-stream';

    // Log the download event (non-blocking — should not delay the response)
    waitUntil(
      base44.entities.DocumentDownloadLog.create({
        document_id: doc.id,
        company_id: doc.company_id,
        user_id: user.id,
        file_format: resolvedFormat,
        version_number: doc.version_number || 1,
        filename,
      }).catch(() => {})
    );

    return Response.json({
      download_url: fileUrl,
      filename,
      mime_type: mimeType,
    });
  } catch (error) {
    console.error('getDocumentDownloadUrl error:', error);
    return Response.json({ error: error.message || 'Failed to retrieve download URL.' }, { status: 500 });
  }
}