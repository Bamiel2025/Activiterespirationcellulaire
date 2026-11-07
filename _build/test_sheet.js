/* ============================================================================
 *  Validation du pont Google Sheets SANS déploiement.
 *  On exécute le vrai Code.gs dans un contexte Node où SpreadsheetApp,
 *  Charts, LockService et ContentService sont simulés. On vérifie ainsi la
 *  logique qui n'est pas testable depuis le navigateur : dédoublonnage,
 *  synthèse, graphiques et surtout la feuille de REMÉDIATION.
 *
 *  node test_sheet.js
 * ========================================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

require("./correction.js");
const C = globalThis.Correction;

let total = 0, ok = 0;
const echecs = [];
function verifier(nom, condition, detail) {
  total++;
  if (condition) ok++;
  else echecs.push("ÉCHEC " + nom + " : " + JSON.stringify(detail));
}

/* ---------------------------------------------------------------------------
 *  MOCK d'un classeur Google Sheets
 * ------------------------------------------------------------------------- */
class Plage {
  constructor(feuille, ligne, colonne, nl, nc) {
    this.f = feuille; this.l = ligne; this.c = colonne; this.nl = nl; this.nc = nc;
  }
  setValues(valeurs) {
    for (let i = 0; i < valeurs.length; i++)
      for (let j = 0; j < valeurs[i].length; j++)
        this.f.ecrire(this.l + i, this.c + j, valeurs[i][j]);
    return this;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nl; i++) {
      const ligne = [];
      for (let j = 0; j < this.nc; j++) ligne.push(this.f.lire(this.l + i, this.c + j));
      out.push(ligne);
    }
    return out;
  }
  setValue(v) { this.f.ecrire(this.l, this.c, v); return this; }
  /* Méthodes de mise en forme : sans effet sur les données, mais chaînables. */
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setWrapStrategy() { return this; }
  setNote() { return this; }
  setNumberFormat() { return this; }
  sort() { return this; }
}

class Feuille {
  constructor(nom) {
    this.nom = nom;
    this.grille = new Map();     // "l,c" -> valeur
    this.derniereLigne = 0;
    this.graphiques = [];
    this.regles = [];
    this.lignesGelees = 0;
    this.largeurs = {};
  }
  ecrire(l, c, v) {
    this.grille.set(l + "," + c, v);
    if (l > this.derniereLigne) this.derniereLigne = l;
  }
  lire(l, c) {
    const v = this.grille.get(l + "," + c);
    return v === undefined ? "" : v;
  }
  getLastRow() { return this.derniereLigne; }
  getRange(a, b, c, d) {
    if (typeof a === "string") return new Plage(this, 1, 1, 1, 1); // 'A1' -> setNote
    return new Plage(this, a, b, c || 1, d || 1);
  }
  appendRow(ligne) {
    const l = this.derniereLigne + 1;
    ligne.forEach((v, i) => this.ecrire(l, i + 1, v));
    return l;
  }
  clear() { this.grille.clear(); this.derniereLigne = 0; }
  setFrozenRows(n) { this.lignesGelees = n; }
  setColumnWidth(c, w) { this.largeurs[c] = w; }
  setConditionalFormatRules(r) { this.regles = r; }
  getCharts() { return this.graphiques.slice(); }
  removeChart(g) { this.graphiques = this.graphiques.filter(x => x !== g); }
  insertChart(g) { this.graphiques.push(g); }
  newChart() {
    const g = { options: {}, ranges: [], type: null, position: null };
    const chaine = {
      setChartType: t => { g.type = t; return chaine; },
      addRange: p => { g.ranges.push(p); return chaine; },
      setOption: (k, v) => { g.options[k] = v; return chaine; },
      setPosition: (l, c, x, y) => { g.position = { ligne: l, colonne: c, x: x, y: y }; return chaine; },
      build: () => g
    };
    return chaine;
  }
}

class Classeur {
  constructor() { this.feuilles = new Map(); }
  getSheetByName(n) { return this.feuilles.get(n) || null; }
  insertSheet(n) { const f = new Feuille(n); this.feuilles.set(n, f); return f; }
}

const classeur = new Classeur();

function regle() {
  const r = {};
  const chaine = {
    whenTextEqualTo: v => { r.texte = v; return chaine; },
    setBackground: v => { r.fond = v; return chaine; },
    setRanges: v => { r.plages = v; return chaine; },
    build: () => r
  };
  return chaine;
}

