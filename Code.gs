/**
 * ============================================================================
 *  « L'ÉNERGIE DES MUSCLES » — SVT 3e — Pont Google Sheets
 *  Pont entre l'application HTML autonome et le tableur du professeur.
 * ============================================================================
 *
 *  MISE EN ROUTE (5 minutes, une seule fois)
 *  1. Crée un Google Sheets vide. Extensions > Apps Script.
 *  2. Supprime le contenu de l'éditeur, colle INTÉGRALEMENT ce fichier.
 *  3. Renseigne CONFIG.TOKEN (même jeton que dans l'application).
 *  4. Déployer > Nouveau déploiement > (engrenage) "Application web"
 *       - Exécuter en tant que : Moi
 *       - Qui a accès      : Tout le monde
 *     (les élèves ne se connectent PAS à ton compte : aucun login, aucune
 *      plateforme, seulement nom / prénom / classe)
 *  5. Copie l'URL "/exec" et colle-la dans l'onglet « Fiche professeur »
 *     de l'application (code 2027), puis « Tester la connexion ».
 *  6. Les onglets Copies, Synthese et Remediation se créent automatiquement.
 *
 *  CE QUE FAIT LE SCRIPT
 *  - Reçoit la copie + l'analyse automatique (grille D4.2 / D4.1 / D1.3,
 *    /20, quatre niveaux de maîtrise).
 *  - Dédoublonne : renvoyer deux fois la même copie MET À JOUR la ligne
 *    (identifiant = nom + prénom + classe), jamais de doublon. L'élève ne
 *    saisit NI date NI heure : HORODATAGE est horodaté par le serveur.
 *  - Reconstruit à chaque envoi : graphique empilé par compétence, tableau
 *    des niveaux pour CHAQUE élève, et feuille de remédiation listant ce qui
 *    manque aux élèves « Fragile » et « Insuffisante ».
 *
 *  ⚠️ L'analyse automatique est un INDICATEUR, pas une note définitive.
 *     La colonne A_VALIDER vaut toujours « Oui » : le professeur valide
 *     l'orthographe, la justesse scientifique et l'emploi des mots imposés.
 *
 *  NOTE CORS : Apps Script ne renvoie pas toujours les en-têtes permettant
 *  de LIRE la réponse depuis un fichier ouvert en file://. L'application
 *  tente d'abord une requête lisible, puis replie en mode "no-cors" :
 *  l'envoi a bien lieu, et le dédoublonnage évite la double écriture.
 * ============================================================================
 */

var CONFIG = {
  TOKEN: 'respiration-2027',          // IDENTIQUE à celui de l'application
  SHEET_COPIES: 'Copies',
  SHEET_SYNTHESE: 'Synthese',
  SHEET_REMEDIATION: 'Remediation',
  FORMAT: 'energie-muscles-v1',
  MAX_TEXTE: 5000                     // garde-fou sur la taille des réponses
};

var NIVEAUX = ['Très satisfaisante', 'Satisfaisante', 'Fragile', 'Insuffisante'];
var COMPETENCES = [
  { code: 'D4.2', libelle: 'Lire et exploiter des données quantitatives', max: 4 },
  { code: 'D4.1', libelle: 'Pratiquer une démarche scientifique', max: 6 },
  { code: 'D1.3', libelle: 'Communiquer en langage scientifique', max: 10 }
];
var COULEURS = {
  'Très satisfaisante': '#b7e1c1',
  'Satisfaisante': '#dcecc0',
  'Fragile': '#ffe6a3',
  'Insuffisante': '#f8c6c6'
};

/* HORODATAGE est ajouté par le SERVEUR : l'élève ne saisit que
   nom / prénom / classe, aucune date, aucune donnée de son appareil. */
