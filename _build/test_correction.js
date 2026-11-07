/* Tests unitaires de la grille de correction : copies synthétiques.
   Aucun navigateur requis : node test_correction.js */
require("./correction.js");
const C = globalThis.Correction;

let total = 0, ok = 0;
function verifier(nom, condition, detail) {
  total++;
  if (condition) ok++;
  else console.log("ÉCHEC", nom, JSON.stringify(detail));
}

const Q1_EXCELLENT = "Le dioxygène passe de 200 à 150 mL par litre de sang : le muscle en prélève 50 mL. " +
  "Le glucose passe de 900 à 800 mg : le muscle en prélève 100 mg. " +
  "Le dioxyde de carbone passe de 490 à 560 mL : le muscle en rejette 70 mL. " +
  "Le muscle prélève donc du glucose et du dioxygène et rejette du dioxyde de carbone, un déchet.";

const Q2_EXCELLENT = "Le carbone du glucose se retrouve dans le dioxyde de carbone. " +
  "L'oxygène du dioxygène se retrouve dans l'eau. " +
  "Bilan de la respiration cellulaire : glucose + dioxygène → dioxyde de carbone + eau + énergie. " +
  "Cette réaction chimique se déroule dans les cellules musculaires, dans les mitochondries ; elle libère l'énergie utilisable.";

const Q3_MODELE = "Pendant un effort, les muscles ont besoin de plus d'énergie. " +
  "Le rythme cardiaque passe de 70 à 180 battements par minute : le cœur propulse davantage de sang vers les muscles. " +
  "Ce sang apporte du glucose et du dioxygène et emporte le dioxyde de carbone produit. " +
  "Dans les cellules musculaires, le glucose réagit avec le dioxygène : il se forme du dioxyde de carbone et de l'eau, et de l'énergie est libérée. " +
  "C'est la respiration cellulaire. Cette énergie permet la contraction des muscles. " +
  "Le sang ne fabrique donc pas l'énergie : il transporte les réactifs et les déchets nécessaires à la respiration cellulaire.";

const Q3_PARFAIT = "D'abord, pendant un effort, les muscles ont besoin de davantage d'énergie. " +
  "Le rythme cardiaque de monsieur X passe de 70 à 180 battements par minute : le cœur envoie donc plus de sang vers les muscles. " +
  "Ensuite, ce sang transporte le glucose et le dioxygène prélevés, ainsi que le dioxyde de carbone rejeté : les valeurs du document 1 montrent que le dioxygène passe de 200 à 150 mL, le glucose de 900 à 800 mg et le dioxyde de carbone de 490 à 560 mL. " +
  "Dans les cellules musculaires, la respiration cellulaire transforme le glucose et le dioxygène en dioxyde de carbone et en eau ; elle libère ainsi de l'énergie. " +
  "Cette énergie sert à la contraction des muscles, alors que le sang ne fait que transporter les réactifs et les déchets. " +
  "En conclusion, c'est bien dans les cellules, et non dans le sang ni dans les poumons, que l'énergie est produite.";

const Q3_FAIBLE = "le muscle utilise de l'air pour bouger. le coeur bat plus vite. c'est les poumons qui donnent l'energie.";

/* --- 1. Copie vide ---------------------------------------------------- */
const vide = C.analyser({ q1: "", q2: "", q3: "", lignes: 0, bilanScore: 0 });
verifier("copie vide : 0/20", vide.total.score === 0, vide.total);
verifier("copie vide : niveau insuffisant", vide.total.niveau === "Insuffisante", vide.total);
verifier("copie vide : 3 compétences", Object.keys(vide.competences).length === 3, Object.keys(vide.competences));
verifier("copie vide : D4.2 manques renseignés", vide.competences["D4.2"].manques.length === 5, vide.competences["D4.2"].manques);
verifier("copie vide : marquée à valider", vide.aValider === true, vide.aValider);

/* --- 2. Très bonne copie --------------------------------------------- */
const fort = C.analyser({ q1: Q1_EXCELLENT, q2: Q2_EXCELLENT, q3: Q3_PARFAIT, lignes: 12, bilanScore: 7 });
verifier("forte copie : D4.2 = 4/4", fort.competences["D4.2"].score === 4, fort.competences["D4.2"]);
verifier("forte copie : D4.1 = 6/6", fort.competences["D4.1"].score === 6, fort.competences["D4.1"]);
verifier("forte copie : D1.3 >= 9/10", fort.competences["D1.3"].score >= 9, fort.competences["D1.3"]);
verifier("forte copie : total très satisfaisant", fort.total.niveau === "Très satisfaisante", fort.total);
verifier("forte copie : 5 mots imposés", fort.indicateurs.motsImposes.length === 5, fort.indicateurs.motsImposes);
verifier("forte copie : >= 3 connecteurs", fort.indicateurs.nbConnecteurs >= 3, fort.indicateurs.connecteurs);
verifier("forte copie : 6 valeurs du doc 1", fort.indicateurs.valeursQ1.length === 6, fort.indicateurs.valeursQ1);
verifier("forte copie : pas de manque MDL", fort.competences["D1.3"].criteres[4].acquis === true, fort.competences["D1.3"].criteres[4]);

