// Site text. English is the key itself; French is the default language of the site.
// t("Show all {n} matches", { n: 12 }) fills placeholders. Missing keys fall back to English.

export const LANGS = { fr: "Français", en: "English" };
export const DEFAULT_LANG = "fr";
export const LOCALE = { fr: "fr-FR", en: "en-GB" };

const fr = {
  // navigation / shell
  "Dashboard": "Accueil", "Matches": "Matchs", "Live": "En direct", "History": "Historique", "Settings": "Paramètres",
  "Navigation": "Navigation", "Account": "Compte", "Engine · live odds · AI": "Moteur · cotes live · IA",
  "Search team or league": "Équipe ou championnat", "Search": "Rechercher", "Sign in": "Connexion", "Me": "Moi", "Coupon": "Coupon",
  "Synced account": "Compte synchronisé", "Save picks across devices": "Retrouve tes pronos partout",
  "18+ · Bet responsibly. No pick is a guarantee.": "18+ · Pariez de façon responsable. Aucun prono n'est garanti.",
  "Skii Pronos home": "Accueil Skii Pronos", "Back": "Retour", "Close": "Fermer", "Remove": "Retirer", "Delete": "Supprimer",
  "Copy": "Copier", "Copied": "Copié", "Clear": "Vider", "Clear all": "Tout effacer", "Add": "Ajouter", "Added": "Ajouté",
  "Refresh": "Actualiser", "Re-run": "Relancer", "Show more ({n} left)": "Voir plus ({n} restants)", "Language": "Langue",
  "Track record": "Palmarès", "Legal": "Mentions",

  // notifications bell
  "{n} new": "{n} nouvelles", "Mark all read": "Tout marquer lu", "No notifications yet.": "Aucune notification pour l'instant.",
  "Follow a match with the bell to get goal alerts.": "Suis un match avec la cloche pour recevoir les alertes de buts.",
  "See all & settings": "Tout voir & réglages", "Inbox": "Boîte de réception", "Unread": "Non lues",
  "{n} unread · {m} followed matches": "{n} non lues · {m} matchs suivis",
  "Follow a match (🔔) or track a coupon to get alerts.": "Suis un match (🔔) ou suis un coupon pour recevoir des alertes.",
  "Followed matches": "Matchs suivis", "None yet. Tap 🔔 on any match.": "Aucun pour l'instant. Touche 🔔 sur un match.", "Unfollow": "Ne plus suivre",

  // slip drawer
  "My coupon": "Mon coupon", "Bet slip": "Ticket", "Your coupon is empty. Tap any pick or price to add it.": "Ton coupon est vide. Touche un prono ou une cote pour l'ajouter.",
  "Total odds": "Cote totale", "Hit chance": "Chance de passer",
  "≈ prices are estimates — take them only at or above the shown odds on 1xBet.": "Les cotes ≈ sont des estimations : à prendre sur 1xBet uniquement à la cote affichée ou mieux.",
  "Track it": "Suivre", "MY COUPON": "MON COUPON",

  // match rows
  "Unfollow match": "Ne plus suivre ce match", "Follow match": "Suivre ce match", "Alerts on": "Alertes activées", "Get goal alerts": "Recevoir les alertes de buts",
  "{team} win": "Victoire {team}", "Draw": "Nul", "Red card": "Carton rouge", "Add pick to coupon": "Ajouter le prono au coupon", "Add to coupon": "Ajouter au coupon",
  "Engine pick": "Prono du moteur", "Final": "Terminé", "Postponed": "Reporté", "No prices yet": "Pas encore de cotes",
  "Pre-match pick": "Prono d'avant-match", "Tap for live analysis": "Touche pour l'analyse live", "LIVE": "LIVE", "FT": "TER", "PPD": "REP", "HT": "MT",
  "Today": "Aujourd'hui", "Tomorrow": "Demain", "Yesterday": "Hier",

  // tiers
  "High": "Élevé", "Med-high": "Moyen +", "Medium": "Moyen", "Low": "Faible", "Skip": "Passer",

  // dashboard
  "{n} matches in the next 24h across {m} leagues": "{n} matchs dans les 24 h dans {m} championnats",
  "Safest legs today": "Les sélections les plus sûres du jour", " · AI-checked": " · vérifié par l'IA", "Live now": "En direct", "All {n}": "Tous ({n})",
  "Next 24 hours": "Prochaines 24 h", "Strong picks": "Pronos solides", "Value spots": "Cotes de valeur", "Your record": "Ton bilan", "Last 7 days": "7 derniers jours",
  "{w} won of {n} graded legs": "{w} gagnés sur {n} sélections jugées", "Track a coupon to start your record.": "Suis un coupon pour démarrer ton bilan.",
  "{n} legs · {chance}": "{n} sélections · {chance}", "Big odds, best chance · generator inside": "Grosses cotes, meilleure chance · générateur inclus",
  "Top picks today": "Meilleurs pronos du jour", "All matches": "Tous les matchs", "No high-confidence picks in the next 24 hours.": "Pas de prono à forte confiance dans les 24 h.",
  "model beats the price": "le modèle bat la cote", "No price beats the model right now. That's normal, value is rare.": "Aucune cote ne bat le modèle pour l'instant. C'est normal, la valeur est rare.",
  "Big games": "Grosses affiches", "See all": "Tout voir",
  "Probabilities come from bookmaker odds with the margin removed, blended with a league-table and form model. “≈” prices are estimates: take them on 1xBet only at or above the shown odds. 18+, bet responsibly.":
    "Les probabilités viennent des cotes des bookmakers sans la marge, mélangées à un modèle classement + forme. Les cotes « ≈ » sont des estimations : à prendre sur 1xBet uniquement à la cote affichée ou mieux. 18+, pariez de façon responsable.",

  // matches page
  "All": "Tous", "Upcoming": "À venir", "Finished": "Terminés", "Kick-off": "Coup d'envoi", "Best picks": "Meilleurs pronos",
  "All competitions": "Toutes compétitions", "Men's": "Hommes", "Women's": "Femmes", "Youth & college": "Jeunes & universitaire",
  "Show fewer": "Voir moins", "Show all {n} {league} matches": "Voir les {n} matchs de {league}",
  "{n} competitions, loaded automatically": "{n} compétitions, chargées automatiquement", " · updated {time}": " · mis à jour {time}",
  "Team or league": "Équipe ou championnat", "Clear search": "Effacer la recherche", "All days": "Tous les jours", "All sports": "Tous les sports", "All leagues": "Tous les championnats",
  "No matches for these filters.": "Aucun match pour ces filtres.", "{n} match": "{n} match", "{n} matches": "{n} matchs", "{n} live": "{n} en direct",
  "Football": "Football", "Basketball": "Basket", "American football": "Football américain", "Hockey": "Hockey", "Baseball": "Baseball",

  // live page
  "{n} live now · refreshes every 15s": "{n} en direct · actualisé toutes les 15 s", "Nothing live right now.": "Rien en direct pour l'instant.",
  "{n} matches start in the next 3 hours.": "{n} matchs commencent dans les 3 prochaines heures.", "Check the upcoming list below.": "Regarde la liste à venir ci-dessous.",
  "Open any live match for the": "Ouvre n'importe quel match en direct pour le", "live model": "modèle live",
  "(win/draw/loss re-priced from score, minute, red cards and shots) and a one-tap": "(victoire/nul/défaite recalculés selon le score, la minute, les cartons rouges et les tirs) et une",
  "AI live read": "lecture live par l'IA", "Tap 🔔 to get goal alerts.": "Touche 🔔 pour les alertes de buts.",
  "Starting soon": "Bientôt", "Just finished": "Viennent de se terminer",

  // coupon page
  "{day} · built by the engine from every league": "{day} · construit par le moteur à partir de tous les championnats", ", double-checked by AI": ", revérifié par l'IA",
  "Safe · ~2.5 odds": "Sûr · cote ~2,5", "Dropped by the AI check": "Écartés par la vérification IA", "Grosse cote du jour": "Grosse cote du jour", "Coupon du jour": "Coupon du jour",
  "~30 odds · {chance}": "cote ~30 · {chance}", "Grosse cote generator": "Générateur de grosse cote", "Build your own": "Compose le tien", "Target odds": "Cote visée",
  "Profile": "Profil", "Safe": "Sûr", "Short, likely legs": "Sélections courtes et probables", "Balanced": "Équilibré", "Chance + price": "Chance + cote",
  "Value": "Valeur", "Biggest edge vs the price": "Plus grand avantage sur la cote", "Kick-off within": "Coup d'envoi dans", "24 h": "24 h", "48 h": "48 h", "3 days": "3 jours",
  "Build ~{t} odds": "Construire cote ~{t}", "Building…": "Construction…", "Couldn't build the coupon.": "Impossible de construire le coupon.",
  "One market per match, built for the highest chance at your target. Want 10, 50, 1000? Use the": "Un marché par match, construit pour la meilleure chance d'atteindre ta cote. Tu veux 10, 50, 1000 ? Utilise le",
  "grosse cote generator": "générateur de grosse cote", "Custom ~{t}": "Perso ~{t}", "{profile} · {n} legs": "{profile} · {n} sélections", " · target not reached": " · cote non atteinte",
  "Coupon ~{t}": "Coupon ~{t}", "Matches considered": "Matchs analysés", "Safe coupon hit chance": "Chance du coupon sûr", "Grosse cote hit chance": "Chance de la grosse cote",
  "Saved for the day": "Enregistré pour la journée", "Yes, archived in History": "Oui, archivé dans l'Historique", "This session": "Cette session",

  // grosse cote page
  "Grosse cote": "Grosse cote", "Big-odds coupons, built for the best possible chance at each target": "Coupons à grosse cote, construits pour la meilleure chance possible à chaque objectif",
  "~30 odds · {n} legs": "cote ~30 · {n} sélections", "Big legs": "Grosses sélections", "Fewer legs at 1.45–4.20 each": "Moins de sélections, à 1,45–4,20 chacune",
  "More legs": "Plus de sélections", "Safer legs at 1.25–2.60 each": "Sélections plus sûres, à 1,25–2,60 chacune", "Or type any target, e.g. 75": "Ou tape une cote, ex. 75",
  "Custom target odds": "Cote visée personnalisée", "Style": "Style", "Max legs · {n}": "Sélections max · {n}", "Maximum legs": "Nombre maximum de sélections",
  "Generate ~{t} odds": "Générer cote ~{t}", "Another one": "Une autre",
  "No other combination reaches that target. Widen the window or lower the target.": "Aucune autre combinaison n'atteint cette cote. Élargis la période ou baisse l'objectif.",
  "Not enough strong legs for that target right now. Widen the window or lower the target.": "Pas assez de sélections solides pour cette cote maintenant. Élargis la période ou baisse l'objectif.",
  "Couldn't generate the coupon.": "Impossible de générer le coupon.", "Chance of landing:": "Chance de passer :",
  "“Another one” builds a different combination from the remaining matches.": "« Une autre » construit une combinaison différente avec les matchs restants.",
  "How it's built": "Comment c'est construit",
  "Every match is priced by the model. For each one the generator keeps the leg that gives up the least chance per unit of odds, then stacks the most efficient legs and finishes with the one that closes the gap to your target for the smallest loss. The result is the highest chance of landing that target, not just the shortest prices.":
    "Chaque match est évalué par le modèle. Pour chacun, le générateur garde la sélection qui sacrifie le moins de chance par unité de cote, empile les plus efficaces, puis termine par celle qui comble l'écart avec ta cote visée en perdant le moins de chance. Résultat : la meilleure chance d'atteindre cette cote, pas simplement les cotes les plus basses.",
  "Big odds mean small chances. Stake a tenth of a unit at most, never chase. 18+.": "Grosse cote = petite chance. Mise au maximum un dixième d'unité, ne cours jamais après tes pertes. 18+.",
  "Grosse cote ~{t}": "Grosse cote ~{t}", " · target not fully reached": " · cote pas totalement atteinte",

  // coupon component
  "1 in {n}": "1 sur {n}", "🔥 Coupon du jour + grosse cote are ready": "🔥 Coupon du jour + grosse cote sont prêts", "Safe {n} legs @ {o}": "Sûr {n} sélections @ {o}",
  " · grosse cote @ {o}": " · grosse cote @ {o}", "Couldn't load the coupon.": "Impossible de charger le coupon.", "Load in my coupon": "Charger dans mon coupon",
  "Tracking": "Suivi", "Track": "Suivre", "Copy for Telegram": "Copier pour Telegram", "✓ Won": "✓ Gagné", "✗ Lost": "✗ Perdu", "Void": "Remboursé", "AI:": "IA :",
  "✓ Coupon won": "✓ Coupon gagné", "✗ Coupon lost": "✗ Coupon perdu",
  "No legs strong enough right now. The engine would rather skip than force a coupon.": "Pas de sélection assez solide pour l'instant. Le moteur préfère passer plutôt que forcer un coupon.",

  // history
  "Every game the engine picked, graded from final scores": "Chaque match prono par le moteur, jugé sur le score final", "All games": "Tous les matchs", "Daily coupons": "Coupons du jour",
  "My coupons": "Mes coupons", "7 days": "7 jours", "30 days": "30 jours", "Grade now": "Juger maintenant", "Grade finished games now": "Juger les matchs terminés maintenant",
  "Couldn't load the history.": "Impossible de charger l'historique.", "The game history needs the database.": "L'historique des matchs a besoin de la base de données.",
  "Connect Supabase to this project in Vercel (Storage) and redeploy. From then on every pick is saved before kick-off and graded at full time.": "Connecte Supabase à ce projet dans Vercel (Storage) et redéploie. Ensuite chaque prono est enregistré avant le coup d'envoi et jugé au coup de sifflet final.",
  "Engine hit rate · {n} games": "Réussite du moteur · {n} matchs", "Picks won": "Pronos gagnés", "Flat 1u at the pick odds": "Mise fixe 1u à la cote du prono", "Value picks · {n} graded": "Pronos valeur · {n} jugés",
  "By confidence": "Par confiance", "{w}/{n} · avg @{o} · ": "{w}/{n} · moy. @{o} · ", "By league": "Par championnat", "Won": "Gagnés", "Lost": "Perdus",
  "No graded games in this window yet.": "Aucun match jugé sur cette période pour l'instant.",
  "Picks are saved before kick-off and graded at full time, so the record fills up as games finish.": "Les pronos sont enregistrés avant le coup d'envoi et jugés à la fin, le bilan se remplit donc au fil des matchs.",
  "{n} games · {w} won": "{n} matchs · {w} gagnés", "Coupons du jour won": "Coupons du jour gagnés", "Grosses cotes won": "Grosses cotes gagnées",
  "No daily coupons archived yet.": "Aucun coupon du jour archivé pour l'instant.",
  "The coupon du jour and grosse cote du jour are saved the first time they're published each day.": "Le coupon du jour et la grosse cote du jour sont enregistrés à leur première publication chaque jour.",
  "No {title} that day.": "Pas de {title} ce jour-là.", "won": "gagné", "lost": "perdu", "open": "en cours", "pending": "en attente",
  "Leg hit rate · {n} graded": "Réussite par sélection · {n} jugées", "Coupons won · {n} settled": "Coupons gagnés · {n} réglés", "Flat 1u per leg": "Mise fixe 1u par sélection", "ROI per leg": "ROI par sélection",
  "Pending": "En attente", "Clear all your tracked coupons?": "Effacer tous tes coupons suivis ?", "Nothing here yet.": "Rien ici pour l'instant.",
  "Track the": "Suis le", "a": "une", "or your own coupon and it lands here, graded automatically.": "ou ton propre coupon et il arrive ici, jugé automatiquement.",
  "{n} legs · {w}W {l}L": "{n} sélections · {w}G {l}P", "Results fill in automatically after full time. W / L / V lets you correct one by hand.": "Les résultats se remplissent automatiquement après la fin du match. G / P / R permet de corriger à la main.",
  "FT {score}": "Score {score}", "Stake": "Mise", "Profit": "Gain", "Bankroll": "Bankroll", "Units": "Unités", "Unit size": "Taille d'une unité",
  "Profit with your stakes": "Gain avec tes mises", "Set a stake on each coupon to see real profit.": "Indique une mise sur chaque coupon pour voir le gain réel.",

  // notifications settings
  "Alerts": "Alertes", "Browser notifications": "Notifications du navigateur", "Not supported in this browser": "Non pris en charge par ce navigateur",
  "Blocked — allow notifications for this site in your browser settings": "Bloquées : autorise les notifications pour ce site dans les réglages du navigateur",
  "Pop-ups even when this tab is in the background": "Pop-ups même quand cet onglet est en arrière-plan",
  "When a followed match starts": "Quand un match suivi commence", "Goals": "Buts", "Every goal in followed matches": "Chaque but des matchs suivis",
  "Red cards": "Cartons rouges", "Sendings-off in followed matches": "Expulsions dans les matchs suivis", "Full time": "Fin de match", "Final score of followed matches": "Score final des matchs suivis",
  "Once a day when the new coupon is ready": "Une fois par jour quand le nouveau coupon est prêt", "Results": "Résultats", "When a tracked coupon is won or lost": "Quand un coupon suivi est gagné ou perdu",
  "Value alerts": "Alertes valeur", "When a strong value spot appears": "Quand une grosse cote de valeur apparaît", "Odds moves": "Mouvements de cotes", "When the odds move sharply on a followed match": "Quand la cote bouge fortement sur un match suivi",
  "Send a test alert": "Envoyer une alerte test", "⚽ Test alert": "⚽ Alerte test", "This is what a goal alert looks like.": "Voici à quoi ressemble une alerte de but.",
  "Push on this device": "Push sur cet appareil", "Alerts reach this phone or computer even with the site closed": "Les alertes arrivent sur ce téléphone ou cet ordinateur même site fermé",
  "Telegram": "Telegram", "WhatsApp": "WhatsApp", "Get alerts and the daily coupons in Telegram": "Reçois les alertes et les coupons du jour sur Telegram",
  "Get alerts and the daily coupons in WhatsApp": "Reçois les alertes et les coupons du jour sur WhatsApp", "Link Telegram": "Lier Telegram", "Link WhatsApp": "Lier WhatsApp",
  "Linked": "Lié", "Unlink": "Délier", "Sign in first to link a messaging app.": "Connecte-toi d'abord pour lier une messagerie.",
  "Open Telegram and press Start, then come back here.": "Ouvre Telegram, appuie sur Démarrer, puis reviens ici.",
  "Send this code to the WhatsApp number, then come back here.": "Envoie ce code au numéro WhatsApp, puis reviens ici.", "Not configured yet": "Pas encore configuré",

  // settings
  "Account, alerts and preferences": "Compte, alertes et préférences", "Member since": "Membre depuis", "Sync": "Synchro", "Sign out": "Déconnexion",
  "Your history, followed matches, coupon and alerts are synced to your account.": "Ton historique, tes matchs suivis, ton coupon et tes alertes sont synchronisés avec ton compte.",
  "You're using Skii Pronos without an account. Your history, coupon and alerts are saved in this browser.": "Tu utilises Skii Pronos sans compte. Ton historique, ton coupon et tes alertes sont enregistrés dans ce navigateur.",
  "Sign in or create an account": "Se connecter ou créer un compte", "Play it safe": "Joue prudent",
  "Flat stakes, one unit per bet. Coupons above ~5 odds are lottery tickets: stake a tenth of a unit. Never chase losses. 18+.": "Mises fixes, une unité par pari. Les coupons au-dessus de ~5 sont des tickets de loterie : mise un dixième d'unité. Ne cours jamais après tes pertes. 18+.",
  "Probabilities are estimates from bookmaker prices and team data. No pick is a guarantee.": "Les probabilités sont des estimations basées sur les cotes et les données des équipes. Aucun prono n'est garanti.",
  "Install the app": "Installer l'application", "Add Skii Pronos to your home screen for a full-screen app with its own icon.": "Ajoute Skii Pronos à ton écran d'accueil : une appli plein écran avec sa propre icône.",
  "Install": "Installer", "Installed": "Installée", "On iPhone: Share → Add to Home Screen.": "Sur iPhone : Partager → Sur l'écran d'accueil.",

  // login
  "Your picks, coupons and alerts, everywhere": "Tes pronos, coupons et alertes, partout", "Create your account": "Crée ton compte", "Reset password": "Réinitialiser le mot de passe",
  "Welcome back": "Content de te revoir", "Free. Save your history and get alerts on every device.": "Gratuit. Garde ton historique et reçois les alertes sur tous tes appareils.",
  "We'll email you a reset link.": "On t'envoie un lien de réinitialisation par e-mail.", "Sign in to sync your coupons and alerts.": "Connecte-toi pour synchroniser tes coupons et alertes.",
  "Accounts aren't switched on yet": "Les comptes ne sont pas encore activés",
  "The sign-in backend runs on Supabase. Connect a Supabase database to this project in Vercel (Storage → Supabase) and redeploy, and this form goes live. Until then everything works without an account.": "La connexion repose sur Supabase. Connecte une base Supabase à ce projet dans Vercel (Storage → Supabase) et redéploie : ce formulaire sera actif. En attendant, tout fonctionne sans compte.",
  "Continue without an account": "Continuer sans compte", "Continue with Google": "Continuer avec Google", "or with email": "ou par e-mail", "Name": "Prénom", "Email": "E-mail", "Password": "Mot de passe",
  "Check your inbox to confirm your email, then sign in.": "Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.",
  "Password reset link sent — check your inbox.": "Lien de réinitialisation envoyé, vérifie ta boîte mail.", "Something went wrong.": "Une erreur est survenue.", "Please wait…": "Patiente…",
  "Create account": "Créer le compte", "Send reset link": "Envoyer le lien", "Forgot password?": "Mot de passe oublié ?", "Back to sign in": "Retour à la connexion", "Create an account": "Créer un compte",
  "By continuing you confirm you are 18 or older and accept the": "En continuant tu confirmes avoir 18 ans ou plus et accepter les", "terms": "conditions", "and the": "et la", "privacy policy": "politique de confidentialité",

  // match page
  "Match": "Match", "Back to matches": "Retour aux matchs", "Loading match…": "Chargement du match…", "Prono": "Prono", "Match stats": "Stats du match", "All markets": "Tous les marchés",
  "Form & table": "Forme & classement", "Lineups": "Compositions", "Bookmakers": "Bookmakers", "Live win probability · {m}'": "Probabilité de victoire live · {m}'", "Win probability": "Probabilité de victoire",
  "Match facts": "Infos du match", "Expected goals (model)": "Buts attendus (modèle)", "Opening 1X2": "1X2 à l'ouverture", "Goal line": "Ligne de buts", "Data quality": "Qualité des données",
  "Full market": "Marché complet", "1X2 only": "1X2 seulement", "Table & form only": "Classement & forme seulement", "League averages only": "Moyennes du championnat seulement",
  "Trained model, no price yet": "Modèle entraîné, pas encore de cote", "Trained model xG": "xG du modèle entraîné",
  // special night
  "Special": "Spécial", "SPECIAL": "SPÉCIAL", "Special night": "Soirée spéciale", "{n} games tonight": "{n} matchs ce soir",
  "Special night being built…": "Soirée spéciale en préparation…", "Every game analysed, team news checked by the AI": "Chaque match analysé, actus vérifiées par l'IA",
  "Tonight's games are over": "Les matchs de ce soir sont terminés", "No big competition plays today.": "Aucune grande compétition ne joue aujourd'hui.",
  "No special night today. The Champions League, Europa League and the big tournaments get one on their matchdays.": "Pas de soirée spéciale aujourd'hui. La Ligue des Champions, la Ligue Europa et les grands tournois en ont une à chaque journée.",
  "{n} games · every game analysed: real prices, trained model, line movement, team news checked by the AI": "{n} matchs · chaque match analysé : cotes réelles, modèle entraîné, mouvement des cotes, actus vérifiées par l'IA",
  "AI check pending": "vérification IA en cours", "The night's coupon": "Le coupon de la soirée", "The night's grosse cote": "La grosse cote de la soirée",
  "safest · ~2.00 odds": "le plus sûr · cote ~2,00", "The slate's strongest legs, real bookmaker prices, games the AI flagged left out": "Les sélections les plus solides de la soirée, cotes réelles, les matchs signalés par l'IA écartés",
  "Tonight's games can't make x2 with strong legs only: this is the closest build.": "Les matchs de ce soir ne font pas x2 avec des sélections solides seulement : voici la combinaison la plus proche.",
  "Same slate, longer odds · ≈ prices are estimates, take them at or above": "Même soirée, plus de cote · les cotes ≈ sont des estimations, à prendre à ce prix ou au-dessus",
  "GAME BY GAME": "MATCH PAR MATCH", "Banker": "Banker", "Pick": "Prono", "Avoid": "À éviter", "AI's choice": "choix de l'IA",
  "No playable pick in this game.": "Aucun prono jouable sur ce match.", "Expected goals": "Buts attendus", "Money on {side}: {from} → {to}": "L'argent va sur {side} : {from} → {to}",
  "risk {r}": "risque {r}", "low": "faible", "medium": "moyen", "high": "élevé", "Special nights won": "Soirées spéciales gagnées",
  "Both clubs' learnt attack and defence (log goals vs the league average) and the games behind them": "Attaque et défense apprises des deux clubs (en log-buts par rapport à la moyenne du championnat) ; le pourcentage est le poids du modèle face aux cotes",
  "Closing line value": "Valeur vs cote de clôture", "beat the close {w}/{n}": "meilleure que la clôture {w}/{n}",
  "Pick odds vs the bookmaker's closing odds on the same market. Positive = our price was better than the close: the sign of an edge that holds over the long run.": "Cote du prono comparée à la cote de clôture du bookmaker sur le même marché. Positif = notre cote était meilleure que la clôture : le signe d'un avantage qui tient sur le long terme.", "Venue": "Stade", "void {p}": "remb. {p}",
  "No live price for this market on the feed: fair odds are {fair}. Take it on 1xBet only at {odds} or better.": "Pas de cote live pour ce marché : la cote juste est {fair}. À prendre sur 1xBet uniquement à {odds} ou mieux.",
  "No prices or table data for this match yet. Check back closer to kick-off.": "Pas encore de cotes ni de classement pour ce match. Reviens plus près du coup d'envoi.",
  "Engine pick · safest playable market": "Prono du moteur · le marché jouable le plus sûr", "Value pick · model beats the price": "Prono valeur · le modèle bat la cote", "Likeliest scores": "Scores les plus probables",
  "Model: {basis}. Probabilities are calibrated to the market; the pick is the market with the best balance of hit chance and price (minimum ~1.20).": "Modèle : {basis}. Les probabilités sont calées sur le marché ; le prono est le marché avec le meilleur équilibre entre chance et cote (minimum ~1,20).",
  "Market": "Marché", "Chance": "Chance", "Fair": "Juste", "Price": "Cote", "pick": "prono",
  "Chance = model probability (v = void, stake returned). Fair = break-even price. Price is the bookmaker's when known; ≈ marks an estimate (fair minus a typical 6% margin).": "Chance = probabilité du modèle (r = remboursé). Juste = cote d'équilibre. Cote = celle du bookmaker quand elle est connue ; ≈ indique une estimation (cote juste moins une marge typique de 6 %).",
  "LIVE MODEL": "MODÈLE LIVE", "{m}' re-pricing": "Recalcul à la {m}'", "Next goal": "Prochain but", "No more goals {p}": "Plus de but {p}", "Over {line} (final)": "Plus de {line} (final)",
  "Both teams score (final)": "Les deux équipes marquent (final)", "Goals still expected": "Buts encore attendus", "Stats": "Stats", "Key moments": "Temps forts", "Commentary": "Commentaires",
  "Possession %": "Possession %", "Shots": "Tirs", "Shots on target": "Tirs cadrés", "Corners": "Corners", "Fouls": "Fautes", "Yellow cards": "Cartons jaunes", "Saves": "Arrêts", "Offsides": "Hors-jeu",
  "Accurate passes": "Passes réussies", "Rebounds": "Rebonds", "Assists": "Passes décisives", "Turnovers": "Pertes de balle",
  "No recent games.": "Pas de match récent.", "at": "chez", "vs": "vs", "Head to head": "Confrontations", "Table": "Classement", "Team": "Équipe", "P": "J", "W": "G", "D": "N", "L": "P", "GD": "Diff", "Pts": "Pts",
  "Couldn't load bookmakers.": "Impossible de charger les bookmakers.", "Compare 1xBet, Pinnacle, Bet365…": "Compare 1xBet, Pinnacle, Bet365…",
  "Bookmaker comparison uses The Odds API. Add": "La comparaison des bookmakers utilise The Odds API. Ajoute", "to the server environment to switch it on. Everything else on the site works without it.": "aux variables du serveur pour l'activer. Tout le reste du site fonctionne sans.",
  "No bookmaker prices for this match.": "Pas de cotes de bookmaker pour ce match.", "Bookmaker": "Bookmaker", "Over": "Plus", "Under": "Moins",
  "Green = best price available. Prices refresh every 30 minutes to protect your Odds API credits": "Vert = meilleure cote disponible. Les cotes s'actualisent toutes les 30 minutes pour économiser les crédits Odds API",
  " ({n} left)": " ({n} restants)", "The analyst didn't answer — try again.": "L'analyste n'a pas répondu, réessaie.", "AI analyst": "Analyste IA",
  "Live read from score, minute & stats": "Lecture live : score, minute & stats", "Full analysis: odds, model, form, table, lineups": "Analyse complète : cotes, modèle, forme, classement, compos",
  "Live analysis": "Analyse live", "Full analysis": "Analyse complète", "Best bet": "Meilleur pari", "Live read": "Lecture live", "Key factors": "Facteurs clés", "Risks": "Risques", "Alternatives": "Alternatives", "Score call": "Score pronostiqué",
  "Team strength": "Force des équipes", "Rating": "Niveau", "Share": "Partager", "Link copied": "Lien copié",

  // toasts
  "Following {home} – {away}": "Tu suis {home} – {away}", "You'll get kick-off, goal and full-time alerts.": "Tu recevras les alertes coup d'envoi, buts et fin de match.",
  "Kick-off: {home} – {away}": "Coup d'envoi : {home} – {away}", "The match has started.": "Le match a commencé.", "⚽ Goal {team}!": "⚽ But {team} !", "🟥 Red card — {team}": "🟥 Carton rouge : {team}",
  "Full time: {label}": "Fin de match : {label}", "Check your picks in History.": "Vérifie tes pronos dans l'Historique.", "Tracking “{title}”": "Suivi de « {title} »",
  "{n} legs @ {o} — results are graded automatically.": "{n} sélections @ {o}, les résultats sont jugés automatiquement.", "❌ “{title}” lost": "❌ « {title} » perdu", "✅ “{title}” won!": "✅ « {title} » gagné !",
  "One or more legs failed.": "Une ou plusieurs sélections ont échoué.", "Paid @ {o}": "Payé @ {o}", "Couldn't reach the server — retrying.": "Serveur injoignable, nouvel essai…",

  // record page
  "The engine's record": "Le palmarès du moteur", "Every pick saved before kick-off, graded at full time. Nothing hidden.": "Chaque prono enregistré avant le coup d'envoi, jugé à la fin. Rien de caché.",
  "Profit curve": "Courbe de gain", "Cumulative units at flat 1u stakes": "Unités cumulées à mise fixe 1u", "Calibration": "Calibration", "What the engine said vs what happened": "Ce que le moteur annonçait vs ce qui s'est passé",
  "Predicted": "Annoncé", "Actual": "Réel", "games": "matchs", "Last {n} days": "{n} derniers jours", "Share this page": "Partager cette page",
  "The record starts filling from the first graded games. Come back after tonight's matches.": "Le palmarès se remplit avec les premiers matchs jugés. Reviens après les matchs de ce soir.",

  // league learning, coupons, top leagues
  "The model's record in this league": "Le bilan du modèle dans cette ligue",
  "The day's safest picks · football only · real bookmaker prices · checked by AI": "Les pronos les plus sûrs du jour · football uniquement · vraies cotes · vérifiés par l'IA",
  "The day's safest picks · football only · real bookmaker prices": "Les pronos les plus sûrs du jour · football uniquement · vraies cotes",
  "Football only · real bookmaker prices": "Football uniquement · vraies cotes",
  "{n} legs": "{n} sélections",
  "Top leagues": "Top ligues",
  "Picks here win more often than the engine expected": "Ici, les pronos passent plus souvent que prévu par le moteur",
  "Strong here · {w}/{n}": "Fort ici · {w}/{n}",
  "Picks here win less often than the engine expected": "Ici, les pronos passent moins souvent que prévu par le moteur",
  "Weak here": "Faible ici",
  "{n} days": "{n} jours",
  "Winning streak": "Série en cours",
  "Model-only picks have no bookmaker price (≈ odds), so they can't be bet at that price: {w}/{n} won, {u}u. Only “All picks” counts them.": "Les pronos « modèle seul » n'ont pas de cote bookmaker (≈ cote estimée), on ne peut donc pas les jouer à ce prix : {w}/{n} gagnés, {u}u. Seul « Tous les pronos » les compte.",
  "Where the model is strongest": "Là où le modèle est le plus fort",
  "Still learning — a league needs 8+ results and a clear edge to stand out.": "Apprentissage en cours — une ligue doit avoir 8 résultats ou plus et un net avantage pour ressortir.",
  "Leagues to avoid": "Ligues à éviter",
  "Weak leagues are left out of the coupon du jour.": "Les ligues faibles sont exclues du coupon du jour.",
  "Priced picks": "Pronos cotés",
  "All picks": "Tous les pronos",
  "Picks with a real bookmaker price: what you can actually bet": "Pronos avec une vraie cote bookmaker : ce que tu peux vraiment jouer",
  "Includes model-only picks without a bookmaker price": "Inclut les pronos « modèle seul » sans cote bookmaker",
  "Hit {a} · expected {b}": "Réussite {a} · attendu {b}",
  "Confidence": "Confiance",
  "What the engine learned about this league: its chances here are shifted by this much. Kept small until there are more results.": "Ce que le moteur a appris sur cette ligue : ses chances y sont décalées d'autant. L'écart reste faible tant qu'il n'y a pas plus de résultats.",
  "Learned shift {x} pts": "Ajustement appris {x} pts",
  "Priced ROI {x}": "ROI coté {x}",
  "{n} upcoming": "{n} à venir",
  "{n} leagues · {m} with upcoming picks": "{n} ligues · {m} avec des pronos à venir",
  "Search a league": "Chercher une ligue",
  "No league matches.": "Aucune ligue ne correspond.",
  "expected {x}": "attendu {x}",
  "from {when}": "dès {when}",
  "first results {date}": "premiers résultats {date}",
  "Strong": "Fort",
  "Neutral": "Neutre",
  "Weak": "Faible",
  "Learning": "En apprentissage",
  "In line with what the engine expected": "Conforme à ce que le moteur attendait",
  "Fewer than 8 results so far": "Moins de 8 résultats pour l'instant",
  "Strong league · {w}/{n}": "Ligue forte · {w}/{n}",

  // league learning, coupons, top leagues


  // league learning, coupons, top leagues


  // league learning, coupons, top leagues
  "Top picks": "Top pronos",
  "When one of the day's top 10 picks kicks off, and its result": "Quand un des 10 meilleurs pronos du jour commence, et son résultat",
  "🔥 Top pick #{n} live: {teams}": "🔥 Top prono #{n} en direct : {teams}",
  "✅ Top pick won: {teams}": "✅ Top prono gagné : {teams}",
  "❌ Top pick lost: {teams}": "❌ Top prono perdu : {teams}",
  "↩️ Top pick void: {teams}": "↩️ Top prono remboursé : {teams}",
  "One of the day's top 10 picks": "Un des 10 meilleurs pronos du jour",
  "Top pick #{n}": "Top prono #{n}",
  "On track": "En bonne voie",
  "At risk": "En danger",
  "Void for now": "Remboursé pour l'instant",
  "{n} of the day's top picks are live — they're highlighted and shown first.": "{n} des meilleurs pronos du jour sont en direct — mis en avant et affichés en premier.",

  // league learning, coupons, top leagues
  "Best live pick": "Meilleur prono en direct",
  "Live leagues": "Ligues en direct",
  "All live": "Tout le direct",
  "Tap a league to see its picks": "Touche une ligue pour voir ses pronos",
  "No results in this window yet.": "Pas encore de résultats sur cette période.",

  // engine notes & basis
  "Market moved toward {side} ({from} → {to}).": "La cote a bougé vers {side} ({from} → {to}).",
  "No bookmaker prices yet — probabilities come from the league table and form only.": "Pas encore de cotes de bookmaker : les probabilités viennent du classement et de la forme seulement.",
  "Red card in this match.": "Carton rouge dans ce match.",
  "league table": "classement", "league average": "moyenne du championnat", "form": "forme", "ratings": "niveau des équipes", "odds (de-vigged)": "cotes (sans la marge)",
  "trained model": "modèle entraîné", "trained model (few games)": "modèle entraîné (peu de matchs)",
  "No bookmaker prices yet — probabilities come from the trained strength model (both clubs' learnt attack and defence).": "Pas encore de cotes de bookmaker : les probabilités viennent du modèle de niveau entraîné (attaque et défense apprises des deux clubs).",
  // redesign (home, VIP builds, menu, snow, music)
  "Safest · ~2.00 odds": "Le plus sûr · cote ~2,00",
  "The combination with the best chance of landing · every sport · real bookmaker prices · checked by AI": "La combinaison qui a le plus de chances de passer · tous les sports · vraies cotes · vérifiée par l'IA",
  "The combination with the best chance of landing · every sport · real bookmaker prices": "La combinaison qui a le plus de chances de passer · tous les sports · vraies cotes",
  "x100 · {chance}": "x100 · {chance}",
  "Same day · every sport · real bookmaker prices": "Même jour · tous les sports · vraies cotes",
  "x100 · {n} legs": "x100 · {n} sélections",
  "Best chance at each odds · real prices": "La meilleure chance à chaque cote · vraies cotes",
  "Today's games are over — next builds tomorrow morning": "Les matchs du jour sont finis — prochains combinés demain matin",
  "Ambience": "Ambiance", "The music is Spotify's official Juice WRLD player: press play in it. Full songs for Spotify listeners, 30-second previews otherwise.": "La musique est le lecteur officiel Spotify de Juice WRLD : appuie sur lecture. Titres complets pour les abonnés Spotify, extraits de 30 secondes sinon.",
  "pick.won": "Gagné", "pick.lost": "Perdu", "pick.void": "Remboursé",
  "VIP builds": "Combinés VIP",
  "Home": "Accueil",
  "Picks": "Pronos",
  "VIP": "VIP",
  "Menu": "Menu",
  "Music": "Musique",
  "Turn the music off": "Couper la musique",
  "Play Juice WRLD": "Écouter Juice WRLD",
  "Falling snow": "Neige qui tombe",
  "Juice WRLD music (Spotify player)": "Musique Juice WRLD (lecteur Spotify)",
  "Every pick posted before kickoff. Every result public.": "Chaque prono publié avant le coup d'envoi. Chaque résultat public.",
  "Weekend": "Week-end",
  "TOP PICKS": "TOP PRONOS",
  "local times": "heures locales",
  "No top pick is playing right now.": "Aucun top prono en cours pour l'instant.",
  "No strong priced pick for this day yet — prices usually appear 1–2 days before kick-off.": "Pas encore de prono solide coté pour ce jour — les cotes sortent en général 1 à 2 jours avant le match.",
  "See all picks": "Voir tous les pronos",
  "COUPON DU JOUR": "COUPON DU JOUR",
  "EXPRESS BUILDS": "COMBINÉS EXPRESS",
  "same day": "même jour",
  "High odds": "Grosses cotes",
  "{n} selections": "{n} sélections",
  "Being built…": "En préparation…",
  "Not enough games today": "Pas assez de matchs aujourd'hui",
  "Live grosse cote": "Grosse cote live",
  "Built from the {n} games in play": "Construite avec les {n} matchs en cours",
  "Opens when games are in play": "S'ouvre quand des matchs sont en cours",
  "Join the free WhatsApp channel": "Rejoins la chaîne WhatsApp gratuite",
  "Picks and coupons before kickoff": "Pronos et coupons avant le coup d'envoi",
  "Join now": "Rejoindre",
  "Get the picks before kickoff": "Reçois les pronos avant le coup d'envoi",
  "Alerts for the coupon du jour, the top picks and your matches": "Alertes pour le coupon du jour, les top pronos et tes matchs",
  "Turn on alerts": "Activer les alertes",
  "Bonus code": "Code bonus",
  "1xBet promo and sign-up link": "Promo 1xBet et lien d'inscription",
  "18+ only. No pick is guaranteed. Bet responsibly.": "18+ uniquement. Aucun prono n'est garanti. Pariez de façon responsable.",
  "Win rate ({d} days)": "Taux de réussite ({d} jours)",
  "{w} of {n} top picks": "{w} sur {n} top pronos",
  "flat stakes at the listed odds": "mise fixe à la cote affichée",
  "units": "unités",
  "1 unit per pick": "1 unité par prono",
  "Last 10": "10 derniers",
  "Model {m}% vs odds {o}%": "Modèle {m} % vs cote {o} %",
  "1 unit": "1 unité",
  "{n} units": "{n} unités",
  "hit chance": "chance de passer",
  "Safest legs of the day, real prices": "Les sélections les plus sûres du jour, vraies cotes",
  "YESTERDAY'S RESULTS": "RÉSULTATS D'HIER",
  "Express x12.5": "Express x12,5",
  "Express x100": "Express x100",
  "Express x200": "Express x200",
  "Express x300/400": "Express x300/400",
  "Express x300 / 400": "Express x300 / 400",
  "Every build keeps the combination with the best chance at its odds · real bookmaker prices": "Chaque combiné garde la combinaison qui a le plus de chances à sa cote · vraies cotes de bookmaker",
  "~2.00 · safest legs of the day": "~2,00 · les sélections les plus sûres du jour",
  "Medium · same day": "Moyen · même jour",
  "Grosse cote du jour · same day": "Grosse cote du jour · même jour",
  "High odds · same day": "Grosses cotes · même jour",
  "Today's remaining games can't reach the full target with real prices: this is the closest build.": "Les matchs restants aujourd'hui n'atteignent pas toute la cote visée avec de vraies cotes : voici le combiné le plus proche.",
  "Not published yet today.": "Pas encore publié aujourd'hui.",
  "Any target, any window — another combination on demand": "N'importe quelle cote, n'importe quelle période — une autre combinaison à la demande",
  "Long odds land rarely: a x100 build wins about 1 time in 100 even when every leg is priced right. Stake small, flat, and never chase. 18+.": "Les grosses cotes passent rarement : un combiné x100 gagne environ 1 fois sur 100 même quand chaque sélection est bien cotée. Mise petite et fixe, ne cours jamais après tes pertes. 18+.",
  "Couldn't load the live grosse cote.": "Impossible de charger la grosse cote live.",
  "Live x{t}": "Live x{t}",
  "{n} games in play · refreshes every 30 s": "{n} matchs en cours · mise à jour toutes les 30 s",
  "Live prices are estimates (≈): no free feed carries in-play odds. Take a leg on 1xBet only at or above the shown odds — they move every minute.": "Les cotes live sont des estimations (≈) : aucun flux gratuit ne donne les cotes en direct. Prends une sélection sur 1xBet uniquement à la cote affichée ou mieux — elles bougent chaque minute.",
  "Another combination": "Une autre combinaison",
  "The games in play can't build x{t} right now. Try a lower target.": "Les matchs en cours ne permettent pas un x{t} pour l'instant. Essaie une cote plus basse.",
  "No game the engine follows is in play right now.": "Aucun match suivi par le moteur n'est en cours.",
  // NFL model
  "NFL score model (key numbers)": "modèle de scores NFL (nombres clés)", "Elo ratings": "classement Elo", "points & yards per play": "points & yards par jeu",
  "Expected score (model)": "Score attendu (modèle)", "Points line": "Ligne de points", "Moneyline": "vainqueur", "Opening moneyline": "Vainqueur à l'ouverture",
  "Spread": "Handicap (spread)", "Skii line": "Ligne Skii", "Points still expected": "Points encore attendus",
  "Skii's own line: {team} {line} (market {market}) — a gap this size has not beaten the closing line historically.": "Ligne Skii : {team} {line} (marché {market}) — un tel écart n'a pas battu la cote de clôture par le passé.",
  "{team} comes off a bye week.": "{team} sort d'une semaine de repos.", "{team} plays on a short week.": "{team} joue après une semaine courte.",
  "Preseason game: starters sit, so Skii doesn't price it.": "Match de pré-saison : les titulaires sont au repos, Skii ne le cote pas.",
  "Playoff game: overtime until someone wins (no ties).": "Match de play-offs : prolongation jusqu'à la victoire (pas de nul).",
  "No bookmaker prices yet — the line comes from Skii's NFL strength model only.": "Pas encore de cotes de bookmaker : la ligne vient du modèle NFL de Skii seulement.",
  "NFL model: a score grid trained on ten seasons of results against the closing lines (key numbers 3, 7, 10, 14) plus overtime and ties. The game's margin and total come from the bookmaker's moneyline, spread and total; every other market is priced from the grid. Skii's own line (Elo, points, yards per play, turnovers, rest) is shown next to the market's.":
    "Modèle NFL : une grille de scores entraînée sur dix saisons de résultats face aux cotes de clôture (nombres clés 3, 7, 10, 14), plus la prolongation et les nuls. L'écart et le total du match viennent du vainqueur, du handicap et du total du bookmaker ; tous les autres marchés sont calculés depuis la grille. La ligne Skii (Elo, points, yards par jeu, pertes de balle, repos) est affichée à côté de celle du marché.",
  "First downs": "Premiers essais", "Plays": "Jeux", "Total yards": "Yards au total", "Yards per play": "Yards par jeu", "Passing yards": "Yards à la passe", "Rushing yards": "Yards à la course",
  // hockey model
  "hockey strength model": "modèle hockey (forces)", "shot volumes": "volumes de tirs", "rest days": "jours de repos",
  "No bookmaker prices yet — probabilities come from the hockey strength model only.": "Pas encore de cotes de bookmaker : les probabilités viennent du modèle hockey seulement.",
  "{team} plays on back-to-back nights.": "{team} joue deux soirs de suite.",
  "The results feed gives final scores only: 60-minute and overtime markets are shown for information, never picked.": "Le flux de résultats ne donne que le score final : les marchés temps réglementaire et prolongation sont affichés pour information, jamais choisis.",
  "No team data yet (prices, goals, ratings): league averages only — treat as a coin flip.": "Pas encore de données d'équipe (cotes, buts, niveau) : moyennes du championnat seulement — à considérer comme un pile ou face.",
  "Playoff game: tighter scoring, overtime until a goal (no shootout).": "Match de play-offs : moins de buts, prolongation jusqu'au but (pas de tirs au but).",
  "Live win probability · {label}": "Probabilité de victoire live · {label}", "{label} re-pricing": "Recalcul · {label}", "Goes to overtime (final)": "Prolongation (final)",
  "Hockey model: regulation goals (Poisson, trained on five NHL seasons) + overtime and shootout. Probabilities are calibrated to the market where it has prices; the pick is the market with the best balance of hit chance and price (minimum ~1.20).":
    "Modèle hockey : buts du temps réglementaire (Poisson, entraîné sur cinq saisons de NHL) + prolongation et tirs au but. Les probabilités sont calées sur le marché quand il a des cotes ; le prono est le marché au meilleur équilibre chance/cote (minimum ~1,20).",
  "Shots": "Tirs", "Hits": "Mises en échec", "Blocked shots": "Tirs bloqués", "Power-play goals": "Buts en supériorité", "Power plays": "Supériorités", "Faceoffs won": "Mises au jeu gagnées", "Penalty minutes": "Minutes de pénalité", "Giveaways": "Revirements", "Takeaways": "Interceptions",

  // legal
  "Responsible gambling": "Jeu responsable", "Privacy policy": "Politique de confidentialité", "Terms of use": "Conditions d'utilisation",
  "I'm 18 or older": "J'ai 18 ans ou plus", "Leave": "Quitter",
  "Skii Pronos is for adults only. Betting involves risk: never stake money you can't afford to lose.": "Skii Pronos est réservé aux adultes. Parier comporte des risques : ne mise jamais de l'argent que tu ne peux pas te permettre de perdre.",
};

