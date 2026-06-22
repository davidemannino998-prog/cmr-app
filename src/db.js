import { supabase } from './supabaseClient';

const toDate = (d) => d ? new Date(d) : null;

export async function getLavori() {
  const { data, error } = await supabase
    .from('lavori')
    .select(`*, consegne(*), consegne_cliente(*), pose(*), diario(*)`)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return (data || []).map(l => ({
    ...l,
    materialePosa: l.materiale_posa || '',
    soloFornitura: l.solo_fornitura || false,
    dataChiusura: toDate(l.data_chiusura),
    dataRilievo: toDate(l.created_at),
    flags: {
      rilievo: l.flag_rilievo || false,
      confermaOrdine: l.flag_conferma_ordine || false,
      ordineMateriali: l.flag_ordine_materiali || false,
    },
    pag: {
      modalita: l.pag_modalita || 'Acconto',
      numAcconti: l.pag_num_acconti || 1,
      accontiRicevuti: l.pag_acconti_ricevuti || 0,
      saldo: l.pag_saldo || false,
      bloccoSaldo: l.pag_blocco_saldo || false,
    },
    consegne: (l.consegne || []).map(c => ({
      n: c.numero,
      descrizione: c.descrizione,
      fornitore: c.fornitore || '',
      dataOrdine: toDate(c.data_ordine) || new Date(),
      consegna: toDate(c.data_consegna) || new Date(),
      stato: c.stato || 'in_attesa',
      dataArrivo: toDate(c.data_arrivo),
    })),
    consegneCliente: (l.consegne_cliente || []).map(c => ({
      n: c.numero,
      descrizione: c.descrizione,
      data: toDate(c.data) || new Date(),
      stato: c.stato || 'in_attesa',
      insieme: c.insieme || false,
    })),
    pose: (l.pose || []).map(p => ({
      id: p.id,
      squadra: p.squadra,
      dataPosa: toDate(p.data_posa) || new Date(),
      voci: p.voci || [],
      notificata: true,
    })),
    diario: (l.diario || []).map(d => ({
      data: toDate(d.data) || new Date(),
      autore: d.autore,
      testo: d.testo,
    })),
  }));
}

export async function saveLavoro(lavoro) {
  const { data, error } = await supabase
    .from('lavori')
    .insert([{
      codice: lavoro.codice,
      cliente: lavoro.cliente,
      tel: lavoro.tel || '',
      email: lavoro.email || '',
      tipo: lavoro.tipo,
      tipologia: lavoro.tipologia,
      indirizzo: lavoro.indirizzo || '',
      materiale_posa: lavoro.materialePosa || '',
      note: lavoro.note || '',
      solo_fornitura: lavoro.soloFornitura || false,
      pag_modalita: lavoro.pag.modalita,
      pag_num_acconti: lavoro.pag.numAcconti || 1,
      pag_acconti_ricevuti: lavoro.pag.accontiRicevuti || 0,
      pag_saldo: lavoro.pag.saldo || false,
      pag_blocco_saldo: lavoro.pag.bloccoSaldo || false,
    }])
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
}

export async function updateLavoro(codice, patch) {
  const { error } = await supabase
    .from('lavori').update(patch).eq('codice', codice);
  if (error) console.error(error);
}

export async function addNota(lavoro_id, autore, testo) {
  const { error } = await supabase
    .from('diario').insert([{ lavoro_id, autore, testo }]);
  if (error) console.error(error);
}

export async function addConsegna(lavoro_id, consegna) {
  const { error } = await supabase
    .from('consegne').insert([{
      lavoro_id,
      numero: consegna.n,
      descrizione: consegna.descrizione,
      fornitore: consegna.fornitore || '',
      data_ordine: consegna.dataOrdine,
      data_consegna: consegna.consegna,
      stato: consegna.stato || 'in_attesa',
    }]);
  if (error) console.error(error);
}

export async function segnaArrivoDB(id, arrivato) {
  const { error } = await supabase
    .from('consegne').update({
      data_arrivo: arrivato ? new Date().toISOString().split('T')[0] : null,
      stato: arrivato ? 'consegnato' : 'in_attesa',
    }).eq('id', id);
  if (error) console.error(error);
}

export async function savePosa(lavoro_id, posa) {
  const { error } = await supabase
    .from('pose').insert([{
      lavoro_id,
      squadra: posa.squadra,
      data_posa: posa.dataPosa,
      voci: posa.voci || [],
    }]);
  if (error) console.error(error);
}
export async function deleteLavoro(id) {
  const { error } = await supabase.from('lavori').delete().eq('id', id);
  if (error) console.error(error);
}

export async function deleteConsegna(lavoro_id, numero) {
  const { error } = await supabase.from('consegne').delete()
    .eq('lavoro_id', lavoro_id).eq('numero', numero);
  if (error) console.error(error);
}

export async function deletePosa(id) {
  const { error } = await supabase.from('pose').delete().eq('id', id);
  if (error) console.error(error);
}

export async function deleteNota(lavoro_id, autore, testo) {
  const { error } = await supabase.from('diario').delete()
    .eq('lavoro_id', lavoro_id).eq('autore', autore).eq('testo', testo);
  if (error) console.error(error);
}

export async function deleteConsegnaCliente(lavoro_id, numero) {
  const { error } = await supabase.from('consegne_cliente').delete()
    .eq('lavoro_id', lavoro_id).eq('numero', numero);
  if (error) console.error(error);
}