/* --- 3. Réponse modèle du dossier professeur -------------------------- */
const modele = C.analyser({ q1: Q1_EXCELLENT, q2: Q2_EXCELLENT, q3: Q3_MODELE, lignes: 11, bilanScore: 7 });
verifier("réponse modèle : total >= 16/20", modele.total.score >= 16, modele.total);
verifier("réponse modèle : niveau au moins satisfaisant",
  ["Très satisfaisante", "Satisfaisante"].indexOf(modele.total.niveau) >= 0, modele.total);
verifier("réponse modèle : mots imposés complets", modele.indicateurs.motsAbsents.length === 0, modele.indicateurs.motsAbsents);

/* --- 4. Copie faible -------------------------------------------------- */
const faible = C.analyser({ q1: "le sang apporte de l'oxygène", q2: "le glucose donne de l'énergie", q3: Q3_FAIBLE, lignes: 3, bilanScore: 1 });
verifier("faible copie : total < 8/20", faible.total.score < 8, faible.total);
verifier("faible copie : niveau insuffisant ou fragile",
  ["Insuffisante", "Fragile"].indexOf(faible.total.niveau) >= 0, faible.total);
verifier("faible copie : mots imposés absents signalés", faible.indicateurs.motsAbsents.length >= 3, faible.indicateurs.motsAbsents);
verifier("faible copie : alerte poumons/brûle", faible.alertes.length >= 1, faible.alertes);
verifier("faible copie : D1.3 insuffisante", faible.competences["D1.3"].niveau === "Insuffisante", faible.competences["D1.3"]);

/* --- 4 bis. Les quatre niveaux doivent être atteignables --------------- */
const Q1_MOYEN = "Le dioxygène passe de 200 à 150 et le glucose de 900 à 800. " +
  "Le dioxyde de carbone augmente de 490 à 560. Le muscle prélève du glucose et du dioxygène.";
const Q2_MOYEN = "Le carbone du glucose se retrouve dans le dioxyde de carbone. " +
  "Le glucose réagit avec le dioxygène et donne du dioxyde de carbone, de l'eau et de l'énergie dans les cellules.";
const Q3_MOYEN = "Pendant un effort le muscle a besoin d'énergie. " +
  "Le cœur bat plus vite et le sang apporte le glucose et le dioxygène. " +
  "Dans les cellules, la respiration cellulaire produit de l'énergie. " +
  "Le sang transporte les réactifs. Donc le muscle peut se contracter.";
const moyen = C.analyser({ q1: Q1_MOYEN, q2: Q2_MOYEN, q3: Q3_MOYEN, lignes: 8, bilanScore: 5 });
verifier("copie moyenne : niveau satisfaisant ou très satisfaisant",
  ["Satisfaisante", "Très satisfaisante"].indexOf(moyen.total.niveau) >= 0, moyen.total);

const Q1_FRAGILE = "Le sang entrant contient du dioxygène et du glucose. " +
  "Le dioxygène passe de 200 à 150 mL donc le muscle en prélève. " +
  "Le sang sortant contient du dioxyde de carbone.";
const Q2_FRAGILE = "Le glucose est transformé en dioxyde de carbone dans les cellules. Il y a de l'énergie.";
const Q3_FRAGILE = "Le muscle a besoin d'énergie. " +
  "Le sang apporte le glucose et le dioxygène, donc la respiration cellulaire peut avoir lieu dans les cellules. " +
  "Le rythme cardiaque passe de 70 à 180 battements par minute car le cœur travaille plus. " +
  "L'énergie sert à courir.";
const intermediaire = C.analyser({ q1: Q1_FRAGILE, q2: Q2_FRAGILE, q3: Q3_FRAGILE, lignes: 6, bilanScore: 3 });
verifier("copie intermédiaire : ni extrême",
  intermediaire.total.score > 4 && intermediaire.total.score < 17, intermediaire.total);

/* Les quatre niveaux exigés par brice doivent être définis et ordonnés. */
verifier("4 niveaux de maîtrise : Très satisfaisante / Satisfaisante / Fragile / Insuffisante",
  C.niveau(0.9) === "Très satisfaisante" &&
  C.niveau(0.7) === "Satisfaisante" &&
  C.niveau(0.5) === "Fragile" &&
  C.niveau(0.2) === "Insuffisante",
  [C.niveau(0.9), C.niveau(0.7), C.niveau(0.5), C.niveau(0.2)]);
verifier("seuils 80 / 60 / 40 %", C.SEUILS.join("/") === "0.8/0.6/0.4", C.SEUILS);

const niveauxObtenus = [vide, faible, intermediaire, moyen, modele]
  .map(a => a.total.niveau);
verifier("3 niveaux distincts couverts par les copies de test",
  new Set(niveauxObtenus).size >= 3, niveauxObtenus);

