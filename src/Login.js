import React, { useState } from "react";
import { login } from "./auth";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(false);

  const handleLogin = async () => {
    setErrore("");
    setCaricamento(true);
    const res = await login(email, password);
    setCaricamento(false);
    if (res.ok) {
      onLogin(res.user);
    } else {
      setErrore("Email o password non corretti");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fa", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#fff", padding: "40px", borderRadius: "16px", boxShadow: "0 10px 40px rgba(0,0,0,0.1)", width: "360px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1e4d8c", letterSpacing: "-0.02em" }}>C.M.R. S.r.l.</div>
          <div style={{ fontSize: "14px", color: "#6b7a90", marginTop: "4px" }}>Gestione Lavori</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid #d4ddea", fontSize: "14px", outline: "none" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid #d4ddea", fontSize: "14px", outline: "none" }}
          />
          {errore && <div style={{ color: "#dc2626", fontSize: "13px", textAlign: "center" }}>{errore}</div>}
          <button
            onClick={handleLogin}
            disabled={caricamento}
            style={{ padding: "12px", borderRadius: "10px", border: "none", background: "#1e4d8c", color: "#fff", fontSize: "15px", fontWeight: "600", cursor: "pointer", marginTop: "4px" }}
          >
            {caricamento ? "Accesso..." : "Accedi"}
          </button>
        </div>
      </div>
    </div>
  );
}
