// getSharedDocument — Phase 4.2. Public, unauthenticated, read-only lookup
// of a single document by its share_token. Off by default: a document is
// only reachable here if its owner explicitly enabled sharing.
//
// INVARIANT: this endpoint is public and unauthenticated. It must never
// trigger an LLM call, never call routeAdvisorRequest, and never perform
// any billable operation — read-only lookup and a signed download URL,
// nothing else. Keep it that way even as this file changes.
//
// A revoked token (share_token set back to null) and a token that never
// existed both simply fail to match any row — the same "not found" path,
// by construction, not by special-casing. The response is identical and
// deliberately uninformative either way, so the endpoint never confirms
// which tokens are real.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORAGE_BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 300;
const NOT_AVAILABLE = { error: 'This link is no longer available.' };

function deriveNativeFormat(doc: any): string | null {
  if (doc.native_file_format) return doc.native_file_format;
  const FINANCIAL_TYPES = ['Financial Model', 'Budget', 'Forecast', 'Spreadsheet'];
  const PRESENTATION_TYPES = ['Pitch Deck', 'Presentation'];
  if (FINANCIAL_TYPES.includes(doc.document_type)) return 'xlsx';
  if (PRESENTATION_TYPES.includes(doc.document_type)) return 'pptx';
  return doc.native_file_url ? 'docx' : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const allowed = await checkRateLimit(db, req, 'getSharedDocument', { maxRequests: 30, windowMinutes: 5 });
    if (!allowed) return Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: corsHeaders });

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });

    let doc;
    try {
      const { data, error } = await db.from('documents').select('*').eq('share_token', token).single();
      if (error || !data) return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });
      doc = data;
    } catch {
      // A malformed token (not a valid uuid) fails the query itself —
      // treat it exactly the same as a well-formed one that doesn't match.
      return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });
    }

    const { data: company } = await db.from('companies').select('name').eq('id', doc.company_id).single();

    let downloadUrl: string | null = null;
    let downloadFilename: string | null = null;
    const nativeFormat = deriveNativeFormat(doc);
    // Prefer the native file (matches doc.file_name) over the PDF summary —
    // whichever one is actually served must match the filename/extension
    // handed to the browser, or a founder downloads a PDF labelled .xlsx.
    const usingNative = !!doc.native_file_url;
    const filePath = doc.native_file_url || doc.pdf_file_url;
    if (filePath) {
      const filename = usingNative
        ? (doc.file_name || `${(doc.title || 'Document').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')}.${nativeFormat || 'docx'}`)
        : `${(doc.title || 'Document').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')}.pdf`;
      const { data: signed } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS, { download: filename });
      if (signed?.signedUrl) {
        downloadUrl = signed.signedUrl;
        downloadFilename = filename;
      }
    }

    return Response.json({
      title: doc.title,
      document_type: doc.document_type || doc.category,
      // structured_content is the raw JSON spec used to generate the native
      // file, not prose — never render it directly. content is the
      // human-readable text (matches DocumentDetailDialog's own precedence).
      content: doc.content || doc.description || null,
      created_at: doc.created_at,
      company_name: company?.name || null,
      download_url: downloadUrl,
      download_filename: downloadFilename,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('getSharedDocument error:', error);
    return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });
  }
});