const sandbox = {
  console: console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => classeur,
    newConditionalFormatRule: regle,
    WrapStrategy: { WRAP: "WRAP" }
  },
  Charts: { ChartType: { COLUMN: "COLUMN", BAR: "BAR" } },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: {
    MimeType: { JSON: "JSON" },
    createTextOutput: txt => ({ texte: txt, setMimeType: function () { return this; } })
  }
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8"), sandbox,
  { filename: "Code.gs" });

function poster(charge) {
  const sortie = sandbox.doPost({ postData: { contents: JSON.stringify(charge) } });
  return JSON.parse(sortie.texte);
}

/* ---------------------------------------------------------------------------
 *  Copies de démonstration : l'analyse est la VRAIE sortie de correction.js
 * ------------------------------------------------------------------------- */
const Q1_FORT = "Le dioxygène passe de 200 à 150 mL par litre de sang : le muscle en prélève 50 mL. " +
  "Le glucose passe de 900 à 800 mg : le muscle en prélève 100 mg. " +
  "Le dioxyde de carbone passe de 490 à 560 mL : le muscle en rejette 70 mL. " +
  "Le muscle prélève donc du glucose et du dioxygène et rejette du dioxyde de carbone, un déchet.";
const Q2_FORT = "Le carbone du glucose se retrouve dans le dioxyde de carbone. " +
  "L'oxygène du dioxygène se retrouve dans l'eau. " +
  "Bilan de la respiration cellulaire : glucose + dioxygène → dioxyde de carbone + eau + énergie. " +
  "Cette réaction chimique se déroule dans les cellules musculaires, dans les mitochondries ; elle libère l'énergie utilisable.";
const Q3_FORT = "D'abord, pendant un effort, les muscles ont besoin de davantage d'énergie. " +
  "Le rythme cardiaque de monsieur X passe de 70 à 180 battements par minute : le cœur envoie donc plus de sang vers les muscles. " +
  "Ensuite, ce sang transporte le glucose et le dioxygène prélevés, ainsi que le dioxyde de carbone rejeté : les valeurs du document 1 montrent que le dioxygène passe de 200 à 150 mL, le glucose de 900 à 800 mg et le dioxyde de carbone de 490 à 560 mL. " +
  "Dans les cellules musculaires, la respiration cellulaire transforme le glucose et le dioxygène en dioxyde de carbone et en eau ; elle libère ainsi de l'énergie. " +
  "Cette énergie sert à la contraction des muscles, alors que le sang ne fait que transporter les réactifs et les déchets. " +
  "En conclusion, c'est bien dans les cellules, et non dans le sang ni dans les poumons, que l'énergie est produite.";

/* Aucun identifiant dans le payload : c'est le Sheet qui le calcule. */
function copie(nom, prenom, classe, q1, q2, q3, lignes, bilanScore) {
  const d = { q1: q1, q2: q2, q3: q3, lignes: lignes, bilanScore: bilanScore };
  return {
    nom: nom, prenom: prenom, classe: classe,
    q1: q1, q2: q2, q3: q3, bilanScore: bilanScore,
    analyse: C.analyser(d)
  };
}

const forte = copie("Martin", "Léa", "3e B", Q1_FORT, Q2_FORT, Q3_FORT, 12, 7);
const faible = copie("Durand", "Tom", "3e B", "", "", "le muscle utilise de l'air pour bouger. c'est les poumons qui donnent l'energie.", 1, 0);

/* ---------------------------------------------------------------------------
 *  1. Points d'entrée HTTP et jeton
 * ------------------------------------------------------------------------- */
const ping = poster({ action: "ping", token: "respiration-2027" });
verifier("ping : connexion OK", ping.ok === true && ping.feuilles.length === 3, ping);
verifier("ping : 3 onglets créés", ["Copies", "Synthese", "Remediation"]
  .every(n => classeur.getSheetByName(n)), Object.keys(classeur.feuilles || {}));

const sansJeton = poster({ action: "ping", token: "faux" });
verifier("jeton invalide refusé", sansJeton.ok === false, sansJeton);