// English keys are the strings themselves; a few short keys need their own English (one key, two
// meanings: a single pick "Won" vs the "Won" column of a table)
const en = { "pick.won": "Won", "pick.lost": "Lost", "pick.void": "Void" };

export const DICT = { fr, en };

export function translate(lang, key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// Market labels are generated in English by the model; translate the common shapes.
const MARKET_FR = [
  // NFL
  [/^(.+) over (\S+) pts$/, "$1 plus de $2 points"], [/^(.+) under (\S+) pts$/, "$1 moins de $2 points"],
  [/^(.+) by (\d+)-(\d+)$/, "$1 par $2 à $3 points"], [/^(.+) by 13\+$/, "$1 par 13 points ou plus"], [/^Odd total$/, "Total impair"], [/^Even total$/, "Total pair"],
  // hockey
  [/^(.+) win \(60 min\)$/, "Victoire $1 (temps réglementaire)"], [/^Tie \(60 min\)$/, "Nul (temps réglementaire)"], [/^(.+) or tie \(60 min\)$/, "$1 ou nul (temps réglementaire)"],
  [/^Goes to overtime$/, "Prolongation"], [/^Decided in regulation$/, "Décidé dans le temps réglementaire"], [/^Correct score (\S+) \(60 min\)$/, "Score exact $1 (temps réglementaire)"],
  [/^(.+) wins period 1$/, "$1 gagne la 1re période"], [/^Period 1 tied$/, "1re période nulle"], [/^Over (\S+) in period 1$/, "Plus de $1 buts en 1re période"], [/^Under (\S+) in period 1$/, "Moins de $1 buts en 1re période"],
  [/^(.+) win \(HT\)$/, "Victoire $1 (mi-temps)"], [/^Draw \(HT\)$/, "Nul (mi-temps)"], [/^(.+) \/ (.+) \(HT\/FT\)$/, "$1 / $2 (MT/FT)"],
  [/^(.+) scores first$/, "$1 marque en premier"], [/^(.+) scores last$/, "$1 marque en dernier"], [/^No goal$/, "Aucun but"],
  [/^Exactly (\d+) goals$/, "Exactement $1 buts"], [/^5\+ goals$/, "5 buts ou plus"], [/^Odd goals$/, "Total de buts impair"], [/^Even goals$/, "Total de buts pair"],
  [/^(.+) by 3\+$/, "$1 par 3 buts ou plus"], [/^(.+) by (\d)$/, "$1 par $2 but(s)"], [/^Correct score (\S+)$/, "Score exact $1"],
  [/^(.+) win \(incl\. OT & SO\)$/, "Victoire $1 (prol. et t.a.b. inclus)"], [/^(.+) win \(incl\. OT\)$/, "Victoire $1 (prol. incluse)"],
  [/^Over (\S+) pts$/, "Plus de $1 points"], [/^Under (\S+) pts$/, "Moins de $1 points"],
  [/^(.+) win \(incl\. OT & SO\)$/, "Victoire $1 (prol. et t.a.b. inclus)"], [/^(.+) win \(incl\. OT\)$/, "Victoire $1 (prol. incluse)"],
  [/^Over (\S+) pts$/, "Plus de $1 points"], [/^Under (\S+) pts$/, "Moins de $1 points"],
  [/^(.+) win \(incl\. OT & SO\)$/, "Victoire $1 (prol. et t.a.b. inclus)"], [/^(.+) win \(incl\. OT\)$/, "Victoire $1 (prol. incluse)"],
  [/^Over (\S+) pts$/, "Plus de $1 points"], [/^Under (\S+) pts$/, "Moins de $1 points"],
  [/^(.+) win \(incl\. OT & SO\)$/, "Victoire $1 (prol. et t.a.b. inclus)"], [/^(.+) win \(incl\. OT\)$/, "Victoire $1 (prol. incluse)"],
  [/^Over (\S+) pts$/, "Plus de $1 points"], [/^Under (\S+) pts$/, "Moins de $1 points"],
  [/^(.+) win \(incl\. OT & SO\)$/, "Victoire $1 (prol. et t.a.b. inclus)"], [/^(.+) win \(incl\. OT\)$/, "Victoire $1 (prol. incluse)"],
  [/^Over (\S+) pts$/, "Plus de $1 points"], [/^Under (\S+) pts$/, "Moins de $1 points"],
  [/^(.+) win & over (\S+)$/, "Victoire $1 & plus de $2"], [/^(.+) or draw & under (\S+)$/, "$1 ou nul & moins de $2"],
  [/^(.+) win$/, "Victoire $1"], [/^Draw$/, "Match nul"], [/^(.+) or draw$/, "$1 ou nul"], [/^No draw$/, "Pas de nul"],
  [/^(.+) \(DNB\)$/, "$1 (remb. si nul)"], [/^Over (\S+)$/, "Plus de $1 buts"], [/^Under (\S+)$/, "Moins de $1 buts"],
  [/^BTTS — Yes$/, "Les deux marquent : oui"], [/^BTTS — No$/, "Les deux marquent : non"], [/^(.+) over (\S+)$/, "$1 plus de $2 but(s)"],
  [/^(.+) clean sheet$/, "$1 sans encaisser"], [/^(.+) under (\S+)$/, "$1 moins de $2 but(s)"], [/^Double Chance 1X.*$/, "Double chance 1X"],
];
const GROUP_FR = { "1X2": "1X2", "Double chance": "Double chance", "Draw no bet": "Remboursé si nul", "Goals": "Buts", "Both teams score": "Les deux équipes marquent",
  "Team goals": "Buts par équipe", "Clean sheet": "Sans encaisser", "Combo": "Combiné", "Handicap": "Handicap", "Winner": "Vainqueur", "Correct score": "Score exact", "Winning margin": "Écart de buts", "Victory margin": "Écart de victoire", "Odd/Even": "Pair/Impair", "Exact goals": "Nombre exact de buts", "First goal": "Premier à marquer", "Last goal": "Dernier à marquer", "Half-time": "Mi-temps", "Half-time/Full-time": "Mi-temps/Fin de match", "Total": "Total", "Spread": "Écart",
  "Regulation time": "Temps réglementaire", "Team points": "Points par équipe", "Puck line": "Puck line (handicap)", "Overtime": "Prolongation", "Period 1": "1re période" };

export function marketLabel(lang, label) {
  if (lang !== "fr" || !label) return label;
  for (const [re, out] of MARKET_FR) if (re.test(label)) return label.replace(re, out);
  return label;
}
// "DraftKings odds (de-vigged) + league table + form" → French, part by part.
export function basisLabel(lang, basis) {
  if (lang !== "fr" || !basis) return basis;
  return basis.split(" + ").map((part) => {
    const m = part.match(/^(.+?) odds \(de-vigged\)$/);
    if (m) return `${m[1]} ${translate("fr", "odds (de-vigged)")}`;
    return translate("fr", part);
  }).join(" + ");
}
export function noteText(lang, n) {
  return typeof n === "string" ? n : translate(lang, n.k, n.v);
}
export function marketGroup(lang, group) {
  return lang === "fr" ? GROUP_FR[group] || group : group;
}
