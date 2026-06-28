import React, { useState } from "react";
import { X } from "lucide-react";

export default function ModificaModal({ lavoro, onClose, onSalva }) {
  const [cliente, setCliente] = useState(lavoro.cliente || "");
  const [tel, setTel] = useState(lavoro.tel || "");
  const [email, setEmail] = useState(lavoro.email || "");
  const [tipo, setTipo] = useState(lavoro.tipo || "Privato");
  const [tipologia, setTipologia] = useState(lavoro.tipologia || "Sostituzione");
  const [indirizzo, setIndirizzo] = useState(lavoro.indirizzo || "");
  const [materialePosa, setMaterialePosa] = useState(lavoro.materialePosa || "");
  const [note, setNote] = useState(lavoro.note || "");
  const [soloFornitura, setSoloFornitura] = useState(lavoro.soloFornitura || false);

  const tipiCliente = ["Privato", "Impresa", "Falegnameria", "Altro"];
  const valido = cliente.trim();

  const salva = () => {
    if (!valido) return;
    onSalva(lavoro.codice, {
      cliente: cliente.trim(), tel: tel.trim(), email: email.trim(),
      tipo, tipologia, indirizzo: indirizzo.trim(),
      materialePosa: materialePosa.trim() || "—", note: note.trim(), soloFornitura,
    });
    onClose();
  };

  const inputStyle = { padding: "10px 12px", borderRadius: 9, border: "1px solid #d4ddea", fontSize: 14, outline: "none", width: "100%", fontFamily: "inherit" };
  const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#5a6b82", marginBottom: 5, display: "block" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,35,50,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 28, width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: "#1a2332" }}>Modifica {lavoro.codice}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9aa7ba" }}><X size={22} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={labelStyle}>Cliente *</label><input style={inputStyle} value={cliente} onChange={(e) => setCliente(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Telefono</label><input style={inputStyle} value={tel} onChange={(e) => setTel(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Email</label><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Tipo cliente</label>
              <select style={inputStyle} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {tipiCliente.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Tipologia</label>
              <select style={inputStyle} value={tipologia} onChange={(e) => setTipologia(e.target.value)}>
                <option value="Sostituzione">Sostituzione</option>
                <option value="Nuovo">Nuovo</option>
              </select></div>
          </div>
          <div><label style={labelStyle}>Indirizzo</label><input style={inputStyle} value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} /></div>
          <div><label style={labelStyle}>Materiale da posare</label><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={materialePosa} onChange={(e) => setMaterialePosa(e.target.value)} /></div>
          <div><label style={labelStyle}>Note</label><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#2d3a4c", cursor: "pointer" }}>
            <input type="checkbox" checked={soloFornitura} onChange={(e) => setSoloFornitura(e.target.checked)} /> Solo fornitura
          </label>
          <button onClick={salva} disabled={!valido} style={{ padding: 13, borderRadius: 10, border: "none", background: valido ? "#1e4d8c" : "#c5cddb", color: "#fff", fontSize: 15, fontWeight: 600, cursor: valido ? "pointer" : "not-allowed", marginTop: 6 }}>Salva modifiche</button>
        </div>
      </div>
    </div>
  );
}