const copies = classeur.getSheetByName("Copies");
const entetes = copies.getRange(1, 1, 1, 100).getValues()[0];
verifier("aucune colonne DATE_COPIE", !entetes.includes("DATE_COPIE"), entetes);
verifier("HORODATAGE ajouté par le serveur", entetes[1] === "HORODATAGE", entetes.slice(0, 6));
verifier("colonnes nom / prénom / classe", entetes[2] === "NOM" && entetes[3] === "PRENOM" && entetes[4] === "CLASSE", entetes.slice(0, 6));
verifier("colonnes de suivi professeur présentes",
  ["NB_ENVOIS", "VALIDATION_PROF", "NOTE_PROF"].every(h => entetes.includes(h)),
  entetes.slice(28, 33));

/* Normalisation des classes (bonne idée reprise de Wooflashquizz) :
   sans elle, « 3e B » et « 3°B » créent deux lignes pour le même élève. */
const variantes3B = ["3e B", "3°B", "3ème B", "3 B", "3EB", "3eB", "3e-b", "Troisième B"];
verifier("normalisation : 8 écritures de « 3e B » convergent vers 3B",
  variantes3B.every(v => sandbox.normClass(v) === "3B"),
  variantes3B.map(v => [v, sandbox.normClass(v)]));
verifier("normalisation : 3e6 / 3°6 / 3ème 6 → 36",
  ["3e6", "3°6", "3ème 6", "3 6"].every(v => sandbox.normClass(v) === "36"),
  ["3e6", "3°6", "3ème 6", "3 6"].map(v => [v, sandbox.normClass(v)]));
verifier("classes « 3E1 » forcées en texte par Sheets",
  sandbox.sheetText("3E1") === "'3E1" && sandbox.sheetText("3e B") === "3e B",
  [sandbox.sheetText("3E1"), sandbox.sheetText("3e B")]);

/* ---------------------------------------------------------------------------
 *  2. Réception, horodatage serveur, dédoublonnage
 * ------------------------------------------------------------------------- */
const r1 = poster({ action: "append", token: "respiration-2027", copie: forte });
verifier("copie forte acceptée", r1.ok === true && r1.ligne === 2, r1);
verifier("niveau global = Très satisfaisante", r1.niveauGlobal === "Très satisfaisante", r1);
verifier("score /20 transmis au Sheet", r1.total === forte.analyse.total.score, r1);
verifier("HORODATAGE renseigné sans saisie élève",
  /^\d{4}-\d{2}-\d{2}T/.test(String(copies.lire(2, 2))), copies.lire(2, 2));
verifier("identité = nom / prénom / classe seulement",
  copies.lire(2, 3) === "Martin" && copies.lire(2, 4) === "Léa" && copies.lire(2, 5) === "3e B",
  [copies.lire(2, 3), copies.lire(2, 4), copies.lire(2, 5)]);
const colAValider = entetes.indexOf("A_VALIDER") + 1;
verifier("A_VALIDER = Oui (indicateur, pas note)",
  colAValider > 0 && copies.lire(2, colAValider) === "Oui",
  { index: colAValider, valeur: copies.lire(2, colAValider) });

const r2 = poster({ action: "append", token: "respiration-2027", copie: forte });
verifier("renvoi de la même copie = mise à jour, pas doublon",
  r2.ok === true && r2.ligne === 2 && copies.getLastRow() === 2,
  { r2: r2, lignes: copies.getLastRow() });

/* Le professeur valide et corrige la note dans la feuille : un 3e envoi de
   l'élève ne doit PAS écraser ces colonnes (défaut de Wooflashquizz). */
const colValidation = entetes.indexOf("VALIDATION_PROF") + 1;
const colNote = entetes.indexOf("NOTE_PROF") + 1;
const colEnvois = entetes.indexOf("NB_ENVOIS") + 1;
copies.ecrire(2, colValidation, "Validé — orthographe revue");
copies.ecrire(2, colNote, "19");
const r2b = poster({ action: "append", token: "respiration-2027", copie: forte });
verifier("NB_ENVOIS compte les reprises",
  r2b.ok === true && Number(copies.lire(2, colEnvois)) === 3, copies.lire(2, colEnvois));
verifier("redépôt : validation et note du professeur PRÉSERVÉES",
  copies.lire(2, colValidation) === "Validé — orthographe revue" && copies.lire(2, colNote) === "19",
  { validation: copies.lire(2, colValidation), note: copies.lire(2, colNote) });
verifier("A_VALIDER passe à Non après validation du professeur",
  copies.lire(2, colAValider) === "Non", copies.lire(2, colAValider));

