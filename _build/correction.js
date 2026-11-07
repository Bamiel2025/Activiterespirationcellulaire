/* =========================================================================
   Correction automatique — « L'énergie des muscles » (SVT 3e, cycle 4)
   -------------------------------------------------------------------------
   Module PUR : aucune dépendance au DOM, aucune donnée externe.
   Il est testable en Node (globalThis.Correction) et utilisé dans le
   navigateur (window.Correction).

   La grille reprend EXACTEMENT le dossier professeur :
     D4.2  Lire et exploiter des données quantitatives       / 4   (Q1)
     D4.1  Pratiquer une démarche scientifique               / 6   (Q2)
     D1.3  Communiquer en langage scientifique              / 10  (Q3, 8 + 2 MDL)
   Total /20. Quatre niveaux : Très satisfaisante / Satisfaisante /
   Fragile / Insuffisante (seuils 80 / 60 / 40 %).

   Les 2 points MDL portent sur la MAÎTRISE DE LA LANGUE : connecteurs
   logiques et construction de la phrase. La consigne « 10 à 15 lignes »
   demeure dans l'énoncé élève, mais elle n'entre PAS dans la note
   automatique (demande de brice) : le nombre de lignes est seulement
   affiché à titre d'information.

   ⚠️ Ce sont des INDICATEURS automatiques, pas une note définitive.
   L'analyse compte des SIGNAUX STRUCTURELS (phrases complètes, marqueurs de
   subordination, place des connecteurs, ponctuation) : elle ne juge PAS la
   correction grammaticale ni la pertinence d'une phrase. L'orthographe et
   l'emploi réellement correct des mots imposés restent à valider par le
   professeur. Chaque copie est marquée « À valider » dans la feuille.
   ========================================================================= */
