/* Vérification en vrai Chrome : comportement + captures d'écran.
   Un mini-serveur local évite les caprices de localStorage en file://. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("D:/IA/3Dtest/node_modules/playwright-core");

const DOSSIER = path.join(__dirname, "..");
const FICHIER = path.join(DOSSIER, "respiration cellulaire.html");
const HTML = fs.readFileSync(FICHIER, "utf8");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8791;
const URL = "http://127.0.0.1:" + PORT + "/app.html";
const URL_SHEET = "http://127.0.0.1:" + PORT + "/sheet";

/* Le HTML distribué a une URL vide (config.txt non renseigné). Pour le test,
   on injecte l'URL du Sheet simulé dans la meta, exactement comme le ferait
   build.py avec une vraie URL /exec. */
const HTML_SERVI = HTML.replace(
  /(<meta name="sheet-url" content=")[^"]*(")/,
  "$1" + URL_SHEET + "$2"
);
const copiesRecues = [];

function idDe(c) {
  return [c.nom, c.prenom,
    String(c.classe || "").toUpperCase().replace(/[^A-Z0-9]/g, "")].join("|");
}

function simulerSheet(charge) {
  if (charge.token !== "respiration-2027")
    return { ok: false, error: "Jeton invalide (Sheet simulé)." };
  if (charge.action === "ping")
    return {
      ok: true, message: "Connexion OK. Onglets prêts : Copies, Synthese, Remediation.",
      feuilles: ["Copies", "Synthese", "Remediation"]
    };
  if (charge.action === "synthese")
    return { ok: true, message: "Synthèse reconstruite.", eleves: copiesRecues.length };
  const copie = charge.copie || {};
  /* Comme le vrai Code.gs, le Sheet simulé calcule l'identifiant lui-même :
     le client n'en envoie plus aucun. On ne mute surtout pas le payload. */
  const index = copiesRecues.findIndex(c => idDe(c) === idDe(copie));
  const ligne = index >= 0 ? index + 2 : copiesRecues.length + 2;
  if (index >= 0) copiesRecues[index] = copie;
  else copiesRecues.push(copie);
  const t = (copie.analyse && copie.analyse.total) || {};
  return {
    ok: true, ligne: ligne, id: copie.id, miseAJour: index >= 0,
    niveauGlobal: t.niveau || "Insuffisante", total: t.score || 0, warning: ""
  };
}

const rapport = {};
const erreurs = [];
let total = 0;
let reussis = 0;

function verifier(nom, condition, detail) {
  total++;
  if (condition) reussis++;
  rapport[nom] = { ok: !!condition, detail: detail };
  if (!condition) erreurs.push("ÉCHEC " + nom + " : " + JSON.stringify(detail));
}

(async () => {
  const serveur = http.createServer((req, res) => {
    if (req.url === "/copies" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(copiesRecues));
      return;
    }
    if (req.method === "POST" && req.url.indexOf("/sheet") === 0) {
      let corps = "";
      req.on("data", c => { corps += c; });
      req.on("end", () => {
        let charge = {};
        try { charge = JSON.parse(corps); } catch (e) { /* requête illisible */ }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(simulerSheet(charge)));
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML_SERVI);
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const navigateur = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage",
      "--no-sandbox"
    ]
  });

  const page = await navigateur.newPage({ viewport: { width: 1366, height: 768 } });
  const erreursApplicatives = [];
  page.on("pageerror", e => erreursApplicatives.push("PAGEERROR " + e.message));
  page.on("console", m => {
    if (m.type() === "error") erreursApplicatives.push("CONSOLE " + m.text());
  });

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  /* ---- 1. Initialisation 3D ---- */
  const init = await page.evaluate(() => {
    const canvas = document.querySelector("#scene canvas");
    const etiquettes = Array.from(document.querySelectorAll("#scene .etiquette-3d"));
    return {
      canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
      secours: getComputedStyle(document.getElementById("secours3d")).display,
      etiquettes: etiquettes.length,
      etiquettesVisibles: etiquettes.filter(e => getComputedStyle(e).display !== "none").length,
      textes: etiquettes.map(e => e.textContent.trim()),
      titreEtape: document.getElementById("titre-etape").textContent
    };
  });
  verifier("canvas WebGL créé", init.canvas && init.canvas.w > 100 && init.canvas.h > 100, init.canvas);
  verifier("scène 3D active (pas de message de secours)", init.secours === "none", init.secours);
  /* Le renderer CSS2D n'insère dans le DOM que les étiquettes visibles :
     à l'étape 1 il y a 4 étiquettes fixes + les 2 réactifs, pas 7. */
  verifier("4 étiquettes d'organites présentes",
    ["Membrane plasmique", "Cytoplasme", "Noyau — ne participe pas à la réaction",
      "Mitochondrie — lieu de la réaction"].every(t => init.textes.includes(t)), init.textes);
  verifier("étiquettes des réactifs à l'étape 1",
    init.textes.includes("Glucose") && init.textes.includes("Dioxygène O₂") && init.etiquettes >= 6,
    init.textes);
  verifier("étape 1 affichée au démarrage", /1 ·/.test(init.titreEtape), init.titreEtape);
  rapport.init3D = init;

  /* ---- 2. Étapes de l'animation ---- */
  await page.click("#lecture");                    // pause pour figer l'état
  await page.click('#etapes button[data-temps="8.2"]');
  await page.waitForTimeout(250);
  const reaction = await page.evaluate(() => ({
    titre: document.getElementById("titre-etape").textContent,
    doc: document.getElementById("doc-etape").textContent,
    eq: document.getElementById("eq-etape").textContent,
    eqVisible: document.getElementById("eq-etape").classList.contains("visible"),
    boutonActif: document.querySelectorAll("#etapes button.actif").length
  }));
  verifier("étape 3 = mitochondrie", /mitochondrie/i.test(reaction.titre), reaction.titre);
  verifier("document 2 associé", reaction.doc === "Doc. 2", reaction.doc);
  verifier("équation équilibrée affichée", reaction.eqVisible && reaction.eq.includes("6 O₂") && reaction.eq.includes("6 CO₂"), reaction.eq);
  verifier("un seul bouton d'étape actif", reaction.boutonActif === 1, reaction.boutonActif);
  rapport.etapeReaction = reaction;
  await page.addStyleTag({ content: "*{animation:none !important;transition:none !important}" });
  await page.screenshot({ path: path.join(__dirname, "shot_3d_reaction.png") });

  await page.click('#etapes button[data-temps="0"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(__dirname, "shot_3d_depart.png") });

  await page.click('#etapes button[data-temps="14.6"]');
  await page.waitForTimeout(250);
  const fin = await page.evaluate(() => ({
    titre: document.getElementById("titre-etape").textContent,
    doc: document.getElementById("doc-etape").textContent,
    textes: Array.from(document.querySelectorAll("#scene .etiquette-3d")).map(e => e.textContent.trim())
  }));
  verifier("étape 4 = énergie conservée", /énergie/i.test(fin.titre), fin.titre);
  verifier("labels des produits et de l'énergie à l'étape 4",
    ["CO₂ (déchet)", "H₂O", "Énergie (ATP) — reste dans la cellule"]
      .every(t => fin.textes.includes(t)) && fin.textes.length >= 7,
    fin.textes);
  rapport.etapeFin = fin;
  await page.screenshot({ path: path.join(__dirname, "shot_3d_energie.png") });

  /* ---- 3. Onglets : un seul panneau visible à la fois ---- */
  await page.click('.onglet[data-onglet="activite"]');
  await page.waitForTimeout(200);
  const panneaux = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".panneau")).map(p => p.id + ":" + getComputedStyle(p).display)
  );
  verifier("activité seule visible", panneaux.filter(x => !/none/.test(x)).length === 1
    && panneaux.some(x => x === "panneau-activite:block"), panneaux);
  rapport.panneaux = panneaux;

  const images = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".doc-body img")).map(i => ({
      chargee: i.complete && i.naturalWidth > 0, largeur: i.naturalWidth, src: i.getAttribute("src").slice(0, 22)
    }))
  );
  verifier("2 documents illustrés embarqués", images.length === 2 && images.every(i => i.chargee), images);
  verifier("aucune image distante", images.every(i => i.src.startsWith("data:image/")), images.map(i => i.src));
  rapport.images = images;

  const contenu = await page.evaluate(() => ({
    q1: document.body.innerText.includes("Comparer et interpréter"),
    q2: document.body.innerText.includes("Expliquer et modéliser"),
    q3: document.body.innerText.includes("10 à 15 lignes"),
    tableau: document.querySelector("table.blood") ? document.querySelectorAll("table.blood tr").length : 0,
    valeurs: ["200", "150", "490", "560", "900", "800", "70", "180"]
      .filter(v => document.querySelector("#panneau-activite").innerText.includes(v)).length
  }));
  verifier("3 questions de l'activité", contenu.q1 && contenu.q2 && contenu.q3, contenu);
  verifier("tableau doc 1 à 4 lignes", contenu.tableau === 4, contenu.tableau);
  verifier("8 valeurs chiffrées du dossier", contenu.valeurs === 8, contenu.valeurs);
  rapport.contenuActivite = contenu;
  await page.screenshot({ path: path.join(__dirname, "shot_activite.png") });

  /* ---- 4. Sauvegarde automatique ---- */
  const texteQ1 = "Le muscle prélève 50 mL de dioxygène et 100 mg de glucose par litre de sang.";
  await page.fill("#q1", texteQ1);
  await page.fill("#nom", "Dupont");
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(900);
  const restauration = await page.evaluate(() => ({
    q1: document.getElementById("q1").value,
    nom: document.getElementById("nom").value
  }));
  verifier("autosave restaurée après rechargement", restauration.q1 === texteQ1 && restauration.nom === "Dupont", restauration);
  rapport.autosave = restauration;

  /* ---- 5. Bilan interactif ---- */
  await page.click('.onglet[data-onglet="bilan"]');
  const bonnes = { b1: "glucose", b2: "dioxygene", b3: "co2", b4: "eau", b5: "energie", b6: "cellules", b7: "transport" };
  for (const [id, v] of Object.entries(bonnes)) await page.selectOption("#" + id, v);
  await page.click("#btn-verifier-bilan");
  const bilan = await page.evaluate(() => ({
    texte: document.getElementById("resultat-bilan").textContent,
    traceVisible: document.getElementById("trace-ecrite").classList.contains("visible"),
    bons: document.querySelectorAll(".phrase-bilan select.bon").length,
    equation: document.querySelector("#trace-ecrite .eq") ? document.querySelector("#trace-ecrite .eq").textContent : ""
  }));
  verifier("bilan 7/7", /7 \/ 7/.test(bilan.texte) && bilan.bons === 7, bilan.texte);
  verifier("trace écrite révélée", bilan.traceVisible && bilan.equation.includes("glucose + dioxygène"), bilan.equation);
  rapport.bilan = bilan;
  await page.screenshot({ path: path.join(__dirname, "shot_bilan.png") });

  /* ---- 6. Verrou 2027 ---- */
  const avant = await page.evaluate(() => getComputedStyle(document.getElementById("zone-corrige")).display);
  verifier("corrigé masqué avant code", avant === "none", avant);
  await page.click('[data-deverrouiller="corrige"]');
  await page.fill("#code-verrou", "1111");
  await page.click("#valider-verrou");
  const mauvais = await page.evaluate(() => ({
    erreur: getComputedStyle(document.getElementById("erreur-verrou")).display,
    modal: document.getElementById("verrou").classList.contains("visible"),
    corrige: getComputedStyle(document.getElementById("zone-corrige")).display
  }));
  verifier("code erroné refusé", mauvais.erreur === "block" && mauvais.modal && mauvais.corrige === "none", mauvais);
  await page.fill("#code-verrou", "2027");
  await page.click("#valider-verrou");
  const bon = await page.evaluate(() => ({
    modal: document.getElementById("verrou").classList.contains("visible"),
    corrige: getComputedStyle(document.getElementById("zone-corrige")).display,
    prof: getComputedStyle(document.getElementById("zone-prof")).display,
    texteCorrige: document.getElementById("zone-corrige").innerText.includes("Récapitulatif du barème"),
    texteProf: document.getElementById("zone-prof").innerText.includes("Obstacle épistémologique")
  }));
  verifier("code 2027 débloque corrigé + fiche prof",
    !bon.modal && bon.corrige === "block" && bon.prof === "block" && bon.texteCorrige && bon.texteProf, bon);
  rapport.verrou = { mauvais, bon };
  await page.screenshot({ path: path.join(__dirname, "shot_corrige.png") });

  /* ---- 7. Impression de la fiche élève ---- */
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeprint"));
    window.confirm = function () { return true; };
  });
  const impression = await page.evaluate(() => ({
    onglets: getComputedStyle(document.getElementById("onglets")).display,
    zone3d: getComputedStyle(document.getElementById("zone3d")).display,
    activite: getComputedStyle(document.getElementById("panneau-activite")).display,
    bilan: getComputedStyle(document.getElementById("panneau-bilan")).display,
    textarea: getComputedStyle(document.querySelector("textarea.reponse")).display,
    miroirs: document.querySelectorAll(".impression-reponse").length,
    miroirDisplay: getComputedStyle(document.querySelector(".impression-reponse")).display,
    miroirTexte: document.querySelector(".impression-reponse").textContent
  }));
  verifier("impression = fiche élève seule",
    impression.onglets === "none" && impression.zone3d === "none"
    && impression.activite === "block" && impression.bilan === "none", impression);
  verifier("réponses recopiées à l'impression",
    impression.textarea === "none" && impression.miroirs === 3
    && impression.miroirDisplay === "block" && impression.miroirTexte === texteQ1, impression);
  rapport.impression = impression;
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  /* ---- 7 bis. Export de la copie vers un Google Sheet SIMULÉ -----------
     Le serveur local joue le rôle du Web App Apps Script : mêmes contrôle
     du jeton et dédoublonnage par identifiant de copie. ------------------ */
  await page.click('.onglet[data-onglet="activite"]');
  await page.waitForTimeout(150);
  const identite = await page.evaluate(() => ({
    champs: Array.from(document.querySelectorAll(".identite input")).map(i => i.id),
    blocEnvoi: !!document.getElementById("bloc-envoi"),
    metaUrl: document.querySelector('meta[name="sheet-url"]').content
  }));
  verifier("Sheet simulé : URL injectée dans la meta", identite.metaUrl === URL_SHEET, identite.metaUrl);
  verifier("identité : exactement nom, prénom, classe — aucun champ date",
    identite.champs.length === 3 &&
    ["nom", "prenom", "classe"].every(id => identite.champs.includes(id)) &&
    !identite.champs.includes("date") && identite.blocEnvoi, identite);

  await page.fill("#nom", "");
  await page.click("#btn-envoyer");
  const refus = await page.evaluate(() => document.getElementById("etat-envoi").textContent);
  verifier("envoi refusé si le nom manque", /Renseigne/.test(refus), refus);

  const q3Test = [
    "D'abord, pendant un effort, les muscles ont besoin de davantage d'énergie.",
    "Le rythme cardiaque de monsieur X passe de 70 à 180 battements par minute : le cœur envoie donc plus de sang vers les muscles.",
    "Ensuite, ce sang transporte le glucose et le dioxygène prélevés, ainsi que le dioxyde de carbone rejeté.",
    "Les valeurs du document 1 montrent que le dioxygène passe de 200 à 150 mL et le glucose de 900 à 800 mg.",
    "Le dioxyde de carbone passe de 490 à 560 mL : il est rejeté par le muscle.",
    "Dans les cellules musculaires, la respiration cellulaire transforme le glucose et le dioxygène en dioxyde de carbone et en eau.",
    "Cette réaction libère ainsi de l'énergie utilisable par les muscles.",
    "Cette énergie sert à la contraction des muscles, alors que le sang ne fait que transporter les réactifs et les déchets.",
    "La respiration pulmonaire, elle, correspond aux échanges de gaz dans les poumons.",
    "En conclusion, c'est bien dans les cellules que l'énergie est produite, et non dans le sang.",
    "Le sang ne fabrique donc pas l'énergie : il approvisionne la respiration cellulaire."
  ].join("\n");
  await page.fill("#nom", "Martin");
  await page.fill("#prenom", "Léa");
  await page.fill("#classe", "3e B");
  await page.fill("#q2", "Le carbone du glucose se retrouve dans le dioxyde de carbone et l'oxygène du dioxygène dans l'eau. Bilan : glucose + dioxygène → dioxyde de carbone + eau + énergie.");
  await page.fill("#q3", q3Test);
  await page.click("#btn-envoyer");
  const confirmation = await page.evaluate(() => ({
    visible: document.getElementById("confirmation-envoi").classList.contains("visible"),
    nom: document.getElementById("conf-nom").textContent,
    prenom: document.getElementById("conf-prenom").textContent,
    classe: document.getElementById("conf-classe").textContent,
    texte: document.getElementById("confirmation-envoi").innerText
  }));
  verifier("confirmation explicite avant envoi",
    confirmation.visible && confirmation.nom === "Martin" && confirmation.prenom === "Léa"
    && confirmation.classe === "3e B" && /Aucune adresse mail/.test(confirmation.texte), confirmation);
  await page.locator("#bloc-envoi").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(__dirname, "shot_envoi.png") });

  await page.click("#btn-annuler-envoi");
  const annule = await page.evaluate(() =>
    !document.getElementById("confirmation-envoi").classList.contains("visible"));
  verifier("l'élève peut annuler l'envoi", annule, annule);
  verifier("aucune copie transmise après annulation", copiesRecues.length === 0, copiesRecues.length);

  await page.click("#btn-envoyer");
  await page.click("#btn-confirmer-envoi");
  await page.waitForTimeout(700);
  const etatEnvoi = await page.evaluate(() => ({
    texte: document.getElementById("etat-envoi").textContent,
    classe: document.getElementById("etat-envoi").className,
    nouvelle: getComputedStyle(document.getElementById("btn-nouvelle-copie")).display
  }));
  verifier("accusé de réception affiché à l'élève",
    /Copie envoyée/.test(etatEnvoi.texte) && etatEnvoi.classe === "succes"
    && etatEnvoi.nouvelle !== "none", etatEnvoi);
  rapport.envoi = etatEnvoi;

  const recu = await page.evaluate(async () => (await fetch("/copies")).json());
  verifier("1 copie reçue par le Sheet", recu.length === 1, recu.length);
  const copie = recu[0] || {};
  const CLES = ["analyse", "autoEvaluation", "bilanScore", "classe", "nom", "prenom", "q1", "q2", "q3"].sort();
  verifier("transmission STRICTEMENT limitée à nom, prénom, classe et réponses",
    JSON.stringify(Object.keys(copie).sort()) === JSON.stringify(CLES),
    Object.keys(copie).sort());
  verifier("aucune date ni horodatage de l'appareil transmis",
    !("date" in copie) && !("horodatage" in copie), Object.keys(copie));
  verifier("identité reçue conforme",
    copie.nom === "Martin" && copie.prenom === "Léa" && copie.classe === "3e B", copie);
  verifier("analyse : 3 compétences et total /20",
    !!copie.analyse && Object.keys(copie.analyse.competences).length === 3
    && copie.analyse.total.max === 20
    && typeof copie.analyse.total.score === "number"
    && typeof copie.analyse.total.niveau === "string",
    copie.analyse && copie.analyse.total);
  verifier("analyse = indicateur à valider, pas une note",
    copie.analyse.aValider === true, copie.analyse.aValider);
  const niveaux = await page.evaluate(() => window.Correction.NIVEAUX);
  verifier("4 niveaux de maîtrise pour la remédiation",
    niveaux.length === 4 &&
    ["Très satisfaisante", "Satisfaisante", "Fragile", "Insuffisante"]
      .every(n => niveaux.includes(n)) && niveaux.includes(copie.analyse.total.niveau),
    { niveaux: niveaux, obtenu: copie.analyse.total.niveau });

  /* Dédoublonnage : renvoyer la même copie met à jour la ligne. */
  await page.click("#btn-envoyer");
  await page.click("#btn-confirmer-envoi");
  await page.waitForTimeout(700);
  const recu2 = await page.evaluate(async () => (await fetch("/copies")).json());
  verifier("renvoi de la même copie = mise à jour, pas de doublon",
    recu2.length === 1, recu2.length);

  const jetonInvalide = await page.evaluate(async () => {
    const r = await fetch("/sheet", {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "ping", token: "faux" })
    });
    return r.json();
  });
  verifier("jeton invalide refusé par le Sheet", jetonInvalide.ok === false, jetonInvalide);

  /* Repli : si le Sheet refuse la copie, l'élève doit pouvoir la récupérer. */
  await page.evaluate(() => {
    window.__fetchInitial = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ ok: false, error: "Jeton invalide (test de repli)" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
  });
  await page.click("#btn-envoyer");
  await page.click("#btn-confirmer-envoi");
  await page.waitForTimeout(500);
  const etatErreur = await page.evaluate(() => ({
    texte: document.getElementById("etat-envoi").textContent,
    classe: document.getElementById("etat-envoi").className
  }));
  await page.evaluate(() => { window.fetch = window.__fetchInitial; });
  verifier("échec d'envoi : repli vers l'export .txt proposé",
    /Jeton invalide/.test(etatErreur.texte) && /Exporter ma copie/.test(etatErreur.texte)
    && etatErreur.classe === "erreur", etatErreur);

  /* ---- Fiche professeur : configuration, test de connexion, aperçu ---- */
  await page.click('.onglet[data-onglet="prof"]');
  await page.waitForTimeout(150);
  const cfg = await page.evaluate(() => ({
    url: document.getElementById("cfg-url").value,
    jeton: document.getElementById("cfg-jeton").value,
    script: document.getElementById("code-gs").value.length,
    boutons: ["btn-cfg-sauver", "btn-cfg-test", "btn-cfg-copier",
      "btn-apercu-analyse", "btn-cfg-regen"]
      .filter(id => !!document.getElementById(id)).length
  }));
  verifier("fiche prof : URL et jeton pré-remplis",
    cfg.url === URL_SHEET && cfg.jeton === "respiration-2027", cfg);
  verifier("fiche prof : Code.gs complet fourni", cfg.script > 10000 && cfg.boutons === 5, cfg);

  await page.click("#btn-cfg-test");
  await page.waitForTimeout(600);
  const cfgEtat = await page.evaluate(() => ({
    texte: document.getElementById("cfg-etat").textContent,
    classe: document.getElementById("cfg-etat").className
  }));
  verifier("test de connexion depuis la fiche prof",
    /Connexion OK/.test(cfgEtat.texte) && cfgEtat.classe === "succes", cfgEtat);

  /* Après une validation manuelle dans « Copies », Synthese / Remediation ne
     se recalculent pas seuls : ce bouton est le seul moyen de les rafraîchir
     sans attendre une nouvelle copie d'élève. */
  await page.click("#btn-cfg-regen");
  await page.waitForTimeout(600);
  const regenEtat = await page.evaluate(() => ({
    texte: document.getElementById("cfg-etat").textContent,
    classe: document.getElementById("cfg-etat").className
  }));
  verifier("régénération manuelle depuis la fiche prof",
    /Synthèse reconstruite/.test(regenEtat.texte) && regenEtat.classe === "succes", regenEtat);

  await page.click("#btn-apercu-analyse");
  const apercu = await page.evaluate(() => ({
    visible: getComputedStyle(document.getElementById("apercu-analyse")).display,
    lignes: document.querySelectorAll("#apercu-analyse table tr").length,
    texte: document.getElementById("apercu-analyse").innerText
  }));
  verifier("aperçu de l'analyse : 3 compétences détaillées",
    apercu.visible !== "none" && apercu.lignes === 4
    && /D4\.2/.test(apercu.texte) && /D4\.1/.test(apercu.texte) && /D1\.3/.test(apercu.texte)
    && /Indicateur automatique/.test(apercu.texte), apercu);
  /* Régression : le panneau élève est MASQUÉ quand le professeur ouvre cet
     aperçu. clientWidth valait 0 → chaque mot comptait pour une ligne (185). */
  const lignesApercu = await page.evaluate(() => {
    const m = document.getElementById("apercu-analyse").innerText
      .match(/Lignes mesurées : (\d+)/);
    return m ? Number(m[1]) : null;
  });
  verifier("aperçu prof : compteur de lignes cohérent, affiché comme information non notée",
    lignesApercu !== null && lignesApercu >= 10 && lignesApercu <= 15
    && /information, non notée/.test(apercu.texte), lignesApercu);
  verifier("aperçu prof : la longueur n'est PLUS un critère de correction",
    !/10 à 15 lignes|rédaction de 10 à 15/.test(apercu.texte), apercu.texte.slice(0, 400));
  verifier("aperçu prof : signaux de construction de phrase affichés",
    /Construction de la phrase/.test(apercu.texte)
    && /marqueur\(s\) de subordination/.test(apercu.texte)
    && /connecteur\(s\) en tête de phrase/.test(apercu.texte)
    && /MDL [\d.]+\/2/.test(apercu.texte), apercu.texte.slice(0, 700));
  await page.locator("#apercu-analyse").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(__dirname, "shot_apercu.png") });

  /* ---- Nouvelle copie : effacement en deux clics, sans confirm() ------ */
  await page.click('.onglet[data-onglet="activite"]');
  await page.click("#btn-nouvelle-copie");
  await page.click("#btn-nouvelle-copie");
  const efface = await page.evaluate(() => ({
    q1: document.getElementById("q1").value,
    nom: document.getElementById("nom").value,
    bouton: getComputedStyle(document.getElementById("btn-nouvelle-copie")).display
  }));
  verifier("nouvelle copie : effacement en deux clics",
    efface.q1 === "" && efface.nom === "" && efface.bouton === "none", efface);
  rapport.sheets = {
    copies: recu2.length, identite: identite, cfg: cfg,
    apercu: apercu, clefsCopie: Object.keys(copie).sort()
  };

  /* ---- 8. Aucune erreur applicative ---- */
  verifier("0 erreur JS dans la console", erreursApplicatives.length === 0, erreursApplicatives);
  rapport.erreursApplicatives = erreursApplicatives;

  /* ---- 9. Ressources externes ---- */
  const externes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img[src],script[src],link[href]"))
      .map(e => e.getAttribute("src") || e.getAttribute("href"))
      .filter(v => v && /^https?:/.test(v))
  );
  verifier("aucune ressource externe chargée", externes.length === 0, externes);

  /* ---- 10. Cohérence du modèle : noyau dedans, mitochondrie seule active ---- */
  const rayonCellule = Number((HTML.match(/const RAYON_CELLULE = ([\d.]+)/) || [])[1]);
  const posNoyau = HTML.match(/const NOYAU_POS = new THREE\.Vector3\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
  const rayonNoyau = Number((HTML.match(/enveloppeNoyau = new THREE\.Mesh\(\s*new THREE\.SphereGeometry\(([\d.]+)/) || [])[1]);
  const distanceNoyau = posNoyau
    ? Math.hypot(Number(posNoyau[1]), Number(posNoyau[2]), Number(posNoyau[3])) : NaN;
  const marge = rayonCellule - (distanceNoyau + rayonNoyau);
  verifier("noyau entièrement contenu dans la cellule", marge > 0.5,
    { rayonCellule: rayonCellule, rayonNoyau: rayonNoyau,
      distanceNoyau: Math.round(distanceNoyau * 100) / 100, marge: Math.round(marge * 100) / 100 });
  rapport.geometrieNoyau = { rayonCellule: rayonCellule, rayonNoyau: rayonNoyau, marge: marge };

  const debutReaction = HTML.indexOf("SEULE LA MITOCHONDRIE RÉAGIT");
  const finReaction = HTML.indexOf("Aucune autre propriété de la cellule", debutReaction);
  const blocReaction = debutReaction >= 0 && finReaction > debutReaction
    ? HTML.slice(debutReaction, finReaction) : "";
  const animesInterdits = ["cellule.scale", "noyau.scale", "membrane.scale",
    "cytoplasme.scale", "cellule.rotation", "noyau.rotation"].filter(m => HTML.includes(m));
  verifier("seule la mitochondrie est animée",
    /mito\.scale\.setScalar/.test(blocReaction)
      && !/cellule\.|noyau\.|membrane\.|cytoplasme\./.test(blocReaction)
      && animesInterdits.length === 0,
    { bloc: blocReaction.replace(/\s+/g, " ").slice(0, 240), animesInterdits: animesInterdits });

  /* ---- 11. Ouverture réelle en file:// : clé USB, aucun serveur ---- */
  const urlFichier = "file:///" + FICHIER.replace(/\\/g, "/").replace(/ /g, "%20");
  const pageFichier = await navigateur.newPage({ viewport: { width: 1366, height: 768 } });
  const erreursFichier = [];
  pageFichier.on("pageerror", e => erreursFichier.push("PAGEERROR " + e.message));
  pageFichier.on("console", m => {
    if (m.type() === "error") erreursFichier.push("CONSOLE " + m.text());
  });
  await pageFichier.goto(urlFichier, { waitUntil: "load" });
  await pageFichier.waitForTimeout(1500);
  const horsLigne = await pageFichier.evaluate(() => ({
    canvas: !!document.querySelector("#scene canvas"),
    secours: getComputedStyle(document.getElementById("secours3d")).display,
    onglets: document.querySelectorAll(".onglet").length,
    images: Array.from(document.querySelectorAll(".doc-body img"))
      .filter(i => i.complete && i.naturalWidth > 0).length,
    etiquettes: document.querySelectorAll("#scene .etiquette-3d").length,
    localStorage: (() => {
      try { localStorage.setItem("__test__", "1"); localStorage.removeItem("__test__"); return "disponible"; }
      catch (e) { return "bloqué (pris en charge par try/catch)"; }
    })()
  }));
  verifier("ouverture hors ligne file:// : 3D active",
    horsLigne.canvas && horsLigne.secours === "none" && horsLigne.etiquettes >= 6, horsLigne);
  verifier("ouverture hors ligne file:// : 4 onglets et 2 documents illustrés",
    horsLigne.onglets === 4 && horsLigne.images === 2, horsLigne);
  verifier("ouverture hors ligne file:// : 0 erreur JS", erreursFichier.length === 0, erreursFichier);
  rapport.horsLigne = horsLigne;
  await pageFichier.close();

  await navigateur.close();
  await new Promise(r => serveur.close(r));

  rapport.total = reussis + "/" + total;
  rapport.sortie = reussis === total ? "TOUS LES TESTS PASSENT" : "ÉCHECS";
  fs.writeFileSync(path.join(__dirname, "rapport.json"), JSON.stringify(rapport, null, 2), "utf8");
  console.log(rapport.total, rapport.sortie);
  erreurs.forEach(e => console.log(e));
  process.exit(reussis === total ? 0 : 1);
})().catch(e => {
  console.error("ERREUR DU TEST :", e);
  process.exit(2);
});
