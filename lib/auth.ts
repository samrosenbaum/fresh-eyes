'use client';
import { supabase } from './supabase';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...(options.headers || {}) },
  });
}