var HEADERS = [
  'ID_COPIE', 'HORODATAGE', 'NOM', 'PRENOM', 'CLASSE',
  'Q1', 'Q2', 'Q3', 'BILAN_7',
  'D4_2_SCORE', 'D4_2_NIVEAU', 'D4_2_MANQUES',
  'D4_1_SCORE', 'D4_1_NIVEAU', 'D4_1_MANQUES',
  'D1_3_SCORE', 'D1_3_NIVEAU', 'D1_3_MANQUES',
  'TOTAL_20', 'NIVEAU_GLOBAL',
  'MOTS_ABSENTS', 'VALEURS_TROUVEES', 'CONNECTEURS', 'NB_CONNECTEURS',
  'LIGNES', 'PHRASES', 'ALERTES', 'A_VALIDER', 'RESUME', 'VERSION_GRILLE',
  /* Colonnes de SUIVI. Les deux dernières sont SAISIES PAR LE PROFESSEUR :
     un redépôt de l'élève ne doit JAMAIS les écraser. */
  'NB_ENVOIS', 'VALIDATION_PROF', 'NOTE_PROF'
];

/* ==========================================================================
 *  POINTS D'ENTRÉE HTTP
 * ========================================================================== */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'list') {
    var token = (e && e.parameter && e.parameter.token) || '';
    if (CONFIG.TOKEN && token !== CONFIG.TOKEN) {
      return jsonOut({ ok: false, error: 'Jeton invalide.' });
    }
    return jsonOut(handleList({}));
  }
  if (action === 'synthese') return jsonOut(regenererSynthese());
  return jsonOut(handlePing());
}