/* Variante de la classe : même élève, pas de doublon. */
const variante = JSON.parse(JSON.stringify(forte));
variante.classe = "3°B";
const r2c = poster({ action: "append", token: "respiration-2027", copie: variante });
verifier("« 3e B » et « 3°B » = une seule ligne", r2c.ligne === 2 && copies.getLastRow() === 2,
  { ligne: r2c.ligne, lignes: copies.getLastRow() });

const r3 = poster({ action: "append", token: "respiration-2027", copie: faible });
verifier("copie faible acceptée", r3.ok === true && r3.ligne === 3, r3);
verifier("2 élèves distincts = 2 lignes", copies.getLastRow() === 3, copies.getLastRow());
verifier("identifiant calculé par le Sheet, sans date",
  sandbox.identifiant("Martin", "Léa", "3e B") === "martin_lea_3b",
  sandbox.identifiant("Martin", "Léa", "3e B"));

/* ---------------------------------------------------------------------------
 *  3. REMÉDIATION : le bug historique sélectionnait les BONS élèves
 * ------------------------------------------------------------------------- */
const rem = classeur.getSheetByName("Remediation");
/* On filtre sur le NOM de l'élève (colonne 2) : la note de pied « X copie(s)
   déjà validée(s) » n'occupe que la colonne 1 et n'est pas une ligne de
   remédiation. */
const lignesRem = rem.getRange(2, 1, Math.max(1, rem.getLastRow() - 1), 7).getValues()
  .filter(r => String(r[1]).trim() !== "");
const nomsRem = lignesRem.map(r => String(r[1]));
verifier("remédiation : l'élève faible est ciblé", nomsRem.includes("Tom Durand"), nomsRem);
verifier("remédiation : l'élève très satisfaisant est EXCLU", !nomsRem.includes("Léa Martin"), nomsRem);
verifier("remédiation : 3 compétences pour l'élève faible",
  lignesRem.filter(r => r[1] === "Tom Durand").length === 3, lignesRem);
verifier("remédiation : uniquement Fragile / Insuffisante",
  lignesRem.every(r => ["Fragile", "Insuffisante"].includes(String(r[3]))),
  lignesRem.map(r => r[3]));
verifier("remédiation : « ce qui manque » renseigné",
  lignesRem.every(r => String(r[5]).length > 3), lignesRem.map(r => r[5]));

/* ---------------------------------------------------------------------------
 *  4. SYNTHÈSE : effectifs, tableau par élève, graphiques
 * ------------------------------------------------------------------------- */
const synthese = classeur.getSheetByName("Synthese");
verifier("synthèse : en-tête des 4 niveaux",
  synthese.lire(1, 1) === "Compétence" &&
  ["Très satisfaisante", "Satisfaisante", "Fragile", "Insuffisante"]
    .every((n, i) => synthese.lire(1, i + 2) === n),
  [1, 2, 3, 4, 5].map(c => synthese.lire(1, c)));
verifier("synthèse : 3 compétences + global", synthese.lire(2, 1).indexOf("D4.2") === 0
  && synthese.lire(5, 1).indexOf("Global") === 0, [2, 3, 4, 5].map(l => synthese.lire(l, 1)));
verifier("synthèse : tableau par élève (2 lignes)",
  synthese.lire(8, 1) === "Élève" && synthese.lire(9, 1) !== "" && synthese.lire(10, 1) !== "",
  [9, 10].map(l => synthese.lire(l, 1)));
verifier("synthèse : suivi professeur affiché pour CHAQUE élève",
  synthese.lire(8, 8) === "À valider" && synthese.lire(8, 9) === "Envois"
  && synthese.lire(8, 10) === "Note prof"
  && ["Oui", "Non"].includes(String(synthese.lire(9, 8)))
  && Number(synthese.lire(9, 9)) >= 1,
  [8, 9, 10].map(c => [synthese.lire(8, c), synthese.lire(9, c)]));
verifier("synthèse : 4 règles de mise en forme conditionnelle",
  synthese.regles.length === 4, synthese.regles);
verifier("synthèse : 2 graphiques insérés", synthese.graphiques.length === 2, synthese.graphiques.length);
verifier("graphique 1 = colonnes empilées par compétence",
  synthese.graphiques[0].type === "COLUMN" && synthese.graphiques[0].options.isStacked === true,
  synthese.graphiques[0]);
