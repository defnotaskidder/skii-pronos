"use client";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";

const FR = {
  responsible: {
    title: "Jeu responsable",
    body: [
      "Skii Pronos est réservé aux personnes de 18 ans et plus. Les pronostics publiés sont des estimations : aucun n'est garanti, et les paris sportifs comportent un risque réel de perte.",
      "Mise fixe : une unité par pari, un dixième d'unité pour les coupons au-dessus de ~5. Ne mise jamais de l'argent dont tu as besoin, ne cours jamais après tes pertes, et fixe-toi une limite de temps et d'argent avant de jouer.",
      "Si le jeu devient un problème pour toi ou un proche : Joueurs Info Service (France) 09 74 75 13 13, appel non surtaxé, 7 j/7 de 8 h à 2 h. Dans les autres pays, rapproche-toi du service d'aide aux joueurs local.",
    ],
  },
  privacy: {
    title: "Politique de confidentialité",
    body: [
      "Compte : si tu crées un compte, ton adresse e-mail (et ton prénom si tu le donnes) est stockée chez Supabase, notre fournisseur d'authentification et de base de données. Elle sert uniquement à te connecter et à synchroniser tes données.",
      "Données synchronisées : tes matchs suivis, tes coupons suivis, tes réglages d'alertes et ta langue. Sans compte, ces données restent dans ton navigateur.",
      "Alertes : si tu actives les notifications push, l'identifiant de notification de ton appareil est stocké pour t'envoyer les alertes. Si tu lies Telegram ou WhatsApp, l'identifiant de ta conversation est stocké dans le même but. Tu peux tout délier ou désactiver depuis Paramètres.",
      "Nous ne vendons aucune donnée et n'utilisons pas de régie publicitaire. Les cotes, scores et statistiques proviennent de flux publics (ESPN, The Odds API). L'analyse IA envoie les données du match (jamais tes données personnelles) à Anthropic pour produire le texte.",
      "Suppression : écris-nous ou supprime ton compte depuis Paramètres, et toutes les données liées sont effacées.",
    ],
  },
  terms: {
    title: "Conditions d'utilisation",
    body: [
      "Skii Pronos fournit de l'information et des estimations à titre de divertissement. Nous ne prenons pas de paris, ne gérons pas d'argent et ne sommes affiliés à aucun bookmaker.",
      "Tu es seul responsable de tes paris et du respect des lois de ton pays. En utilisant le site tu confirmes avoir 18 ans ou plus.",
      "Le contenu peut contenir des erreurs ou des retards (cotes, scores, compositions). Vérifie toujours la cote dans l'application du bookmaker avant de parier.",
      "Le service est fourni « tel quel », sans garantie de disponibilité ni de résultat.",
    ],
  },
};
const EN = {
  responsible: {
    title: "Responsible gambling",
    body: [
      "Skii Pronos is for people aged 18 and over. Published picks are estimates: none is guaranteed, and sports betting carries a real risk of loss.",
      "Flat stakes: one unit per bet, a tenth of a unit for coupons above ~5 odds. Never stake money you need, never chase losses, and set a time and money limit before you play.",
      "If gambling is becoming a problem for you or someone close to you, contact your local gambling helpline (France: Joueurs Info Service, 09 74 75 13 13; UK: GamCare, 0808 8020 133).",
    ],
  },
  privacy: {
    title: "Privacy policy",
    body: [
      "Account: if you create an account, your email address (and first name if you give it) is stored with Supabase, our authentication and database provider. It is used only to sign you in and sync your data.",
      "Synced data: your followed matches, tracked coupons, alert settings and language. Without an account these stay in your browser.",
      "Alerts: if you turn on push notifications, your device's notification identifier is stored to send them. If you link Telegram or WhatsApp, your chat identifier is stored for the same purpose. You can unlink or switch everything off in Settings.",
      "We sell no data and run no advertising network. Odds, scores and statistics come from public feeds (ESPN, The Odds API). The AI analysis sends match data (never your personal data) to Anthropic to produce its text.",
      "Deletion: write to us or delete your account in Settings and all linked data is erased.",
    ],
  },
  terms: {
    title: "Terms of use",
    body: [
      "Skii Pronos provides information and estimates for entertainment. We take no bets, handle no money and are not affiliated with any bookmaker.",
      "You alone are responsible for your bets and for complying with the laws of your country. By using the site you confirm you are 18 or older.",
      "Content may contain errors or delays (odds, scores, lineups). Always check the odds in the bookmaker's app before betting.",
      "The service is provided as is, with no guarantee of availability or results.",
    ],
  },
};

export default function Legal() {
  const { t, lang } = useT();
  const L = lang === "fr" ? FR : EN;
  return (
    <>
      <Top title={t("Legal")} sub="Skii Pronos" />
      <div className="stack">
        {["responsible", "privacy", "terms"].map((k) => (
          <section key={k} id={k} className="card">
            <div className="card-head"><h2>{L[k].title}</h2></div>
            {L[k].body.map((p, i) => <p key={i} className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>{p}</p>)}
          </section>
        ))}
      </div>
    </>
  );
}
