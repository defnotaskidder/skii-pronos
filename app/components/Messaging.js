"use client";
// Link Telegram / WhatsApp to the account: goal alerts for followed matches and results for
// tracked coupons arrive in the chat.
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icons";
import { useAuth } from "./Auth";
import { useT } from "./Lang";

export default function MessagingLinks() {
  const auth = useAuth();
  const { t } = useT();
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState({}); // platform -> { code, url }
  const [busy, setBusy] = useState("");

  const reload = async () => {
    const token = auth.user ? await auth.token() : null;
    const r = await fetch("/api/link", { headers: token ? { authorization: `Bearer ${token}` } : {} }).catch(() => null);
    if (r?.ok) setInfo(await r.json());
  };
  useEffect(() => { reload(); }, [auth.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async (platform) => {
    setBusy(platform);
    try {
      const token = await auth.token();
      const r = await fetch("/api/link", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ platform }) });
      const d = await r.json();
      if (d.code) setPending((p) => ({ ...p, [platform]: d }));
    } finally { setBusy(""); }
  };
  const unlink = async (platform) => {
    setBusy(platform);
    try {
      const token = await auth.token();
      await fetch("/api/link", { method: "DELETE", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ platform }) });
      setPending((p) => ({ ...p, [platform]: null }));
      await reload();
    } finally { setBusy(""); }
  };

  const rows = [
    ["telegram", "Telegram", "Get alerts and the daily coupons in Telegram", info?.telegram],
    ["whatsapp", "WhatsApp", "Get alerts and the daily coupons in WhatsApp", info?.whatsapp],
  ];
  return (
    <section className="card">
      <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="send" /></span><h3>{t("Telegram")} · {t("WhatsApp")}</h3></div>
      {rows.map(([platform, label, desc, cfg]) => {
        const linked = info?.links?.find((l) => l.platform === platform);
        const p = pending[platform];
        return (
          <div key={platform} className="setting" style={{ flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <b>{label}</b>
              <small>{!cfg ? "…" : !cfg.enabled ? t("Not configured yet") : linked ? `${t("Linked")}${linked.name ? ` · ${linked.name}` : ""}` : t(desc)}</small>
              {p && (
                <div className="card flat tight" style={{ marginTop: 8, background: "rgba(255,255,255,.03)" }}>
                  <b style={{ fontSize: 22, letterSpacing: ".12em" }}>{p.code}</b>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{platform === "telegram" ? t("Open Telegram and press Start, then come back here.") : t("Send this code to the WhatsApp number, then come back here.")}</div>
                  {p.url && <a className="btn primary sm" style={{ marginTop: 8 }} href={p.url} target="_blank" rel="noreferrer"><Icon name="send" />{platform === "telegram" ? "Telegram" : "WhatsApp"}</a>}
                  <button className="btn ghost xs" style={{ marginTop: 8, marginLeft: 6 }} onClick={reload}><Icon name="refresh" />{t("Refresh")}</button>
                </div>
              )}
            </div>
            {cfg?.enabled && (auth.user ? (
              linked ? <button className="btn soft sm" disabled={busy === platform} onClick={() => unlink(platform)}>{t("Unlink")}</button>
                : <button className="btn primary sm" disabled={busy === platform} onClick={() => link(platform)}><Icon name="plus" />{platform === "telegram" ? t("Link Telegram") : t("Link WhatsApp")}</button>
            ) : <Link href="/login" className="btn soft sm">{t("Sign in")}</Link>)}
          </div>
        );
      })}
      {info && !auth.user && (info.telegram?.enabled || info.whatsapp?.enabled) && <p className="note" style={{ marginBottom: 0 }}>{t("Sign in first to link a messaging app.")}</p>}
      {info?.telegram?.enabled && info.telegram.bot && <p className="note" style={{ marginBottom: 0 }}>Telegram: <a href={`https://t.me/${info.telegram.bot}`} target="_blank" rel="noreferrer" style={{ color: "#ffb4b0" }}>@{info.telegram.bot}</a></p>}
    </section>
  );
}