verifier("graphique 2 = barres de score /20", synthese.graphiques[1].type === "BAR", synthese.graphiques[1]);
verifier("graphiques placés SOUS les résultats d'élèves",
  synthese.graphiques.every(g => g.position.ligne >= 9 + 2 + 2),
  synthese.graphiques.map(g => g.position));
verifier("graphiques non superposés horizontalement",
  synthese.graphiques[0].position.colonne === 1 && synthese.graphiques[1].position.colonne === 10,
  synthese.graphiques.map(g => g.position.colonne));

/* ---------------------------------------------------------------------------
 *  5. Régénération manuelle et garde-fou
 * ------------------------------------------------------------------------- */
const regen = poster({ action: "synthese", token: "respiration-2027" });
verifier("régénération manuelle OK", regen.ok === true && regen.eleves === 2 && regen.lignesRemediation === 3, regen);
verifier("régénération : pas de graphique fantôme", synthese.graphiques.length === 2, synthese.graphiques.length);

const longue = JSON.parse(JSON.stringify(faible));
longue.nom = "Gros";
longue.prenom = "Texte";
longue.q3 = "x".repeat(9000);
const rLong = poster({ action: "append", token: "respiration-2027", copie: longue });
verifier("garde-fou MAX_TEXTE respecté",
  rLong.ok === true && String(copies.lire(4, 8)).length === 5000,
  { longueur: String(copies.lire(4, 8)).length });

/* ---------------------------------------------------------------------------
 *  6. Validation MANUELLE du professeur : cohérence Synthèse / Remédiation
 * ---------------------------------------------------------------------------
 *  Cas critique : une copie FRAGILE que le professeur valide à la main en
 *  remplissant VALIDATION_PROF, SANS toucher à A_VALIDER. Elle doit disparaître
 *  de la remédiation ET afficher « À valider : Non » dans la synthèse.
 *  (La copie forte validée plus haut ne testait pas ce cas : elle n'était de
 *  toute façon jamais candidate à la remédiation.)                          */
const remAvant = classeur.getSheetByName("Remediation");
const nomsAvant = remAvant.getRange(2, 1, Math.max(1, remAvant.getLastRow() - 1), 7).getValues()
  .filter(r => String(r[1]).trim() !== "").map(r => String(r[1]));
verifier("avant validation : la copie faible « Texte Gros » est bien à remédier",
  nomsAvant.includes("Texte Gros"), nomsAvant);

copies.ecrire(4, colValidation, "Remédiation faite en classe");
const regen2 = poster({ action: "synthese", token: "respiration-2027" });

const remApres = classeur.getSheetByName("Remediation");
const toutesLignes = remApres.getRange(2, 1, Math.max(1, remApres.getLastRow() - 1), 7).getValues();
const nomsApres = toutesLignes.filter(r => String(r[1]).trim() !== "").map(r => String(r[1]));
const pied = toutesLignes.map(r => String(r[0])).join(" | ");

verifier("validation manuelle : la copie sort de la remédiation",
  !nomsApres.includes("Texte Gros"), nomsApres);
verifier("validation manuelle : les autres élèves fragiles restent ciblés",
  nomsApres.includes("Tom Durand"), nomsApres);
verifier("remédiation : pied de feuille « 2 copie(s) déjà validée(s) »",
  /2 copie\(s\) déjà validée\(s\)/.test(pied), pied);
verifier("régénération : valideesIgnorees = 2, 3 lignes de remédiation",
  regen2.valideesIgnorees === 2 && regen2.lignesRemediation === 3, regen2);

const lignesSynthese = synthese.getRange(9, 1, regen2.eleves, 10).getValues();
const ligneGros = lignesSynthese.find(r => String(r[0]) === "Texte Gros");
verifier("synthèse : « À valider » = Non pour la copie validée à la main",
  !!ligneGros && String(ligneGros[7]) === "Non",
  lignesSynthese.map(r => [r[0], r[7]]));
verifier("synthèse : « À valider » = Oui pour la copie non traitée",
  lignesSynthese.some(r => String(r[0]) === "Tom Durand" && String(r[7]) === "Oui"),
  lignesSynthese.map(r => [r[0], r[7]]));

/* ---------------------------------------------------------------------------
 *  Résultat
 * ------------------------------------------------------------------------- */
console.log(ok + "/" + total, ok === total ? "TOUS LES TESTS PASSENT" : "ÉCHECS");
echecs.forEach(e => console.log(e));
process.exit(ok === total ? 0 : 1);
