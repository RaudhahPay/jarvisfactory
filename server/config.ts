export interface ServerEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export function loadServerEnv(): ServerEnv {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Missing required env var: SUPABASE_URL');

  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabasePublishableKey) throw new Error('Missing required env var: SUPABASE_PUBLISHABLE_KEY');

  return { supabaseUrl, supabasePublishableKey };
}
