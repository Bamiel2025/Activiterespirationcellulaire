/* =========================================================================
   L'énergie des muscles — application autonome
   Le bundle three.js est chargé par le script précédent (THREE, OrbitControls,
   CSS2DObject, CSS2DRenderer sont des constantes globales). On s'isole ici
   dans une IIFE pour ne jamais redéclarer ces identifiants.
   ========================================================================= */
(function () {
  "use strict";

  /* ======================= 1. NAVIGATION ================================ */
  const onglets = Array.from(document.querySelectorAll("#onglets .onglet"));
  const panneaux = Array.from(document.querySelectorAll(".panneau"));
  let redimensionner3D = null;

  function activerOnglet(nom) {
    onglets.forEach(b => b.classList.toggle("actif", b.dataset.onglet === nom));
    panneaux.forEach(p => p.classList.toggle("actif", p.id === "panneau-" + nom));
    if (nom === "3d" && redimensionner3D) requestAnimationFrame(redimensionner3D);
    /* Recalcule les compteurs dès que la fiche élève devient visible : la
       largeur du textarea n'est mesurable que lorsqu'elle est à l'écran. */
    if (nom === "activite") requestAnimationFrame(mettreAJourCompteurs);
  }
  onglets.forEach(b => b.addEventListener("click", () => activerOnglet(b.dataset.onglet)));

  /* ======================= 2. VERROU ENSEIGNANT ======================== */
  const CODE = "2027";
  const modal = document.getElementById("verrou");
  const inputCode = document.getElementById("code-verrou");
  const erreurCode = document.getElementById("erreur-verrou");
  let profDebloque = false;

  function revelerTout() {
    [
      ["tpl-corrige", "zone-corrige", "accroche-corrige"],
      ["tpl-prof", "zone-prof", "accroche-prof"]
    ].forEach(([idTemplate, idZone, idAccroche]) => {
      const zone = document.getElementById(idZone);
      const modele = document.getElementById(idTemplate);
      if (modele && !zone.dataset.rempli) {
        zone.appendChild(modele.content.cloneNode(true));
        zone.dataset.rempli = "1";
      }
      zone.classList.add("visible");
      const accroche = document.getElementById(idAccroche);
      if (accroche) accroche.style.display = "none";
    });
    initialiserProf();
  }

  function fermerVerrou() {
    modal.classList.remove("visible");
    erreurCode.style.display = "none";
    inputCode.value = "";
  }

  function validerCode() {
    if (inputCode.value.trim() === CODE) {
      profDebloque = true;
      fermerVerrou();
      revelerTout();
    } else {
      erreurCode.style.display = "block";
      inputCode.value = "";
      inputCode.focus();
    }
  }

  document.querySelectorAll("[data-deverrouiller]").forEach(bouton => {
    bouton.addEventListener("click", () => {
      if (profDebloque) { revelerTout(); return; }
      modal.classList.add("visible");
      erreurCode.style.display = "none";
      inputCode.value = "";
      setTimeout(() => inputCode.focus(), 30);
    });
  });
  document.getElementById("valider-verrou").addEventListener("click", validerCode);
  document.getElementById("annuler-verrou").addEventListener("click", fermerVerrou);
  inputCode.addEventListener("keydown", e => { if (e.key === "Enter") validerCode(); });
  modal.addEventListener("click", e => { if (e.target === modal) fermerVerrou(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("visible")) fermerVerrou();
  });

  /* ======================= 3. BILAN INTERACTIF ========================= */
  const bonnes = {
    b1: "glucose", b2: "dioxygene", b3: "co2", b4: "eau",
    b5: "energie", b6: "cellules", b7: "transport"
  };
  const resultatBilan = document.getElementById("resultat-bilan");
  const traceEcrite = document.getElementById("trace-ecrite");

  document.getElementById("btn-verifier-bilan").addEventListener("click", () => {
    let score = 0;
    Object.keys(bonnes).forEach(id => {
      const select = document.getElementById(id);
      select.classList.remove("bon", "faux");
      if (select.value === bonnes[id]) { select.classList.add("bon"); score++; }
      else select.classList.add("faux");
    });
    resultatBilan.textContent = score === 7
      ? "✓ 7 / 7 — le bilan est exact."
      : score + " / 7 — corrige les cases rouges, puis vérifie à nouveau.";
    resultatBilan.style.color = score === 7 ? "#15803d" : "#b45309";
    traceEcrite.classList.add("visible");
  });

  document.getElementById("btn-reset-bilan").addEventListener("click", () => {
    Object.keys(bonnes).forEach(id => {
      const select = document.getElementById(id);
      select.value = "";
      select.classList.remove("bon", "faux");
    });
    resultatBilan.textContent = "";
    traceEcrite.classList.remove("visible");
  });

  /* ======================= 4. COPIE ÉLÈVE =============================== */
  const CLE = "energie_muscles_3e_v2";
  const champs = Array.from(document.querySelectorAll("[data-sauvegarde]"));
  const etatSauvegarde = document.getElementById("etat-sauvegarde");
  const textareas = Array.from(document.querySelectorAll("textarea.reponse"));
  const canvasMesure = document.createElement("canvas");
  const contexteMesure = canvasMesure.getContext("2d");
  let minuterie = null;

  function charger() {
    /* L'activité doit être vierge à chaque connexion : on ne restaure rien
       et on purge toute ancienne copie mémorisée sur l'appareil. */
    try { localStorage.removeItem(CLE); } catch (e) {}
    champs.forEach(champ => {
      if (champ.type === "checkbox") champ.checked = false;
      else champ.value = "";
    });
  }

  function sauvegarder() {
    /* Pas de persistance entre connexions : la copie reste vierge au prochain
       chargement. On supprime aussi toute donnée résiduelle. */
    try { localStorage.removeItem(CLE); } catch (e) {}
    etatSauvegarde.textContent = "Copie non enregistrée entre les connexions";
  }

  /* Compte les lignes réellement occupées à l'écran (utile pour la consigne
     « 10 à 15 lignes » de la question 3).
     Piège : quand le panneau est masqué — c'est le cas de l'aperçu ouvert
     depuis la Fiche professeur — clientWidth vaut 0 et CHAQUE MOT serait
     compté comme une ligne (185 au lieu de 11). On mémorise donc la dernière
     largeur mesurée à l'écran et on la réutilise hors écran. */
  const largeursMesurees = new WeakMap();
  function largeurUtile(zone) {
    const style = getComputedStyle(zone);
    const brut = zone.clientWidth
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 6;
    if (brut > 80) { largeursMesurees.set(zone, brut); return brut; }
    return largeursMesurees.get(zone) || 700;
  }

  function compterLignes(zone) {
    if (!zone.value.trim()) return 0;
    const style = getComputedStyle(zone);
    contexteMesure.font = style.fontSize + " " + style.fontFamily;
    const largeur = largeurUtile(zone);
    let total = 0;
    zone.value.split("\n").forEach(paragraphe => {
      if (!paragraphe.trim()) { total += 1; return; }
      let lignes = 1;
      let courant = "";
      paragraphe.split(/\s+/).forEach(mot => {
        if (!mot) return;
        const essai = courant ? courant + " " + mot : mot;
        if (courant && contexteMesure.measureText(essai).width > largeur) {
          lignes++;
          courant = mot;
        } else courant = essai;
      });
      total += lignes;
    });
    return total;
  }

  function mettreAJourCompteurs() {
    textareas.forEach(zone => {
      const afficheur = document.querySelector('[data-compteur="' + zone.dataset.lignes + '"]');
      if (!afficheur) return;
      const n = compterLignes(zone);
      const longue = zone.classList.contains("longue");
      afficheur.textContent = longue
        ? n + " ligne" + (n > 1 ? "s" : "") + " · objectif 10 à 15 lignes"
        : n + " ligne" + (n > 1 ? "s" : "");
      afficheur.style.color = longue && n >= 10 && n <= 15 ? "#15803d" : "";
      afficheur.style.fontWeight = longue && n >= 10 && n <= 15 ? "700" : "";
    });
  }

  champs.forEach(champ => {
    champ.addEventListener("input", () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(sauvegarder, 350);
      if (champ.tagName === "TEXTAREA") mettreAJourCompteurs();
    });
  });
  window.addEventListener("resize", mettreAJourCompteurs);

  function nettoyerNom(texte) {
    return (texte || "").trim().replace(/[^A-Za-z0-9À-ÿ_-]+/g, "_").slice(0, 40);
  }

  document.getElementById("btn-export").addEventListener("click", () => {
    const nom = document.getElementById("nom").value;
    const prenom = document.getElementById("prenom").value;
    const classe = document.getElementById("classe").value;
    const lignes = [
      "L'ÉNERGIE DES MUSCLES — La respiration cellulaire",
      "SVT 3e · Cycle 4 · Activité d'investigation (20 points)",
      "Nom : " + (nom || "…………"), "Prénom : " + (prenom || "…………"),
      "Classe : " + (classe || "……"),
      "",
      "QUESTION 1 — Comparer et interpréter (4 pts · D4.2)",
      "---------------------------------------------------",
      document.getElementById("q1").value || "(non renseigné)",
      "",
      "QUESTION 2 — Expliquer et modéliser (6 pts · D4.1)",
      "---------------------------------------------------",
      document.getElementById("q2").value || "(non renseigné)",
      "",
      "QUESTION 3 — Rédiger, 10 à 15 lignes (8 pts + 2 MDL · D1.3)",
      "---------------------------------------------------",
      document.getElementById("q3").value || "(non renseigné)",
      "",
      "Auto-évaluation avant de rendre :"
    ];
    ["c1", "c2", "c3", "c4"].forEach((id, i) => {
      const libelles = [
        "J'ai répondu aux trois questions.",
        "J'ai utilisé les cinq mots imposés.",
        "J'ai cité au moins une valeur d'un document.",
        "J'ai relu l'orthographe et la ponctuation."
      ];
      lignes.push((document.getElementById(id).checked ? "[x] " : "[ ] ") + libelles[i]);
    });
    const blob = new Blob([lignes.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = "Energie_des_muscles_" + (nettoyerNom(nom) || "eleve")
      + (nettoyerNom(prenom) ? "_" + nettoyerNom(prenom) : "") + ".txt";
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById("btn-effacer").addEventListener("click", () => {
    if (!window.confirm("Effacer toutes les réponses enregistrées sur cet appareil ?")) return;
    champs.forEach(champ => {
      if (champ.type === "checkbox") champ.checked = false;
      else champ.value = "";
    });
    sauvegarder();
    mettreAJourCompteurs();
  });

  /* Impression : le contenu des textarea est recopié dans des blocs imprimables. */
  function preparerImpression() {
    textareas.forEach(zone => {
      const ancien = zone.parentElement.querySelector(".impression-reponse");
      if (ancien) ancien.remove();
      const bloc = document.createElement("div");
      bloc.className = "impression-reponse" + (zone.classList.contains("longue") ? " longue" : "");
      bloc.textContent = zone.value || "";
      zone.parentElement.insertBefore(bloc, zone.nextSibling);
    });
  }
  function nettoyerImpression() {
    document.querySelectorAll(".impression-reponse").forEach(bloc => bloc.remove());
  }
  window.addEventListener("beforeprint", preparerImpression);
  window.addEventListener("afterprint", nettoyerImpression);
  ["btn-imprimer", "btn-imprimer-2"].forEach(id => {
    document.getElementById(id).addEventListener("click", () => {
      preparerImpression();
      window.print();
    });
  });

  charger();
  mettreAJourCompteurs();

  /* ======================================================================
     4 bis. EXPORT DE LA COPIE VERS LE GOOGLE SHEET DU PROFESSEUR
     ----------------------------------------------------------------------
     Aucun compte, aucune inscription, aucune plateforme : l'élève saisit
     seulement nom / prénom / classe. Le pont réutilise la méthode éprouvée
     du projet ODS (fetch text/plain pour éviter le preflight, repli no-cors
     quand Apps Script ne renvoie pas d'en-tête CORS lisible, jeton partagé,
     identifiant de copie stable pour dédoublonner côté Sheet).

     L'analyse automatique est calculée ici, dans le navigateur, par le module
     pur correction.js. Le Sheet la reçoit, l'affiche et construit les
     graphiques : une seule source de vérité côté client, aucun calcul dupliqué.
     ====================================================================== */
  const CLE_CONFIG = "energie_muscles_sheets_v1";
  const FORMAT_ENVOI = "energie-muscles-v1";
  let profInitialise = false;
  let envoiEnCours = false;

  const etatEnvoi = document.getElementById("etat-envoi");
  const panneauConfirmation = document.getElementById("confirmation-envoi");
  const boutonNouvelleCopie = document.getElementById("btn-nouvelle-copie");

  function afficherEtat(message, classe) {
    etatEnvoi.textContent = message;
    etatEnvoi.className = classe || "";
  }
  function cfgEtat(message, classe) {
    const zone = document.getElementById("cfg-etat");
    if (!zone) return;
    zone.textContent = message;
    zone.className = classe || "";
  }

  function configurationEmbarquee() {
    const lire = nom => {
      const m = document.querySelector('meta[name="' + nom + '"]');
      return m ? m.content.trim() : "";
    };
    return { url: lire("sheet-url"), jeton: lire("sheet-jeton") || "respiration-2027" };
  }

  /* La configuration saisie par le professeur (code 2027) est prioritaire
     sur celle intégrée au fichier distribué aux élèves. */
  function obtenirConfig() {
    const base = configurationEmbarquee();
    try {
      const sauve = JSON.parse(localStorage.getItem(CLE_CONFIG) || "null");
      if (sauve && typeof sauve === "object") {
        const url = (sauve.url && String(sauve.url).trim()) ? String(sauve.url).trim() : base.url;
        const jeton = (sauve.jeton && String(sauve.jeton).trim()) ? String(sauve.jeton).trim() : base.jeton;
        return { url: url, jeton: jeton };
      }
    } catch (e) { /* localStorage indisponible : config embarquée */ }
    return base;
  }

  function sauverConfig(url, jeton) {
    try {
      localStorage.setItem(CLE_CONFIG, JSON.stringify({ url: url, jeton: jeton }));
      return true;
    } catch (e) { return false; }
  }

  function lireChamp(id) {
    const e = document.getElementById(id);
    return e ? String(e.value || "").trim() : "";
  }

  function scoreBilan() {
    let score = 0;
    Object.keys(bonnes).forEach(id => {
      const select = document.getElementById(id);
      if (select && select.value === bonnes[id]) score++;
    });
    return score;
  }

  function donneesCopie() {
    return {
      q1: lireChamp("q1"), q2: lireChamp("q2"), q3: lireChamp("q3"),
      lignes: compterLignes(document.getElementById("q3")),
      bilanScore: scoreBilan()
    };
  }

  /* On n'envoie QUE nom / prénom / classe et les réponses. L'identifiant de
     dédoublonnage et l'horodatage sont calculés par le Google Sheet : une
     seule règle de normalisation de la classe (« 3e B » = « 3°B » = « 3B »),
     aucune donnée de l'appareil, aucun risque de divergence client/serveur. */
  function construireCopie() {
    const d = donneesCopie();
    return {
      nom: lireChamp("nom"), prenom: lireChamp("prenom"), classe: lireChamp("classe"),
      q1: d.q1, q2: d.q2, q3: d.q3,
      bilanScore: d.bilanScore,
      autoEvaluation: {
        c1: document.getElementById("c1").checked,
        c2: document.getElementById("c2").checked,
        c3: document.getElementById("c3").checked,
        c4: document.getElementById("c4").checked
      },
      analyse: window.Correction.analyser(d)
    };
  }

  function traduireErreurGoogle(texte, statut) {
    if (!texte || texte.charAt(0) !== "<") {
      return "Réponse illisible du Google Sheet (HTTP " + statut + "). Vérifie le déploiement en « Application web ».";
    }
    const plat = texte.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
    if (plat.indexOf("fonction de script introuvable") >= 0 || plat.indexOf("script function not found") >= 0)
      return "Le script déployé ne contient pas encore Code.gs : colle-le dans Extensions > Apps Script, puis redéploie une NOUVELLE version.";
    if (plat.indexOf("n'a pas vérifié cette application") >= 0 || plat.indexOf("unverified app") >= 0)
      return "Le déploiement attend ton autorisation : ouvre une fois l'URL /exec, clique sur Avancé > Autoriser, puis réessaie.";
    if (plat.indexOf("autorisation") >= 0 || plat.indexOf("sign in") >= 0 || plat.indexOf("connexion") >= 0)
      return "Le script refuse les appels anonymes : redéploie avec « Exécuter en tant que : Moi » et « Qui a accès : Tout le monde ».";
    return "Google a renvoyé une page d'erreur. Ouvre l'URL /exec dans un navigateur pour lire le message exact.";
  }

  /* Deux tentatives : réponse lisible si CORS le permet, sinon envoi opaque
     (la requête est bien transmise ; le Sheet dédoublonne grâce à id). */
  async function poster(charge, url) {
    const corps = JSON.stringify(charge);
    const entetes = { "Content-Type": "text/plain;charset=utf-8" };
    try {
      const reponse = await fetch(url, {
        method: "POST", headers: entetes, body: corps, redirect: "follow"
      });
      const texte = await reponse.text();
      try { return { lisible: true, donnees: JSON.parse(texte) }; }
      catch (e) {
        return { lisible: false, erreur: traduireErreurGoogle(texte, reponse.status) };
      }
    } catch (e) {
      try {
        await fetch(url, { method: "POST", mode: "no-cors", headers: entetes, body: corps });
        return { lisible: false, sansAccuse: true };
      } catch (e2) {
        return { lisible: false, erreur: "Envoi impossible : " + (e2 && e2.message ? e2.message : e2) };
      }
    }
  }

  function masquerConfirmation() {
    panneauConfirmation.classList.remove("visible");
  }

  function verifierAvantEnvoi() {
    const manquants = [];
    if (!lireChamp("nom")) manquants.push("ton nom");
    if (!lireChamp("prenom")) manquants.push("ton prénom");
    if (!lireChamp("classe")) manquants.push("ta classe");
    if (manquants.length) return "Renseigne " + manquants.join(", ") + " avant d'envoyer.";
    const d = donneesCopie();
    if (!d.q1 && !d.q2 && !d.q3) return "Écris au moins une réponse avant d'envoyer.";
    if (!obtenirConfig().url)
      return "L'envoi n'est pas configuré sur cet appareil : demande au professeur de renseigner l'URL de son Google Sheet.";
    return null;
  }

  async function effectuerEnvoi() {
    if (envoiEnCours) return;
    envoiEnCours = true;
    const bouton = document.getElementById("btn-confirmer-envoi");
    bouton.disabled = true;
    afficherEtat("Envoi en cours…", "");
    const cfg = obtenirConfig();
    const charge = {
      action: "append", token: cfg.jeton, format: FORMAT_ENVOI,
      copie: construireCopie()
    };
    /* Canaux de repli : si le réseau ou le Sheet échoue, la copie reste sur
       l'appareil (autosave) et l'export .txt permet de ne rien perdre. */
    const repli = " Ta copie reste enregistrée sur cet appareil : utilise « ⬇ Exporter ma copie (.txt) » pour ne rien perdre.";
    try {
      const resultat = await poster(charge, cfg.url);
      if (resultat.erreur) {
        afficherEtat("✗ " + resultat.erreur + repli, "erreur");
      } else if (!resultat.lisible) {
        afficherEtat("✓ Copie transmise. Vérifie avec le professeur qu'elle apparaît bien dans sa feuille (pas d'accusé de réception depuis ce navigateur).", "succes");
        boutonNouvelleCopie.style.display = "inline-block";
      } else if (resultat.donnees && resultat.donnees.ok === false) {
        afficherEtat("✗ " + (resultat.donnees.error || "Envoi refusé par le Google Sheet.") + repli, "erreur");
      } else {
        afficherEtat("✓ Copie envoyée au professeur.", "succes");
        boutonNouvelleCopie.style.display = "inline-block";
      }
    } catch (e) {
      afficherEtat("✗ " + (e && e.message ? e.message : e) + repli, "erreur");
    } finally {
      envoiEnCours = false;
      bouton.disabled = false;
      masquerConfirmation();
    }
  }

  document.getElementById("btn-envoyer").addEventListener("click", () => {
    const probleme = verifierAvantEnvoi();
    if (probleme) { afficherEtat("✗ " + probleme, "erreur"); return; }
    afficherEtat("", "");
    document.getElementById("conf-nom").textContent = lireChamp("nom");
    document.getElementById("conf-prenom").textContent = lireChamp("prenom");
    document.getElementById("conf-classe").textContent = lireChamp("classe");
    panneauConfirmation.classList.add("visible");
  });
  document.getElementById("btn-annuler-envoi").addEventListener("click", () => {
    masquerConfirmation(); afficherEtat("Envoi annulé.", "");
  });
  document.getElementById("btn-confirmer-envoi").addEventListener("click", effectuerEnvoi);

  /* effacement en deux clics, sans confirm() natif (qui bloque Chrome headless) */
  let confirmationEffacement = false;
  boutonNouvelleCopie.addEventListener("click", () => {
    if (!confirmationEffacement) {
      confirmationEffacement = true;
      boutonNouvelleCopie.textContent = "⚠ Confirmer l'effacement";
      afficherEtat("Clique encore pour effacer cette copie de l'appareil.", "");
      setTimeout(() => {
        confirmationEffacement = false;
        boutonNouvelleCopie.textContent = "🧹 Nouvelle copie";
      }, 6000);
      return;
    }
    confirmationEffacement = false;
    boutonNouvelleCopie.textContent = "🧹 Nouvelle copie";
    champs.forEach(champ => {
      if (champ.type === "checkbox") champ.checked = false;
      else champ.value = "";
    });
    sauvegarder();
    mettreAJourCompteurs();
    boutonNouvelleCopie.style.display = "none";
    afficherEtat("Copie effacée : tu peux commencer une nouvelle fiche.", "");
  });

  /* ---- Configuration et aperçu, réservés au professeur (code 2027) ---- */
  function initialiserProf() {
    if (profInitialise) return;
    const champUrl = document.getElementById("cfg-url");
    if (!champUrl) return;                 /* template pas encore injecté */
    profInitialise = true;
    const cfg = obtenirConfig();
    champUrl.value = cfg.url;
    document.getElementById("cfg-jeton").value = cfg.jeton;

    document.getElementById("btn-cfg-sauver").addEventListener("click", () => {
      const url = champUrl.value.trim();
      const jeton = document.getElementById("cfg-jeton").value.trim() || "respiration-2027";
      if (url && !/^https:\/\/script\.google\.com\//.test(url)) {
        cfgEtat("✗ L'URL doit commencer par https://script.google.com/ et se terminer par /exec.", "erreur");
        return;
      }
      const ok = sauverConfig(url, jeton);
      cfgEtat(ok
        ? "✓ Configuration enregistrée sur cet appareil. Pour les postes élèves, utilise _build/config.txt puis relance build.py."
        : "✗ Enregistrement impossible : utilise _build/config.txt puis relance build.py.",
        ok ? "succes" : "erreur");
    });

    document.getElementById("btn-cfg-test").addEventListener("click", async () => {
      const c = obtenirConfig();
      if (!c.url) { cfgEtat("✗ Renseigne d'abord l'URL /exec, puis clique sur Sauvegarder.", "erreur"); return; }
      cfgEtat("Test de connexion en cours…", "");
      const r = await poster({ action: "ping", token: c.jeton, format: FORMAT_ENVOI }, c.url);
      if (r.erreur) cfgEtat("✗ " + r.erreur, "erreur");
      else if (!r.lisible) cfgEtat("✓ Script contacté (réponse non lisible depuis ce navigateur) : ouvre ton Google Sheet pour confirmer la création des onglets.", "succes");
      else if (r.donnees && r.donnees.ok === false) cfgEtat("✗ " + (r.donnees.error || "Échec."), "erreur");
      else cfgEtat("✓ " + ((r.donnees && r.donnees.message) || "Connexion OK."), "succes");
    });

    /* Après une correction manuelle dans l'onglet « Copies », les onglets
       Synthese / Remediation ne se recalculent PAS tout seuls : ils sont
       reconstruits à chaque copie reçue. Ce bouton force le recalcul, sinon
       une copie validée à la main resterait affichée dans la remédiation
       jusqu'à la prochaine soumission d'élève. */
    document.getElementById("btn-cfg-regen").addEventListener("click", async () => {
      const c = obtenirConfig();
      if (!c.url) { cfgEtat("✗ Renseigne d'abord l'URL /exec, puis clique sur Sauvegarder.", "erreur"); return; }
      cfgEtat("Reconstruction de la synthèse en cours…", "");
      const r = await poster({ action: "synthese", token: c.jeton, format: FORMAT_ENVOI }, c.url);
      if (r.erreur) cfgEtat("✗ " + r.erreur, "erreur");
      else if (!r.lisible) cfgEtat("✓ Script contacté (réponse non lisible depuis ce navigateur) : ouvre ton Google Sheet pour vérifier les onglets.", "succes");
      else if (r.donnees && r.donnees.ok === false) cfgEtat("✗ " + (r.donnees.error || "Échec."), "erreur");
      else {
        const d = r.donnees || {};
        const extra = (typeof d.valideesIgnorees === "number" && d.valideesIgnorees > 0)
          ? " · " + d.valideesIgnorees + " copie(s) déjà validée(s) exclue(s) de la remédiation"
          : "";
        cfgEtat("✓ " + (d.message || "Synthèse et remédiation reconstruites.") + extra, "succes");
      }
    });

    document.getElementById("btn-cfg-copier").addEventListener("click", () => {
      const zone = document.getElementById("code-gs");
      if (!zone) return;
      zone.focus(); zone.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(zone.value).then(
          () => cfgEtat("✓ Code.gs copié. Colle-le dans Extensions > Apps Script.", "succes"),
          () => cfgEtat("✗ Copie refusée : déplie le bloc de code et sélectionne-le manuellement.", "erreur")
        );
        return;
      }
      cfgEtat(ok ? "✓ Code.gs copié. Colle-le dans Extensions > Apps Script." : "✗ Copie impossible : déplie le bloc de code et sélectionne-le.", ok ? "succes" : "erreur");
    });

    document.getElementById("btn-apercu-analyse").addEventListener("click", afficherApercuAnalyse);
  }

  function classeNiveau(niveau) {
    return {
      "Très satisfaisante": "niveau-ts", "Satisfaisante": "niveau-s",
      "Fragile": "niveau-f", "Insuffisante": "niveau-i"
    }[niveau] || "";
  }

  /* L'aperçu est construit avec textContent : aucune réponse d'élève n'est
     jamais injectée comme HTML. */
  function afficherApercuAnalyse() {
    const boite = document.getElementById("apercu-analyse");
    if (!boite || !window.Correction) return;
    boite.style.display = "block";
    while (boite.firstChild) boite.removeChild(boite.firstChild);

    const a = window.Correction.analyser(donneesCopie());
    const titre = document.createElement("p");
    titre.className = "accent";
    titre.textContent = "Aperçu de l'analyse automatique — " + a.total.score + "/20 · " + a.total.niveau;
    boite.appendChild(titre);

    const table = document.createElement("table");
    table.className = "tableau-analyse";
    const entete = document.createElement("tr");
    ["Compétence", "Score", "Niveau", "Ce qui manque"].forEach(t => {
      const th = document.createElement("th"); th.textContent = t; entete.appendChild(th);
    });
    table.appendChild(entete);
    window.Correction.COMPETENCES.forEach(def => {
      const c = a.competences[def.code];
      const tr = document.createElement("tr");
      const cellules = [
        def.code + " — " + def.libelle,
        c.score + "/" + c.max,
        c.niveau,
        c.manques.length ? c.manques.join(" ; ") : "— rien, tous les critères sont acquis —"
      ];
      cellules.forEach((texte, i) => {
        const td = document.createElement("td");
        td.textContent = texte;
        if (i === 2) td.className = classeNiveau(c.niveau);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    boite.appendChild(table);

    const i = a.indicateurs;
    const l = i.langue || {};
    const pointsMdl = Math.round(((l.pointsConnecteurs || 0) + (l.pointsStructure || 0)) * 100) / 100;
    const p = document.createElement("p");
    p.className = "small";
    p.textContent = "Connecteurs (" + i.nbConnecteurs + ") : " + (i.connecteurs.join(", ") || "aucun")
      + " · Mots imposés absents : " + (i.motsAbsents.join(", ") || "aucun")
      + " · Valeurs du doc. 1 : " + (i.valeursQ1.join(", ") || "aucune");
    boite.appendChild(p);

    /* La longueur reste une INFORMATION (consigne de rédaction de l'énoncé),
       mais elle n'est plus notée : on l'annonce explicitement au professeur. */
    const pl = document.createElement("p");
    pl.className = "small";
    pl.textContent = "Construction de la phrase : " + (l.phrasesCompletes || 0)
      + " phrase(s) complète(s) / " + (l.unites || 0) + " unité(s), "
      + (l.fragments || 0) + " fragment(s), "
      + (l.marqueursSubordination || 0) + " marqueur(s) de subordination, "
      + (l.connecteursEnTete || 0) + " connecteur(s) en tête de phrase"
      + " → MDL " + pointsMdl + "/2"
      + " · Lignes mesurées : " + i.lignes + " (information, non notée)";
    boite.appendChild(pl);

    if (a.alertes.length) {
      const al = document.createElement("p");
      al.className = "small";
      al.textContent = "Alertes à vérifier : " + a.alertes.join(" ");
      boite.appendChild(al);
    }
    const note = document.createElement("p");
    note.className = "small";
    note.style.marginBottom = "0";
    note.textContent = "⚠️ Indicateur automatique, pas une note : la copie reste marquée « À valider » dans le Google Sheet. L'orthographe, la justesse des phrases et l'emploi réellement correct des mots imposés relèvent de ton regard.";
    boite.appendChild(note);
  }

  /* ======================================================================
     5. MODÉLISATION 3D
     ----------------------------------------------------------------------
     Règle de cohérence : la cellule (membrane, cytoplasme, noyau) est
     strictement statique. Seule la mitochondrie s'active pendant la réaction
     (pulsation, crêtes emissives, halo et lumière LOCALE de faible portée).
     Les réactifs entrent, les déchets sortent, l'énergie reste dans la cellule.
     ====================================================================== */
  function init3D() {
    const conteneur = document.getElementById("scene");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    camera.position.set(0, 2.6, 17);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    conteneur.appendChild(renderer.domElement);

    const renduEtiquettes = new CSS2DRenderer();
    renduEtiquettes.domElement.style.position = "absolute";
    renduEtiquettes.domElement.style.top = "0";
    renduEtiquettes.domElement.style.left = "0";
    renduEtiquettes.domElement.style.pointerEvents = "none";
    conteneur.appendChild(renduEtiquettes.domElement);

    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    controles.dampingFactor = 0.07;
    controles.minDistance = 4.5;
    controles.maxDistance = 32;
    controles.maxPolarAngle = Math.PI * 0.85;
    controles.autoRotateSpeed = 0.6;
    controles.target.set(0, 0, 0);

    /* Lumières globales : FIXES, jamais modifiées pendant l'animation. */
    scene.add(new THREE.HemisphereLight(0xbfeaff, 0x102438, 2.1));
    const cle = new THREE.DirectionalLight(0xffffff, 2.6);
    cle.position.set(-5, 8, 9);
    scene.add(cle);
    const remplissage = new THREE.DirectionalLight(0x8fd8ff, 1.3);
    remplissage.position.set(6, -3, -6);
    scene.add(remplissage);

    /* --- utilitaires ------------------------------------------------- */
    const etiquettesFixes = [];
    const etiquettesMobiles = [];
    const objetsCliquables = [];
    let etiquettesActives = true;

    function bulle(couleur, puissance, force) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uCouleur: { value: new THREE.Color(couleur) },
          uPuissance: { value: puissance },
          uForce: { value: force }
        },
        vertexShader: [
          "varying vec3 vN; varying vec3 vV;",
          "void main(){",
          "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
          "  vN = normalize(normalMatrix * normal);",
          "  vV = normalize(-mv.xyz);",
          "  gl_Position = projectionMatrix * mv;",
          "}"
        ].join("\n"),
        fragmentShader: [
          "uniform vec3 uCouleur; uniform float uPuissance; uniform float uForce;",
          "varying vec3 vN; varying vec3 vV;",
          "void main(){",
          "  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPuissance);",
          "  gl_FragColor = vec4(uCouleur, f * uForce + 0.02);",
          "}"
        ].join("\n"),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
    }

    const matC = new THREE.MeshStandardMaterial({ color: 0x8a97a4, roughness: 0.4, metalness: 0.05 });
    const matO = new THREE.MeshStandardMaterial({ color: 0xff665e, roughness: 0.35, metalness: 0.05, emissive: 0x501008, emissiveIntensity: 0.25 });
    const matH = new THREE.MeshStandardMaterial({ color: 0xf3f7ff, roughness: 0.42, metalness: 0.02 });
    const matLien = new THREE.MeshStandardMaterial({ color: 0xc7d8e2, roughness: 0.5 });
    const matE = new THREE.MeshStandardMaterial({ color: 0xffd84d, roughness: 0.25, emissive: 0xff9d00, emissiveIntensity: 1.3 });
    const geoC = new THREE.SphereGeometry(0.20, 20, 14);
    const geoO = new THREE.SphereGeometry(0.20, 20, 14);
    const geoH = new THREE.SphereGeometry(0.12, 16, 12);

    function sphere(rayon, materiau) {
      return new THREE.Mesh(new THREE.SphereGeometry(rayon, 20, 14), materiau);
    }

    function liaison(a, b, rayon) {
      const direction = new THREE.Vector3().subVectors(b, a);
      const longueur = direction.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rayon, rayon, longueur, 8), matLien);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      return mesh;
    }

    function doubleLiaison(a, b) {
      const groupe = new THREE.Group();
      [-0.045, 0.045].forEach(dz => {
        const aa = a.clone(); aa.z += dz;
        const bb = b.clone(); bb.z += dz;
        groupe.add(liaison(aa, bb, 0.026));
      });
      return groupe;
    }

    function etiquette(parent, texte, position, options) {
      options = options || {};
      const element = document.createElement("div");
      element.className = "etiquette-3d" + (options.classe ? " " + options.classe : "");
      element.textContent = texte;
      const objet = new CSS2DObject(element);
      objet.position.set(position[0], position[1], position[2]);
      parent.add(objet);
      const entree = { objet: objet, element: element, actif: !options.dynamique };
      (options.dynamique ? etiquettesMobiles : etiquettesFixes).push(entree);
      return entree;
    }

    function synchroniserEtiquettes() {
      etiquettesFixes.forEach(e => {
        e.objet.visible = etiquettesActives;
        e.element.style.display = etiquettesActives ? "" : "none";
      });
      etiquettesMobiles.forEach(e => {
        const visible = etiquettesActives && e.actif;
        e.objet.visible = visible;
        e.element.style.display = visible ? "" : "none";
      });
    }

    function information(objet, titre, description, decor, rang) {
      objet.userData.information = { titre: titre, description: description };
      objet.userData.estDecor = !!decor;
      objet.userData.rangDecor = decor ? (rang || 9) : 0;
      objetsCliquables.push(objet);
    }

    function lissage(debut, fin, valeur) {
      const x = THREE.MathUtils.clamp((valeur - debut) / (fin - debut), 0, 1);
      return x * x * (3 - 2 * x);
    }

    /* --- LA CELLULE : membrane, cytoplasme, noyau (tout est statique) --- */
    const RAYON_CELLULE = 4.6;
    const cellule = new THREE.Group();
    scene.add(cellule);

    const membraneCellule = new THREE.Mesh(
      new THREE.SphereGeometry(RAYON_CELLULE, 64, 44),
      bulle(0x54c8f5, 2.6, 0.55)
    );
    cellule.add(membraneCellule);
    etiquette(cellule, "Membrane plasmique", [-0.4, 4.55, 0]);
    information(
      membraneCellule,
      "La membrane plasmique",
      "Elle sépare la cellule du milieu extérieur. Le glucose et le dioxygène la traversent pour entrer ; le dioxyde de carbone et l’eau la traversent pour sortir. Elle ne participe pas à la réaction.",
      true, 2
    );

    /* Cytoplasme : nuage de points confiné dans la cellule, IMMOBILE. */
    const sommetsCytoplasme = [];
    const NOYAU_POS = new THREE.Vector3(-2.0, 1.25, -0.9);
    const MITO_POS = new THREE.Vector3(1.45, -0.45, 0.55);
    for (let i = 0; i < 620; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = 4.28 * Math.cbrt(Math.random());
      const s = Math.sqrt(1 - u * u);
      const p = new THREE.Vector3(r * s * Math.cos(theta), r * u, r * s * Math.sin(theta));
      if (p.distanceTo(NOYAU_POS) < 1.45) continue;
      if (p.distanceTo(MITO_POS) < 1.7) continue;
      sommetsCytoplasme.push(p.x, p.y, p.z);
    }
    const geoCytoplasme = new THREE.BufferGeometry();
    geoCytoplasme.setAttribute("position", new THREE.Float32BufferAttribute(sommetsCytoplasme, 3));
    const cytoplasme = new THREE.Points(geoCytoplasme, new THREE.PointsMaterial({
      color: 0x79cdbb, size: 0.045, transparent: true, opacity: 0.34, depthWrite: false
    }));
    cellule.add(cytoplasme);
    etiquette(cellule, "Cytoplasme", [-3.5, -2.4, 0.6]);
    information(
      cytoplasme,
      "Le cytoplasme",
      "Milieu intérieur de la cellule. Les molécules y circulent jusqu’à la mitochondrie. La première étape de la dégradation du glucose (glycolyse) s’y déroule ; le modèle regroupe la réaction dans la mitochondrie.",
      true, 1
    );

    /* Noyau : sphère + nucléole, bien à l'intérieur de la membrane,
       strictement immobile et inchangé pendant toute l'animation. */
    const noyau = new THREE.Group();
    noyau.position.copy(NOYAU_POS);
    cellule.add(noyau);
    const enveloppeNoyau = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 40, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0x8b74cf, transparent: true, opacity: 0.20,
        roughness: 0.55, side: THREE.DoubleSide, depthWrite: false
      })
    );
    noyau.add(enveloppeNoyau);
    const contourNoyau = new THREE.Mesh(new THREE.SphereGeometry(1.25, 40, 28), bulle(0xa48be0, 2.3, 0.6));
    noyau.add(contourNoyau);
    const nucleole = sphere(0.42, new THREE.MeshStandardMaterial({ color: 0x6b56b5, roughness: 0.6, emissive: 0x2a1c55, emissiveIntensity: 0.35 }));
    noyau.add(nucleole);
    etiquette(noyau, "Noyau — ne participe pas à la réaction", [0, 1.55, 0], { classe: "noyau" });
    information(
      noyau,
      "Le noyau",
      "Il contient l’information génétique de la cellule. Il ne participe pas à la respiration cellulaire : dans cette modélisation, il reste à sa place, sans changer de taille ni de couleur, du début à la fin."
    );

    /* --- LA MITOCHONDRIE : le seul élément actif ----------------------- */
    const mito = new THREE.Group();
    mito.position.copy(MITO_POS);
    mito.rotation.z = -0.16;
    cellule.add(mito);

    const enveloppeMito = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), bulle(0xff9147, 2.0, 0.95));
    enveloppeMito.scale.set(1.45, 0.82, 0.78);
    mito.add(enveloppeMito);

    const matrice = new THREE.Mesh(
      new THREE.SphereGeometry(0.96, 40, 26),
      new THREE.MeshStandardMaterial({
        color: 0xb64b1c, transparent: true, opacity: 0.24,
        roughness: 0.65, side: THREE.DoubleSide, depthWrite: false
      })
    );
    matrice.scale.set(1.42, 0.79, 0.75);
    mito.add(matrice);

    /* Crêtes mitochondriales : un matériau partagé, le seul dont l'émission
       varie. */
    const matCrete = new THREE.MeshStandardMaterial({
      color: 0xffc072, roughness: 0.4,
      emissive: 0xff6a18, emissiveIntensity: 0.28
    });
    for (let rangee = -2; rangee <= 2; rangee++) {
      const z = rangee * 0.255;
      const points = [];
      for (let i = 0; i <= 60; i++) {
        const x = -1.17 + (i / 60) * 2.34;
        const amplitude = 1 - Math.pow(Math.abs(x) / 1.35, 2);
        const y = Math.sin(i * 0.42 + rangee * 0.9) * 0.31 * amplitude + rangee * 0.025;
        points.push(new THREE.Vector3(x, y, z));
      }
      const crete = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 110, 0.052, 8, false),
        matCrete
      );
      mito.add(crete);
    }

    /* Halo et lumière sont ENFANTS de la mitochondrie : leur portée reste
       strictement locale, aucune autre structure n'est éclairée. */
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 22),
      new THREE.MeshBasicMaterial({
        color: 0xffa63a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    halo.scale.set(1.85, 1.16, 1.12);
    halo.raycast = function () {};   /* zone de clic limitée à la mitochondrie */
    mito.add(halo);

    const lumReaction = new THREE.PointLight(0xff9a3c, 0, 2.8);
    mito.add(lumReaction);

    etiquette(mito, "Mitochondrie — lieu de la réaction", [0, 1.18, 0], { classe: "mito" });
    information(
      mito,
      "La mitochondrie",
      "Organite où se déroule l’essentiel de la respiration cellulaire. Ses crêtes internes offrent une grande surface de réaction. C’est le seul élément de la cellule qui s’active dans cette modélisation."
    );

    /* --- MOLÉCULES ------------------------------------------------------ */
    function creerGlucose() {
      const g = new THREE.Group();
      const sommets = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0);
        sommets.push(p);
        const atome = sphere(0.20, i === 0 ? matO : matC);
        atome.position.copy(p);
        g.add(atome);
        const h = new THREE.Mesh(geoH, matH);
        h.position.set(Math.cos(angle) * 0.68, Math.sin(angle) * 0.68, 0.05);
        g.add(h, liaison(p, h.position, 0.022));
      }
      for (let i = 0; i < 6; i++) g.add(liaison(sommets[i], sommets[(i + 1) % 6], 0.045));
      information(g, "Le glucose (C₆H₁₂O₆)", "Nutriment issu de la digestion et apporté par le sang (doc. 1 : 900 → 800 mg par litre). Son carbone se retrouvera dans le dioxyde de carbone. Le modèle ne montre pas tous les atomes.");
      return g;
    }

    function creerO2() {
      const g = new THREE.Group();
      const a = new THREE.Mesh(geoO, matO);
      const b = new THREE.Mesh(geoO, matO);
      a.position.x = -0.23; b.position.x = 0.23;
      g.add(a, b, doubleLiaison(a.position, b.position));
      information(g, "Le dioxygène (O₂)", "Gaz prélevé dans l’air et transporté par le sang (doc. 1 : 200 → 150 mL par litre). Son oxygène se retrouvera dans l’eau produite.");
      return g;
    }

    function creerCO2() {
      const g = new THREE.Group();
      const c = sphere(0.20, matC);
      const o1 = new THREE.Mesh(geoO, matO);
      const o2 = new THREE.Mesh(geoO, matO);
      o1.position.x = -0.48; o2.position.x = 0.48;
      g.add(c, o1, o2, doubleLiaison(c.position, o1.position), doubleLiaison(c.position, o2.position));
      information(g, "Le dioxyde de carbone (CO₂)", "Déchet de la respiration cellulaire. Il quitte la cellule, est transporté par le sang (doc. 1 : 490 → 560 mL par litre) puis éliminé lors de l’expiration.");
      return g;
    }

    function creerH2O() {
      const g = new THREE.Group();
      const o = sphere(0.22, matO);
      const h1 = new THREE.Mesh(geoH, matH);
      const h2 = new THREE.Mesh(geoH, matH);
      h1.position.set(-0.34, -0.28, 0);
      h2.position.set(0.34, -0.28, 0);
      g.add(o, h1, h2, liaison(o.position, h1.position, 0.032), liaison(o.position, h2.position, 0.032));
      information(g, "L’eau (H₂O)", "Produit de la respiration cellulaire. L’oxygène du dioxygène inhalé se retrouve dans cette molécule (doc. 2).");
      return g;
    }

    function creerEnergie() {
      const g = new THREE.Group();
      g.add(sphere(0.13, matE));
      information(g, "L’énergie utilisable (ATP)", "Énergie libérée par la réaction et stockée sous forme d’ATP. Elle RESTE dans la cellule : elle sert notamment à la contraction du muscle. Ce n’est pas un déchet rejeté.");
      return g;
    }

    function pointDansMito(i) {
      const angle = i * 2.39996;
      const r = 0.14 + 0.34 * ((i % 5) / 5);
      return new THREE.Vector3(
        MITO_POS.x + Math.cos(angle) * r,
        MITO_POS.y + Math.sin(angle) * r * 0.62,
        MITO_POS.z + Math.sin(angle * 1.3) * 0.20
      );
    }

    /* 1 glucose + 6 O₂ : trajectoires qui contournent le noyau par le bas
       et par l'avant (z positif), puis rejoignent la mitochondrie. */
    const reactifs = [];
    for (let i = 0; i < 7; i++) {
      const groupe = i === 0 ? creerGlucose() : creerO2();
      const y = -2.7 + (i / 6) * 5.2;
      const z = -0.7 + (i % 3) * 0.65;
      const depart = new THREE.Vector3(-8.2, y, z);
      const controle = new THREE.Vector3(-1.1, -2.5 + (i % 4) * 0.42, 0.55 + (i % 3) * 0.22);
      const courbe = new THREE.QuadraticBezierCurve3(depart, controle, pointDansMito(i));
      scene.add(groupe);
      let entreeEtiquette = null;
      if (i === 0) entreeEtiquette = etiquette(groupe, "Glucose", [0, -0.55, 0], { dynamique: true });
      if (i === 1) entreeEtiquette = etiquette(groupe, "Dioxygène O₂", [0, 0.55, 0], { dynamique: true });
      reactifs.push({ groupe: groupe, courbe: courbe, decal: i * 0.012, etiquette: entreeEtiquette });
    }

    /* 6 CO₂ + 6 H₂O : naissent dans la mitochondrie puis traversent la
       membrane vers le sang. */
    const produits = [];
    for (let i = 0; i < 12; i++) {
      const groupe = i < 6 ? creerCO2() : creerH2O();
      const y = -2.6 + (i / 11) * 5.0;
      const z = -0.7 + (i % 3) * 0.65;
      const fin = new THREE.Vector3(8.2, y, z);
      const controle = new THREE.Vector3(3.15, -1.5 + (i % 5) * 0.72, 0.6 + (i % 3) * 0.2);
      const courbe = new THREE.QuadraticBezierCurve3(pointDansMito(i), controle, fin);
      scene.add(groupe);
      let entreeEtiquette = null;
      if (i === 0) entreeEtiquette = etiquette(groupe, "CO₂ (déchet)", [0, 0.58, 0], { dynamique: true });
      if (i === 6) entreeEtiquette = etiquette(groupe, "H₂O", [0, 0.58, 0], { dynamique: true });
      produits.push({ groupe: groupe, courbe: courbe, decal: (i % 6) * 0.008, etiquette: entreeEtiquette });
    }

    /* L'énergie reste DANS la cellule : cibles à distance < 4 du centre. */
    const energies = [];
    for (let i = 0; i < 9; i++) {
      const groupe = creerEnergie();
      const angle = i * (Math.PI * 2 / 9);
      const cible = new THREE.Vector3(
        Math.cos(angle) * 3.0, Math.sin(angle) * 2.15, 0.25 + (i % 3) * 0.18
      );
      const controle = new THREE.Vector3(
        MITO_POS.x + 0.6, MITO_POS.y + Math.sin(angle) * 0.8, 0.45
      );
      const courbe = new THREE.QuadraticBezierCurve3(pointDansMito(i), controle, cible);
      scene.add(groupe);
      /* L'étiquette est portée par la particule i=5 (bas gauche) : sur i=0
         elle retombait sur l'étiquette de la mitochondrie à l'étape 4. */
      const entreeEtiquette = i === 5
        ? etiquette(groupe, "Énergie (ATP) — reste dans la cellule", [0, -0.22, 0], { dynamique: true })
        : null;
      energies.push({ groupe: groupe, courbe: courbe, decal: i * 0.010, etiquette: entreeEtiquette });
    }

    /* --- CHRONOLOGIE ---------------------------------------------------- */
    const DUREE = 16;
    let temps = 0;
    let enLecture = true;
    let vitesse = 1;

    const boutonLecture = document.getElementById("lecture");
    const progression = document.getElementById("progression");
    const titreEtape = document.getElementById("titre-etape");
    const texteEtape = document.getElementById("texte-etape");
    const docEtape = document.getElementById("doc-etape");
    const eqEtape = document.getElementById("eq-etape");
    const boutonsEtapes = Array.from(document.querySelectorAll("#etapes button"));

    const ETAPES = [
      {
        titre: "1 · Le sang apporte les réactifs",
        doc: "Doc. 1",
        texte: "Le sang qui irrigue le muscle apporte du glucose et du dioxygène. Le tableau du document 1 montre que le muscle prélève 100 mg de glucose et 50 mL de dioxygène par litre de sang.",
        eq: ""
      },
      {
        titre: "2 · Entrée dans la cellule musculaire",
        doc: "Doc. 1 → 2",
        texte: "Les réactifs traversent la membrane plasmique puis le cytoplasme, en contournant le noyau. La réaction n’a lieu ni dans les poumons ni dans le sang : elle se déroule dans les cellules.",
        eq: ""
      },
      {
        titre: "3 · La respiration cellulaire dans la mitochondrie",
        doc: "Doc. 2",
        texte: "Seule la mitochondrie s’active : ses crêtes s’illuminent, la cellule et le noyau restent inchangés. Le carbone du glucose se retrouve dans le dioxyde de carbone, l’oxygène du dioxygène dans l’eau.",
        eq: "C₆H₁₂O₆ + 6 O₂ → 6 CO₂ + 6 H₂O + énergie"
      },
      {
        titre: "4 · Déchets rejetés, énergie conservée",
        doc: "Doc. 1 & 3",
        texte: "Le dioxyde de carbone et l’eau quittent la cellule (CO₂ : 490 → 560 mL par litre de sang). L’énergie, elle, reste dans la cellule et permet la contraction du muscle : le cœur accélère jusqu’à 180 battements/min.",
        eq: ""
      }
    ];
    let derniereEtape = -1;

    function actualiserEtape(index) {
      if (index === derniereEtape) return;
      derniereEtape = index;
      const e = ETAPES[index];
      titreEtape.textContent = e.titre;
      docEtape.textContent = e.doc;
      texteEtape.textContent = e.texte;
      if (e.eq) { eqEtape.textContent = e.eq; eqEtape.classList.add("visible"); }
      else eqEtape.classList.remove("visible");
      boutonsEtapes.forEach((b, i) => b.classList.toggle("actif", i === index));
    }

    function afficherTemps(valeur) {
      temps = THREE.MathUtils.clamp(valeur, 0, DUREE);
      const t = temps / DUREE;

      reactifs.forEach((r, i) => {
        const avancement = lissage(0.02 + r.decal, 0.42 + r.decal, t);
        r.groupe.position.copy(r.courbe.getPoint(Math.min(avancement, 1)));
        const reste = 1 - lissage(0.43, 0.56, t);
        r.groupe.scale.setScalar(Math.max(reste, 0.0001));
        r.groupe.visible = reste > 0.02;
        r.groupe.rotation.z = t * (i % 2 ? 1.8 : -1.4);
        if (r.etiquette) r.etiquette.actif = reste > 0.25 && t < 0.50;
      });

      produits.forEach((p, i) => {
        const avancement = lissage(0.57 + p.decal, 0.95 + p.decal, t);
        p.groupe.position.copy(p.courbe.getPoint(Math.min(avancement, 1)));
        const apparition = lissage(0.52, 0.62, t);
        p.groupe.scale.setScalar(Math.max(apparition, 0.0001));
        p.groupe.visible = apparition > 0.02;
        p.groupe.rotation.z = t * (i % 2 ? -1.5 : 1.2);
        if (p.etiquette) p.etiquette.actif = apparition > 0.4 && t > 0.62;
      });

      energies.forEach((e, i) => {
        const avancement = lissage(0.60 + e.decal, 0.92 + e.decal, t);
        e.groupe.position.copy(e.courbe.getPoint(Math.min(avancement, 1)));
        const apparition = lissage(0.55, 0.66, t);
        const scintillement = 1 + Math.sin(temps * 5 + i) * 0.12;
        e.groupe.scale.setScalar(Math.max(apparition, 0.0001) * scintillement);
        e.groupe.visible = apparition > 0.02;
        if (e.etiquette) e.etiquette.actif = apparition > 0.5 && t > 0.70;
      });

      /* ===== SEULE LA MITOCHONDRIE RÉAGIT ===== */
      const reaction = Math.max(0, 1 - Math.abs(t - 0.50) / 0.14);
      mito.scale.setScalar(1 + reaction * 0.045);
      lumReaction.intensity = reaction * 24;
      halo.material.opacity = reaction * 0.20;
      matCrete.emissiveIntensity = 0.28 + reaction * 1.5;
      /* Aucune autre propriété de la cellule n'est modifiée. */

      let etape = 0;
      if (temps >= 4.2) etape = 1;
      if (temps >= 8.2) etape = 2;
      if (temps >= 12.4) etape = 3;
      actualiserEtape(etape);
      progression.value = Math.round(t * 1000);
      boutonLecture.textContent = enLecture ? "⏸ Pause" : "▶ Reprendre";
      synchroniserEtiquettes();
    }

    boutonLecture.addEventListener("click", () => {
      if (temps >= DUREE) { temps = 0; enLecture = true; }
      else enLecture = !enLecture;
      afficherTemps(temps);
    });
    document.getElementById("recommencer").addEventListener("click", () => {
      temps = 0; enLecture = true; afficherTemps(temps);
    });
    document.getElementById("vitesse").addEventListener("input", e => {
      vitesse = Number(e.target.value);
      document.getElementById("valeur-vitesse").textContent =
        "×" + vitesse.toFixed(1).replace(".0", "");
    });
    progression.addEventListener("input", e => {
      enLecture = false;
      afficherTemps((Number(e.target.value) / 1000) * DUREE);
    });
    boutonsEtapes.forEach(b => b.addEventListener("click", () => {
      enLecture = false;
      afficherTemps(Number(b.dataset.temps));
    }));
    document.getElementById("etiquettes").addEventListener("change", e => {
      etiquettesActives = e.target.checked;
      synchroniserEtiquettes();
    });
    document.getElementById("rotation").addEventListener("change", e => {
      controles.autoRotate = e.target.checked;
    });

    /* Vues caméra */
    let cameraCible = null;
    document.getElementById("vue-mito").addEventListener("click", () => {
      cameraCible = {
        position: new THREE.Vector3(2.3, 0.5, 7.5),
        target: MITO_POS.clone()
      };
    });
    document.getElementById("vue-cellule").addEventListener("click", () => {
      cameraCible = {
        position: new THREE.Vector3(0, 2.6, 17),
        target: new THREE.Vector3(0, 0, 0)
      };
    });
    controles.addEventListener("start", () => { cameraCible = null; });

    /* --- FICHES D'INFORMATION AU CLIC ----------------------------------- */
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.25;
    const pointeur = new THREE.Vector2();
    const infoObjet = document.getElementById("info-objet");

    renderer.domElement.addEventListener("click", evenement => {
      const limites = renderer.domElement.getBoundingClientRect();
      pointeur.x = ((evenement.clientX - limites.left) / limites.width) * 2 - 1;
      pointeur.y = -((evenement.clientY - limites.top) / limites.height) * 2 + 1;
      raycaster.setFromCamera(pointeur, camera);
      const touches = raycaster.intersectObjects(objetsCliquables, true);

      let retenue = null;
      let retenueDecor = null;
      let meilleurRang = Infinity;
      for (const touche of touches) {
        let objet = touche.object;
        while (objet && !objet.userData.information) objet = objet.parent;
        if (!objet || !objet.visible) continue;
        if (objet.userData.estDecor) {
          if (objet.userData.rangDecor < meilleurRang) {
            meilleurRang = objet.userData.rangDecor;
            retenueDecor = objet.userData.information;
          }
        } else { retenue = objet.userData.information; break; }
      }
      const informationTrouvee = retenue || retenueDecor;
      if (!informationTrouvee) { infoObjet.style.display = "none"; return; }

      infoObjet.innerHTML = "<strong></strong><span></span>";
      infoObjet.querySelector("strong").textContent = informationTrouvee.titre;
      infoObjet.querySelector("span").textContent = informationTrouvee.description;
      infoObjet.style.display = "block";
      const x = Math.max(8, Math.min(evenement.clientX - limites.left + 14, limites.width - 290));
      const y = Math.max(8, Math.min(evenement.clientY - limites.top + 14, limites.height - 140));
      infoObjet.style.left = x + "px";
      infoObjet.style.top = y + "px";
    });

    /* --- DIMENSIONNEMENT ET BOUCLE ------------------------------------- */
    let derniereLargeur = 0;
    let derniereHauteur = 0;

    function redimensionner() {
      const largeur = conteneur.clientWidth;
      const hauteur = conteneur.clientHeight;
      if (!largeur || !hauteur) return;
      derniereLargeur = largeur;
      derniereHauteur = hauteur;
      camera.aspect = largeur / hauteur;
      camera.updateProjectionMatrix();
      renderer.setSize(largeur, hauteur);
      renduEtiquettes.setSize(largeur, hauteur);
    }

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(redimensionner).observe(conteneur);
    }
    window.addEventListener("resize", redimensionner);
    redimensionner();

    const horloge = new THREE.Clock();
    function animer() {
      requestAnimationFrame(animer);
      const delta = Math.min(horloge.getDelta(), 0.05);

      if (enLecture) {
        temps += delta * vitesse;
        if (temps >= DUREE) { temps = DUREE; enLecture = false; }
        afficherTemps(temps);
      }

      if (conteneur.clientWidth !== derniereLargeur || conteneur.clientHeight !== derniereHauteur) {
        redimensionner();
      }

      if (cameraCible) {
        camera.position.lerp(cameraCible.position, 0.07);
        controles.target.lerp(cameraCible.target, 0.07);
        if (camera.position.distanceTo(cameraCible.position) < 0.04) cameraCible = null;
      }

      controles.update();
      renderer.render(scene, camera);
      renduEtiquettes.render(scene, camera);
    }

    afficherTemps(0);
    animer();
    return redimensionner;
  }

  /* La 3D peut échouer (WebGL désactivé) : le reste de l'application doit
     malgré tout rester parfaitement utilisable. */
  try {
    redimensionner3D = init3D();
  } catch (erreur) {
    console.error("Scène 3D indisponible :", erreur);
    document.getElementById("secours3d").classList.add("visible");
    document.getElementById("commandes").style.display = "none";
    document.getElementById("explication").style.display = "none";
  }
})();
