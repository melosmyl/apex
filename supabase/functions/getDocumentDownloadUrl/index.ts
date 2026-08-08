// getDocumentDownloadUrl — verifies permissions, checks file existence, and
// returns a short-lived signed URL with the correct filename and MIME type.
// Files live in the private `documents` bucket, so the stored value is an
// object path rather than a URL and must be signed for each download.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORAGE_BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 300;

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { document_id, requested_format } = body;
    if (!document_id || !requested_format) {
      return Response.json({ error: 'document_id and requested_format are required' }, { status: 400, headers: corsHeaders });
    }

    // Read the document as the caller, so the table's row-level security
    // policies decide access rather than a permission rule duplicated here.
    const { data: doc } = await authClient.from('documents').select('*').eq('id', document_id).single();
    if (!doc) {
      return Response.json({ error: 'Document not found, or you do not have permission to download it.' }, { status: 404, headers: corsHeaders });
    }

    // Resolve the file URL based on the requested format
    const fmt = requested_format.toLowerCase();
    const nativeFormat = deriveNativeFormat(doc);
    let filePath: string | null = null;

    if (fmt === 'pdf') {
      filePath = doc.pdf_file_url;
    } else if (fmt === nativeFormat) {
      filePath = doc.native_file_url;
    } else if (fmt === 'native' && doc.native_file_url) {
      filePath = doc.native_file_url;
    }

    if (!filePath) {
      const label = FORMAT_LABELS[fmt] || fmt.toUpperCase();
      const available = getAvailableFormats(doc);
      const hint = available.length > 0
        ? `Available format${available.length > 1 ? 's' : ''}: ${available.map((f) => FORMAT_LABELS[f] || f.toUpperCase()).join(', ')}.`
        : 'No files have been generated for this document yet.';
      return Response.json({
        error: `${label} file has not been generated for this document. ${hint}`,
        available_formats: available,
      }, { status: 404, headers: corsHeaders });
    }

    const resolvedFormat = fmt === 'native' ? (nativeFormat || 'file') : fmt;
    const filename = buildFilename(doc, resolvedFormat);
    const mimeType = MIME_TYPES[resolvedFormat] || 'application/octet-stream';

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: signed, error: signErr } = await db.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS, { download: filename });
    if (signErr || !signed?.signedUrl) {
      return Response.json({ error: 'The file could not be retrieved from storage.' }, { status: 404, headers: corsHeaders });
    }

    await db.from('document_download_logs').insert({
      document_id: doc.id,
      company_id: doc.company_id,
      user_id: user.id,
      file_format: resolvedFormat,
      version_number: doc.version_number || 1,
      filename,
    });

    return Response.json({
      download_url: signed.signedUrl,
      filename,
      mime_type: mimeType,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('getDocumentDownloadUrl error:', error);
    return Response.json({ error: error.message || 'Failed to retrieve download URL.' }, { status: 500, headers: corsHeaders });
  }
});