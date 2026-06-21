import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEvent } from '@/lib/inngest';

export const maxDuration = 60;

function getSupabaseUser(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return supabase.auth.getUser(token);
}

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user } } = await getSupabaseUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('case_files')
    .select('*')
    .eq('case_id', params.caseId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: data });
}

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user } } = await getSupabaseUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { filename, storagePath, fileType, fileSize, documentType } = body;

  if (!filename || !storagePath) {
    return NextResponse.json({ error: 'filename and storagePath required' }, { status: 400 });
  }

  const { data: file, error } = await supabaseAdmin.from('case_files').insert({
    case_id: params.caseId,
    filename,
    storage_path: storagePath,
    file_type: fileType || 'unknown',
    file_size: fileSize,
    document_type: documentType || 'other',
    processing_status: 'pending',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger background processing
  await sendEvent('document/uploaded', {
    caseId: params.caseId,
    fileId: file.id,
    storagePath,
    fileType: fileType || 'unknown',
    documentType: documentType || 'other',
  });

  return NextResponse.json({ file }, { status: 201 });
}