(function (racine) {
  "use strict";

  const VERSION = "energie-muscles-grille-v2";

  const COMPETENCES = [
    { code: "D4.2", libelle: "Lire et exploiter des données quantitatives", max: 4 },
    { code: "D4.1", libelle: "Pratiquer une démarche scientifique", max: 6 },
    { code: "D1.3", libelle: "Communiquer en langage scientifique", max: 10 }
  ];

  const NIVEAUX = ["Très satisfaisante", "Satisfaisante", "Fragile", "Insuffisante"];
  const SEUILS = [0.80, 0.60, 0.40];

  /* Connecteurs logiques de la grille MDL (DNB) + équivalents courants.
     On ne retient que les marqueurs explicites, pas « et » / « mais » isolés
     qui surgissent dans n'importe quelle phrase. */
  const CONNECTEURS = [
    "car", "donc", "ainsi", "en effet", "c'est pourquoi", "par consequent",
    "de ce fait", "parce que", "puisque", "de plus", "en outre", "d'abord",
    "ensuite", "enfin", "puis", "alors que", "tandis que", "cependant",
    "toutefois", "en revanche", "neanmoins", "pourtant", "or", "en conclusion",
    "en somme", "finalement", "d'autre part", "en premier lieu", "de meme",
    "c'est ainsi que", "afin de", "grace a", "si", "lorsque", "quand"
  ];

  const MOTS_IMPOSES = [
    "respiration cellulaire", "glucose", "dioxygene", "sang", "energie"
  ];

  const VALEURS_DOC1 = [200, 150, 900, 800, 490, 560];
  const DIFFERENCES = [50, 100, 70];
  const VALEURS_DOC3 = [70, 180];

  /* -------------------------------------------------------------------- */
  function normaliser(texte) {
    return String(texte || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[œŒ]/g, "oe").replace(/[æÆ]/g, "ae")
      .replace(/[\u2019\u2018`´]/g, "'");
  }

  /* Version « mots » : ponctuation remplacée par des espaces. */
  function aplati(texte) {
    return normaliser(texte).replace(/[^a-z0-9']+/g, " ").trim();
  }

  /* Version « brute » : ponctuation conservée, pour repérer les nombres. */
  function brut(texte) {
    return normaliser(texte).replace(/\s+/g, " ").trim();
  }

  /* Mot ou expression entière (évite « eau » trouvé dans « nouveau »).
     L'apostrophe compte comme frontière : « l'oxygène », « d'abord »,
     « l'eau » sont ainsi reconnus sans casser « respiration cellulaire ». */
  function chercher(plat, source) {
    return new RegExp("(?:^|[\\s'])(?:" + source + ")(?=[\\s']|$)", "i").test(plat);
  }

  function mot(plat, expression) {
    return chercher(plat, expression.replace(/ /g, "\\s+"));
  }

  function nombre(texteBrut, n) {
    return new RegExp("(?:^|\\D)" + n + "(?!\\d)").test(texteBrut);
  }

  function compterNombres(texteBrut, liste) {
    return liste.filter(n => nombre(texteBrut, n));
  }

  function arrondir(x) {
    return Math.round(x * 100) / 100;
  }

  function niveau(pourcent) {
    if (pourcent >= SEUILS[0]) return NIVEAUX[0];
    if (pourcent >= SEUILS[1]) return NIVEAUX[1];
    if (pourcent >= SEUILS[2]) return NIVEAUX[2];
    return NIVEAUX[3];
  }

  /* Un critère = un id, un libellé, un max, un obtenu, et une aide à la
     remédiation affichée dans la feuille quand le critère n'est pas acquis. */
  function critere(id, libelle, max, obtenu, manque) {
    const points = arrondir(Math.min(max, Math.max(0, obtenu)));
    return {
      id: id, libelle: libelle, max: max, points: points,
      acquis: points >= max,
      manque: points < max ? manque : ""
    };
  }

  function bilanCompetence(def, criteres) {
    const score = arrondir(criteres.reduce((s, c) => s + c.points, 0));
    const pourcent = Math.round((score / def.max) * 100);
    const manques = criteres.filter(c => c.manque).map(c => c.manque);
    return {
      code: def.code, libelle: def.libelle, max: def.max,
      score: score, pourcent: pourcent, niveau: niveau(pourcent / 100),
      criteres: criteres, manques: manques
    };
  }

  /* -------------------------------------------------------------------- */
  /* SIGNAUX STRUCTURELS de la langue. On ne juge PAS la grammaire : on
     compte des indices observables. La longueur de la copie n'intervient
     PAS ici — c'est une consigne de rédaction, pas un critère noté.       */
  const MARQUEURS_LIEN = [
    "qui", "que", "dont", "ou", "parce que", "puisque", "lorsque", "quand",
    "si", "alors que", "tandis que", "bien que", "afin de", "de sorte que",
    "ce qui", "ce que", "c'est pourquoi"
  ];

  function structureLangue(texte, plat) {
    const t = String(texte || "").trim();
    const vide = {
      unites: 0, completes: 0, fragments: 0, majuscules: 0,
      marqueurs: 0, motsParPhrase: 0, connecteursEnTete: 0
    };
    if (!t) return vide;

    /* Découpe sur la ponctuation forte et les retours à la ligne. */
    const unites = t.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
    let completes = 0, fragments = 0, majuscules = 0, nbMotsTotal = 0;
    unites.forEach(s => {
      const nbMots = s.split(/[\s,;:()«»"']+/).filter(Boolean).length;
      nbMotsTotal += nbMots;
      if (nbMots < 5) fragments++;
      else if (/[.!?]$/.test(s)) completes++;
      if (/^[A-ZÀ-ÖØ-Þ]/.test(s)) majuscules++;
    });

    const platLocal = plat || aplati(t);
    const marqueurs = MARQUEURS_LIEN.filter(m => mot(platLocal, m)).length;

    /* Un connecteur n'articule vraiment le raisonnement que placé en tête
       de phrase ou après « : » / « ; ». On ne le compte pas au milieu. */
    const norme = normaliser(t);
    const connecteursEnTete = CONNECTEURS.filter(c => {
      const motif = c.replace(/ /g, "\\s+");
      return new RegExp("(?:^|[\\n.;:!?]\\s*)(?:" + motif + ")(?=[\\s',.;:]|$)", "i")
        .test(norme);
    }).length;

    return {
      unites: unites.length,
      completes: completes,
      fragments: fragments,
      majuscules: majuscules,
      marqueurs: marqueurs,
      motsParPhrase: unites.length ? arrondir(nbMotsTotal / unites.length) : 0,
      connecteursEnTete: connecteursEnTete
    };
  }

  /* -------------------------------------------------------------------- */
  /**
   * @param {object} copie
   *   q1, q2, q3 : textes des réponses
   *   lignes     : nombre de lignes réellement occupées par Q3 (mesuré dans
   *                l'application) ; à défaut, estimation 95 caractères/ligne
   *   bilanScore : score /7 du bilan interactif (indicateur complémentaire)
   * @returns {object} analyse complète, sérialisable en JSON
   */
  function analyser(copie) {
    const q1 = String(copie.q1 || "");
    const q2 = String(copie.q2 || "");
    const q3 = String(copie.q3 || "");
    const p1 = aplati(q1), p2 = aplati(q2), p3 = aplati(q3);
    const b1 = brut(q1), b2 = brut(q2), b3 = brut(q3);
    const tout = b1 + " " + b2 + " " + b3;

    /* --- Indicateurs transversaux -------------------------------------- */
    const connecteursTrouves = CONNECTEURS.filter(c => mot(p3, c));
    const motsTrouves = MOTS_IMPOSES.filter(m => mot(p3, m));
    const motsAbsents = MOTS_IMPOSES.filter(m => !mot(p3, m));
    const phrases = (q3.match(/[.!?]+(?=\s|$)/g) || []).length;
    const virgules = (q3.match(/[,;:]/g) || []).length;
    const lignes = Number.isFinite(copie.lignes) && copie.lignes > 0
      ? copie.lignes
      : Math.ceil(q3.trim().length / 95);
    const unites = [];
    if (/(?:^|\s)(?:ml|millilitres?)(?=\s|$)/i.test(b1 + " " + b3)) unites.push("mL");
    if (/(?:^|\s)(?:mg|milligrammes?)(?=\s|$)/i.test(b1 + " " + b3)) unites.push("mg");

    const valeursQ1 = compterNombres(b1, VALEURS_DOC1);
    const differencesQ1 = compterNombres(b1, DIFFERENCES);
    const valeursQ3 = compterNombres(b3, VALEURS_DOC1.concat(DIFFERENCES));
    const doc3 = compterNombres(b3, VALEURS_DOC3);

    /* --- D4.2 : Q1, /4 -------------------------------------------------- */
    const cD42 = [
      critere("valeurs", "Valeurs chiffrées du document 1", 1.5,
        valeursQ1.length * 0.25,
        "citer les valeurs du doc. 1 (200 → 150 mL ; 900 → 800 mg ; 490 → 560 mL)"),
      critere("unites", "Unités", 0.5,
        (unites.indexOf("mL") >= 0 ? 0.25 : 0) + (unites.indexOf("mg") >= 0 ? 0.25 : 0),
        "préciser les unités (mL, mg)"),
      critere("differences", "Différences calculées", 0.5,
        Math.min(2, differencesQ1.length) * 0.25,
        "calculer les différences (50 mL, 100 mg, 70 mL)"),
      critere("molecules", "Molécules identifiées", 1.0,
        ["glucose", "dioxygene", "dioxyde de carbone|co2"]
          .filter(m => chercher(p1, m)).length / 3,
        "nommer glucose, dioxygène et dioxyde de carbone"),
      critere("sens", "Sens des variations", 0.5,
        (chercher(p1, "prelev\\w*|consomm\\w*|diminu\\w*|baisse\\w*") ? 0.25 : 0)
        + (chercher(p1, "rejett?\\w*|rejet\\w*|produi\\w*|augment\\w*") ? 0.25 : 0),
        "dire ce que le muscle prélève et ce qu'il rejette")
    ];

    /* --- D4.1 : Q2, /6 -------------------------------------------------- */
    const cD41 = [
      critere("carbone", "Devenir du carbone du glucose", 1.5,
        (mot(p2, "carbone") ? 0.5 : 0) + (mot(p2, "glucose") ? 0.5 : 0)
        + (chercher(p2, "dioxyde de carbone|co2") ? 0.5 : 0),
        "relier le carbone du glucose au dioxyde de carbone"),
      critere("oxygene", "Devenir de l'oxygène du dioxygène", 1.5,
        (mot(p2, "oxygene") ? 0.5 : 0) + (mot(p2, "dioxygene") ? 0.5 : 0)
        + (mot(p2, "eau") ? 0.5 : 0),
        "relier l'oxygène du dioxygène à l'eau"),
      critere("bilan", "Bilan complet de la réaction", 1.5,
        ["glucose", "dioxygene", "dioxyde de carbone|co2", "eau", "energie"]
          .filter(m => chercher(p2, m)).length * 0.3,
        "écrire le bilan : glucose + dioxygène → dioxyde de carbone + eau + énergie"),
      critere("lieu", "Lieu et nom de la réaction", 1.5,
        (mot(p2, "respiration cellulaire") ? 0.75 : 0)
        + (chercher(p2, "cellules?|mitochondries?") ? 0.75 : 0),
        "situer la respiration cellulaire dans les cellules (mitochondries)")
    ];

    /* --- D1.3 : Q3, /10 (8 contenu + 2 MDL) ---------------------------- */
    /* Les 2 pts MDL évaluent UNIQUEMENT la maîtrise de la langue :
       (1,0) connecteurs logiques — variété + place en tête de phrase ;
       (1,0) construction de la phrase — complétude, subordination,
             majuscules et ponctuation.
       « 10 à 15 lignes » RESTE une consigne de rédaction dans l'énoncé
       élève, mais n'est plus jamais utilisée pour calculer un point.   */
    const st = structureLangue(q3, p3);
    const nbEspeces = connecteursTrouves.length;
    const enTete = st.connecteursEnTete;
    const ratioComplet = st.unites ? st.completes / st.unites : 0;
    const ratioFragments = st.unites ? st.fragments / st.unites : 0;
    const ratioMajuscules = st.unites ? st.majuscules / st.unites : 0;

    const pointsConnecteurs =
      (nbEspeces >= 3 ? 0.6 : nbEspeces === 2 ? 0.4 : nbEspeces === 1 ? 0.2 : 0)
      + (enTete >= 2 ? 0.4 : enTete === 1 ? 0.2 : 0);
    const pointsPhrases = ratioComplet >= 0.8 ? 0.4 : ratioComplet >= 0.5 ? 0.25 : 0;
    const pointsLiens = st.marqueurs >= 2 ? 0.3 : st.marqueurs === 1 ? 0.15 : 0;
    const pointsPonctuation = (ratioMajuscules >= 0.8 && ratioFragments <= 0.2) ? 0.3
      : ratioMajuscules >= 0.5 ? 0.15 : 0;
    const pointsStructure = pointsPhrases + pointsLiens + pointsPonctuation;

    const manquesMdl = [];
    if (nbEspeces < 3) manquesMdl.push("varier les connecteurs logiques (car, donc, ainsi, de plus, alors que…)");
    if (enTete < 2) manquesMdl.push("placer les connecteurs en début de phrase ou après « : » pour articuler");
    if (ratioComplet < 0.8) manquesMdl.push("construire des phrases complètes (sujet + verbe + complément), pas une juxtaposition de mots");
    if (st.marqueurs < 2) manquesMdl.push("relier les idées par des subordonnées (qui, que, parce que, alors que…)");
    if (pointsPonctuation < 0.3) manquesMdl.push("soigner les majuscules de début et la ponctuation de fin de phrase");

    const cD13 = [
      critere("mots", "Cinq mots imposés", 2.0, motsTrouves.length * 0.4,
        "employer : " + motsAbsents.join(", ")),
      critere("chaine", "Chaîne effort → cœur → sang → cellule → énergie", 2.0,
        ["effort|course|exercice", "coeur|rythme cardiaque|180|battements",
          "sang", "cellules?", "energie"]
          .filter(m => chercher(p3, m)).length * 0.4,
        "relier l'effort, le cœur, le sang, la cellule et l'énergie"),
      critere("valeurs", "Valeurs des documents 1 et 3", 2.0,
        (doc3.length === 2 ? 1 : doc3.length === 1 ? 0.5 : 0)
        + (valeursQ3.length >= 1 ? 1 : 0),
        "citer 70 → 180 battements/min et au moins une valeur du doc. 1"),
      critere("roleSang", "Rôle du sang et lieu cellulaire", 2.0,
        ((chercher(p3, "transport\\w*|apport\\w*|amen\\w*|irrigue\\w*") && mot(p3, "sang")) ? 1 : 0)
        + ((chercher(p3, "cellules?") && mot(p3, "respiration cellulaire")) ? 1 : 0),
        "distinguer le transport par le sang de la réaction dans les cellules"),
      critere("mdl", "Maîtrise de la langue — connecteurs et construction (2 pts MDL)", 2.0,
        pointsConnecteurs + pointsStructure,
        manquesMdl.join(" ; "))
    ];

    const competences = {
      "D4.2": bilanCompetence(COMPETENCES[0], cD42),
      "D4.1": bilanCompetence(COMPETENCES[1], cD41),
      "D1.3": bilanCompetence(COMPETENCES[2], cD13)
    };

    const total = {
      score: arrondir(competences["D4.2"].score + competences["D4.1"].score + competences["D1.3"].score),
      max: 20
    };
    total.pourcent = Math.round((total.score / total.max) * 100);
    total.niveau = niveau(total.score / total.max);

    /* --- Alertes : signaux à vérifier, jamais de pénalité automatique ---- */
    const alertes = [];
    if (chercher(p2, "poumons?")) alertes.push("Q2 : « poumons » présent — vérifier la distinction respiration pulmonaire / cellulaire.");
    if (phrases < 2 && motsTrouves.length >= 4) alertes.push("Q3 : mots imposés présents mais très peu de phrases — simples mots recopiés ?");
    if (/(?:^|\s)(?:dioxigene|oxigene|celulaire|glucoose)(?=\s|$)/.test(p3)) alertes.push("Q3 : orthographe de mots scientifiques à vérifier.");
    if (chercher(p3, "brul\\w*|combustion")) alertes.push("Q3 : « brûle / combustion » — reformuler en oxydation progressive.");
    if (motsAbsents.length) alertes.push("Q3 : mots imposés absents : " + motsAbsents.join(", ") + ".");

    const resume = COMPETENCES.map(def => {
      const c = competences[def.code];
      return def.code + " " + c.score + "/" + c.max + " " + c.niveau
        + (c.manques.length ? " — manque : " + c.manques.join(" ; ") : " — acquis");
    }).join(" | ");

    return {
      version: VERSION,
      aValider: true,
      competences: competences,
      total: total,
      indicateurs: {
        motsImposes: motsTrouves, motsAbsents: motsAbsents,
        valeursQ1: valeursQ1, differencesQ1: differencesQ1, valeursQ3: valeursQ3,
        valeursDoc3: doc3, unites: unites,
        connecteurs: connecteursTrouves, nbConnecteurs: connecteursTrouves.length,
        phrases: phrases, virgules: virgules, lignes: lignes,
        /* Signaux de maîtrise de la langue : INFORMATION + points MDL.
           Aucune de ces valeurs ne dépend du nombre de lignes. */
        langue: {
          especesConnecteurs: nbEspeces, connecteursEnTete: enTete,
          unites: st.unites, phrasesCompletes: st.completes,
          fragments: st.fragments, marqueursSubordination: st.marqueurs,
          motsParPhrase: st.motsParPhrase, majuscules: st.majuscules,
          pointsConnecteurs: arrondir(pointsConnecteurs),
          pointsStructure: arrondir(pointsStructure)
        },
        bilanScore: Number.isFinite(copie.bilanScore) ? copie.bilanScore : null
      },
      alertes: alertes,
      resume: resume
    };
  }

  racine.Correction = {
    VERSION: VERSION,
    COMPETENCES: COMPETENCES,
    NIVEAUX: NIVEAUX,
    SEUILS: SEUILS,
    CONNECTEURS: CONNECTEURS,
    MOTS_IMPOSES: MOTS_IMPOSES,
    analyser: analyser,
    normaliser: normaliser,
    niveau: niveau
  };
})(typeof window !== "undefined" ? window : globalThis);