function doPost(e) {
  try {
    var data = lireRequete(e);
    if (CONFIG.TOKEN && data.token !== CONFIG.TOKEN) {
      return jsonOut({ ok: false, error: 'Jeton invalide : vérifie CONFIG.TOKEN et le jeton saisi dans l’application.' });
    }
    var action = data.action || 'append';
    if (action === 'ping') return jsonOut(handlePing());
    if (action === 'list') return jsonOut(handleList(data));
    if (action === 'synthese') return jsonOut(regenererSynthese());
    if (action === 'append') return jsonOut(handleAppend(data));
    return jsonOut({ ok: false, error: 'Action inconnue : ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** Accepte JSON brut (fetch text/plain) et formulaire (e.parameter.donnees). */
function lireRequete(e) {
  if (!e) throw new Error('Requête vide.');
  if (e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  if (e.parameter && e.parameter.donnees) return JSON.parse(e.parameter.donnees);
  throw new Error('Aucune donnée reçue.');
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
 *  FEUILLES
 * ========================================================================== */

function feuille(nom) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var f = ss.getSheetByName(nom);
  if (!f) f = ss.insertSheet(nom);
  return f;
}

function preparerFeuilles() {
  var copies = feuille(CONFIG.SHEET_COPIES);
  if (copies.getLastRow() === 0) {
    copies.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    copies.setFrozenRows(1);
    copies.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#115e59').setFontColor('#ffffff');
    copies.setColumnWidth(1, 210);
    copies.setColumnWidth(2, 155);
    copies.setColumnWidth(7, 320);
    copies.setColumnWidth(8, 320);
    copies.setColumnWidth(9, 420);
  }
  /* Colonne CLASSE en texte : « 3E1 » ne doit pas devenir 3,00E+01. */
  copies.getRange(1, 5, Math.max(1, copies.getLastRow()), 1).setNumberFormat('@');
  feuille(CONFIG.SHEET_SYNTHESE);
  feuille(CONFIG.SHEET_REMEDIATION);
  return copies;
}

function handlePing() {
  preparerFeuilles();
  return {
    ok: true,
    message: 'Connexion OK. Onglets prêts : ' + CONFIG.SHEET_COPIES + ', ' +
      CONFIG.SHEET_SYNTHESE + ', ' + CONFIG.SHEET_REMEDIATION + '.',
    format: CONFIG.FORMAT,
    feuilles: [CONFIG.SHEET_COPIES, CONFIG.SHEET_SYNTHESE, CONFIG.SHEET_REMEDIATION]
  };
}

/* ==========================================================================
 *  RÉCEPTION D'UNE COPIE
 * ========================================================================== */

function texte(v) {
  return String(v === undefined || v === null ? '' : v).slice(0, CONFIG.MAX_TEXTE);
}

function handleAppend(data) {
  var copie = data.copie || {};
  var analyse = copie.analyse || {};
  var indic = analyse.indicateurs || {};
  var comp = analyse.competences || {};
  var total = analyse.total || {};

  var nom = texte(copie.nom).trim();
  var prenom = texte(copie.prenom).trim();
  var classe = texte(copie.classe).trim();
  /* L'identifiant est calculé ICI, jamais reçu du client : une seule règle,
     aucun risque de divergence entre l'application et le Sheet. */
  var id = identifiant(nom, prenom, classe) || texte(copie.id).trim();
  if (!id) return { ok: false, error: 'Copie sans identifiant : renseigne au moins le nom.' };

  var verrou = LockService.getScriptLock();
  verrou.waitLock(15000);
  try {
    var f = preparerFeuilles();
    var niveauGlobal = total.niveau || 'Insuffisante';
    if (NIVEAUX.indexOf(niveauGlobal) < 0) niveauGlobal = 'Insuffisante';

    /* Repère la ligne existante AVANT d'écrire : on y lit le nombre d'envois
       précédents et les colonnes que le PROFESSEUR a pu remplir. Wooflash
       écrasait toute la ligne au redépôt — ici elles sont préservées. */
    var derniere = f.getLastRow();
    var numero = 0;
    var ancienne = null;
    if (derniere > 1) {
      var ids = f.getRange(2, 1, derniere - 1, 1).getValues().map(function (r) { return String(r[0]); });
      var index = ids.indexOf(id);
      if (index >= 0) {
        numero = index + 2;
        ancienne = f.getRange(numero, 1, 1, HEADERS.length).getValues()[0];
      }
    }
    var iValidation = HEADERS.indexOf('VALIDATION_PROF');
    var iNote = HEADERS.indexOf('NOTE_PROF');
    var iEnvois = HEADERS.indexOf('NB_ENVOIS');
    var validation = ancienne ? texte(ancienne[iValidation]) : '';
    var noteProf = ancienne ? texte(ancienne[iNote]) : '';
    var nbEnvois = ancienne ? (Number(ancienne[iEnvois]) || 1) + 1 : 1;

    var ligne = [
      id,
      new Date().toISOString(),          // horodatage serveur, jamais saisi par l'élève
      nom, prenom, sheetText(classe),
      texte(copie.q1), texte(copie.q2), texte(copie.q3),
      Number(copie.bilanScore) || 0,
      val(comp, 'D4.2', 'score'), val(comp, 'D4.2', 'niveau'), val(comp, 'D4.2', 'manques', true),
      val(comp, 'D4.1', 'score'), val(comp, 'D4.1', 'niveau'), val(comp, 'D4.1', 'manques', true),
      val(comp, 'D1.3', 'score'), val(comp, 'D1.3', 'niveau'), val(comp, 'D1.3', 'manques', true),
      Number(total.score) || 0, niveauGlobal,
      liste(indic.motsAbsents), liste(indic.valeursQ1), liste(indic.connecteurs),
      Number(indic.nbConnecteurs) || 0, Number(indic.lignes) || 0, Number(indic.phrases) || 0,
      liste(analyse.alertes), validation ? 'Non' : 'Oui',
      texte(analyse.resume), texte(analyse.version),
      nbEnvois, validation, noteProf
    ];

    if (numero) {
      f.getRange(numero, 1, 1, ligne.length).setValues([ligne]);
    } else {
      f.appendRow(ligne);
      numero = f.getLastRow();
    }

    /* Tri par classe, puis nom, puis prénom (ligne 1 = en-tête). */
    if (f.getLastRow() > 2) {
      f.getRange(2, 1, f.getLastRow() - 1, HEADERS.length).sort([
        { column: 5, ascending: true },
        { column: 3, ascending: true },
        { column: 4, ascending: true }
      ]);
    }

    var avertissement = '';
    try {
      mettreAJourSynthese();
      mettreAJourRemediation();
    } catch (eGraph) {
      /* La copie est déjà enregistrée : un échec de graphique ne doit JAMAIS
         faire croire à l'élève que son envoi a échoué. */
      avertissement = 'Copie enregistrée, mais la synthèse n’a pas pu être reconstruite : ' + String(eGraph);
    }

    return {
      ok: true,
      ligne: numero,
      id: id,
      miseAJour: !!numero && derniere >= numero,
      niveauGlobal: niveauGlobal,
      total: Number(total.score) || 0,
      warning: avertissement
    };
  } finally {
    verrou.releaseLock();
  }
}

function val(comp, code, champ, joindre) {
  var c = comp[code] || {};
  var v = c[champ];
  if (joindre) return Array.isArray(v) ? v.join(' ; ') : texte(v);
  if (champ === 'score') return Number(v) || 0;
  return texte(v);
}

function liste(v) {
  return Array.isArray(v) ? v.join(', ') : texte(v);
}

/* Normalisation d'une classe, reprise du projet Wooflashquizz :
   « 3e B », « 3°B », « 3ème B », « 3 B », « 3EB » → « 3B ».
   Sans cela, le même élève qui écrit sa classe différemment crée un DOUBLON.
   Règle unique : elle vit ici, côté serveur. Le client n'envoie PAS d'id. */
function normClass(c) {
  var s = String(c == null ? '' : c);
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  s = s.toUpperCase();
  s = s.replace(/\bSIXIEMES?(?![A-Z])/g, '6')
    .replace(/\bCINQUIEMES?(?![A-Z])/g, '5')
    .replace(/\bQUATRIEMES?(?![A-Z])/g, '4')
    .replace(/\bTROISIEMES?(?![A-Z])/g, '3')
    .replace(/\bSECONDES?(?![A-Z])/g, '2')
    .replace(/\bPREMIERES?(?![A-Z])/g, '1')
    .replace(/\bTERMINALES?(?![A-Z])/g, 'T');
  s = s.replace(/[\u00b0*\u02c6\u00ba\u00aa`\u00b4]/g, 'E');
  s = s.replace(/[^A-Z0-9]/g, '');
  var prev;
  do {
    prev = s;
    s = s.replace(/([0-9])(ERE|EME|ER|RE|EM|E)(?=[0-9A-Z]|$)/g, '$1')
      .replace(/([12])(NDE|DE|D)(?=[0-9A-Z]|$)/g, '$1');
  } while (s !== prev);
  return s;
}

/* Sheets interprète « 3E1 » comme 3,00E+01 : on force le format texte. */
function sheetText(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^[0-9]+[Ee][0-9]+$/.test(s) ? "'" + s : s;
}

function identifiant(nom, prenom, classe) {
  function net(t) {
    return String(t || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  return [net(nom), net(prenom), normClass(classe).toLowerCase()]
    .filter(Boolean).join('_') || '';
}

/* ==========================================================================
 *  LECTURE / EXPORT DES COPIES
 * ========================================================================== */

function lireCopies() {
  var f = feuille(CONFIG.SHEET_COPIES);
  if (f.getLastRow() < 2) return [];
  var valeurs = f.getRange(2, 1, f.getLastRow() - 1, HEADERS.length).getValues();
  return valeurs.filter(function (r) { return String(r[0]).length > 0; }).map(function (r) {
    var o = {};
    HEADERS.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

/** Renvoie toutes les copies pour le tableau de bord résultats (lecture seule). */
function handleList(data) {
  preparerFeuilles();
  var copies = lireCopies();
  return {
    ok: true,
    headers: HEADERS,
    copies: copies,
    count: copies.length,
    format: CONFIG.FORMAT
  };
}

/** Renvoie toutes les copies pour le tableau de bord résultats (lecture seule). */
function handleList(data) {
  preparerFeuilles();
  var copies = lireCopies();
  return {
    ok: true,
    headers: HEADERS,
    copies: copies,
    count: copies.length,
    format: CONFIG.FORMAT
  };
}

/* Une copie est traitée dès que le professeur l'a validée, qu'il ait passé
   A_VALIDER à « Non » OU saisi directement VALIDATION_PROF à la main.
   UNE SEULE règle partagée par la synthèse et la remédiation : sans elle, un
   élève validé manuellement resterait « À valider : Oui » dans la synthèse
   tout en disparaissant déjà de la liste de remédiation. */
function dejaValidee(r) {
  return String(r.A_VALIDER) === 'Non' ||
    String(r.VALIDATION_PROF || '').trim().length > 0;
}

/* ==========================================================================
 *  SYNTHÈSE : graphique par compétence + tableau par élève
 * ========================================================================== */

function mettreAJourSynthese() {
  var f = feuille(CONFIG.SHEET_SYNTHESE);
  var copies = lireCopies();

  f.getCharts().forEach(function (c) { f.removeChart(c); });
  f.clear();
  f.setConditionalFormatRules([]);

  /* --- Tableau 1 : effectifs par compétence et par niveau (A1:E5) ------ */
  var colonnesNiveau = {
    'D4.2': 'D4_2_NIVEAU', 'D4.1': 'D4_1_NIVEAU', 'D1.3': 'D1_3_NIVEAU'
  };
  var tableau = [['Compétence'].concat(NIVEAUX)];
  COMPETENCES.forEach(function (c) {
    var ligne = [c.code + ' — ' + c.libelle];
    NIVEAUX.forEach(function (n) {
      ligne.push(copies.filter(function (r) { return r[colonnesNiveau[c.code]] === n; }).length);
    });
    tableau.push(ligne);
  });
  var globale = ['Global (total /20)'];
  NIVEAUX.forEach(function (n) {
    globale.push(copies.filter(function (r) { return r['NIVEAU_GLOBAL'] === n; }).length);
  });
  tableau.push(globale);
  f.getRange(1, 1, tableau.length, 5).setValues(tableau);
  f.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#115e59').setFontColor('#ffffff');
  f.setColumnWidth(1, 320);
  f.getRange('A1').setNote('Graphique : répartition des niveaux de maîtrise par compétence. Mis à jour à chaque copie reçue.');

  /* --- Tableau 2 : résultats + suivi professeur, pour CHAQUE élève ----- */
  var enteteEleves = ['Élève', 'Classe', 'D4.2', 'D4.1', 'D1.3', 'Global',
    'Score /20', 'À valider', 'Envois', 'Note prof'];
  var lignesEleves = copies.map(function (r) {
    return [
      String(r.PRENOM) + ' ' + String(r.NOM),
      String(r.CLASSE),
      r.D4_2_NIVEAU, r.D4_1_NIVEAU, r.D1_3_NIVEAU,
      r.NIVEAU_GLOBAL, Number(r.TOTAL_20) || 0,
      dejaValidee(r) ? 'Non' : String(r.A_VALIDER || 'Oui'),
      Number(r.NB_ENVOIS) || 1, String(r.NOTE_PROF || '')
    ];
  });
  f.getRange(8, 1, 1, 10).setValues([enteteEleves]);
  f.getRange(8, 1, 1, 10).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
  if (lignesEleves.length) {
    f.getRange(9, 1, lignesEleves.length, 10).setValues(lignesEleves);
    /* Seules les 4 colonnes de niveaux (C→F) reçoivent la couleur :
       « À valider », « Envois » et « Note prof » ne sont pas des niveaux. */
    var plageNiveaux = f.getRange(9, 3, lignesEleves.length, 4);
    var regles = NIVEAUX.map(function (n) {
      return SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(n)
        .setBackground(COULEURS[n])
        .setRanges([plageNiveaux])
        .build();
    });
    f.setConditionalFormatRules(regles);
  }
  f.setFrozenRows(8);
  f.setColumnWidth(8, 100);
  f.setColumnWidth(10, 100);

  /* --- Tableau auxiliaire pour le graphique des scores (L8:M…) ---------
     Déplacé de I8:J… : le tableau élève occupe maintenant A→J. */
  var aux = [['Élève', 'Score /20']];
  copies.forEach(function (r) {
    aux.push([String(r.PRENOM) + ' ' + String(r.NOM), Number(r.TOTAL_20) || 0]);
  });
  f.getRange(8, 12, aux.length, 2).setValues(aux);
  f.getRange(8, 12, 1, 2).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');

  /* Les graphiques flottent AU-DESSUS des cellules : on les place sous la
     plus longue table, sinon ils masqueraient des résultats d'élèves. */
  var ligneGraphiques = Math.max(20, 9 + lignesEleves.length + 2);

  /* --- Graphique 1 : barres empilées par compétence (colonne A) --------- */
  var graphique = f.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(f.getRange(1, 1, tableau.length, 5))
    .setOption('isStacked', true)
    .setOption('title', 'Maîtrise par compétence — répartition des élèves')
    .setOption('legend', { position: 'bottom' })
    .setOption('hAxis', { title: 'Compétence' })
    .setOption('vAxis', { title: 'Nombre d’élèves', minValue: 0 })
    .setOption('height', 330)
    .setOption('width', 760)
    .setPosition(ligneGraphiques, 1, 0, 0)
    .build();
  f.insertChart(graphique);

  /* --- Graphique 2 : score /20 de chaque élève (colonne J) -------------- */
  if (copies.length) {
    var graphiqueScores = f.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(f.getRange(8, 12, aux.length, 2))
      .setOption('title', 'Score /20 par élève (indicateur automatique)')
      .setOption('legend', { position: 'none' })
      .setOption('hAxis', { minValue: 0, maxValue: 20 })
      .setOption('height', Math.max(220, copies.length * 28))
      .setOption('width', 620)
      .setPosition(ligneGraphiques, 10, 0, 0)
      .build();
    f.insertChart(graphiqueScores);
  }
  return { ok: true, eleves: copies.length };
}

/* ==========================================================================
 *  REMÉDIATION : qui est fragile, et sur quoi exactement
 * ========================================================================== */

function mettreAJourRemediation() {
  var f = feuille(CONFIG.SHEET_REMEDIATION);
  var copies = lireCopies();
  f.clear();
  f.setConditionalFormatRules([]);

  var entete = ['Compétence', 'Élève', 'Classe', 'Niveau', 'Score', 'Ce qui manque (à travailler)', 'Alertes'];
  f.getRange(1, 1, 1, entete.length).setValues([entete]);
  f.getRange(1, 1, 1, entete.length).setFontWeight('bold').setBackground('#b45309').setFontColor('#ffffff');

  var champs = {
    'D4.2': { score: 'D4_2_SCORE', niveau: 'D4_2_NIVEAU', manques: 'D4_2_MANQUES' },
    'D4.1': { score: 'D4_1_SCORE', niveau: 'D4_1_NIVEAU', manques: 'D4_1_MANQUES' },
    'D1.3': { score: 'D1_3_SCORE', niveau: 'D1_3_NIVEAU', manques: 'D1_3_MANQUES' }
  };
  /* Une copie validée par le professeur ne doit plus encombrer la liste de
     remédiation : elle a déjà été traitée. Même règle que dans la synthèse
     (dejaValidee), sinon les deux onglets se contredisent. */
  var validees = copies.filter(dejaValidee).length;

  var lignes = [];
  COMPETENCES.forEach(function (c) {
    var ch = champs[c.code];
    copies.forEach(function (r) {
      if (dejaValidee(r)) return;
      /* NIVEAUX = [Très satisfaisante(0), Satisfaisante(1), Fragile(2),
         Insuffisante(3)] : la remédiation cible les index 2 et 3. */
      if (NIVEAUX.indexOf(r[ch.niveau]) >= 2) {  // Fragile ou Insuffisante
        lignes.push([
          c.code + ' — ' + c.libelle,
          String(r.PRENOM) + ' ' + String(r.NOM),
          String(r.CLASSE), String(r[ch.niveau]), Number(r[ch.score]) || 0,
          String(r[ch.manques] || '—'), String(r.ALERTES || '')
        ]);
      }
    });
  });

  if (lignes.length) {
    f.getRange(2, 1, lignes.length, entete.length).setValues(lignes);
    f.getRange(2, 1, lignes.length, entete.length).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  } else {
    f.getRange(2, 1).setValue('Aucun élève en maîtrise fragile ou insuffisante à remédier pour le moment.');
  }
  if (validees) {
    f.getRange(lignes.length + 3, 1).setValue(
      validees + ' copie(s) déjà validée(s) par le professeur : non affichée(s) ici.');
  }
  f.setFrozenRows(1);
  f.setColumnWidth(1, 290);
  f.setColumnWidth(6, 420);
  return { ok: true, lignes: lignes.length, valideesIgnorees: validees };
}

function regenererSynthese() {
  preparerFeuilles();
  var a = mettreAJourSynthese();
  var b = mettreAJourRemediation();
  return {
    ok: true, message: 'Synthèse et remédiation reconstruites.',
    eleves: a.eleves, lignesRemediation: b.lignes,
    valideesIgnorees: b.valideesIgnorees
  };
}
