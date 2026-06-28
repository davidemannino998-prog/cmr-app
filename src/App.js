import React, { useState, useMemo, useEffect } from "react";
import { supabase } from './supabaseClient';
import { saveLavoro, getLavori, addConsegna, addNota, savePosa, updateLavoro, segnaArrivoDB, deleteLavoro, deleteConsegna, deletePosa, deleteNota, deleteConsegnaCliente } from './db';
import Login from './Login';
import ModificaModal from './ModificaModal';
import { getUtente, logout } from './auth';
import {
  Package, Calendar, AlertTriangle, CheckCircle2, Clock, Truck,
  Bell, FileText, ChevronRight, ChevronLeft, Search, Plus, Mail,
  Users, TrendingUp, MapPin, Circle, List, Contact,
  Phone, Image, FolderOpen, ArrowLeft, Edit3, Copy, Check,
  X, Layers, Link2, Hammer, Ruler, BookOpen
} from "lucide-react";

// ============ UTILITY DATE ============
const OGGI = new Date(2026, 5, 8); // lun 8 giugno 2026
const NOMI_UTENTI = {
  "davide@cmr.it": "Davide",
  "alessandro@cmr.it": "Alessandro",
  "anna@cmr.it": "Anna",
  "matteo@cmr.it": "Matteo",
};
const nomeUtente = (email) => NOMI_UTENTI[email] || email || "Sconosciuto";
function giorni(n) { const d = new Date(OGGI); d.setDate(d.getDate() + n); return d; }
const NOMI_MESI = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
const MESI_EST = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const NOMI_GIORNI = ["dom","lun","mar","mer","gio","ven","sab"];
const GIORNI_EST = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
const fmtData = (d) => `${NOMI_GIORNI[d.getDay()]} ${d.getDate()} ${NOMI_MESI[d.getMonth()]}`;
const fmtDataEstesa = (d) => `${GIORNI_EST[d.getDay()]} ${d.getDate()} ${MESI_EST[d.getMonth()]} ${d.getFullYear()}`;
const giorniDiff = (d) => Math.round((d - OGGI) / 86400000);
const toInput = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fromInput = (s) => { const [y,m,dd] = s.split("-").map(Number); return new Date(y, m-1, dd); };

// ============ COSTANTI ============
const FASI = [
  "Rilievo misure","Conferma d'ordine cliente","Ordine materiali","Fine lavori",
];
const PAGAMENTI = {
  rosso:  { label: "Nessun acconto", color: "#dc2626", bg: "#fef2f2", dot: "#dc2626" },
  giallo: { label: "Acconto ricevuto", color: "#b45309", bg: "#fffbeb", dot: "#f59e0b" },
  verde:  { label: "Saldo pagato", color: "#15803d", bg: "#f0fdf4", dot: "#22c55e" },
  grigio: { label: "Ric. bancaria", color: "#475569", bg: "#f1f5f9", dot: "#94a3b8" },
};
const TIPI = {
  "Privato":      { bg:"#fef9ec", color:"#a16207" },
  "Impresa":      { bg:"#f1f5f9", color:"#475569" },
  "Falegnameria": { bg:"#ecfdf5", color:"#047857" },
  "Altro":        { bg:"#f5f3ff", color:"#6d28d9" },
};
const SQUADRE_INIZIALI = ["Squadra 1","Squadra 2","Squadra 3","Squadra 4"];


// ============ HELPER LOGICA ============
function prossimaConsegna(l) {
  const pend = l.consegne.filter((c) => c.stato !== "consegnato");
  if (pend.length === 0) return null;
  return [...pend].sort((a,b) => a.consegna - b.consegna)[0];
}
function statoConsegna(c) {
  if (!c) return "completato";
  if (c.stato === "consegnato") return "consegnato";
  if (giorniDiff(c.consegna) < 0) return "ritardo";
  return "in_attesa";
}
function statoPagamento(l) {
  if (l.pag.modalita === "Riba") return "grigio";
  if (l.pag.accontiRicevuti === 0) return "rosso";
  if (l.pag.saldo) return "verde";
  return "giallo";
}
function tipoPagLabel(l) { return l.pag.modalita === "Riba" ? "Ricevuta bancaria" : "Acconto"; }
function semaforo(l) {
  const s = statoPagamento(l);
  const base = PAGAMENTI[s];
  if (s === "giallo" && l.pag.numAcconti > 1) {
    return { ...base, label: `${l.pag.accontiRicevuti}° di ${l.pag.numAcconti} acconti` };
  }
  return base;
}
function nFasiFatte(l) {
  const f = l.flags || {};
  return (f.rilievo?1:0) + (f.confermaOrdine?1:0) + (f.ordineMateriali?1:0) + (l.concluso?1:0);
}
function puoOrganizzare(l) { return !l.soloFornitura; }
function vociCoperte(l) { const s = new Set(); (l.pose||[]).forEach((p) => (p.voci||[]).forEach((v) => s.add(v))); return s; }
function statoPosa(l) {
  if (l.soloFornitura) return "nessuna";
  const tot = l.consegne.length;
  const cop = vociCoperte(l).size;
  if (tot === 0) return (l.pose||[]).length ? "completa" : "nessuna";
  if (cop === 0) return "nessuna";
  if (cop >= tot) return "completa";
  return "parziale";
}

// ============ APP ============
export default function App() {
  const [vista, setVista] = useState("dashboard");
  const [selCodice, setSelCodice] = useState(null);
  const [utente, setUtente] = useState(null);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    getUtente().then(u => { setUtente(u); setCaricato(true); });
  }, []);
  const [lavori, setLavori] = useState([]);
  const [caricandoDati, setCaricandoDati] = useState(true);

// Carica i dati dal database all'avvio
useEffect(() => {
setCaricandoDati(true);
  getLavori().then(data => {
    setLavori(data || []);
    setCaricandoDati(false);
  });
}, []);
  const [squadre, setSquadre] = useState(SQUADRE_INIZIALI);
  const [modal, setModal] = useState(null); // {tipo:"posa"|"squadra"|"nuovo", lavoro?}
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuUtente, setMenuUtente] = useState(false);
  const [modificaLav, setModificaLav] = useState(null);
  const [notifScartate, setNotifScartate] = useState([]);

  const ordinati = useMemo(() => [...lavori].sort((a,b) => {
    const pa = prossimaConsegna(a), pb = prossimaConsegna(b);
    if (!pa) return 1; if (!pb) return -1;
    return pa.consegna - pb.consegna;
  }), [lavori]);

  // lavori attivi (esclude i conclusi) per le viste operative
  const attivi = ordinati.filter((l) => !l.concluso);

  // liste per dashboard/report basate sulla prossima consegna
  const conProssima = attivi.map((l) => ({ l, c: prossimaConsegna(l) })).filter((x) => x.c);
  const inRitardo = conProssima.filter((x) => statoConsegna(x.c) === "ritardo");
  const settimana = conProssima.filter((x) => { const g = giorniDiff(x.c.consegna); return g >= 0 && g <= 7; });
  const prossimi  = conProssima.filter((x) => { const g = giorniDiff(x.c.consegna); return g > 7 && g <= 30; });
  const daAssegnare = attivi.filter((l) => puoOrganizzare(l) && l.consegne.length > 0 && statoPosa(l) !== "completa").length;

  const apriLavoro = (l) => { setSelCodice(l.codice); setVista("dettaglio"); };
  const lavoroSel = lavori.find((l) => l.codice === selCodice);

const concludiLavoro = async (codice) => {
    await updateLavoro(codice, { concluso: true, data_chiusura: new Date().toISOString().split('T')[0] });
    setLavori((prev) => prev.map((l) => l.codice === codice ? { ...l, concluso: true, dataChiusura: OGGI } : l));
  };
  const riapriLavoro = async (codice) => {
    await updateLavoro(codice, { concluso: false, data_chiusura: null });
    setLavori((prev) => prev.map((l) => l.codice === codice ? { ...l, concluso: false, dataChiusura: null } : l));
  };
  const duplicaLavoro = async (codiceOrig, nuovoCodice) => {
    const orig = lavori.find(l => l.codice === codiceOrig);
    if (!orig) return;
    const nuovo = {
      codice: nuovoCodice.trim().toUpperCase(),
      cliente: orig.cliente, tel: orig.tel, email: orig.email,
      tipo: orig.tipo, tipologia: orig.tipologia, indirizzo: orig.indirizzo,
      materialePosa: orig.materialePosa, note: orig.note, soloFornitura: orig.soloFornitura,
      dataRilievo: OGGI,
      flags: { rilievo:false, confermaOrdine:false, ordineMateriali:false },
      pag: orig.pag.modalita === "Riba" ? { modalita:"Riba" } : { modalita:"Acconto", numAcconti: orig.pag.numAcconti || 1, accontiRicevuti:0, saldo:false, bloccoSaldo:false },
      consegne: [], consegneCliente: [], pose: [], diario: [],
    };
   await saveLavoro(nuovo);
    const aggiornati = await getLavori();
    setLavori(aggiornati || []);
  };
  const modificaLavoro = async (codice, datiNuovi) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro && lavoro.id) {
      await updateLavoro(codice, {
        cliente: datiNuovi.cliente,
        tel: datiNuovi.tel,
        email: datiNuovi.email,
        tipo: datiNuovi.tipo,
        tipologia: datiNuovi.tipologia,
        indirizzo: datiNuovi.indirizzo,
        materiale_posa: datiNuovi.materialePosa,
        note: datiNuovi.note,
        solo_fornitura: datiNuovi.soloFornitura,
      });
    }
    setLavori((prev) => prev.map((l) => l.codice === codice ? { ...l, ...datiNuovi } : l));
  };
  const eliminaLavoro = async (codice) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro && lavoro.id) {
      await deleteLavoro(lavoro.id);
    }
    setLavori((prev) => prev.filter((l) => l.codice !== codice));
  };
  const eliminaConsegna = async (codice, n) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro && lavoro.id) {
      await deleteConsegna(lavoro.id, n);
    }
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, consegne: l.consegne.filter((c) => c.n !== n) } : l));
  };
  const eliminaConsegnaCliente = async (codice, n) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro && lavoro.id) {
      await deleteConsegnaCliente(lavoro.id, n);
    }
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, consegneCliente: (l.consegneCliente||[]).filter((c) => c.n !== n) } : l));
  };
  const eliminaPosa = async (codice, posaId) => {
    await deletePosa(posaId);
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, pose: (l.pose||[]).filter((p) => p.id !== posaId) } : l));
  };
  const eliminaNota = async (codice, nota) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro && lavoro.id) {
      await deleteNota(lavoro.id, nota.autore, nota.testo);
    }
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, diario: (l.diario||[]).filter((d) => !(d.autore === nota.autore && d.testo === nota.testo)) } : l));
  };
const toggleFlag = async (codice, key) => {
    const lavoro = lavori.find(l => l.codice === codice);
    const nuovoValore = !lavoro?.flags?.[key];
    const mapFlag = {
      rilievo: 'flag_rilievo',
      confermaOrdine: 'flag_conferma_ordine',
      ordineMateriali: 'flag_ordine_materiali',
    };
    if (mapFlag[key]) {
      await updateLavoro(codice, { [mapFlag[key]]: nuovoValore });
    }
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, flags: { ...l.flags, [key]: nuovoValore } } : l));
  };
  const segnaArrivo = async (codice, n, arrivato) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro && lavoro.id) {
      const { data } = await supabase
        .from('consegne')
        .select('id')
        .eq('lavoro_id', lavoro.id)
        .eq('numero', n)
        .single();
      if (data) await segnaArrivoDB(data.id, arrivato);
    }
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, consegne: l.consegne.map((c) => c.n === n ? { ...c, stato: arrivato ? "consegnato" : "in_attesa", dataArrivo: arrivato ? OGGI : null } : c) }
      : l));
  };
const aggiungiNota = async (codice, testo) => {
    const autore = nomeUtente(utente?.email);
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro) {
      await addNota(lavoro.id, autore, testo);
    }
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, diario: [...(l.diario||[]), { data: new Date(), autore, testo }] }
      : l));
  };

  // notifiche generate dai dati
  const notifiche = useMemo(() => {
    const out = [];
    attivi.forEach((l) => {
      l.consegne.forEach((c) => {
        if (c.stato !== "consegnato" && giorniDiff(c.consegna) < 0)
          out.push({ tipo:"ritardo", id:`ritardo-${l.codice}-${c.n}`, testo:`${l.codice} · ${c.descrizione} in ritardo di ${Math.abs(giorniDiff(c.consegna))}gg (${c.fornitore})`, l });
        if (c.stato === "consegnato" && c.dataArrivo && giorniDiff(c.dataArrivo) >= -2)
          out.push({ tipo:"arrivo", id:`arrivo-${l.codice}-${c.n}`, testo:`${l.codice} · ${c.descrizione} arrivato in magazzino`, l });
      });
(l.pose||[]).forEach((po) => {
        const g = giorniDiff(po.dataPosa);
        if (g >= 0 && g <= 3) out.push({ tipo:"posa", id:`posa-${l.codice}-${po.id}`, testo:`${l.codice} · posa ${po.squadra} ${fmtData(po.dataPosa)}`, l });
      });
      (l.diario||[]).forEach((nota) => {
        const gg = Math.round((new Date() - new Date(nota.data)) / 86400000);
        if (gg >= 0 && gg <= 3 && nota.autore !== nomeUtente(utente?.email)) out.push({ tipo:"nota", id:`nota-${l.codice}-${nota.data}-${nota.testo.slice(0,10)}`, testo:`${nota.autore} ha aggiunto una nota a ${l.codice}: "${nota.testo.length > 40 ? nota.testo.slice(0,40)+'…' : nota.testo}"`, l });
      });
    });
  return out.filter(n => !notifScartate.includes(n.id));
  }, [attivi, utente, notifScartate]);
const aggiornaPag = async (codice, patchPag) => {
    const mapPag = {
      modalita: 'pag_modalita', numAcconti: 'pag_num_acconti',
      accontiRicevuti: 'pag_acconti_ricevuti', saldo: 'pag_saldo',
      bloccoSaldo: 'pag_blocco_saldo',
    };
    const dbPatch = {};
    Object.keys(patchPag).forEach(k => { if (mapPag[k]) dbPatch[mapPag[k]] = patchPag[k]; });
    await updateLavoro(codice, dbPatch);
    setLavori((prev) => prev.map((l) => l.codice === codice ? { ...l, pag: { ...l.pag, ...patchPag } } : l));
  };
 const aggiungiPosa = async (codice, posa) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro) {
      await savePosa(lavoro.id, posa);
    }
    setLavori((prev) => prev.map((l) => {
      if (l.codice !== codice) return l;
      const nextId = (l.pose||[]).reduce((m,p) => Math.max(m, p.id), 0) + 1;
      return { ...l, pose: [...(l.pose||[]), { ...posa, id: nextId, notificata: true }] };
    }));
  };
  const aggiungiSquadra = (nome) => { setSquadre((prev) => [...prev, nome]); };
  const creaLavoro = async (nuovo) => {
  const saved = await saveLavoro(nuovo);
  if (saved) {
    setLavori((prev) => [{ ...nuovo, db_id: saved.id }, ...prev]);
  } else {
    setLavori((prev) => [nuovo, ...prev]);
  }
};
  const aggiungiConsegna = async (codice, consegna) => {
    const lavoro = lavori.find(l => l.codice === codice);
    if (lavoro) {
      await addConsegna(lavoro.id, { ...consegna, n: lavoro.consegne.length + 1 });
    }
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, consegne: [...l.consegne, { ...consegna, n: l.consegne.length + 1 }] } : l));
  };
  const aggiungiConsegnaCliente = (codice, consegna) => {
    setLavori((prev) => prev.map((l) => l.codice === codice
      ? { ...l, consegneCliente: [...(l.consegneCliente || []), { ...consegna, n: (l.consegneCliente || []).length + 1 }] } : l));
  };
