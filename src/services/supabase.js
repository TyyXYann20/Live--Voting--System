import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export async function rpc(name, args = {}) {
  if (!supabase)
    throw new Error(
      "Connect Supabase using the environment variables in .env.example.",
    );
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function select(table, modify = (q) => q) {
  if (!supabase) return [];
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await modify(
      supabase.from(table).select("*"),
    ).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