/* --- 5. Robustesse des détections ------------------------------------- */
verifier("« eau » n'est pas trouvé dans « nouveau »",
  !/(?:^|\s)eau(?=\s|$)/.test(C.normaliser("un nouveau muscle").replace(/[^a-z0-9']+/g, " ").trim()), true);
const piege = C.analyser({ q1: "1200 1500 2000", q2: "", q3: "", lignes: 0 });
verifier("1200 ne compte pas comme 200", piege.indicateurs.valeursQ1.indexOf(200) === -1, piege.indicateurs.valeursQ1);
const sansAccents = C.analyser({ q1: "", q2: "", q3: "L'énergie, le dioxygène et la respiration cellulaire : donc le sang.", lignes: 1 });
verifier("accents et apostrophes typographiques gérés",
  sansAccents.indicateurs.motsImposes.length >= 3, sansAccents.indicateurs.motsImposes);

/* --- 6. Monotonie : ajouter du contenu ne fait jamais baisser --------- */
const partiel = C.analyser({ q1: "Le dioxygène passe de 200 à 150 mL.", q2: "", q3: "", lignes: 0 });
verifier("monotonie D4.2", partiel.competences["D4.2"].score > vide.competences["D4.2"].score,
  [partiel.competences["D4.2"].score, vide.competences["D4.2"].score]);

/* --- 7. MDL = langue uniquement, JAMAIS la longueur (demande brice) --- */
verifier("grille versionnée v2 (le Sheet distingue les anciennes copies)",
  C.VERSION === "energie-muscles-grille-v2", C.VERSION);

const court = C.analyser({ q1: Q1_EXCELLENT, q2: Q2_EXCELLENT, q3: Q3_PARFAIT, lignes: 2, bilanScore: 7 });
const long = C.analyser({ q1: Q1_EXCELLENT, q2: Q2_EXCELLENT, q3: Q3_PARFAIT, lignes: 40, bilanScore: 7 });
verifier("longueur 2 lignes = longueur 40 lignes : NOTE IDENTIQUE",
  court.total.score === long.total.score &&
  court.competences["D1.3"].score === long.competences["D1.3"].score,
  [court.total.score, long.total.score]);
verifier("la longueur reste affichée comme INFORMATION dans les indicateurs",
  court.indicateurs.lignes === 2 && long.indicateurs.lignes === 40,
  [court.indicateurs.lignes, long.indicateurs.lignes]);
verifier("aucun manque MDL ne mentionne « 10 à 15 lignes »",
  [vide, faible, intermediaire, moyen, modele, fort, court, long].every(a =>
    !/10 à 15 lignes|rédaction de 10|lignes/i.test(a.competences["D1.3"].criteres[4].manque)),
  [vide, faible, fort].map(a => a.competences["D1.3"].criteres[4].manque));

const mdlFort = fort.competences["D1.3"].criteres[4];
verifier("MDL = connecteurs (1,0) + construction (1,0) sur la forte copie",
  mdlFort.points === 2 &&
  fort.indicateurs.langue.pointsConnecteurs === 1 &&
  fort.indicateurs.langue.pointsStructure === 1, fort.indicateurs.langue);
verifier("connecteurs : 6 espèces et 3 placés en tête de phrase",
  fort.indicateurs.langue.especesConnecteurs === 6 &&
  fort.indicateurs.langue.connecteursEnTete === 3, fort.indicateurs.langue);
verifier("phrases complètes et marqueurs de subordination comptés",
  fort.indicateurs.langue.phrasesCompletes === 6 &&
  fort.indicateurs.langue.marqueursSubordination >= 2, fort.indicateurs.langue);

const motsEpars = C.analyser({ q1: "", q2: "", q3:
  "glucose. dioxygene. sang. energie. respiration cellulaire. muscle. effort. coeur.", lignes: 8 });
verifier("juxtaposition de mots : 0 point de construction de phrase",
  motsEpars.indicateurs.langue.pointsStructure === 0 &&
  /phrases complètes/.test(motsEpars.competences["D1.3"].criteres[4].manque),
  motsEpars.indicateurs.langue);
verifier("copie faible : pas de connecteurs en tête, MDL < 1/2",
  faible.indicateurs.langue.connecteursEnTete === 0 &&
  faible.competences["D1.3"].criteres[4].points < 1,
  faible.indicateurs.langue);

console.log(ok + "/" + total, ok === total ? "TOUS LES TESTS PASSENT" : "ÉCHECS");
console.log("--- Repères de calibration ---");
[
  ["vide", vide], ["faible", faible], ["modèle", modele], ["fort", fort]
].forEach(([nom, a]) => {
  console.log(nom.padEnd(8), a.total.score + "/20", a.total.niveau,
    "| D4.2", a.competences["D4.2"].score + "/4",
    "| D4.1", a.competences["D4.1"].score + "/6",
    "| D1.3", a.competences["D1.3"].score + "/10",
    "| connecteurs", a.indicateurs.nbConnecteurs);
});
process.exit(ok === total ? 0 : 1);