const handleLogout = async () => {
    await logout();
    setUtente(null);
  };
  const NAV = [
    { id:"dashboard", label:"Dashboard", icon:TrendingUp },
    { id:"report", label:"Report settimanale", icon:FileText },
    { id:"lavori", label:"Lavori", icon:List },
    { id:"calendario", label:"Calendario", icon:Calendar },
    { id:"magazzino", label:"Magazzino", icon:Package },
    { id:"anagrafica", label:"Riferimenti", icon:Contact },
  ];
if (!caricato) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>Caricamento...</div>;
  if (!utente) return <Login onLogin={(u) => setUtente(u)} />;
  if (caricandoDati) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#f1f4f8", gap:24 }}>
      <style>{`@keyframes camminaT { 0%,100% {transform:translateX(-50px);} 50% {transform:translateX(50px);} } @keyframes dondolaT { 0%,100% {transform:rotate(-4deg);} 50% {transform:rotate(4deg);} }`}</style>
      <div style={{ animation:"camminaT 3s ease-in-out infinite" }}>
        <div style={{ fontSize:64, animation:"dondolaT 0.5s ease-in-out infinite" }}>🐢</div>
      </div>
      <div style={{ fontSize:15, color:"#5a6b82", fontWeight:600, fontFamily:"system-ui, sans-serif" }}>Caricamento lavori...</div>
    </div>
  );
  
  return (
    <div style={{ minHeight:"100vh", background:"#f1f4f8", fontFamily:"'DM Sans', system-ui, sans-serif", color:"#1a2332" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #c5cddb; border-radius: 4px; }
        .card-hover { transition: all .18s ease; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(26,35,50,.10); }
        .row-hover { transition: background .14s ease; cursor: pointer; }
        .row-hover:hover { background: #f7f9fc !important; }
        .btn { transition: all .15s ease; cursor: pointer; border: none; font-family: inherit; }
        .btn:active { transform: scale(.97); }
        @keyframes slideIn { from {opacity:0; transform:translateY(8px);} to {opacity:1; transform:translateY(0);} }
        .anim { animation: slideIn .4s ease backwards; }
        @keyframes fadeIn { from {opacity:0;} to {opacity:1;} }
        .fade { animation: fadeIn .25s ease; }
        @keyframes pop { from {opacity:0; transform:scale(.96);} to {opacity:1; transform:scale(1);} }
        @keyframes cammina { 0%,100% {transform:translateX(-60px);} 50% {transform:translateX(60px);} }
        @keyframes dondola { 0%,100% {transform:rotate(-3deg);} 50% {transform:rotate(3deg);} }
        @keyframes zampe { 0%,100% {transform:translateY(0);} 50% {transform:translateY(-2px);} }
        .turtle-walk { animation: cammina 3s ease-in-out infinite; display:inline-block; }
        .turtle-body { animation: dondola 0.6s ease-in-out infinite; display:inline-block; }
        .pop { animation: pop .2s ease; }
        textarea { font-family: inherit; }
        .grid-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
        .grid-two { display:grid; grid-template-columns:1.4fr 1fr; gap:20px; }
        .grid-detail { display:grid; grid-template-columns:1.5fr 1fr; gap:20px; }
        .grid-mag { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .nav-scroll { display:flex; gap:2px; overflow-x:auto; scrollbar-width:none; }
        .nav-scroll::-webkit-scrollbar { display:none; }
        .table-scroll { overflow-x:auto; }
        @media (max-width: 920px) {
          .nav-label { display:none; }
          .grid-stats { grid-template-columns:repeat(2,1fr); gap:12px; }
          .grid-two, .grid-detail, .grid-mag { grid-template-columns:1fr; }
          main { padding:16px !important; }
          header { padding:0 14px !important; }
          .hide-mobile { display:none !important; }
        }
        input:focus, textarea:focus, select:focus { border-color:#1e4d8c !important; }
      `}</style>

      {/* TOPBAR */}
      <header style={{ background:"#fff", borderBottom:"1px solid #e3e8f0", padding:"0 28px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#1e4d8c,#2e6fc7)", display:"grid", placeItems:"center", color:"#fff", fontWeight:700, fontSize:15, fontFamily:"'Fraunces',serif" }}>CM</div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, letterSpacing:"-0.01em" }}>C.M.R. S.r.l.</div>
            <div style={{ fontSize:11.5, color:"#7c8aa0", marginTop:-1 }}>Gestione Lavori</div>
          </div>
        </div>
        <nav className="nav-scroll">
          {NAV.map((t) => {
            const Icon = t.icon;
            const attivo = vista === t.id || (vista === "dettaglio" && t.id === "lavori");
            return (
              <button key={t.id} className="btn" onClick={() => setVista(t.id)} style={{
                display:"flex", alignItems:"center", gap:7, padding:"9px 14px", borderRadius:9,
                background: attivo ? "#eef3fb" : "transparent",
                color: attivo ? "#1e4d8c" : "#5a6b82",
                fontWeight: attivo ? 600 : 500, fontSize:13.5, whiteSpace:"nowrap", flexShrink:0,
              }}>
                <Icon size={16} /> <span className="nav-label">{t.label}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button className="btn" onClick={()=>setSearchOpen(true)} title="Ricerca globale" style={{ width:36, height:36, borderRadius:9, background:"#f1f4f8", display:"grid", placeItems:"center" }}>
            <Search size={18} color="#5a6b82" />
          </button>
          <button className="btn" onClick={()=>setNotifOpen(!notifOpen)} title="Notifiche" style={{ width:36, height:36, borderRadius:9, background: notifOpen?"#eef3fb":"#f1f4f8", display:"grid", placeItems:"center", position:"relative" }}>
            <Bell size={18} color={notifOpen?"#1e4d8c":"#5a6b82"} />
            {notifiche.length > 0 && (
              <span style={{ position:"absolute", top:-4, right:-4, minWidth:16, height:16, borderRadius:8, background:"#dc2626", color:"#fff", fontSize:10, fontWeight:700, display:"grid", placeItems:"center", padding:"0 3px" }}>{notifiche.length}</span>
            )}
          </button>
   <div style={{ position:"relative" }}>
            <button onClick={()=>setMenuUtente(!menuUtente)} title="Account" className="btn" style={{ width:34, height:34, borderRadius:"50%", background:"#1e4d8c", color:"#fff", display:"grid", placeItems:"center", fontSize:13, fontWeight:600, border:"none", cursor:"pointer" }}>{(utente?.email?.[0] || "D").toUpperCase()}</button>
            {menuUtente && (
              <>
                <div onClick={()=>setMenuUtente(false)} style={{ position:"fixed", inset:0, zIndex:90 }} />
                <div style={{ position:"absolute", top:44, right:0, background:"#fff", borderRadius:12, border:"1px solid #e8edf4", boxShadow:"0 12px 32px rgba(26,35,50,.16)", zIndex:100, minWidth:200, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:"1px solid #eef2f7" }}>
                    <div style={{ fontSize:11, color:"#9aa7ba", fontWeight:600 }}>Accesso effettuato</div>
                    <div style={{ fontSize:13, color:"#2d3a4c", fontWeight:600, marginTop:2 }}>{utente?.email}</div>
                  </div>
                  <button onClick={handleLogout} className="btn" style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"12px 16px", background:"transparent", color:"#dc2626", fontWeight:600, fontSize:13.5, border:"none", cursor:"pointer", textAlign:"left" }}>
                    <ArrowLeft size={16} /> Esci
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {notifOpen && (
        <NotifichePanel notifiche={notifiche} onClose={()=>setNotifOpen(false)}
          onScarta={(id) => setNotifScartate(prev => [...prev, id])}
          onScartaTutte={() => setNotifScartate(prev => [...prev, ...notifiche.map(n => n.id)])}
          onApri={(n) => { setNotifOpen(false); if (n.l) apriLavoro(n.l); }} />
      )}
      {searchOpen && (
        <RicercaOverlay lavori={ordinati} onClose={()=>setSearchOpen(false)}
          onApri={(l) => { setSearchOpen(false); apriLavoro(l); }} />
      )}
      <main style={{ maxWidth:1180, margin:"0 auto", padding:"28px" }} className="fade" key={vista}>
        {vista === "dashboard" && <Dashboard settimana={settimana} inRitardo={inRitardo} prossimi={prossimi} daAssegnare={daAssegnare} totale={attivi.length} vaiReport={() => setVista("report")} apriLavoro={apriLavoro} />}
        {vista === "report" && <Report settimana={settimana} inRitardo={inRitardo} prossimi={prossimi} apriLavoro={apriLavoro} onNotifica={(l)=>setModal({tipo:"posa", lavoro:l})} />}
        {vista === "lavori" && <Lavori lavori={attivi} apriLavoro={apriLavoro} onNuovo={()=>setModal({tipo:"nuovo"})} />}
        {modificaLav && <ModificaModal lavoro={modificaLav} onClose={()=>setModificaLav(null)} onSalva={modificaLavoro} />}{vista === "dettaglio" && <Dettaglio l={lavoroSel} indietro={() => setVista("lavori")} onPosa={(l)=>setModal({tipo:"posa", lavoro:l})} onAggiungiConsegna={aggiungiConsegna} onAggiungiConsegnaCliente={aggiungiConsegnaCliente} onAggiornaPag={aggiornaPag} onConcludi={concludiLavoro} onRiapri={riapriLavoro} onSegnaArrivo={segnaArrivo} onAggiungiNota={aggiungiNota} onToggleFlag={toggleFlag} onElimina={eliminaLavoro} onModifica={()=>setModificaLav(lavoroSel)} onDuplica={duplicaLavoro} esistenti={lavori.map(l=>l.codice)} onEliminaConsegna={eliminaConsegna} onEliminaPosa={eliminaPosa} onEliminaNota={eliminaNota} onEliminaConsegnaCliente={eliminaConsegnaCliente} />}
        {vista === "calendario" && <Calendario lavori={attivi} squadre={squadre} apriLavoro={apriLavoro} onPosa={(l)=>setModal({tipo:"posa", lavoro:l})} onNuovaSquadra={()=>setModal({tipo:"squadra"})} />}
        {vista === "magazzino" && <Magazzino lavori={attivi} apriLavoro={apriLavoro} onSegnaArrivo={segnaArrivo} />}
        {vista === "anagrafica" && <Anagrafica lavori={ordinati} apriLavoro={apriLavoro} onNuovo={()=>setModal({tipo:"nuovo"})} />}
      </main>

      {modal?.tipo === "posa" && (
        <PosaModal
          lavoro={lavori.find((l) => l.codice === modal.lavoro.codice) || modal.lavoro} squadre={squadre}
          onAddSquadra={aggiungiSquadra}
          onClose={() => setModal(null)}
          onConferma={(squadra, dataPosa, voci) => {
            aggiungiPosa(modal.lavoro.codice, { squadra, dataPosa, voci });
            setModal(null);
          }}
        />
      )}
      {modal?.tipo === "squadra" && (
        <SquadraModal onClose={() => setModal(null)} onConferma={(nome) => { aggiungiSquadra(nome); setModal(null); }} esistenti={squadre} />
      )}
      {modal?.tipo === "nuovo" && (
        <NuovoModal esistenti={lavori.map((l) => l.codice)} onClose={() => setModal(null)}
          onCrea={(nuovo) => { creaLavoro(nuovo); setModal(null); setSelCodice(nuovo.codice); setVista("dettaglio"); }} />
      )}
    </div>
  );
}

// ============ DASHBOARD ============
function Dashboard({ settimana, inRitardo, prossimi, daAssegnare, totale, vaiReport, apriLavoro }) {
  const stat = [
    { label:"Lavori attivi", val:totale, icon:Package, color:"#1e4d8c", bg:"#eef3fb" },
    { label:"In arrivo questa settimana", val:settimana.length, icon:Truck, color:"#0e7490", bg:"#ecfeff" },
    { label:"In ritardo", val:inRitardo.length, icon:AlertTriangle, color:"#dc2626", bg:"#fef2f2" },
    { label:"Da assegnare", val:daAssegnare, icon:Users, color:"#b45309", bg:"#fffbeb" },
  ];
  return (
    <div>
      <div style={{ marginBottom:24 }} className="anim">
        <div style={{ fontSize:13, color:"#7c8aa0", fontWeight:500, marginBottom:4 }}>Lunedì 8 giugno 2026</div>
        <h1 style={{ fontSize:27, fontWeight:600, fontFamily:"'Fraunces',serif", letterSpacing:"-0.02em" }}>Buongiorno, Davide</h1>
      </div>
      <div className="grid-stats">
        {stat.map((s,i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card-hover anim" style={{ background:"#fff", borderRadius:14, padding:"20px", border:"1px solid #e8edf4", animationDelay:`${i*0.05}s` }}>
              <div style={{ width:40, height:40, borderRadius:10, background:s.bg, display:"grid", placeItems:"center", marginBottom:14 }}><Icon size={20} color={s.color} /></div>
              <div style={{ fontSize:32, fontWeight:700, color:s.color, lineHeight:1, fontFamily:"'Fraunces',serif" }}>{s.val}</div>
              <div style={{ fontSize:13, color:"#6b7a90", marginTop:6, fontWeight:500 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
      {inRitardo.length > 0 && (
        <div className="anim" style={{ background:"linear-gradient(90deg,#fef2f2,#fff)", border:"1px solid #fecaca", borderLeft:"4px solid #dc2626", borderRadius:12, padding:"16px 20px", marginBottom:24, display:"flex", alignItems:"center", gap:14, animationDelay:"0.2s" }}>
          <AlertTriangle size={22} color="#dc2626" />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:14.5, color:"#991b1b" }}>{inRitardo.length} consegna in ritardo</div>
            <div style={{ fontSize:13, color:"#b91c1c", marginTop:2 }}>{inRitardo.map((x) => `${x.l.codice} (${x.c.fornitore})`).join(", ")} — da sollecitare al fornitore</div>
          </div>
        </div>
      )}
      <div className="grid-two">
        <div className="anim" style={{ animationDelay:"0.25s" }}>
          <SectionHead title="In arrivo questa settimana" sub={`${settimana.length} consegne`} action={<button className="btn" onClick={vaiReport} style={linkBtn}>Vai al report <ChevronRight size={15} /></button>} />
          <div style={cardWrap}>
            {settimana.length === 0 ? <Empty text="Nessuna consegna prevista questa settimana" /> : settimana.map((x,i) => <MiniRow key={x.l.codice} x={x} last={i===settimana.length-1} onClick={() => apriLavoro(x.l)} />)}
          </div>
        </div>
        <div className="anim" style={{ animationDelay:"0.3s" }}>
          <SectionHead title="Prossime settimane" sub={`${prossimi.length} consegne (8-30 gg)`} />
          <div style={cardWrap}>
            {prossimi.length === 0 ? <Empty text="Nessuna consegna nei prossimi 30 giorni" /> : prossimi.map((x,i) => <MiniRow key={x.l.codice} x={x} last={i===prossimi.length-1} compact onClick={() => apriLavoro(x.l)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniRow({ x, last, compact, onClick }) {
  const { l, c } = x;
  const p = semaforo(l);
  const g = giorniDiff(c.consegna);
  const multi = l.consegne.length > 1;
  return (
    <div className="row-hover" onClick={onClick} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderBottom: last?"none":"1px solid #f0f3f8" }}>
      <div style={{ minWidth:52, textAlign:"center", background: g<=2?"#eff6ff":"#f7f9fc", borderRadius:8, padding:"6px 4px" }}>
        <div style={{ fontSize:11, color:"#94a3b8", fontWeight:600, textTransform:"uppercase" }}>{NOMI_GIORNI[c.consegna.getDay()]}</div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1e4d8c", fontFamily:"'Fraunces',serif" }}>{c.consegna.getDate()}</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontWeight:700, fontSize:14 }}>{l.codice}</span>
          <Tag tipo={l.tipo} />
          {multi && <span title="Consegna multipla" style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:10.5, fontWeight:600, color:"#0e7490", background:"#ecfeff", padding:"1px 6px", borderRadius:5 }}><Layers size={11} /> {c.n}ª</span>}
        </div>
        {!compact && <div style={{ fontSize:12.5, color:"#7c8aa0", marginTop:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.descrizione}</div>}
      </div>
      <Semaforo p={p} />
    </div>
  );
}

// ============ REPORT ============
function Report({ settimana, inRitardo, prossimi, apriLavoro, onNotifica }) {
  return (
    <div>
      <div className="anim" style={{ marginBottom:24 }}>
        <div style={{ fontSize:13, color:"#7c8aa0", fontWeight:500, marginBottom:4, display:"flex", alignItems:"center", gap:7 }}><Calendar size={15} /> Report generato lunedì 8 giugno 2026</div>
        <h1 style={{ fontSize:27, fontWeight:600, fontFamily:"'Fraunces',serif", letterSpacing:"-0.02em" }}>Report settimanale consegne</h1>
        <p style={{ fontSize:14, color:"#6b7a90", marginTop:6, maxWidth:540 }}>Materiali in arrivo e in ritardo. Verifica e organizza la posa quando il materiale e il pagamento sono pronti.</p>
      </div>
      {inRitardo.length > 0 && (
        <ReportBlock title="In ritardo" count={inRitardo.length} color="#dc2626" icon={AlertTriangle} delay={0.1}>
          {inRitardo.map((x) => <ReportRow key={x.l.codice} x={x} onNotifica={() => onNotifica(x.l)} onClick={()=>apriLavoro(x.l)} />)}
        </ReportBlock>
      )}
      <ReportBlock title="In arrivo questa settimana" count={settimana.length} color="#0e7490" icon={Truck} delay={0.15}>
        {settimana.length === 0 ? <Empty text="Nessuna consegna questa settimana" /> : settimana.map((x) => <ReportRow key={x.l.codice} x={x} onNotifica={() => onNotifica(x.l)} onClick={()=>apriLavoro(x.l)} />)}
      </ReportBlock>
      <ReportBlock title="Prossime settimane (8-30 giorni)" count={prossimi.length} color="#1e4d8c" icon={Clock} delay={0.2}>
        {prossimi.map((x) => <ReportRow key={x.l.codice} x={x} onNotifica={() => onNotifica(x.l)} onClick={()=>apriLavoro(x.l)} />)}
      </ReportBlock>
    </div>
  );
}

function ReportBlock({ title, count, color, icon:Icon, children, delay }) {
  return (
    <div className="anim" style={{ marginBottom:22, animationDelay:`${delay}s` }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{ width:30, height:30, borderRadius:8, background:`${color}15`, display:"grid", placeItems:"center" }}><Icon size={17} color={color} /></div>
        <h2 style={{ fontSize:16.5, fontWeight:700 }}>{title}</h2>
        <span style={{ fontSize:12.5, fontWeight:700, color, background:`${color}12`, padding:"2px 10px", borderRadius:20 }}>{count}</span>
      </div>
      <div style={cardWrap}>{children}</div>
    </div>
  );
}

function ReportRow({ x, onNotifica, onClick }) {
  const { l, c } = x;
  const p = semaforo(l);
  const g = giorniDiff(c.consegna);
  const multi = l.consegne.length > 1;
  const sp = statoPosa(l);
  const squadrePosa = [...new Set((l.pose||[]).map((po) => po.squadra))];
  return (
    <div className="row-hover" onClick={onClick} style={{ padding:"16px 20px", borderBottom:"1px solid #f0f3f8", display:"grid", gridTemplateColumns:"auto 1fr auto", gap:18, alignItems:"center" }}>
      <div style={{ minWidth:64, textAlign:"center", background: g<0?"#fef2f2":g<=2?"#eff6ff":"#f7f9fc", borderRadius:10, padding:"8px 6px" }}>
        <div style={{ fontSize:10.5, color: g<0?"#dc2626":"#94a3b8", fontWeight:700, textTransform:"uppercase" }}>{g<0?`${Math.abs(g)}gg fa`:g===0?"oggi":`+${g}gg`}</div>
        <div style={{ fontSize:19, fontWeight:700, color: g<0?"#dc2626":"#1e4d8c", fontFamily:"'Fraunces',serif", lineHeight:1.1 }}>{c.consegna.getDate()}</div>
        <div style={{ fontSize:10, color:"#94a3b8", fontWeight:600 }}>{NOMI_MESI[c.consegna.getMonth()]}</div>
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap" }}>
          <span style={{ fontWeight:700, fontSize:15.5 }}>{l.codice}</span>
          <Tag tipo={l.tipo} />
          <Semaforo p={p} />
          {multi && <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, fontWeight:600, color:"#0e7490", background:"#ecfeff", padding:"3px 8px", borderRadius:6 }}><Layers size={12} /> {c.n}ª di {l.consegne.length}</span>}
          {squadrePosa.map((sq) => <span key={sq} style={{ fontSize:11.5, fontWeight:600, color:"#1e4d8c", background:"#eef3fb", padding:"3px 9px", borderRadius:6, display:"inline-flex", alignItems:"center", gap:5 }}><Users size={12} /> {sq}</span>)}
          {l.soloFornitura && <span style={{ fontSize:11, fontWeight:600, color:"#6d28d9", background:"#f5f3ff", padding:"3px 9px", borderRadius:6 }}>Solo fornitura</span>}
        </div>
        <div style={{ fontSize:13.5, color:"#3d4a5c", marginTop:6, fontWeight:500 }}>{c.descrizione}</div>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:5, fontSize:12, color:"#8493a8" }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><MapPin size={12} /> {l.indirizzo}</span>
          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Truck size={12} /> {c.fornitore}</span>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:7, alignItems:"flex-end", minWidth:150 }} onClick={(e)=>e.stopPropagation()}>
        {l.soloFornitura ? (
          <div style={{ fontSize:11.5, color:"#6d28d9", textAlign:"right", background:"#f5f3ff", padding:"8px 12px", borderRadius:8, lineHeight:1.4 }}>Nessuna posa<br />(solo fornitura)</div>
        ) : sp === "completa" ? (
          <div style={{ display:"flex", alignItems:"center", gap:6, color:"#15803d", fontSize:13, fontWeight:600, background:"#f0fdf4", padding:"8px 14px", borderRadius:8 }}><CheckCircle2 size={16} /> Posa organizzata</div>
        ) : sp === "parziale" ? (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:6, color:"#b45309", fontSize:12.5, fontWeight:600, background:"#fffbeb", padding:"6px 12px", borderRadius:8 }}><Layers size={14} /> Posa parziale ({vociCoperte(l).size}/{l.consegne.length})</div>
            <button className="btn" onClick={onNotifica} style={{ display:"flex", alignItems:"center", gap:6, background:"#1e4d8c", color:"#fff", padding:"7px 13px", borderRadius:8, fontWeight:600, fontSize:12.5 }}><Plus size={14} /> Posa restante</button>
          </>
        ) : (
          <button className="btn" onClick={onNotifica} style={{ display:"flex", alignItems:"center", gap:7, background:"#1e4d8c", color:"#fff", padding:"9px 15px", borderRadius:8, fontWeight:600, fontSize:13 }}><Bell size={15} /> Organizza posa</button>
        )}
      </div>
    </div>
  );
}

// ============ LAVORI (lista) ============
function Lavori({ lavori, apriLavoro, onNuovo }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("tutti");
  const filtrati = lavori.filter((l) => {
    const matchQ = !q || l.codice.toLowerCase().includes(q.toLowerCase()) || l.cliente.toLowerCase().includes(q.toLowerCase()) || l.materialePosa.toLowerCase().includes(q.toLowerCase());
    const c = prossimaConsegna(l);
    const st = statoConsegna(c);
    const matchF = filtro === "tutti"
      || (filtro === "ritardo" && st === "ritardo")
      || (filtro === "daassegnare" && puoOrganizzare(l) && l.consegne.length > 0 && statoPosa(l) !== "completa")
      || (filtro === l.tipo.toLowerCase());
    return matchQ && matchF;
  });
  const filtri = [
    { id:"tutti", label:"Tutti" }, { id:"privato", label:"Privati" }, { id:"impresa", label:"Imprese" },
    { id:"falegnameria", label:"Falegnamerie" }, { id:"daassegnare", label:"Da assegnare" }, { id:"ritardo", label:"In ritardo" },
  ];
  return (
    <div>
      <div className="anim" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:14 }}>
        <div>
          <h1 style={{ fontSize:27, fontWeight:600, fontFamily:"'Fraunces',serif", letterSpacing:"-0.02em" }}>Lavori</h1>
          <p style={{ fontSize:14, color:"#6b7a90", marginTop:4 }}>{filtrati.length} lavori {filtro!=="tutti" && `(filtrati)`}</p>
        </div>
        <button className="btn" onClick={onNuovo} style={{ display:"flex", alignItems:"center", gap:8, background:"#1e4d8c", color:"#fff", padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14 }}><Plus size={17} /> Nuovo lavoro</button>
      </div>
      <div className="anim" style={{ display:"flex", gap:12, marginBottom:18, flexWrap:"wrap", animationDelay:"0.05s" }}>
        <div style={{ flex:1, minWidth:220, position:"relative" }}>
          <Search size={17} color="#9aa7ba" style={{ position:"absolute", left:14, top:13 }} />
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Cerca per codice, cliente, materiale..." style={inputStyle} />
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {filtri.map((f) => (
            <button key={f.id} className="btn" onClick={()=>setFiltro(f.id)} style={{ padding:"10px 14px", borderRadius:9, fontSize:13, fontWeight:600, background: filtro===f.id?"#1e4d8c":"#fff", color: filtro===f.id?"#fff":"#5a6b82", border:"1px solid", borderColor: filtro===f.id?"#1e4d8c":"#dce3ee" }}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="anim table-scroll" style={{ ...cardWrap, animationDelay:"0.1s" }}>
        <div style={{ minWidth:760 }}>
        <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 130px 150px 130px 40px", gap:14, padding:"12px 20px", borderBottom:"1px solid #eef2f7", fontSize:11.5, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em" }}>
          <div>Codice</div><div>Materiale</div><div>Pagamento</div><div>Fase</div><div>Pross. consegna</div><div></div>
        </div>
        {filtrati.length === 0 ? <Empty text="Nessun lavoro trovato" /> : filtrati.map((l,i) => <LavoroRow key={l.codice} l={l} last={i===filtrati.length-1} onClick={()=>apriLavoro(l)} />)}
        </div>
      </div>
    </div>
  );
}

function LavoroRow({ l, last, onClick }) {
  const p = semaforo(l);
  const c = prossimaConsegna(l);
  const st = statoConsegna(c);
  return (
    <div className="row-hover" onClick={onClick} style={{ display:"grid", gridTemplateColumns:"90px 1fr 130px 150px 130px 40px", gap:14, padding:"15px 20px", borderBottom: last?"none":"1px solid #f0f3f8", alignItems:"center" }}>
      <div>
        <div style={{ fontWeight:700, fontSize:14.5 }}>{l.codice}</div>
        <div style={{ marginTop:4 }}><Tag tipo={l.tipo} /></div>
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13.5, fontWeight:500, color:"#2d3a4c", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c ? c.descrizione : l.materialePosa.split("\n")[0]}</div>
        <div style={{ fontSize:12, color:"#8493a8", marginTop:3, display:"flex", alignItems:"center", gap:4 }}><MapPin size={11} /> {l.indirizzo}{l.consegne.length>1 && <span style={{ marginLeft:6, color:"#0e7490", fontWeight:600 }}>· {l.consegne.length} consegne</span>}</div>
      </div>
      <div><Semaforo p={p} /></div>
      <div><FaseBadge l={l} /></div>
      <div>
        {l.consegne.length === 0 ? (
          <span style={{ fontSize:12.5, color:"#8493a8", fontWeight:500 }}>Nessun ordine</span>
        ) : !c ? (
          <span style={{ fontSize:12.5, color:"#15803d", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}><CheckCircle2 size={14} /> Completato</span>
        ) : st === "ritardo" ? (
          <span style={{ fontSize:12.5, color:"#dc2626", fontWeight:600 }}>{Math.abs(giorniDiff(c.consegna))}gg in ritardo</span>
        ) : (
          <span style={{ fontSize:13, color:"#3d4a5c", fontWeight:500 }}>{fmtData(c.consegna)}</span>
        )}
      </div>
      <ChevronRight size={17} color="#c5cddb" />
    </div>
  );
}

// ============ DETTAGLIO LAVORO ============
function Dettaglio({ l, indietro, onPosa, onAggiungiConsegna, onAggiungiConsegnaCliente, onAggiornaPag, onConcludi, onRiapri, onSegnaArrivo, onAggiungiNota, onToggleFlag, onElimina, onEliminaConsegna, onEliminaPosa, onEliminaNota, onEliminaConsegnaCliente, onModifica, onDuplica, esistenti }) {
  const [addOpen, setAddOpen] = useState(false);
  const [addCliOpen, setAddCliOpen] = useState(false);
  const [nuovaNota, setNuovaNota] = useState("");
  if (!l) return null;
  const p = semaforo(l);
  const cartelle = [
    { nome:"Foto", n: l.concluso?8:4, icon:Image },
    { nome:"Rilievi", n: l.flags?.rilievo?1:0, icon:Ruler },
    { nome:"Ordini Fornitori", n:l.consegne.length, icon:FileText },
    { nome:"Preventivi", n:1, icon:FileText },
    { nome:"Conferma d'ordine cliente", n: l.flags?.confermaOrdine?1:0, icon:FileText },
    { nome:"Altro", n:2, icon:FolderOpen },
  ];
  const organizzabile = puoOrganizzare(l);
  const sp = statoPosa(l);
  const concluso = !!l.concluso;
  return (
    <div>
      <button className="btn anim" onClick={indietro} style={{ display:"flex", alignItems:"center", gap:7, background:"transparent", color:"#5a6b82", fontSize:13.5, fontWeight:600, marginBottom:18, padding:"4px 0" }}><ArrowLeft size={17} /> Torna ai lavori</button>

      <div className="anim" style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:22, flexWrap:"wrap", gap:16, animationDelay:"0.05s" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6, flexWrap:"wrap" }}>
            <h1 style={{ fontSize:30, fontWeight:600, fontFamily:"'Fraunces',serif", letterSpacing:"-0.02em" }}>{l.codice}</h1>
            <Tag tipo={l.tipo} big />
            <span style={{ fontSize:12, fontWeight:600, color:"#475569", background:"#eef2f7", padding:"4px 11px", borderRadius:6, display:"inline-flex", alignItems:"center", gap:5 }}>
              {l.tipologia === "Nuovo" ? <Hammer size={13} /> : <Edit3 size={13} />} {l.tipologia}
            </span>
            {concluso ? (
              <span style={{ fontSize:12, fontWeight:600, color:"#15803d", background:"#dcfce7", padding:"4px 11px", borderRadius:6, display:"inline-flex", alignItems:"center", gap:5 }}><CheckCircle2 size={13} /> Concluso{l.dataChiusura ? ` · ${fmtData(l.dataChiusura)}` : ""}</span>
            ) : (<>
              {!l.soloFornitura && sp === "completa" && <span style={{ fontSize:12, fontWeight:600, color:"#15803d", background:"#f0fdf4", padding:"4px 11px", borderRadius:6, display:"inline-flex", alignItems:"center", gap:5 }}><CheckCircle2 size={13} /> Posa organizzata</span>}
              {!l.soloFornitura && sp === "parziale" && <span style={{ fontSize:12, fontWeight:600, color:"#b45309", background:"#fffbeb", padding:"4px 11px", borderRadius:6, display:"inline-flex", alignItems:"center", gap:5 }}><Layers size={13} /> Posa parziale ({vociCoperte(l).size}/{l.consegne.length})</span>}
              {l.soloFornitura && <span style={{ fontSize:12, fontWeight:600, color:"#6d28d9", background:"#f5f3ff", padding:"4px 11px", borderRadius:6 }}>Solo fornitura</span>}
            </>)}
          </div>
          <div style={{ fontSize:15, color:"#3d4a5c", fontWeight:500 }}>{l.cliente} <span style={{ color:"#9aa7ba", fontSize:12.5, fontWeight:400 }}>(visibile solo internamente)</span></div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          {concluso ? (
            <button className="btn" onClick={()=>onRiapri(l.codice)} style={{ display:"flex", alignItems:"center", gap:7, background:"#fff", border:"1px solid #d4ddea", color:"#5a6b82", padding:"10px 16px", borderRadius:10, fontWeight:600, fontSize:13.5 }}>Riapri lavoro</button>
          ) : (<>
            <button className="btn" onClick={onModifica} style={{ display:"flex", alignItems:"center", gap:7, background:"#fff", border:"1px solid #d4ddea", color:"#1e4d8c", padding:"10px 16px", borderRadius:10, fontWeight:600, fontSize:13.5 }}><Edit3 size={16} /> Modifica</button>
            <button className="btn" onClick={()=>{ const nc = window.prompt(`Duplica ${l.codice}\n\nInserisci il codice per il nuovo lavoro:`); if(nc && nc.trim()){ if(esistenti.includes(nc.trim().toUpperCase())){ alert("Questo codice esiste già!"); } else { onDuplica(l.codice, nc); alert(`Lavoro ${nc.trim().toUpperCase()} creato! Lo trovi nella lista lavori.`); } } }} style={{ display:"flex", alignItems:"center", gap:7, background:"#fff", border:"1px solid #d4ddea", color:"#6d28d9", padding:"10px 16px", borderRadius:10, fontWeight:600, fontSize:13.5 }}><Copy size={16} /> Duplica</button>
            {organizzabile && sp !== "completa" && (
              <button className="btn" onClick={()=>onPosa(l)} style={{ display:"flex", alignItems:"center", gap:7, background:"#1e4d8c", color:"#fff", padding:"10px 16px", borderRadius:10, fontWeight:600, fontSize:13.5 }}>
                <Bell size={16} /> {sp === "parziale" ? "Posa restante" : "Organizza posa"}
              </button>
            )}
            <button className="btn" onClick={()=>onConcludi(l.codice)} style={{ display:"flex", alignItems:"center", gap:7, background:"#15803d", color:"#fff", padding:"10px 16px", borderRadius:10, fontWeight:600, fontSize:13.5 }}><CheckCircle2 size={16} /> Lavoro concluso</button>
            <button className="btn" onClick={()=>{ if(window.confirm(`Eliminare definitivamente il lavoro ${l.codice}? L'azione non si può annullare.`)){ onElimina(l.codice); indietro(); } }} style={{ display:"flex", alignItems:"center", gap:7, background:"#fff", border:"1px solid #fbd5d5", color:"#dc2626", padding:"10px 16px", borderRadius:10, fontWeight:600, fontSize:13.5 }}><X size={16} /> Elimina</button>
          </>)}
        </div>
      </div>

      {l.pag.modalita === "Acconto" && l.pag.bloccoSaldo && (
        <div className="anim" style={{ background:"linear-gradient(90deg,#fef2f2,#fff)", border:"1px solid #fecaca", borderLeft:"4px solid #dc2626", borderRadius:12, padding:"14px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:14, animationDelay:"0.07s" }}>
          <AlertTriangle size={22} color="#dc2626" />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14.5, color:"#991b1b" }}>Saldo bloccato — problematiche di posa</div>
            <div style={{ fontSize:13, color:"#b91c1c", marginTop:2 }}>L'amministrazione è avvisata di non procedere all'incasso del saldo finché le questioni non sono risolte.</div>
          </div>
        </div>
      )}

      {/* TIMELINE FASI (flag manuali) */}
      <div className="anim" style={{ ...cardWrap, padding:"22px 24px", marginBottom:20, animationDelay:"0.1s" }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em", marginBottom:6 }}>Avanzamento lavoro</div>
        <div style={{ fontSize:12, color:"#9aa7ba", marginBottom:18 }}>Spunta ogni fase quando è eseguita e il documento è caricato nella cartella.</div>
        <div style={{ display:"flex", alignItems:"flex-start", gap:0, overflowX:"auto", paddingBottom:6 }}>
          {[
            { key:"rilievo", label:"Rilievo misure", done: !!l.flags?.rilievo, click:true },
            { key:"confermaOrdine", label:"Conferma d'ordine cliente", done: !!l.flags?.confermaOrdine, click:true },
            { key:"ordineMateriali", label:"Ordine materiali", done: !!l.flags?.ordineMateriali, click:true },
            { key:"fine", label:"Fine lavori", done: concluso, click:false },
          ].map((f, i, arr) => (
            <div key={f.key}
              onClick={f.click && !concluso ? ()=>onToggleFlag(l.codice, f.key) : undefined}
              title={f.click ? (f.done ? "Clicca per annullare" : "Clicca quando eseguito e caricato in cartella") : "Si attiva con 'Lavoro concluso'"}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:90, flex:1, position:"relative", cursor: f.click && !concluso ? "pointer" : "default" }}>
              {i < arr.length-1 && <div style={{ position:"absolute", top:13, left:"50%", width:"100%", height:2, background: f.done?"#1e4d8c":"#e3e8f0" }} />}
              <div style={{ width:28, height:28, borderRadius:"50%", background: f.done?"#1e4d8c":"#fff", border: f.done?"none":"2px solid #c5cddb", display:"grid", placeItems:"center", zIndex:1, position:"relative", transition:"all .15s ease" }}>
                {f.done ? <Check size={15} color="#fff" /> : <Circle size={8} fill="#c5cddb" color="#c5cddb" />}
              </div>
              <div style={{ fontSize:10.5, textAlign:"center", marginTop:8, color: f.done?"#1e4d8c":"#aab4c4", fontWeight: f.done?700:500, lineHeight:1.25, padding:"0 4px" }}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-detail">
        <div className="anim" style={{ animationDelay:"0.15s" }}>
          {/* DETTAGLI */}
          <div style={{ ...cardWrap, padding:"22px 24px", marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em", marginBottom:16 }}>Dettagli</div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11.5, color:"#9aa7ba", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.03em", marginBottom:4 }}>Indirizzo cantiere</div>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.indirizzo)}`} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:7, fontSize:14, color:"#1e4d8c", fontWeight:600, textDecoration:"none" }}>
                <MapPin size={15} /> {l.indirizzo || "—"}
                <span style={{ fontSize:11.5, color:"#0e7490", background:"#ecfeff", padding:"2px 8px", borderRadius:5, fontWeight:600 }}>Apri in Maps</span>
              </a>
            </div>
            <InfoRiga label="Telefono" icon={Phone} value={l.tel} />
            {l.email && <InfoRiga label="Email" icon={Mail} value={l.email} />}
            <InfoRiga label="Tipo pagamento" icon={CheckCircle2} value={tipoPagLabel(l)} />
            <InfoRiga label="Data rilievo" icon={Calendar} value={fmtData(l.dataRilievo)} />
            <InfoRiga label="Materiale da posare" icon={Package} value={l.materialePosa} />
            {l.note && (
              <div style={{ marginTop:14, padding:"12px 14px", background:"#f7f9fc", borderRadius:10, borderLeft:"3px solid #c2d6ef" }}>
                <div style={{ fontSize:11.5, color:"#9aa7ba", fontWeight:600, marginBottom:4 }}>NOTE</div>
                <div style={{ fontSize:13.5, color:"#3d4a5c", lineHeight:1.5 }}>{l.note}</div>
              </div>
            )}
          </div>

          {/* CONSEGNE FORNITORE (multiple, ordinate) */}
          <div style={{ ...cardWrap, padding:"22px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em" }}>Consegne fornitore ({l.consegne.length})</div>
              {!concluso && <button className="btn" onClick={()=>setAddOpen(!addOpen)} style={{ display:"flex", alignItems:"center", gap:6, background:"#eef3fb", color:"#1e4d8c", padding:"7px 13px", borderRadius:8, fontWeight:600, fontSize:12.5 }}>
                {addOpen ? <><X size={14} /> Annulla</> : <><Plus size={14} /> Aggiungi consegna</>}
              </button>}
            </div>
            <div style={{ fontSize:12, color:"#9aa7ba", marginTop:-8, marginBottom:14 }}>Materiale dal fornitore a noi.</div>

            {addOpen && <FormConsegna onSalva={(c)=>{ onAggiungiConsegna(l.codice, c); setAddOpen(false); }} />}

            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[...l.consegne].sort((a,b)=>a.n-b.n).map((c) => {
                const st = statoConsegna(c);
                const stStyle = st==="consegnato" ? {c:"#15803d",b:"#f0fdf4",t:"Arrivato"} : st==="ritardo" ? {c:"#dc2626",b:"#fef2f2",t:"In ritardo"} : {c:"#b45309",b:"#fffbeb",t:"In attesa"};
                const arrivato = c.stato === "consegnato";
                return (
                  <div key={c.n} style={{ border:"1px solid #eef2f7", borderRadius:10, padding:"13px 15px", position:"relative", borderLeft:`3px solid ${stStyle.c}` }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11.5, fontWeight:700, color:"#1e4d8c", background:"#eef3fb", width:24, height:24, borderRadius:"50%", display:"grid", placeItems:"center" }}>{c.n}</span>
                        <span style={{ fontWeight:600, fontSize:14 }}>{c.descrizione}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:stStyle.c, background:stStyle.b, padding:"3px 9px", borderRadius:6 }}>{stStyle.t}</span>
                        {!concluso && <button onClick={()=>{ if(window.confirm(`Eliminare la consegna "${c.descrizione}"?`)) onEliminaConsegna(l.codice, c.n); }} title="Elimina consegna fornitore" style={{ width:24, height:24, borderRadius:6, background:"transparent", border:"none", cursor:"pointer", display:"grid", placeItems:"center", color:"#c5cddb" }}><X size={14} /></button>}
                      </div>
                      </div>
                    <div style={{ display:"flex", gap:16, fontSize:12, color:"#8493a8", marginLeft:32, marginBottom: concluso?0:8 }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Truck size={12} /> {c.fornitore}</span>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Calendar size={12} /> prevista {fmtData(c.consegna)}</span>
                      {arrivato && c.dataArrivo && <span style={{ display:"inline-flex", alignItems:"center", gap:4, color:"#15803d", fontWeight:600 }}><CheckCircle2 size={12} /> arrivata {fmtData(c.dataArrivo)}</span>}
                    </div>
                    {!concluso && (
                      <div style={{ marginLeft:32 }}>
                        <button className="btn" onClick={()=>onSegnaArrivo(l.codice, c.n, !arrivato)} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:7, fontWeight:600, fontSize:12, background: arrivato?"#f0fdf4":"#1e4d8c", color: arrivato?"#15803d":"#fff", border: arrivato?"1px solid #bbf7d0":"none" }}>
                          {arrivato ? <><X size={13} /> Annulla arrivo</> : <><CheckCircle2 size={13} /> Segna arrivato in magazzino</>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* DIARIO */}
          <div style={{ ...cardWrap, padding:"22px 24px", marginTop:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <BookOpen size={16} color="#9aa7ba" />
              <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em" }}>Diario ({(l.diario||[]).length})</div>
            </div>
            <div style={{ fontSize:12, color:"#9aa7ba", marginBottom:14 }}>Note cronologiche condivise: chi ha fatto cosa, quando.</div>
            {!concluso && (
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input value={nuovaNota} onChange={(e)=>setNuovaNota(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter" && nuovaNota.trim()){ onAggiungiNota(l.codice, nuovaNota.trim()); setNuovaNota(""); } }} placeholder="Aggiungi una nota… (es. sollecitato fornitore)" style={{ ...inputSm, flex:1 }} />
                <button className="btn" disabled={!nuovaNota.trim()} onClick={()=>{ onAggiungiNota(l.codice, nuovaNota.trim()); setNuovaNota(""); }} style={{ background: nuovaNota.trim()?"#1e4d8c":"#c5cddb", color:"#fff", padding:"0 16px", borderRadius:8, fontWeight:600, fontSize:13, cursor: nuovaNota.trim()?"pointer":"not-allowed" }}>Salva</button>
              </div>
            )}
            {(l.diario||[]).length === 0 ? (
              <div style={{ fontSize:13, color:"#8493a8", background:"#f7f9fc", padding:"12px 14px", borderRadius:10 }}>Nessuna nota nel diario.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[...(l.diario||[])].reverse().map((nota, i) => (
                  <div key={i} style={{ display:"flex", gap:11, padding:"11px 13px", background:"#f7f9fc", borderRadius:9 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:"#1e4d8c", color:"#fff", display:"grid", placeItems:"center", fontSize:11.5, fontWeight:700, flexShrink:0 }}>{nota.autore[0]}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                        <span style={{ fontSize:12.5, fontWeight:700, color:"#2d3a4c" }}>{nota.autore}</span>
                        <span style={{ fontSize:11, color:"#9aa7ba" }}>{fmtData(nota.data)}</span>
                      </div>
                      <div style={{ fontSize:13, color:"#3d4a5c", lineHeight:1.5 }}>{nota.testo}</div>
                    </div>
                    {!concluso && <button onClick={()=>{ if(window.confirm("Eliminare questa nota?")) onEliminaNota(l.codice, nota); }} title="Elimina nota" style={{ flexShrink:0, width:24, height:24, borderRadius:6, background:"transparent", border:"none", cursor:"pointer", display:"grid", placeItems:"center", color:"#c5cddb" }}><X size={14} /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="anim" style={{ animationDelay:"0.2s" }}>
          {/* STATO PAGAMENTO */}
          <div style={{ ...cardWrap, padding:"22px 24px", marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em", marginBottom:14 }}>Stato pagamento</div>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:p.bg, borderRadius:10, marginBottom: l.pag.modalita==="Acconto"?16:0 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:p.dot, display:"grid", placeItems:"center" }}><Circle size={14} fill="#fff" color="#fff" /></div>
              <div>
                <div style={{ fontWeight:700, fontSize:15, color:p.color }}>{p.label}</div>
                <div style={{ fontSize:12, color:p.color, opacity:0.85, marginTop:1 }}>{l.pag.modalita==="Riba"?"Pagamento con ricevuta bancaria":statoPagamento(l)==="verde"?"Saldato — pronto per la posa":statoPagamento(l)==="giallo"?`${l.pag.accontiRicevuti}/${l.pag.numAcconti} acconti · attesa saldo`:"In attesa del primo acconto"}</div>
              </div>
            </div>

            {l.pag.modalita === "Acconto" ? (
              <>
                <div style={{ fontSize:11.5, color:"#9aa7ba", fontWeight:600, marginBottom:8 }}>{l.pag.numAcconti} acconti previsti + saldo</div>
                {Array.from({ length:l.pag.numAcconti }).map((_,i) => {
                  const ric = i < l.pag.accontiRicevuti;
                  return <PagStep key={i} label={`${i+1}° acconto`} done={ric} disabled={concluso} onClick={()=>onAggiornaPag(l.codice, ric ? { accontiRicevuti:i, saldo:false } : { accontiRicevuti:i+1 })} />;
                })}
                <PagStep label="Saldo" done={l.pag.saldo}
                  disabled={concluso || l.pag.accontiRicevuti < l.pag.numAcconti || l.pag.bloccoSaldo}
                  onClick={()=> onAggiornaPag(l.codice, { saldo: !l.pag.saldo })} />

                {l.pag.bloccoSaldo && (
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 14px", marginTop:10 }}>
                    <AlertTriangle size={18} color="#dc2626" style={{ flexShrink:0, marginTop:1 }} />
                    <div style={{ fontSize:12.5, color:"#991b1b", lineHeight:1.5 }}><strong>Saldo bloccato.</strong> Problematiche di posa in corso: non procedere all'incasso del saldo finché non sono risolte.</div>
                  </div>
                )}
                {!concluso && (
                  <button className="btn" onClick={()=>onAggiornaPag(l.codice, { bloccoSaldo: !l.pag.bloccoSaldo })} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"9px", borderRadius:9, fontWeight:600, fontSize:12.5, marginTop:10, background: l.pag.bloccoSaldo?"#fff":"#fef6f6", border:"1px solid", borderColor: l.pag.bloccoSaldo?"#d4ddea":"#fbd5d5", color: l.pag.bloccoSaldo?"#5a6b82":"#dc2626" }}>
                    <AlertTriangle size={14} /> {l.pag.bloccoSaldo ? "Rimuovi blocco saldo" : "Segnala problema posa (blocca saldo)"}
                  </button>
                )}
              </>
            ) : (
              <div style={{ fontSize:13, color:"#5a6b82", background:"#f7f9fc", padding:"12px 14px", borderRadius:10, lineHeight:1.5 }}>Pagamento con ricevuta bancaria (Ri.Ba) — nessun acconto da tracciare.</div>
            )}
          </div>

          {/* CONSEGNE AL CLIENTE (lista, più spedizioni) */}
          <div style={{ ...cardWrap, padding:"22px 24px", marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em" }}>Consegne al cliente ({(l.consegneCliente||[]).length})</div>
              {!concluso && <button className="btn" onClick={()=>setAddCliOpen(!addCliOpen)} style={{ display:"flex", alignItems:"center", gap:6, background:"#ecfeff", color:"#0e7490", padding:"7px 13px", borderRadius:8, fontWeight:600, fontSize:12.5 }}>
                {addCliOpen ? <><X size={14} /> Annulla</> : <><Plus size={14} /> Aggiungi</>}
              </button>}
            </div>
            <div style={{ fontSize:12, color:"#9aa7ba", marginBottom:14 }}>Spedizioni dal nostro magazzino al cliente. Possono essere più di una.</div>

            {addCliOpen && <FormConsegnaCliente consegne={l.consegne} onSalva={(c)=>{ onAggiungiConsegnaCliente(l.codice, c); setAddCliOpen(false); }} />}

            {(l.consegneCliente||[]).length === 0 ? (
              <div style={{ fontSize:13, color:"#8493a8", background:"#f7f9fc", padding:"12px 14px", borderRadius:10 }}>Nessuna consegna al cliente pianificata.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[...l.consegneCliente].sort((a,b)=>a.n-b.n).map((c) => {
                  const cons = c.stato === "consegnato";
                  const stStyle = cons ? {c:"#15803d",b:"#f0fdf4",t:"Consegnata"} : {c:"#0e7490",b:"#ecfeff",t:"Da spedire"};
                  return (
                    <div key={c.n} style={{ border:"1px solid #eef2f7", borderRadius:10, padding:"13px 15px", borderLeft:`3px solid ${stStyle.c}` }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:11.5, fontWeight:700, color:"#0e7490", background:"#ecfeff", width:24, height:24, borderRadius:"50%", display:"grid", placeItems:"center" }}>{c.n}</span>
                          <span style={{ fontWeight:600, fontSize:14 }}>{c.descrizione}</span>
                          {c.insieme && <span title="Parte insieme dal magazzino, stessa spedizione" style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:10.5, fontWeight:600, color:"#7c3aed", background:"#f5f3ff", padding:"2px 7px", borderRadius:5 }}><Link2 size={11} /> stessa spedizione</span>}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:stStyle.c, background:stStyle.b, padding:"3px 9px", borderRadius:6 }}>{stStyle.t}</span>
                        {!concluso && <button onClick={()=>{ if(window.confirm(`Eliminare la consegna "${c.descrizione}"?`)) onEliminaConsegnaCliente(l.codice, c.n); }} title="Elimina consegna" style={{ width:24, height:24, borderRadius:6, background:"transparent", border:"none", cursor:"pointer", display:"grid", placeItems:"center", color:"#c5cddb" }}><X size={14} /></button>}
                      </div>
                      </div>
                      <div style={{ fontSize:12, color:"#8493a8", marginLeft:32, display:"inline-flex", alignItems:"center", gap:4 }}><Calendar size={12} /> consegna al cliente {fmtData(c.data)}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize:11.5, color:"#9aa7ba", marginTop:12 }}>Spesso anticipata rispetto alla posa.</div>
          </div>

          {!l.soloFornitura && (
            <div style={{ ...cardWrap, padding:"22px 24px", marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em" }}>Pose ({(l.pose||[]).length})</div>
                {!concluso && sp !== "completa" && (
                  <button className="btn" onClick={()=>onPosa(l)} style={{ display:"flex", alignItems:"center", gap:6, background:"#eef3fb", color:"#1e4d8c", padding:"7px 13px", borderRadius:8, fontWeight:600, fontSize:12.5 }}><Plus size={14} /> {(l.pose||[]).length ? "Altra posa" : "Organizza"}</button>
                )}
              </div>
              {(l.pose||[]).length === 0 ? (
                concluso
                  ? <div style={{ fontSize:13, color:"#8493a8", background:"#f7f9fc", padding:"12px 14px", borderRadius:10 }}>Nessuna posa registrata.</div>
                  : <button className="btn" onClick={()=>onPosa(l)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px", background:"#fff", border:"1.5px dashed #c2d6ef", color:"#1e4d8c", borderRadius:10, fontWeight:600, fontSize:14 }}><Plus size={16} /> Organizza posa</button>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {(l.pose||[]).map((po) => {
                    const voci = (po.voci||[]).map((n) => l.consegne.find((c)=>c.n===n)?.descrizione).filter(Boolean);
                    return (
                      <div key={po.id} style={{ border:"1px solid #e3edfa", background:"#f7faff", borderRadius:10, padding:"12px 14px" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                          <span style={{ fontWeight:700, fontSize:14, color:"#1e4d8c", display:"flex", alignItems:"center", gap:7 }}><Users size={15} /> {po.squadra}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:12, color:"#5a6b82", fontWeight:600, display:"flex", alignItems:"center", gap:5 }}><Calendar size={13} /> {fmtData(po.dataPosa)}</span>
                            {!concluso && <button onClick={()=>{ if(window.confirm(`Eliminare la posa di ${po.squadra}?`)) onEliminaPosa(l.codice, po.id); }} title="Elimina posa" style={{ width:24, height:24, borderRadius:6, background:"transparent", border:"none", cursor:"pointer", display:"grid", placeItems:"center", color:"#c5cddb" }}><X size={14} /></button>}
                          </div>
                        </div>
                        <div style={{ fontSize:12.5, color:"#3d4a5c", lineHeight:1.5 }}>
                          <span style={{ color:"#9aa7ba", fontWeight:600 }}>Posa: </span>{voci.length ? voci.join(" · ") : "—"}
                        </div>
                      </div>
                    );
                  })}
                  {sp === "parziale" && (
                    <div style={{ fontSize:12, color:"#b45309", background:"#fffbeb", padding:"10px 12px", borderRadius:9, lineHeight:1.45 }}>Materiale ancora da pianificare: {l.consegne.filter((c)=>!vociCoperte(l).has(c.n)).map((c)=>c.descrizione).join(", ")}</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ ...cardWrap, padding:"22px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em" }}>Documenti</div>
              <span style={{ fontSize:12, color:"#1e4d8c", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}><FolderOpen size={14} /> Google Drive</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {cartelle.map((cart) => {
                const Icon = cart.icon;
                return (
                  <div key={cart.nome} className="row-hover" style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 12px", borderRadius:9, background:"#f7f9fc" }}>
                    <Icon size={17} color="#7c8aa0" />
                    <span style={{ flex:1, fontSize:13.5, fontWeight:500, color:"#3d4a5c" }}>{cart.nome}</span>
                    <span style={{ fontSize:12, color: cart.n>0?"#5a6b82":"#c5cddb", fontWeight:600, background: cart.n>0?"#e8edf4":"transparent", padding:"2px 8px", borderRadius:12 }}>{cart.n}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize:11.5, color:"#9aa7ba", marginTop:12, fontStyle:"italic" }}>Cartelle ancora da finalizzare insieme.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormConsegna({ onSalva }) {
  const [desc, setDesc] = useState("");
  const [forn, setForn] = useState("");
  const [data, setData] = useState(toInput(giorni(7)));
  const valido = desc.trim() && forn.trim();
  return (
    <div className="pop" style={{ background:"#f7f9fc", border:"1px solid #e3e8f0", borderRadius:10, padding:"16px", marginBottom:14 }}>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <input value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Descrizione materiale (es. Falsi telai in legno)" style={inputSm} />
        <div style={{ display:"flex", gap:10 }}>
          <input value={forn} onChange={(e)=>setForn(e.target.value)} placeholder="Fornitore" style={{ ...inputSm, flex:1 }} />
          <input type="date" value={data} onChange={(e)=>setData(e.target.value)} style={{ ...inputSm, flex:1 }} />
        </div>
        <button className="btn" disabled={!valido} onClick={()=>onSalva({ descrizione:desc, fornitore:forn, consegna:fromInput(data), dataOrdine:OGGI, stato:"in_attesa" })} style={{ background: valido?"#1e4d8c":"#c5cddb", color:"#fff", padding:"10px", borderRadius:8, fontWeight:600, fontSize:13.5, cursor: valido?"pointer":"not-allowed" }}>Salva consegna</button>
      </div>
    </div>
  );
}

function FormConsegnaCliente({ consegne, onSalva }) {
  const [voci, setVoci] = useState([]);
  const [extra, setExtra] = useState("");
  const [data, setData] = useState(toInput(giorni(5)));
  const [insieme, setInsieme] = useState(false);
  const toggleVoce = (n) => setVoci((v) => v.includes(n) ? v.filter((x)=>x!==n) : [...v, n]);
  const selDescr = (consegne||[]).filter((c) => voci.includes(c.n)).map((c) => c.descrizione);
  const descrizione = [...selDescr, extra.trim()].filter(Boolean).join(" + ");
  const valido = descrizione.length > 0;
  return (
    <div className="pop" style={{ background:"#f0fbfd", border:"1px solid #cdeef3", borderRadius:10, padding:"16px", marginBottom:14 }}>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div>
          <label style={{ fontSize:11.5, color:"#0e7490", fontWeight:600, display:"block", marginBottom:6 }}>Materiale ordinato da spedire</label>
          {(consegne||[]).length === 0 ? (
            <div style={{ fontSize:12.5, color:"#8493a8", background:"#fff", padding:"10px 12px", borderRadius:8 }}>Nessun materiale in consegne fornitore.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {[...consegne].sort((a,b)=>a.n-b.n).map((c) => {
                const sel = voci.includes(c.n);
                return (
                  <label key={c.n} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 11px", borderRadius:8, cursor:"pointer", background: sel?"#dbf3f8":"#fff", border:"1px solid", borderColor: sel?"#9fdfe9":"#e3eef0" }}>
                    <input type="checkbox" checked={sel} onChange={()=>toggleVoce(c.n)} style={{ width:16, height:16, accentColor:"#0e7490", flexShrink:0 }} />
                    <span style={{ fontSize:13, fontWeight:500, color:"#2d3a4c" }}>{c.descrizione}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <label style={{ fontSize:11.5, color:"#0e7490", fontWeight:600, display:"block", marginBottom:5 }}>Materiale di magazzino (facoltativo)</label>
          <input value={extra} onChange={(e)=>setExtra(e.target.value)} placeholder="Es. guarnizioni, accessori, coprifili…" style={{ ...inputSm, width:"100%" }} />
        </div>
        <div>
          <label style={{ fontSize:11.5, color:"#0e7490", fontWeight:600, display:"block", marginBottom:5 }}>Data consegna al cliente</label>
          <input type="date" value={data} onChange={(e)=>setData(e.target.value)} style={{ ...inputSm, width:"100%" }} />
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#5a6b82", cursor:"pointer" }}>
          <input type="checkbox" checked={insieme} onChange={(e)=>setInsieme(e.target.checked)} style={{ width:16, height:16, accentColor:"#0e7490" }} />
          Deve partire insieme dal magazzino (stessa spedizione)
        </label>
        <button className="btn" disabled={!valido} onClick={()=>onSalva({ descrizione, data:fromInput(data), stato:"in_attesa", insieme })} style={{ background: valido?"#0e7490":"#c5cddb", color:"#fff", padding:"10px", borderRadius:8, fontWeight:600, fontSize:13.5, cursor: valido?"pointer":"not-allowed" }}>Salva consegna al cliente</button>
      </div>
    </div>
  );
}

function InfoRiga({ label, icon:Icon, value }) {
  return (
    <div style={{ display:"flex", gap:12, padding:"9px 0", borderBottom:"1px solid #f3f6fa" }}>
      <Icon size={16} color="#9aa7ba" style={{ marginTop:2, flexShrink:0 }} />
      <div>
        <div style={{ fontSize:11.5, color:"#9aa7ba", fontWeight:600 }}>{label}</div>
        <div style={{ fontSize:14, color:"#2d3a4c", marginTop:2, fontWeight:500, whiteSpace:"pre-line" }}>{value}</div>
      </div>
    </div>
  );
}

// ============ CALENDARIO ============
function Calendario({ lavori, squadre, apriLavoro, onPosa, onNuovaSquadra }) {
  const [vistaCal, setVistaCal] = useState("pose");
  const [offsetSett, setOffsetSett] = useState(0);
  const oggiReale = new Date();
  const lunedi = new Date(oggiReale);
  const giornoSett = (oggiReale.getDay() + 6) % 7;
  lunedi.setDate(oggiReale.getDate() - giornoSett + offsetSett * 7);
  lunedi.setHours(0,0,0,0);
  const settimanaGiorni = [0,1,2,3,4,5].map((i) => {
    const d = new Date(lunedi); d.setDate(lunedi.getDate() + i); return d;
  });
  const fineSett = settimanaGiorni[5];
  const labelSett = `${lunedi.getDate()} ${NOMI_MESI[lunedi.getMonth()]} - ${fineSett.getDate()} ${NOMI_MESI[fineSett.getMonth()]} ${fineSett.getFullYear()}`;
  const tuttePose = lavori.flatMap((l) => (l.pose||[]).map((po) => ({ l, po })));
  const tutteConsegneCli = lavori.flatMap((l) => (l.consegneCliente||[]).map((cc) => ({ l, cc })));
  const daPianificare = lavori.filter((l) => puoOrganizzare(l) && prossimaConsegna(l) && statoPosa(l) !== "completa");
  return (
    <div>
      <div className="anim" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:14 }}>
        <div>
          <h1 style={{ fontSize:27, fontWeight:600, fontFamily:"'Fraunces',serif", letterSpacing:"-0.02em" }}>Calendario</h1>
          <p style={{ fontSize:14, color:"#6b7a90", marginTop:4 }}>{labelSett}</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {vistaCal === "pose" && <button className="btn" onClick={onNuovaSquadra} style={{ display:"flex", alignItems:"center", gap:7, background:"#fff", border:"1px solid #d4ddea", color:"#1e4d8c", padding:"10px 15px", borderRadius:10, fontWeight:600, fontSize:13.5 }}><Plus size={16} /> Nuova squadra</button>}
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <button className="btn" onClick={()=>setOffsetSett(offsetSett-1)} style={navArrow}><ChevronLeft size={18} color="#5a6b82" /></button>
            <button className="btn" onClick={()=>setOffsetSett(0)} style={{ ...navArrow, width:"auto", padding:"0 12px", fontSize:12.5, fontWeight:600, color:"#1e4d8c" }}>Oggi</button>
            <button className="btn" onClick={()=>setOffsetSett(offsetSett+1)} style={navArrow}><ChevronRight size={18} color="#5a6b82" /></button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="anim" style={{ display:"flex", gap:8, marginBottom:18, animationDelay:"0.04s" }}>
        <button className="btn" onClick={()=>setVistaCal("pose")} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:10, fontWeight:600, fontSize:14, background: vistaCal==="pose"?"#1e4d8c":"#fff", color: vistaCal==="pose"?"#fff":"#5a6b82", border:"1px solid", borderColor: vistaCal==="pose"?"#1e4d8c":"#dce3ee" }}><Users size={16} /> Pose</button>
        <button className="btn" onClick={()=>setVistaCal("consegne")} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:10, fontWeight:600, fontSize:14, background: vistaCal==="consegne"?"#0e7490":"#fff", color: vistaCal==="consegne"?"#fff":"#5a6b82", border:"1px solid", borderColor: vistaCal==="consegne"?"#0e7490":"#dce3ee" }}><Truck size={16} /> Consegne al cliente</button>
      </div>

      {vistaCal === "pose" ? (
        <>
          <div className="anim" style={{ ...cardWrap, padding:0, overflow:"auto", animationDelay:"0.08s" }}>
            <div style={{ display:"grid", gridTemplateColumns:"120px repeat(6, 1fr)", minWidth:820 }}>
              <div style={{ padding:"14px 16px", borderBottom:"1px solid #eef2f7", borderRight:"1px solid #eef2f7", fontSize:12, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase" }}>Squadra</div>
              {settimanaGiorni.map((d,i) => {
                const oggi = giorniDiff(d) === 0;
                return (
                  <div key={i} style={{ padding:"12px 14px", borderBottom:"1px solid #eef2f7", borderRight: i<5?"1px solid #eef2f7":"none", textAlign:"center", background: oggi?"#eff6ff":"transparent" }}>
                    <div style={{ fontSize:11.5, color: oggi?"#1e4d8c":"#9aa7ba", fontWeight:600, textTransform:"uppercase" }}>{NOMI_GIORNI[d.getDay()]}</div>
                    <div style={{ fontSize:18, fontWeight:700, color: oggi?"#1e4d8c":"#3d4a5c", fontFamily:"'Fraunces',serif" }}>{d.getDate()}</div>
                  </div>
                );
              })}
              {squadre.map((sq, si) => (
                <React.Fragment key={sq}>
                  <div style={{ padding:"16px", borderBottom: si<squadre.length-1?"1px solid #eef2f7":"none", borderRight:"1px solid #eef2f7", display:"flex", alignItems:"center", gap:8, background:"#fbfcfe" }}>
                    <div style={{ width:30, height:30, borderRadius:8, background:"#eef3fb", display:"grid", placeItems:"center" }}><Users size={15} color="#1e4d8c" /></div>
                    <span style={{ fontSize:13.5, fontWeight:600, color:"#3d4a5c" }}>{sq}</span>
                  </div>
                  {settimanaGiorni.map((d,di) => {
                    const entry = tuttePose.find((e) => e.po.squadra === sq && e.po.dataPosa.toDateString() === d.toDateString());
                    const voci = entry ? (entry.po.voci||[]).map((n) => entry.l.consegne.find((c)=>c.n===n)?.descrizione).filter(Boolean) : [];
                    return (
                      <div key={di} onClick={entry?()=>apriLavoro(entry.l):undefined} className={entry?"row-hover":""} style={{ padding:8, borderBottom: si<squadre.length-1?"1px solid #eef2f7":"none", borderRight: di<5?"1px solid #eef2f7":"none", minHeight:72, cursor: entry?"pointer":"default" }}>
                        {entry && (
                          <div style={{ background:"linear-gradient(135deg,#eef3fb,#e3edfa)", border:"1px solid #c2d6ef", borderRadius:8, padding:"8px 10px", height:"100%" }}>
                            <div style={{ fontWeight:700, fontSize:13, color:"#1e4d8c" }}>{entry.l.codice}</div>
                            <div style={{ fontSize:10.5, color:"#5a6b82", marginTop:2, lineHeight:1.3, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{voci.join(", ") || entry.l.indirizzo}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="anim" style={{ marginTop:18, animationDelay:"0.15s" }}>
            <SectionHead title="Da pianificare" sub="Lavori pronti con materiale ancora da posare" />
            <div style={cardWrap}>
              {daPianificare.length === 0 ? <Empty text="Tutto pianificato" /> : daPianificare.map((l,i,arr) => (
                <div key={l.codice} className="row-hover" onClick={()=>apriLavoro(l)} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderBottom: i<arr.length-1?"1px solid #f0f3f8":"none" }}>
                  <span style={{ fontWeight:700, fontSize:14 }}>{l.codice}</span>
                  <Tag tipo={l.tipo} />
                  <span style={{ flex:1, fontSize:13, color:"#5a6b82" }}>{l.materialePosa.split("\n").join(", ")} · {l.indirizzo}</span>
                  <button className="btn" onClick={(e)=>{e.stopPropagation(); onPosa(l);}} style={{ display:"flex", alignItems:"center", gap:6, background:"#1e4d8c", color:"#fff", padding:"7px 13px", borderRadius:8, fontWeight:600, fontSize:12.5 }}><Plus size={14} /> Assegna</button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <CalendarioConsegne settimanaGiorni={settimanaGiorni} consegne={tutteConsegneCli} apriLavoro={apriLavoro} />
      )}
    </div>
  );
}

// ============ CALENDARIO CONSEGNE AL CLIENTE ============
function CalendarioConsegne({ settimanaGiorni, consegne, apriLavoro }) {
  const futurePerData = [...consegne]
    .filter((e) => giorniDiff(e.cc.data) > 5)
    .sort((a,b) => a.cc.data - b.cc.data);
  return (
    <>
      <div className="anim" style={{ ...cardWrap, padding:0, overflow:"auto", animationDelay:"0.08s" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", minWidth:760 }}>
          {settimanaGiorni.map((d,i) => {
            const oggi = giorniDiff(d) === 0;
            return (
              <div key={i} style={{ padding:"12px 10px", borderBottom:"1px solid #eef2f7", borderRight: i<5?"1px solid #eef2f7":"none", textAlign:"center", background: oggi?"#ecfeff":"#fbfdfe" }}>
                <div style={{ fontSize:11.5, color: oggi?"#0e7490":"#9aa7ba", fontWeight:600, textTransform:"uppercase" }}>{NOMI_GIORNI[d.getDay()]}</div>
                <div style={{ fontSize:18, fontWeight:700, color: oggi?"#0e7490":"#3d4a5c", fontFamily:"'Fraunces',serif" }}>{d.getDate()}</div>
              </div>
            );
          })}
          {settimanaGiorni.map((d,di) => {
            const items = consegne.filter((e) => e.cc.data.toDateString() === d.toDateString());
            return (
              <div key={di} style={{ padding:8, borderRight: di<5?"1px solid #eef2f7":"none", minHeight:160, display:"flex", flexDirection:"column", gap:8, background: giorniDiff(d)===0?"#f7feff":"transparent" }}>
                {items.map((e,k) => (
                  <div key={k} onClick={()=>apriLavoro(e.l)} className="row-hover" style={{ background:"linear-gradient(135deg,#ecfeff,#dbf3f8)", border:"1px solid #9fdfe9", borderRadius:8, padding:"8px 10px", cursor:"pointer" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontWeight:700, fontSize:12.5, color:"#0e7490" }}>{e.l.codice}</span>
                      {e.cc.insieme && <Link2 size={11} color="#7c3aed" />}
                    </div>
                    <div style={{ fontSize:10.5, color:"#5a6b82", marginTop:2, lineHeight:1.3 }}>{e.cc.descrizione}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="anim" style={{ marginTop:18, animationDelay:"0.15s" }}>
        <SectionHead title="Prossime consegne" sub="Spedizioni al cliente oltre questa settimana" />
        <div style={cardWrap}>
          {futurePerData.length === 0 ? <Empty text="Nessuna consegna programmata oltre la settimana" /> : futurePerData.map((e,i,arr) => (
            <div key={i} className="row-hover" onClick={()=>apriLavoro(e.l)} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderBottom: i<arr.length-1?"1px solid #f0f3f8":"none" }}>
              <div style={{ minWidth:58, textAlign:"center", background:"#ecfeff", borderRadius:8, padding:"5px 4px" }}>
                <div style={{ fontSize:10.5, color:"#0e7490", fontWeight:700, textTransform:"uppercase" }}>{NOMI_GIORNI[e.cc.data.getDay()]}</div>
                <div style={{ fontSize:15, fontWeight:700, color:"#0e7490", fontFamily:"'Fraunces',serif" }}>{e.cc.data.getDate()}</div>
                <div style={{ fontSize:9.5, color:"#0e7490", fontWeight:600 }}>{NOMI_MESI[e.cc.data.getMonth()]}</div>
              </div>
              <span style={{ fontWeight:700, fontSize:14 }}>{e.l.codice}</span>
              <Tag tipo={e.l.tipo} />
              <span style={{ flex:1, fontSize:13, color:"#5a6b82" }}>{e.cc.descrizione} · {e.l.indirizzo}</span>
              {e.cc.insieme && <span style={{ fontSize:10.5, fontWeight:600, color:"#7c3aed", background:"#f5f3ff", padding:"2px 8px", borderRadius:5, display:"inline-flex", alignItems:"center", gap:3 }}><Link2 size={11} /> stessa spedizione</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============ RICERCA GLOBALE ============
function RicercaOverlay({ lavori, onClose, onApri }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const match = (s) => s && s.toLowerCase().includes(ql);
  const risLavori = !ql ? [] : lavori.filter((l) =>
    match(l.codice) || match(l.cliente) || match(l.indirizzo) || match(l.materialePosa) ||
    l.consegne.some((c) => match(c.descrizione) || match(c.fornitore))
  ).slice(0, 8);
  return (
    <div onClick={onClose} className="fade" style={{ position:"fixed", inset:0, background:"rgba(20,28,42,.45)", zIndex:120, padding:"10vh 16px 16px", display:"flex", justifyContent:"center", alignItems:"flex-start", backdropFilter:"blur(2px)" }}>
      <div onClick={(e)=>e.stopPropagation()} className="pop" style={{ background:"#fff", borderRadius:16, width:"min(640px, 100%)", maxHeight:"75vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ padding:"16px 18px", borderBottom:"1px solid #eef2f7", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, background:"#fff" }}>
          <Search size={19} color="#9aa7ba" />
          <input autoFocus value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Cerca codici, clienti, materiali, fornitori, indirizzi…" style={{ flex:1, border:"none", outline:"none", fontSize:15.5, fontFamily:"inherit", background:"transparent" }} />
          <button className="btn" onClick={onClose} style={{ width:30, height:30, borderRadius:8, background:"#f1f4f8", display:"grid", placeItems:"center" }}><X size={16} color="#5a6b82" /></button>
        </div>
        {!ql ? (
          <div style={{ padding:"28px 20px", textAlign:"center", color:"#9aa7ba", fontSize:13.5 }}>Digita per cercare in tutta l'app.</div>
        ) : risLavori.length === 0 ? (
          <div style={{ padding:"28px 20px", textAlign:"center", color:"#9aa7ba", fontSize:13.5 }}>Nessun risultato per "{q}".</div>
        ) : (
          <div style={{ padding:"10px 0" }}>
            {risLavori.length > 0 && <div style={{ padding:"8px 18px 4px", fontSize:11, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.04em" }}>Lavori</div>}
            {risLavori.map((l) => (
              <div key={l.codice} className="row-hover" onClick={()=>onApri(l)} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 18px" }}>
                <span style={{ fontWeight:700, fontSize:14, color:"#1e4d8c", minWidth:48 }}>{l.codice}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:600, color:"#2d3a4c" }}>{l.cliente} {l.concluso && <span style={{ fontSize:10.5, color:"#15803d", background:"#dcfce7", padding:"1px 7px", borderRadius:5, marginLeft:6 }}>Concluso</span>}</div>
                  <div style={{ fontSize:12, color:"#8493a8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{l.indirizzo} · {l.materialePosa.split("\n")[0]}</div>
                </div>
                <ChevronRight size={16} color="#c5cddb" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ NOTIFICHE ============
function NotifichePanel({ notifiche, onClose, onApri, onScarta, onScartaTutte }) {
  const stile = {
    ritardo: { icon:AlertTriangle, color:"#dc2626", bg:"#fef2f2" },
    arrivo:  { icon:Package, color:"#15803d", bg:"#f0fdf4" },
    posa:    { icon:Users, color:"#1e4d8c", bg:"#eef3fb" },
    nota:    { icon:BookOpen, color:"#7c3aed", bg:"#f5f3ff" },
  };
  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:90 }} />
      <div className="pop" style={{ position:"fixed", top:70, right:16, width:"min(380px, calc(100vw - 32px))", maxHeight:"70vh", overflow:"auto", background:"#fff", borderRadius:14, border:"1px solid #e8edf4", boxShadow:"0 16px 48px rgba(26,35,50,.18)", zIndex:100 }}>
       <div style={{ padding:"12px 18px", borderBottom:"1px solid #eef2f7", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"#fff", zIndex:1 }}>
          <span style={{ fontWeight:700, fontSize:14.5 }}>Notifiche ({notifiche.length})</span>
          {notifiche.length > 0 && <button onClick={onScartaTutte} className="btn" style={{ fontSize:12, fontWeight:600, color:"#5a6b82", background:"#f1f4f8", padding:"5px 10px", borderRadius:7, border:"none", cursor:"pointer" }}>Cancella tutte</button>}
        </div>
        {notifiche.length === 0 ? (
          <div style={{ padding:"26px 18px", textAlign:"center", color:"#9aa7ba", fontSize:13 }}>Nessuna notifica.</div>
        ) : notifiche.map((n, i) => {
          const st = stile[n.tipo] || stile.posa;
          const Icon = st.icon;
          return (
            <div key={i} className="row-hover" style={{ display:"flex", gap:11, padding:"12px 16px", borderBottom: i<notifiche.length-1?"1px solid #f0f3f8":"none", alignItems:"flex-start" }}>
              <div onClick={()=>onApri(n)} style={{ width:30, height:30, borderRadius:8, background:st.bg, display:"grid", placeItems:"center", flexShrink:0, cursor:"pointer" }}><Icon size={15} color={st.color} /></div>
              <div onClick={()=>onApri(n)} style={{ flex:1, fontSize:13, color:"#2d3a4c", lineHeight:1.45, paddingTop:4, cursor:"pointer" }}>{n.testo}</div>
              <button onClick={(e)=>{ e.stopPropagation(); onScarta(n.id); }} title="Elimina notifica" style={{ flexShrink:0, width:24, height:24, borderRadius:6, background:"transparent", border:"none", cursor:"pointer", display:"grid", placeItems:"center", color:"#9aa7ba" }}><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============ MAGAZZINO ============
function Magazzino({ lavori, apriLavoro, onSegnaArrivo }) {
  // tutte le consegne fornitore di tutti i lavori attivi
  const tutte = lavori.flatMap((l) => l.consegne.map((c) => ({ l, c })));
  const inArrivo = tutte.filter((e) => e.c.stato !== "consegnato");
  const inMagazzino = tutte.filter((e) => e.c.stato === "consegnato");

  const perFornitore = (lista) => {
    const m = {};
    lista.forEach((e) => { (m[e.c.fornitore] = m[e.c.fornitore] || []).push(e); });
    return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0]));
  };

  return (
    <div>
      <div className="anim" style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:27, fontWeight:600, fontFamily:"'Fraunces',serif", letterSpacing:"-0.02em" }}>Magazzino</h1>
        <p style={{ fontSize:14, color:"#6b7a90", marginTop:4, maxWidth:600 }}>Vista d'insieme degli ordini ai fornitori. Conferma l'arrivo effettivo del materiale: è la verifica reale prima di organizzare consegne e pose.</p>
      </div>

      <div className="grid-mag">
        {/* IN ARRIVO */}
        <div className="anim" style={{ animationDelay:"0.06s" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:"#fff7ed", display:"grid", placeItems:"center" }}><Truck size={17} color="#b45309" /></div>
            <h2 style={{ fontSize:16.5, fontWeight:700 }}>Da ricevere</h2>
            <span style={{ fontSize:12.5, fontWeight:700, color:"#b45309", background:"#fffbeb", padding:"2px 10px", borderRadius:20 }}>{inArrivo.length}</span>
          </div>
          <div style={{ fontSize:12.5, color:"#8493a8", marginBottom:12 }}>Materiale ordinato non ancora arrivato da noi.</div>
          {inArrivo.length === 0 ? (
            <div style={cardWrap}><Empty text="Nessun ordine in arrivo" /></div>
          ) : perFornitore(inArrivo).map(([forn, items]) => (
            <div key={forn} style={{ ...cardWrap, marginBottom:14 }}>
              <div style={{ padding:"11px 16px", borderBottom:"1px solid #eef2f7", background:"#fbfcfe", display:"flex", alignItems:"center", gap:8 }}>
                <Truck size={14} color="#8493a8" />
                <span style={{ fontSize:13, fontWeight:700, color:"#3d4a5c" }}>{forn}</span>
                <span style={{ fontSize:11.5, color:"#9aa7ba", fontWeight:600 }}>· {items.length}</span>
              </div>
              {items.sort((a,b)=>a.c.consegna-b.c.consegna).map((e,i) => {
                const st = statoConsegna(e.c);
                const ritardo = st === "ritardo";
                return (
                  <div key={i} style={{ padding:"13px 16px", borderBottom: i<items.length-1?"1px solid #f0f3f8":"none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap", marginBottom:6 }}>
                      <span className="row-hover" onClick={()=>apriLavoro(e.l)} style={{ fontWeight:700, fontSize:13.5, color:"#1e4d8c", cursor:"pointer" }}>{e.l.codice}</span>
                      <span style={{ fontSize:13.5, color:"#2d3a4c", fontWeight:500 }}>{e.c.descrizione}</span>
                      <span style={{ fontSize:11, fontWeight:600, color: ritardo?"#dc2626":"#b45309", background: ritardo?"#fef2f2":"#fffbeb", padding:"2px 8px", borderRadius:5, display:"inline-flex", alignItems:"center", gap:4 }}>
                        <Calendar size={11} /> prevista {fmtData(e.c.consegna)}{ritardo ? " · in ritardo" : ""}
                      </span>
                    </div>
                    <button className="btn" onClick={()=>onSegnaArrivo(e.l.codice, e.c.n, true)} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, fontWeight:600, fontSize:12.5, background:"#15803d", color:"#fff" }}>
                      <CheckCircle2 size={14} /> Conferma arrivo in magazzino
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* IN MAGAZZINO */}
        <div className="anim" style={{ animationDelay:"0.12s" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:"#f0fdf4", display:"grid", placeItems:"center" }}><Package size={17} color="#15803d" /></div>
            <h2 style={{ fontSize:16.5, fontWeight:700 }}>In magazzino</h2>
            <span style={{ fontSize:12.5, fontWeight:700, color:"#15803d", background:"#f0fdf4", padding:"2px 10px", borderRadius:20 }}>{inMagazzino.length}</span>
          </div>
          <div style={{ fontSize:12.5, color:"#8493a8", marginBottom:12 }}>Materiale arrivato e verificato: pronto per consegna e posa.</div>
          {inMagazzino.length === 0 ? (
            <div style={cardWrap}><Empty text="Nessun materiale in magazzino" /></div>
          ) : perFornitore(inMagazzino).map(([forn, items]) => (
            <div key={forn} style={{ ...cardWrap, marginBottom:14 }}>
              <div style={{ padding:"11px 16px", borderBottom:"1px solid #eef2f7", background:"#fbfcfe", display:"flex", alignItems:"center", gap:8 }}>
                <Truck size={14} color="#8493a8" />
                <span style={{ fontSize:13, fontWeight:700, color:"#3d4a5c" }}>{forn}</span>
                <span style={{ fontSize:11.5, color:"#9aa7ba", fontWeight:600 }}>· {items.length}</span>
              </div>
              {items.map((e,i) => (
                <div key={i} style={{ padding:"13px 16px", borderBottom: i<items.length-1?"1px solid #f0f3f8":"none", display:"flex", alignItems:"center", gap:10 }}>
                  <CheckCircle2 size={16} color="#15803d" style={{ flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9, flexWrap:"wrap" }}>
                      <span className="row-hover" onClick={()=>apriLavoro(e.l)} style={{ fontWeight:700, fontSize:13.5, color:"#1e4d8c", cursor:"pointer" }}>{e.l.codice}</span>
                      <span style={{ fontSize:13.5, color:"#2d3a4c", fontWeight:500 }}>{e.c.descrizione}</span>
                    </div>
                    {e.c.dataArrivo && <div style={{ fontSize:11.5, color:"#15803d", marginTop:3 }}>Arrivato il {fmtData(e.c.dataArrivo)}</div>}
                  </div>
                  <button className="btn" onClick={()=>onSegnaArrivo(e.l.codice, e.c.n, false)} title="Annulla arrivo" style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"6px 10px", borderRadius:7, fontWeight:600, fontSize:11.5, background:"#f1f4f8", color:"#8493a8" }}>
                    <X size={13} /> Annulla
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ ANAGRAFICA ============
function Anagrafica({ lavori, apriLavoro, onNuovo }) {
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("tutti");
  const filtrati = lavori.filter((l) => {
    const mq = !q || l.codice.toLowerCase().includes(q.toLowerCase()) || l.cliente.toLowerCase().includes(q.toLowerCase());
    const ms = stato === "tutti" || (stato === "attivi" && !l.concluso) || (stato === "conclusi" && l.concluso);
    return mq && ms;
  });
  const nConclusi = lavori.filter((l) => l.concluso).length;
  return (
    <div>
      <div className="anim" style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:14 }}>
        <div>
          <h1 style={{ fontSize:27, fontWeight:600, fontFamily:"'Fraunces',serif", letterSpacing:"-0.02em" }}>Anagrafica Riferimenti</h1>
          <p style={{ fontSize:14, color:"#6b7a90", marginTop:4, maxWidth:560 }}>Associazione nome cliente → codice. Anno corrente: lettera <strong>E</strong>. Il codice si inserisce manualmente.</p>
        </div>
        <button className="btn" onClick={onNuovo} style={{ display:"flex", alignItems:"center", gap:8, background:"#1e4d8c", color:"#fff", padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14 }}><Plus size={17} /> Nuovo riferimento</button>
      </div>

      <div className="anim" style={{ display:"flex", gap:12, marginBottom:18, flexWrap:"wrap", alignItems:"center", animationDelay:"0.05s" }}>
        <div style={{ position:"relative", flex:1, minWidth:240, maxWidth:380 }}>
          <Search size={17} color="#9aa7ba" style={{ position:"absolute", left:14, top:13 }} />
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Cerca codice o nome..." style={inputStyle} />
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[{id:"tutti",label:"Tutti"},{id:"attivi",label:"Attivi"},{id:"conclusi",label:`Conclusi (${nConclusi})`}].map((f) => (
            <button key={f.id} className="btn" onClick={()=>setStato(f.id)} style={{ padding:"10px 14px", borderRadius:9, fontSize:13, fontWeight:600, background: stato===f.id?"#1e4d8c":"#fff", color: stato===f.id?"#fff":"#5a6b82", border:"1px solid", borderColor: stato===f.id?"#1e4d8c":"#dce3ee" }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="anim table-scroll" style={{ ...cardWrap, animationDelay:"0.1s" }}>
        <div style={{ minWidth:760 }}>
        <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 130px 140px 130px 40px", gap:14, padding:"12px 20px", borderBottom:"1px solid #eef2f7", fontSize:11.5, fontWeight:700, color:"#9aa7ba", textTransform:"uppercase", letterSpacing:"0.03em" }}>
          <div>Codice</div><div>Nome cliente</div><div>Tipo</div><div>Pagamento</div><div>Stato</div><div></div>
        </div>
        {filtrati.length === 0 ? <Empty text="Nessun riferimento" /> : filtrati.map((l,i) => (
          <div key={l.codice} className="row-hover" onClick={()=>apriLavoro(l)} style={{ display:"grid", gridTemplateColumns:"90px 1fr 130px 140px 130px 40px", gap:14, padding:"15px 20px", borderBottom: i<filtrati.length-1?"1px solid #f0f3f8":"none", alignItems:"center" }}>
            <div style={{ fontWeight:700, fontSize:14.5, color:"#1e4d8c" }}>{l.codice}</div>
            <div style={{ fontSize:14, fontWeight:500, color:"#2d3a4c" }}>{l.cliente}</div>
            <div><Tag tipo={l.tipo} /></div>
            <div style={{ fontSize:12.5, color:"#5a6b82", fontWeight:500 }}>{tipoPagLabel(l)}</div>
            <div>
              {l.concluso
                ? <span style={{ fontSize:11.5, fontWeight:600, color:"#15803d", background:"#dcfce7", padding:"3px 9px", borderRadius:6, display:"inline-flex", alignItems:"center", gap:4 }}><CheckCircle2 size={12} /> Concluso</span>
                : <span style={{ fontSize:11.5, fontWeight:600, color:"#1e4d8c", background:"#eef3fb", padding:"3px 9px", borderRadius:6 }}>Attivo</span>}
            </div>
            <ChevronRight size={17} color="#c5cddb" />
          </div>
        ))}
        </div>
      </div>
      <div style={{ marginTop:14, padding:"14px 18px", background:"#eff6ff", borderRadius:10, fontSize:13, color:"#1e4d8c", display:"flex", alignItems:"flex-start", gap:10 }}>
        <Contact size={18} style={{ flexShrink:0, marginTop:1 }} />
        <span>I lavori conclusi restano qui come archivio: apri un riferimento per rivedere foto, ordini al fornitore e tutti i dati del cliente. In comunicazioni esterne appare solo il codice.</span>
      </div>
    </div>
  );
}

// ============ MODALE: ORGANIZZA POSA + MESSAGGIO ============
function PosaModal({ lavoro, squadre, onAddSquadra, onConferma, onClose }) {
  const coperte = vociCoperte(lavoro);
  const nonCoperte = lavoro.consegne.filter((c) => !coperte.has(c.n)).map((c) => c.n);
  const [squadra, setSquadra] = useState("");
  const [dataPosa, setDataPosa] = useState(toInput(giorni(7)));
  const [voci, setVoci] = useState(nonCoperte); // di default le voci non ancora pianificate
  const [nuovaOpen, setNuovaOpen] = useState(false);
  const [nuovaNome, setNuovaNome] = useState("");
  const [copiato, setCopiato] = useState(false);

  const toggleVoce = (n) => setVoci((v) => v.includes(n) ? v.filter((x)=>x!==n) : [...v, n]);
  const dataObj = fromInput(dataPosa);
  const materialeSel = lavoro.consegne.filter((c) => voci.includes(c.n)).map((c) => c.descrizione).join("\n");
  const messaggio = `Ciao ${squadra || "[nome posatore]"}, di seguito il dettaglio della posa richiesta:\n\nData: ${fmtDataEstesa(dataObj)}\nCliente: ${lavoro.cliente}\nIndirizzo: ${lavoro.indirizzo}\nNumero telefono: ${lavoro.tel}\nTipologia: ${lavoro.tipologia}\nMateriale da posare:\n${materialeSel || lavoro.materialePosa}`;

  const copia = () => {
    try { navigator.clipboard.writeText(messaggio); } catch(e) {}
    setCopiato(true); setTimeout(()=>setCopiato(false), 2000);
  };
  const confermaNuova = () => { if (nuovaNome.trim()) { onAddSquadra(nuovaNome.trim()); setSquadra(nuovaNome.trim()); setNuovaNome(""); setNuovaOpen(false); } };
  const valido = squadra && voci.length > 0;

  return (
    <Overlay onClose={onClose}>
      <div className="pop" style={{ background:"#fff", borderRadius:16, width:"min(560px, 94vw)", maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid #eef2f7", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"#fff", zIndex:2 }}>
          <div>
            <h2 style={{ fontSize:19, fontWeight:600, fontFamily:"'Fraunces',serif" }}>Organizza posa — {lavoro.codice}</h2>
            <div style={{ fontSize:13, color:"#8493a8", marginTop:2 }}>{lavoro.cliente}</div>
          </div>
          <button className="btn" onClick={onClose} style={{ width:34, height:34, borderRadius:9, background:"#f1f4f8", display:"grid", placeItems:"center" }}><X size={18} color="#5a6b82" /></button>
        </div>

        <div style={{ padding:"22px 24px" }}>
          {lavoro.pag.modalita === "Acconto" && !lavoro.pag.saldo && (
            <div style={{ display:"flex", gap:10, alignItems:"flex-start", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"12px 14px", marginBottom:18 }}>
              <AlertTriangle size={18} color="#b45309" style={{ flexShrink:0, marginTop:1 }} />
              <div style={{ fontSize:12.5, color:"#92400e", lineHeight:1.5 }}><strong>Saldo non ancora ricevuto</strong> ({lavoro.pag.accontiRicevuti}/{lavoro.pag.numAcconti} acconti). Puoi comunque organizzare la posa: questo è solo un promemoria.</div>
            </div>
          )}
          {/* scelta squadra */}
          <label style={labelStyle}>Squadra</label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
            {squadre.map((sq) => (
              <button key={sq} className="btn" onClick={()=>setSquadra(sq)} style={{ padding:"9px 14px", borderRadius:9, fontSize:13.5, fontWeight:600, background: squadra===sq?"#1e4d8c":"#fff", color: squadra===sq?"#fff":"#5a6b82", border:"1px solid", borderColor: squadra===sq?"#1e4d8c":"#dce3ee", display:"flex", alignItems:"center", gap:6 }}>
                <Users size={14} /> {sq}
              </button>
            ))}
            {!nuovaOpen ? (
              <button className="btn" onClick={()=>setNuovaOpen(true)} style={{ padding:"9px 14px", borderRadius:9, fontSize:13.5, fontWeight:600, background:"#f7f9fc", color:"#1e4d8c", border:"1.5px dashed #c2d6ef", display:"flex", alignItems:"center", gap:6 }}><Plus size={14} /> Nuova</button>
            ) : (
              <div style={{ display:"flex", gap:6 }}>
                <input autoFocus value={nuovaNome} onChange={(e)=>setNuovaNome(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&confermaNuova()} placeholder="Nome squadra" style={{ ...inputSm, width:140 }} />
                <button className="btn" onClick={confermaNuova} style={{ background:"#1e4d8c", color:"#fff", padding:"0 12px", borderRadius:8, fontWeight:600, fontSize:13 }}><Check size={16} /></button>
              </div>
            )}
          </div>

          {/* data posa */}
          <label style={{ ...labelStyle, marginTop:16 }}>Data posa</label>
          <input type="date" value={dataPosa} onChange={(e)=>setDataPosa(e.target.value)} style={{ ...inputStyleNoIcon, maxWidth:220 }} />

          {/* selezione materiale da posare */}
          <label style={{ ...labelStyle, marginTop:18 }}>Materiale da posare in questo intervento</label>
          {lavoro.consegne.length === 0 ? (
            <div style={{ fontSize:13, color:"#b45309", background:"#fffbeb", padding:"12px 14px", borderRadius:10 }}>Nessuna consegna fornitore inserita. Aggiungi prima il materiale ordinato nella scheda del lavoro.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[...lavoro.consegne].sort((a,b)=>a.n-b.n).map((c) => {
                const sel = voci.includes(c.n);
                const giaPosato = coperte.has(c.n);
                return (
                  <label key={c.n} style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 13px", borderRadius:9, cursor:"pointer", background: sel?"#eef3fb":"#f7f9fc", border:"1px solid", borderColor: sel?"#c2d6ef":"#eef2f7" }}>
                    <input type="checkbox" checked={sel} onChange={()=>toggleVoce(c.n)} style={{ width:17, height:17, accentColor:"#1e4d8c", flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13.5, fontWeight:600, color:"#2d3a4c" }}>{c.descrizione}</div>
                      <div style={{ fontSize:11.5, color:"#8493a8", marginTop:1 }}>{c.fornitore} · consegna {fmtData(c.consegna)}</div>
                    </div>
                    {giaPosato && <span style={{ fontSize:10.5, fontWeight:600, color:"#15803d", background:"#f0fdf4", padding:"2px 8px", borderRadius:5 }}>già pianificato</span>}
                  </label>
                );
              })}
            </div>
          )}

          {/* messaggio generato */}
          <div style={{ marginTop:20, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <label style={{ ...labelStyle, margin:0 }}>Messaggio per il posatore</label>
            <button className="btn" onClick={copia} style={{ display:"flex", alignItems:"center", gap:6, background: copiato?"#f0fdf4":"#eef3fb", color: copiato?"#15803d":"#1e4d8c", padding:"7px 13px", borderRadius:8, fontWeight:600, fontSize:12.5 }}>
              {copiato ? <><Check size={14} /> Copiato!</> : <><Copy size={14} /> Copia</>}
            </button>
          </div>
          <textarea readOnly value={messaggio} rows={9} style={{ width:"100%", padding:"14px", border:"1px solid #dce3ee", borderRadius:10, fontSize:13.5, lineHeight:1.6, color:"#2d3a4c", background:"#f7f9fc", resize:"vertical", outline:"none" }} />
          <div style={{ fontSize:11.5, color:"#9aa7ba", marginTop:8, lineHeight:1.5 }}>Il "Materiale da posare" nel messaggio segue le voci selezionate qui sopra. Copialo e incollalo su WhatsApp, e aggiungi il tuo saluto finale. Il nome del posatore verrà personalizzato quando definirai i nomi reali delle squadre.</div>
        </div>

        <div style={{ padding:"16px 24px", borderTop:"1px solid #eef2f7", display:"flex", gap:10, justifyContent:"flex-end", position:"sticky", bottom:0, background:"#fff" }}>
          <button className="btn" onClick={onClose} style={{ padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14, background:"#f1f4f8", color:"#5a6b82" }}>Annulla</button>
          <button className="btn" disabled={!valido} onClick={()=>onConferma(squadra, fromInput(dataPosa), voci)} style={{ padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14, background: valido?"#1e4d8c":"#c5cddb", color:"#fff", cursor: valido?"pointer":"not-allowed", display:"flex", alignItems:"center", gap:7 }}><CheckCircle2 size={17} /> Conferma posa</button>
        </div>
      </div>
    </Overlay>
  );
}

// ============ MODALE: NUOVA SQUADRA ============
function SquadraModal({ onClose, onConferma, esistenti }) {
  const [nome, setNome] = useState("");
  const valido = nome.trim() && !esistenti.includes(nome.trim());
  return (
    <Overlay onClose={onClose}>
      <div className="pop" style={{ background:"#fff", borderRadius:16, width:"min(420px, 94vw)", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid #eef2f7", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h2 style={{ fontSize:19, fontWeight:600, fontFamily:"'Fraunces',serif" }}>Nuova squadra</h2>
          <button className="btn" onClick={onClose} style={{ width:34, height:34, borderRadius:9, background:"#f1f4f8", display:"grid", placeItems:"center" }}><X size={18} color="#5a6b82" /></button>
        </div>
        <div style={{ padding:"22px 24px" }}>
          <label style={labelStyle}>Nome squadra</label>
          <input autoFocus value={nome} onChange={(e)=>setNome(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&valido&&onConferma(nome.trim())} placeholder="Es. Squadra 5 o nome posatore" style={inputStyleNoIcon} />
          {nome.trim() && esistenti.includes(nome.trim()) && <div style={{ fontSize:12.5, color:"#dc2626", marginTop:8 }}>Esiste già una squadra con questo nome.</div>}
          <div style={{ fontSize:12, color:"#9aa7ba", marginTop:10, lineHeight:1.5 }}>I nomi reali delle squadre si potranno definire qui man mano. Per ora puoi usare i nomi che preferisci.</div>
        </div>
        <div style={{ padding:"16px 24px", borderTop:"1px solid #eef2f7", display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button className="btn" onClick={onClose} style={{ padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14, background:"#f1f4f8", color:"#5a6b82" }}>Annulla</button>
          <button className="btn" disabled={!valido} onClick={()=>onConferma(nome.trim())} style={{ padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14, background: valido?"#1e4d8c":"#c5cddb", color:"#fff", cursor: valido?"pointer":"not-allowed", display:"flex", alignItems:"center", gap:7 }}><Plus size={17} /> Crea squadra</button>
        </div>
      </div>
    </Overlay>
  );
}

// ============ MODALE: NUOVO RIFERIMENTO ============
function NuovoModal({ onClose, onCrea, esistenti }) {
  const [codice, setCodice] = useState("");
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState("Privato");
  const [modalita, setModalita] = useState("Acconto");
  const [numAcconti, setNumAcconti] = useState(1);
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [tipologia, setTipologia] = useState("Sostituzione");
  const [soloFornitura, setSoloFornitura] = useState(false);
  const [materialePosa, setMaterialePosa] = useState("");
  const [note, setNote] = useState("");

  const codiceDuplicato = codice.trim() && esistenti.includes(codice.trim().toUpperCase());
  const valido = codice.trim() && cliente.trim() && !codiceDuplicato;

  const crea = () => {
    if (!valido) return;
    const pag = modalita === "Riba"
      ? { modalita: "Riba" }
      : { modalita: "Acconto", numAcconti: Number(numAcconti) || 1, accontiRicevuti: 0, saldo: false, bloccoSaldo: false };
    onCrea({
      codice: codice.trim().toUpperCase(),
      cliente: cliente.trim(),
      tel: tel.trim(),
      email: email.trim(),
      tipo,
      tipologia,
      soloFornitura,
      indirizzo: indirizzo.trim(),
      materialePosa: materialePosa.trim() || "—",
      note: note.trim(),
      dataRilievo: OGGI,
      squadra: null, dataPosa: null,
      flags: { rilievo:false, confermaOrdine:false, ordineMateriali:false },
      pag,
      consegne: [],
      consegneCliente: [],
    });
  };

  const tipiCliente = ["Privato","Impresa","Falegnameria","Altro"];

  return (
    <Overlay onClose={onClose}>
      <div className="pop" style={{ background:"#fff", borderRadius:16, width:"min(620px, 95vw)", maxHeight:"92vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid #eef2f7", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"#fff", zIndex:2 }}>
          <div>
            <h2 style={{ fontSize:19, fontWeight:600, fontFamily:"'Fraunces',serif" }}>Nuovo riferimento</h2>
            <div style={{ fontSize:13, color:"#8493a8", marginTop:2 }}>Inserisci i dati del nuovo lavoro</div>
          </div>
          <button className="btn" onClick={onClose} style={{ width:34, height:34, borderRadius:9, background:"#f1f4f8", display:"grid", placeItems:"center" }}><X size={18} color="#5a6b82" /></button>
        </div>

        <div style={{ padding:"22px 24px" }}>
          {/* codice + nome */}
          <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:16, marginBottom:16 }}>
            <div>
              <label style={labelStyle}>Codice *</label>
              <input autoFocus value={codice} onChange={(e)=>setCodice(e.target.value)} placeholder="Es. E046" style={{ ...inputStyleNoIcon, textTransform:"uppercase" }} />
              {codiceDuplicato && <div style={{ fontSize:11.5, color:"#dc2626", marginTop:5 }}>Codice già esistente.</div>}
            </div>
            <div>
              <label style={labelStyle}>Nome / Ragione sociale *</label>
              <input value={cliente} onChange={(e)=>setCliente(e.target.value)} placeholder="Es. Rossi Mario" style={inputStyleNoIcon} />
            </div>
          </div>

          {/* tipo cliente */}
          <label style={labelStyle}>Tipo cliente</label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
            {tipiCliente.map((t) => (
              <button key={t} className="btn" onClick={()=>setTipo(t)} style={chip(tipo===t)}>{t}</button>
            ))}
          </div>

          {/* tipo pagamento + acconti */}
          <div style={{ display:"flex", gap:24, flexWrap:"wrap", marginBottom:16 }}>
            <div>
              <label style={labelStyle}>Tipo pagamento</label>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn" onClick={()=>setModalita("Acconto")} style={chip(modalita==="Acconto")}>Acconto</button>
                <button className="btn" onClick={()=>setModalita("Riba")} style={chip(modalita==="Riba")}>Ricevuta bancaria</button>
              </div>
            </div>
            {modalita === "Acconto" && (
              <div>
                <label style={labelStyle}>N° acconti previsti</label>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button className="btn" onClick={()=>setNumAcconti(Math.max(1, numAcconti-1))} style={stepperBtn}>−</button>
                  <span style={{ fontSize:17, fontWeight:700, color:"#1e4d8c", minWidth:24, textAlign:"center", fontFamily:"'Fraunces',serif" }}>{numAcconti}</span>
                  <button className="btn" onClick={()=>setNumAcconti(Math.min(6, numAcconti+1))} style={stepperBtn}>+</button>
                  <span style={{ fontSize:12, color:"#9aa7ba", marginLeft:4 }}>+ saldo</span>
                </div>
              </div>
            )}
          </div>

          {/* tel + email */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input value={tel} onChange={(e)=>setTel(e.target.value)} placeholder="Es. 347 1234567" style={inputStyleNoIcon} />
            </div>
            <div>
              <label style={labelStyle}>Email (opzionale)</label>
              <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="email@esempio.it" style={inputStyleNoIcon} />
            </div>
          </div>

          {/* indirizzo */}
          <label style={labelStyle}>Indirizzo cantiere</label>
          <input value={indirizzo} onChange={(e)=>setIndirizzo(e.target.value)} placeholder="Via, numero, città" style={{ ...inputStyleNoIcon, marginBottom:16 }} />

          {/* tipologia + solo fornitura */}
          <div style={{ display:"flex", gap:24, flexWrap:"wrap", marginBottom:16, alignItems:"flex-start" }}>
            <div>
              <label style={labelStyle}>Tipologia</label>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn" onClick={()=>setTipologia("Nuovo")} style={chip(tipologia==="Nuovo")}>Nuovo</button>
                <button className="btn" onClick={()=>setTipologia("Sostituzione")} style={chip(tipologia==="Sostituzione")}>Sostituzione</button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Solo fornitura</label>
              <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13.5, color:"#5a6b82", cursor:"pointer", padding:"9px 0" }}>
                <input type="checkbox" checked={soloFornitura} onChange={(e)=>setSoloFornitura(e.target.checked)} style={{ width:17, height:17, accentColor:"#1e4d8c" }} />
                Sì, il cliente installa in autonomia (nessuna posa)
              </label>
            </div>
          </div>

          {/* materiale */}
          <label style={labelStyle}>Materiale da posare</label>
          <textarea value={materialePosa} onChange={(e)=>setMaterialePosa(e.target.value)} rows={3} placeholder={"Es.\nN. 2 porte battenti\nN. 1 scorrevole"} style={{ width:"100%", padding:"11px 14px", border:"1px solid #dce3ee", borderRadius:10, fontSize:13.5, lineHeight:1.5, outline:"none", resize:"vertical", marginBottom:16 }} />

          {/* note */}
          <label style={labelStyle}>Note</label>
          <textarea value={note} onChange={(e)=>setNote(e.target.value)} rows={2} placeholder="Eventuali note o criticità" style={{ width:"100%", padding:"11px 14px", border:"1px solid #dce3ee", borderRadius:10, fontSize:13.5, lineHeight:1.5, outline:"none", resize:"vertical" }} />

          <div style={{ fontSize:11.5, color:"#9aa7ba", marginTop:14, lineHeight:1.5 }}>Le consegne dal fornitore si aggiungono dopo, dalla scheda del lavoro. I campi con * sono obbligatori.</div>
        </div>

        <div style={{ padding:"16px 24px", borderTop:"1px solid #eef2f7", display:"flex", gap:10, justifyContent:"flex-end", position:"sticky", bottom:0, background:"#fff" }}>
          <button className="btn" onClick={onClose} style={{ padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14, background:"#f1f4f8", color:"#5a6b82" }}>Annulla</button>
          <button className="btn" disabled={!valido} onClick={crea} style={{ padding:"11px 18px", borderRadius:10, fontWeight:600, fontSize:14, background: valido?"#1e4d8c":"#c5cddb", color:"#fff", cursor: valido?"pointer":"not-allowed", display:"flex", alignItems:"center", gap:7 }}><Plus size={17} /> Crea riferimento</button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} className="fade" style={{ position:"fixed", inset:0, background:"rgba(20,28,42,.45)", display:"grid", placeItems:"center", zIndex:100, padding:16, backdropFilter:"blur(2px)" }}>
      <div onClick={(e)=>e.stopPropagation()}>{children}</div>
    </div>
  );
}

// ============ COMPONENTI CONDIVISI ============
function PagStep({ label, done, disabled, onClick }) {
  return (
    <div onClick={disabled ? undefined : onClick} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:9, marginBottom:6, background: done?"#f0fdf4":"#f7f9fc", cursor: disabled?"not-allowed":"pointer", opacity: disabled?0.5:1, border:"1px solid", borderColor: done?"#bbf7d0":"#eef2f7" }}>
      <div style={{ width:22, height:22, borderRadius:"50%", background: done?"#22c55e":"#fff", border: done?"none":"2px solid #c5cddb", display:"grid", placeItems:"center", flexShrink:0 }}>
        {done && <Check size={13} color="#fff" />}
      </div>
      <span style={{ fontSize:13.5, fontWeight:600, color: done?"#15803d":"#5a6b82" }}>{label}</span>
      {done && <span style={{ marginLeft:"auto", fontSize:11.5, color:"#15803d", fontWeight:600 }}>ricevuto</span>}
    </div>
  );
}
function Tag({ tipo, big }) {
  const t = TIPI[tipo] || TIPI["Altro"];
  return <span style={{ fontSize: big?12:10.5, fontWeight:600, padding: big?"3px 10px":"1px 7px", borderRadius:5, background:t.bg, color:t.color }}>{tipo}</span>;
}
function Semaforo({ p }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color:p.color, background:p.bg, padding:"4px 9px", borderRadius:6 }}>
      <Circle size={7} fill={p.dot} color={p.dot} /> {p.label}
    </span>
  );
}
function FaseBadge({ l }) {
  const n = nFasiFatte(l);
  const nome = n === 0 ? "Da iniziare" : FASI[n-1];
  return (
    <div>
      <div style={{ fontSize:13, fontWeight:600, color: n===0?"#9aa7ba":"#3d4a5c" }}>{nome}</div>
      <div style={{ display:"flex", gap:2, marginTop:5 }}>
        {FASI.map((_,i) => <div key={i} style={{ height:3, flex:1, borderRadius:2, background: i<n?"#1e4d8c":"#e3e8f0", maxWidth:8 }} />)}
      </div>
    </div>
  );
}
function SectionHead({ title, sub, action }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
      <div>
        <h2 style={{ fontSize:16.5, fontWeight:700 }}>{title}</h2>
        <div style={{ fontSize:12.5, color:"#8493a8", marginTop:1 }}>{sub}</div>
      </div>
      {action}
    </div>
  );
}
function Empty({ text }) {
  return <div style={{ padding:"32px 20px", textAlign:"center", color:"#9aa7ba", fontSize:13.5 }}>{text}</div>;
}

const cardWrap = { background:"#fff", borderRadius:14, border:"1px solid #e8edf4", overflow:"hidden" };
const linkBtn = { display:"flex", alignItems:"center", gap:3, background:"transparent", color:"#1e4d8c", fontWeight:600, fontSize:13, padding:"4px 6px" };
const navArrow = { width:36, height:36, borderRadius:9, background:"#fff", border:"1px solid #dce3ee", display:"grid", placeItems:"center" };
const inputStyle = { width:"100%", padding:"11px 14px 11px 40px", border:"1px solid #dce3ee", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none", background:"#fff" };
const inputSm = { padding:"9px 12px", border:"1px solid #dce3ee", borderRadius:8, fontSize:13.5, fontFamily:"inherit", outline:"none", background:"#fff" };
const labelStyle = { display:"block", fontSize:12.5, fontWeight:600, color:"#5a6b82", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.02em" };
const chip = (active) => ({ padding:"9px 14px", borderRadius:9, fontSize:13.5, fontWeight:600, background: active?"#1e4d8c":"#fff", color: active?"#fff":"#5a6b82", border:"1px solid", borderColor: active?"#1e4d8c":"#dce3ee" });
const stepperBtn = { width:32, height:32, borderRadius:8, background:"#eef3fb", color:"#1e4d8c", fontSize:18, fontWeight:700, display:"grid", placeItems:"center", border:"1px solid #dce3ee" };

// fix: inputStyle senza icona per i campi non-search
const inputStyleNoIcon = { ...inputStyle, padding:"11px 14px" };