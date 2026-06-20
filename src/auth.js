import { supabase } from './supabaseClient';

// Effettua il login
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user };
}

// Effettua il logout
export async function logout() {
  await supabase.auth.signOut();
}

// Controlla se c'è un utente già loggato
export async function getUtente() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
