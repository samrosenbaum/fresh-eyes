import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await ctx.db
    .from('cases')
    .select(`*, case_files(count), entities(count), contradictions(count)`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cases: data });
}

export async function POST(req: NextRequest) {
  const ctx = await authenticateRequest(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, incident_date, incident_location } = body;
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const { data, error } = await ctx.db.from('cases').insert({
    name,
    description,
    incident_date: incident_date || null,
    incident_location: incident_location || null,
    created_by: ctx.user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ case: data }, { status: 201 });
}
