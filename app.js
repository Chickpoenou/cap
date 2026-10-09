/* ============================================================
   Cap — logique de l'application
   Étapes 1 à 6 : transactions, activités, budgets, objectifs,
   investissements, rapports, export CSV et paramètres,
   avec rappel de sauvegarde et annulation de la dernière saisie.
   Toutes les données sont enregistrées dans le stockage local
   du navigateur (localStorage), rien n'est envoyé sur Internet.
   ============================================================ */

/* ---------- 1. Constantes et état ---------- */

/* Nom de la "clé" sous laquelle les données sont enregistrées
   dans le stockage local du navigateur. */
const CLE_STOCKAGE = 'cap-donnees';

/* Date de la dernière sauvegarde exportée, gardée à part :
   restaurer une sauvegarde ne doit pas effacer ce souvenir. */
const CLE_DERNIERE_SAUVEGARDE = 'cap-derniere-sauvegarde';

/* Nombre de jours sans sauvegarde avant d'afficher un rappel. */
const JOURS_AVANT_RAPPEL = 7;

/* Catégories de dépenses proposées au départ (modifiables
   plus tard depuis les paramètres — étape 6). */
const CATEGORIES_DEFAUT = [
  'Transport',
  'Matériel et fournitures',
  'Formation et cours',
  'Internet et crédit',
  'Alimentation',
  'Santé et sport',
  'Maison et travaux',
  'Outils et services',
  'Divers'
];

/* Toutes les données de l'application, chargées au démarrage. */
let donnees = null;
let stockageEnErreur = false;
let messageErreurStockage = '';

/* Période affichée sur le tableau de bord.
   mode : 'mois', 'moisPrecedent' ou 'perso' (personnalisée). */
let periode = { mode: 'mois', debut: '', fin: '' };

/* Mois affiché dans le filtre de l'écran Transactions,
   sous la forme "2026-09". */
let moisFiltre = '';

/* État du formulaire : 'ajout' ou 'modification'.
   En modification, idEnModification désigne la transaction ouverte. */
let modeFormulaire = 'ajout';
let idEnModification = null;
let idActiviteModification = null;
let idBudgetModification = null;
let idObjectifModification = null;
let idObjectifCotisation = null;
let idObjectifAchat = null;
let idInvestissementModification = null;
let idInvestissementOperation = null;

/* Période affichée dans l'écran Rapports ("AAAA-MM-JJ"). */
let periodeRapport = { debut: '', fin: '' };

/* Délais possibles du rappel de mise à jour, en jours (0 = jamais). */
const DELAIS_RAPPEL = [0, 1, 3, 7];

/* Dernière action annulable : copie des données juste avant
   la modification, et minuteur qui masque le bandeau. */
let annulation = null;
let minuteurAnnulation = null;

/* ---------- 2. Lecture et enregistrement des données ---------- */

/* Charge les données depuis le stockage local.
   Si rien n'est encore enregistré, prépare une structure vide. */
function chargerDonnees() {
  let brut;
  try {
    brut = localStorage.getItem(CLE_STOCKAGE);
  } catch (erreur) {
    donnees = donneesVides();
    stockageEnErreur = true;
    messageErreurStockage = "Le navigateur interdit l'accès au stockage local. Tes changements ne pourront pas être enregistrés.";
    return;
  }

  if (brut === null) {
    donnees = donneesVides();
    return;
  }

  try {
    const lues = migrerAnciennesDonnees(JSON.parse(brut));
    if (!structureValide(lues)) {
      throw new Error('Structure invalide');
    }
    donnees = normaliserDonnees(lues);
  } catch (erreur) {
    donnees = donneesVides();
    stockageEnErreur = true;
    messageErreurStockage = "Les données enregistrées sont illisibles. Elles ont été préservées ; restaure une sauvegarde ou exporte les données endommagées avant de réinitialiser.";
  }
}

/* La version 0.5 publiée sur GitHub enregistrait les investissements
   autrement : liste « apports », valeur, frais et revenus en totaux.
   On les convertit au format actuel avant la vérification, sans rien
   perdre : chaque total devient une opération de l'historique. */
function migrerAnciennesDonnees(objet) {
  if (!objet || typeof objet !== 'object' || !Array.isArray(objet.investissements)) return objet;
  objet.investissements = objet.investissements.map(function (ancien) {
    if (!ancien || typeof ancien !== 'object' || Array.isArray(ancien.operations) || !Array.isArray(ancien.apports)) return ancien;
    const creeLe = Number.isFinite(ancien.creeLe) ? ancien.creeLe : Date.now();
    const dateValeur = typeof ancien.dateMiseAJourValeur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ancien.dateMiseAJourValeur)
      ? ancien.dateMiseAJourValeur
      : versISO(new Date(creeLe));
    const operations = ancien.apports.map(function (apport) {
      return { id: apport.id, type: 'apport', montant: apport.montant, date: apport.date,
        note: typeof apport.note === 'string' ? apport.note : '', creeLe: Number.isFinite(apport.creeLe) ? apport.creeLe : creeLe };
    });
    ['frais', 'revenus'].forEach(function (cle) {
      if (Number.isSafeInteger(ancien[cle]) && ancien[cle] > 0) {
        operations.push({ id: nouvelIdentifiant(), type: cle === 'frais' ? 'frais' : 'revenu', montant: ancien[cle], date: dateValeur,
          note: 'Total repris de la version 0.5', creeLe: creeLe });
      }
    });
    const valeurs = Number.isSafeInteger(ancien.valeurActuelle) && ancien.valeurActuelle >= 0
      ? [{ id: nouvelIdentifiant(), montant: ancien.valeurActuelle, date: dateValeur, note: '', creeLe: creeLe }]
      : [];
    return {
      id: ancien.id,
      nom: ancien.nom,
      type: typeof ancien.type === 'string' ? ancien.type : '',
      notes: typeof ancien.notes === 'string' ? ancien.notes : '',
      statut: 'actif',
      creeLe: creeLe,
      operations: operations,
      valeurs: valeurs
    };
  });
  return objet;
}

/* Complète une structure valide avec les listes et réglages
   apparus dans les versions suivantes (anciennes sauvegardes). */
function normaliserDonnees(d) {
  d.version = 1;
  ['activites', 'objectifs', 'investissements', 'budgets'].forEach(function (cle) {
    if (!Array.isArray(d[cle])) d[cle] = [];
  });
  d.reglages = d.reglages || {};
  d.reglages.devise = d.reglages.devise || 'FCFA';
  d.reglages.categories = Array.isArray(d.reglages.categories) ? d.reglages.categories : CATEGORIES_DEFAUT.slice();
  d.reglages.rappelJours = DELAIS_RAPPEL.includes(d.reglages.rappelJours) ? d.reglages.rappelJours : 7;
  return d;
}

function donneesVides() {
  return {
    version: 1,
    transactions: [],
    activites: [],
    objectifs: [],
    investissements: [],
    budgets: [],
    reglages: { devise: 'FCFA', categories: CATEGORIES_DEFAUT.slice(), rappelJours: 7 }
  };
}

function structureValide(objet) {
  return objet !== null && typeof objet === 'object' &&
    Array.isArray(objet.transactions) && objet.transactions.every(transactionValide) &&
    (objet.activites === undefined || (Array.isArray(objet.activites) && objet.activites.every(activiteValide))) &&
    (objet.objectifs === undefined || (Array.isArray(objet.objectifs) && objet.objectifs.every(objectifValide))) &&
    (objet.investissements === undefined || (Array.isArray(objet.investissements) && objet.investissements.every(investissementValide))) &&
    (objet.budgets === undefined || (Array.isArray(objet.budgets) && objet.budgets.every(budgetValide))) &&
    (objet.reglages === undefined || reglagesValides(objet.reglages));
}

/* Sécurité : la devise et les catégories sont affichées partout ;
   on n'accepte que des textes courts. */
function reglagesValides(reglages) {
  return reglages !== null && typeof reglages === 'object' && !Array.isArray(reglages) &&
    (reglages.devise === undefined || (typeof reglages.devise === 'string' && /^[\p{L}\p{Sc} ]{1,10}$/u.test(reglages.devise))) &&
    (reglages.categories === undefined || (Array.isArray(reglages.categories) && reglages.categories.every(function (categorie) {
      return typeof categorie === 'string' && categorie.trim() !== '' && categorie.length <= 60;
    }))) &&
    (reglages.rappelJours === undefined || DELAIS_RAPPEL.includes(reglages.rappelJours));
}

function activiteValide(activite) {
  return activite !== null && typeof activite === 'object' &&
    typeof activite.id === 'string' && typeof activite.nom === 'string' &&
    ['idee', 'encours', 'pause', 'terminee'].includes(activite.statut) &&
    ['budget', 'revenuPrevu', 'depensesPrevues'].every(function (cle) {
      return activite[cle] === undefined || activite[cle] === null ||
        (Number.isSafeInteger(activite[cle]) && activite[cle] >= 0);
    }) &&
    (activite.heures === undefined || (typeof activite.heures === 'number' && Number.isFinite(activite.heures) && activite.heures >= 0)) &&
    ['description', 'dateDebut', 'dateFin'].every(function (cle) {
      return activite[cle] === undefined || typeof activite[cle] === 'string';
    });
}

function budgetValide(budget) {
  return budget !== null && typeof budget === 'object' &&
    typeof budget.id === 'string' &&
    ['general', 'categorie', 'activite'].includes(budget.type) &&
    typeof budget.mois === 'string' && /^\d{4}-\d{2}$/.test(budget.mois) &&
    Number.isSafeInteger(budget.montant) && budget.montant > 0 &&
    Number.isInteger(budget.seuil) && budget.seuil >= 1 && budget.seuil <= 100 &&
    (budget.categorie === undefined || typeof budget.categorie === 'string') &&
    (budget.activiteId === undefined || typeof budget.activiteId === 'string');
}

function investissementValide(investissement) {
  return investissement !== null && typeof investissement === 'object' &&
    typeof investissement.id === 'string' && typeof investissement.nom === 'string' &&
    typeof investissement.type === 'string' && typeof investissement.notes === 'string' &&
    ['actif', 'clos'].includes(investissement.statut) && Number.isFinite(investissement.creeLe) &&
    Array.isArray(investissement.operations) && investissement.operations.every(operationInvestissementValide) &&
    Array.isArray(investissement.valeurs) && investissement.valeurs.every(valeurInvestissementValide);
}

function operationInvestissementValide(operation) {
  return operation !== null && typeof operation === 'object' && typeof operation.id === 'string' &&
    ['apport', 'revenu', 'frais'].includes(operation.type) &&
    Number.isSafeInteger(operation.montant) && operation.montant > 0 &&
    typeof operation.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(operation.date) &&
    typeof operation.note === 'string' && Number.isFinite(operation.creeLe);
}

function valeurInvestissementValide(valeur) {
  return valeur !== null && typeof valeur === 'object' && typeof valeur.id === 'string' &&
    Number.isSafeInteger(valeur.montant) && valeur.montant >= 0 &&
    typeof valeur.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valeur.date) &&
    typeof valeur.note === 'string' && Number.isFinite(valeur.creeLe);
}

function transactionValide(transaction) {
  return transaction !== null && typeof transaction === 'object' &&
    typeof transaction.id === 'string' &&
    ['revenu', 'depense', 'transfert'].includes(transaction.type) &&
    Number.isSafeInteger(transaction.montant) && transaction.montant > 0 &&
    typeof transaction.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date) &&
    ['categorie', 'activiteId', 'objectifId', 'moyen', 'note', 'justificatif', 'source', 'destination'].every(function (cle) {
      return transaction[cle] === undefined || typeof transaction[cle] === 'string';
    }) &&
    (transaction.creeLe === undefined || Number.isFinite(transaction.creeLe));
}

function objectifValide(objectif) {
  return objectif !== null && typeof objectif === 'object' &&
    typeof objectif.id === 'string' && typeof objectif.nom === 'string' &&
    Number.isSafeInteger(objectif.cible) && objectif.cible > 0 &&
    (objectif.montantInitial === undefined || (Number.isSafeInteger(objectif.montantInitial) && objectif.montantInitial >= 0)) &&
    (objectif.dateCible === '' || /^\d{4}-\d{2}-\d{2}$/.test(objectif.dateCible)) &&
    ['hebdomadaire', 'mensuelle'].includes(objectif.frequence) &&
    (objectif.cotisationPrevue === null || (Number.isSafeInteger(objectif.cotisationPrevue) && objectif.cotisationPrevue > 0)) &&
    typeof objectif.reserve === 'string' && ['encours', 'termine'].includes(objectif.statut) &&
    Array.isArray(objectif.cotisations) && objectif.cotisations.every(cotisationValide) &&
    (objectif.achat === null || achatObjectifValide(objectif.achat)) && Number.isFinite(objectif.creeLe);
}

function cotisationValide(cotisation) {
  return cotisation !== null && typeof cotisation === 'object' &&
    typeof cotisation.id === 'string' && Number.isSafeInteger(cotisation.montant) && cotisation.montant > 0 &&
    typeof cotisation.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cotisation.date) &&
    typeof cotisation.note === 'string' && Number.isFinite(cotisation.creeLe);
}

function achatObjectifValide(achat) {
  return achat !== null && typeof achat === 'object' &&
    typeof achat.transactionId === 'string' && Number.isSafeInteger(achat.montant) && achat.montant > 0 &&
    typeof achat.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(achat.date) && typeof achat.categorie === 'string' &&
    ['encours', 'termine'].includes(achat.statutAvantAchat);
}

/* Enregistre toutes les données dans le stockage local. */
function enregistrerDonnees() {
  if (stockageEnErreur) {
    afficherErreurStockage();
    return false;
  }
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(donnees));
    return true;
  } catch (erreur) {
    messageErreurStockage = "L'enregistrement a échoué. Vérifie l'espace disponible dans le navigateur et exporte une sauvegarde dès que possible.";
    afficherErreurStockage();
    return false;
  }
}

function afficherErreurStockage() {
  const message = document.getElementById('alerte-stockage');
  if (message) {
    message.textContent = messageErreurStockage;
    message.hidden = false;
  }
}

function afficherEtatSauvegarde(message) {
  document.getElementById('etat-sauvegarde').textContent = message;
}

function telechargerTexte(nomFichier, texte, type) {
  const fichier = new Blob([texte], { type: type });
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function exporterSauvegarde() {
  if (stockageEnErreur) {
    afficherEtatSauvegarde("La sauvegarde structurée est bloquée tant que les données ne sont pas lisibles. Exporte le contenu brut ou restaure une sauvegarde valide.");
    return;
  }
  const sauvegarde = {
    application: 'Cap',
    versionSauvegarde: 1,
    exporteeLe: new Date().toISOString(),
    donnees: donnees
  };
  telechargerTexte('cap-sauvegarde-' + aujourdhuiISO() + '.json', JSON.stringify(sauvegarde, null, 2), 'application/json');
  try {
    localStorage.setItem(CLE_DERNIERE_SAUVEGARDE, aujourdhuiISO());
  } catch (erreur) {
    /* Sans stockage, le rappel restera affiché : ce n'est pas grave. */
  }
  afficherEtatSauvegarde('Sauvegarde JSON téléchargée. Conserve une copie hors de cet appareil.');
  rendreRappelSauvegarde();
}

function lireDerniereSauvegarde() {
  try {
    const date = localStorage.getItem(CLE_DERNIERE_SAUVEGARDE);
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  } catch (erreur) {
    return '';
  }
}

/* Nombre de jours entiers entre deux dates "AAAA-MM-JJ". */
function joursEntre(debutISO, finISO) {
  return Math.round((new Date(finISO + 'T12:00:00') - new Date(debutISO + 'T12:00:00')) / 86400000);
}

function contientDesDonnees() {
  return donnees.transactions.length + donnees.activites.length + donnees.objectifs.length +
    donnees.budgets.length + donnees.investissements.length > 0;
}

/* Rappel sur l'accueil + date de la dernière sauvegarde dans les
   paramètres (cahier des charges §7). */
function rendreRappelSauvegarde() {
  const derniere = lireDerniereSauvegarde();
  const anciennete = derniere ? joursEntre(derniere, aujourdhuiISO()) : null;
  document.getElementById('derniere-sauvegarde').textContent = derniere
    ? 'Dernière sauvegarde exportée depuis cet appareil : ' + formaterDateLongue(derniere) + '.'
    : 'Aucune sauvegarde exportée depuis cet appareil.';

  let message = '';
  if (contientDesDonnees() && !stockageEnErreur) {
    if (!derniere) {
      message = "Tes données n'existent que sur cet appareil et n'ont jamais été sauvegardées. Exporte une copie et garde-la ailleurs.";
    } else if (anciennete >= JOURS_AVANT_RAPPEL) {
      message = 'Dernière sauvegarde il y a ' + anciennete + ' jours. Exporte une copie à jour pour ne rien perdre.';
    }
  }
  document.getElementById('rappel-sauvegarde-texte').textContent = message;
  document.getElementById('rappel-sauvegarde').classList.toggle('cache', message === '');
}

/* Demande au navigateur de ne pas effacer les données de lui-même
   (manque de place, longue inutilisation, notamment sur iPhone). */
async function demanderStockagePersistant() {
  const etat = document.getElementById('etat-stockage');
  if (!navigator.storage || !navigator.storage.persist) {
    etat.textContent = 'Ce navigateur ne permet pas de protéger le stockage : les sauvegardes régulières sont indispensables.';
    return;
  }
  try {
    const persistant = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    etat.textContent = persistant
      ? "Stockage protégé : le navigateur ne doit pas effacer les données de lui-même. Elles restent perdues si l'appareil l'est : garde des sauvegardes."
      : "Stockage non protégé : le navigateur peut effacer les données s'il manque de place ou après une longue inutilisation. Exporte régulièrement une sauvegarde.";
  } catch (erreur) {
    etat.textContent = "L'état du stockage n'a pas pu être vérifié. Exporte régulièrement une sauvegarde.";
  }
}

function exporterContenuBrut() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (brut === null) {
      afficherEtatSauvegarde("Aucune donnée n'est présente dans le stockage local.");
      return;
    }
    telechargerTexte('cap-stockage-brut-' + aujourdhuiISO() + '.txt', brut, 'text/plain;charset=utf-8');
    afficherEtatSauvegarde('Contenu brut téléchargé sans modification.');
  } catch (erreur) {
    afficherEtatSauvegarde("Le navigateur n'autorise pas la lecture du stockage local.");
  }
}

async function restaurerSauvegarde(fichier) {
  if (!fichier) return;
  try {
    const contenu = JSON.parse(await fichier.text());
    const candidate = migrerAnciennesDonnees(contenu && contenu.application === 'Cap' ? contenu.donnees : contenu);
    if (!structureValide(candidate)) {
      throw new Error('Format de sauvegarde non reconnu');
    }
    if (!confirm("Cette restauration remplacera les données actuelles. Exporte-les d'abord si tu veux les conserver. Continuer ?")) {
      return;
    }
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(candidate));
    } catch (erreur) {
      stockageEnErreur = true;
      messageErreurStockage = "La restauration a été lue, mais le navigateur n'a pas pu enregistrer les données.";
      afficherErreurStockage();
      return;
    }
    donnees = normaliserDonnees(candidate);
    stockageEnErreur = false;
    messageErreurStockage = '';
    document.getElementById('alerte-stockage').hidden = true;
    moisFiltre = aujourdhuiISO().slice(0, 7);
    masquerAnnulation();
    rendreTout();
    afficherEtatSauvegarde('Sauvegarde restaurée avec succès.');
  } catch (erreur) {
    afficherEtatSauvegarde('Impossible de restaurer ce fichier : vérifie qu’il s’agit d’une sauvegarde JSON valide de Cap.');
  } finally {
    document.getElementById('fichier-sauvegarde').value = '';
  }
}

/* Après une modification réussie : propose de revenir à l'état
   précédent pendant 10 secondes (cahier des charges §6). */
function proposerAnnulation(avant, message) {
  clearTimeout(minuteurAnnulation);
  annulation = avant;
  document.getElementById('texte-annulation').textContent = message;
  document.getElementById('bandeau-annulation').classList.remove('cache');
  minuteurAnnulation = setTimeout(masquerAnnulation, 10000);
}

function masquerAnnulation() {
  clearTimeout(minuteurAnnulation);
  annulation = null;
  document.getElementById('bandeau-annulation').classList.add('cache');
}

function annulerDerniereAction() {
  if (annulation === null) return;
  const actuel = JSON.stringify(donnees);
  donnees = JSON.parse(annulation);
  if (!enregistrerDonnees()) donnees = JSON.parse(actuel);
  masquerAnnulation();
  rendreTout();
}

/* Crée un identifiant unique pour une nouvelle transaction. */
function nouvelIdentifiant() {
  return crypto.randomUUID();
}

/* ---------- 3. Outils d'affichage ---------- */

/* Transforme 45000 en "45 000 FCFA". */
function formaterMontant(nombre) {
  return nombre.toLocaleString('fr-FR') + ' ' + donnees.reglages.devise;
}

/* Transforme "2026-09-26" en "26 septembre 2026".
   L'heure "12:00" évite les décalages de fuseau horaire. */
function formaterDateLongue(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* Transforme "2026-09-26" en "26/09/2026". */
function formaterDateCourte(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  return d.toLocaleDateString('fr-FR');
}

/* Transforme "2026-09-01" en "Septembre 2026". */
function formaterMoisAnnee(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  const texte = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/* Date du jour au format "2026-09-27". */
function aujourdhuiISO() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mois + '-' + jour;
}

/* Date quelconque au format "AAAA-MM-JJ". */
function versISO(date) {
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + mois + '-' + jour;
}

/* Crée une icône du sprite placé en haut de index.html. */
function icone(nom) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icone');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + nom);
  svg.appendChild(use);
  return svg;
}

/* Nombre seul, sans devise : "45 000", "+42 500" si signe demandé. */
function formaterNombre(nombre, signe) {
  return (signe && nombre > 0 ? '+' : '') + nombre.toLocaleString('fr-FR');
}

/* Petits blocs de chiffres côte à côte : [{ libelle, valeur, classe }].
   Les montants y sont écrits sans devise pour tenir sur un téléphone. */
function construireStats(stats) {
  const grille = document.createElement('div');
  grille.className = 'stats';
  stats.forEach(function (stat) {
    const bloc = document.createElement('div');
    bloc.className = 'stat' + (stat.classe ? ' ' + stat.classe : '');
    const libelle = document.createElement('small');
    libelle.textContent = stat.libelle;
    const valeur = document.createElement('strong');
    valeur.textContent = stat.valeur;
    bloc.append(libelle, valeur);
    grille.appendChild(bloc);
  });
  return grille;
}

/* Barre de progression accessible (pourcentage de 0 à 100). */
function construireBarre(pourcentage, libelle, classe) {
  const barre = document.createElement('div');
  barre.className = 'barre-progression';
  barre.setAttribute('role', 'progressbar');
  barre.setAttribute('aria-label', libelle);
  barre.setAttribute('aria-valuemin', '0');
  barre.setAttribute('aria-valuemax', '100');
  barre.setAttribute('aria-valuenow', String(Math.round(Math.min(100, pourcentage))));
  const progression = document.createElement('span');
  if (classe) progression.className = classe;
  progression.style.width = Math.min(100, Math.max(0, pourcentage)) + '%';
  barre.appendChild(progression);
  return barre;
}

/* Classe de couleur d'un résultat : positif, négatif ou neutre. */
function classeSigne(montant) {
  return montant > 0 ? 'positif' : (montant < 0 ? 'negatif' : '');
}

/* "Aujourd'hui", "Hier" ou la date en toutes lettres. */
function libelleJour(dateISO) {
  const aujourdHui = aujourdhuiISO();
  if (dateISO === aujourdHui) return 'Aujourd’hui';
  if (dateISO === veille(aujourdHui)) return 'Hier';
  return formaterDateLongue(dateISO);
}

/* ---------- 4. Navigation entre les écrans ---------- */

/* Sur téléphone, certains écrans sont rangés sous un même onglet de la
   barre du bas (sur ordinateur, chaque écran a son propre bouton). */
const ONGLET_DE_ECRAN = { investissements: 'objectifs', budgets: 'plus', rapports: 'plus', parametres: 'plus' };

/* Affiche l'écran demandé et masque les autres. */
function afficherEcran(nom) {
  document.querySelectorAll('.ecran').forEach(function (ecran) {
    ecran.classList.remove('actif');
  });
  const cible = document.getElementById('ecran-' + nom);
  if (cible !== null) {
    cible.classList.add('actif');
  }
  /* L'onglet correspondant passe en surbrillance. */
  const groupe = ONGLET_DE_ECRAN[nom] || '';
  document.querySelectorAll('.onglet').forEach(function (bouton) {
    const actif = bouton.dataset.ecran === nom;
    bouton.classList.toggle('actif', actif);
    bouton.classList.toggle('actif-groupe', bouton.dataset.ecran === groupe);
    if (actif) bouton.setAttribute('aria-current', 'page'); else bouton.removeAttribute('aria-current');
  });
  /* Les graphiques prennent la largeur de leur bloc : on les redessine
     quand l'accueil redevient visible. */
  if (nom === 'accueil') rendreGraphiques();
  document.querySelectorAll('.segment').forEach(function (segment) {
    const actif = segment.dataset.ecran === nom;
    segment.classList.toggle('actif', actif);
    segment.setAttribute('aria-selected', String(actif));
  });
  window.scrollTo(0, 0); /* remonte en haut du nouvel écran */
}

/* ---------- 5. Période affichée sur le tableau de bord ---------- */

/* Renvoie les bornes { debut, fin } de la période choisie,
   au format "AAAA-MM-JJ". */
function bornesPeriode() {
  const maintenant = new Date();

  if (periode.mode === 'mois') {
    return { debut: premierJourMois(maintenant), fin: dernierJourMois(maintenant) };
  }

  if (periode.mode === 'moisPrecedent') {
    const precedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
    return { debut: premierJourMois(precedent), fin: dernierJourMois(precedent) };
  }

  return { debut: periode.debut, fin: periode.fin };
}

/* Premier jour du mois de la date donnée. */
function premierJourMois(date) {
  return versISO(new Date(date.getFullYear(), date.getMonth(), 1));
}

/* Dernier jour du mois : jour 0 du mois suivant. */
function dernierJourMois(date) {
  return versISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/* Les dates "AAAA-MM-JJ" se comparent très simplement :
   l'ordre alphabétique est aussi l'ordre chronologique. */
function transactionsDeLaPeriode() {
  const bornes = bornesPeriode();
  return donnees.transactions.filter(function (t) {
    return t.date >= bornes.debut && t.date <= bornes.fin;
  });
}

/* ---------- 6. Calculs ---------- */

/* Additionne revenus, dépenses et transferts d'une liste de
   transactions, puis calcule le solde.
   Rappel (cahier des charges §3.5) : un transfert interne déplace
   de l'argent d'une "poche" à une autre (par exemple vers un
   objectif d'épargne). Il ne compte ni en revenu ni en dépense. */
function totaux(liste) {
  let revenus = 0;
  let depenses = 0;
  let transferts = 0;

  for (const t of liste) {
    if (t.type === 'revenu') {
      revenus += t.montant;
    } else if (t.type === 'depense') {
      depenses += t.montant;
    } else if (t.type === 'transfert') {
      transferts += t.montant;
    }
  }

  return { revenus: revenus, depenses: depenses, transferts: transferts, solde: revenus - depenses };
}

/* ---------- 7. Activités et budgets ---------- */

function transactionsDeBudget(budget) {
  return donnees.transactions.filter(function (transaction) {
    if (transaction.type !== 'depense' || transaction.date.slice(0, 7) !== budget.mois) return false;
    if (budget.type === 'categorie') return transaction.categorie === budget.categorie;
    if (budget.type === 'activite') return transaction.activiteId === budget.activiteId;
    return true;
  });
}

function depensesBudget(budget) {
  return totaux(transactionsDeBudget(budget)).depenses;
}

function nomPorteeBudget(budget) {
  if (budget.type === 'categorie') return 'Catégorie : ' + (budget.categorie || 'inconnue');
  if (budget.type === 'activite') return 'Activité : ' + nomActivite(budget.activiteId);
  return 'Budget global';
}

function libelleStatutActivite(statut) {
  const libelles = { idee: 'Idée', encours: 'En cours', pause: 'En pause', terminee: 'Terminée' };
  return libelles[statut] || 'Autre';
}

function totauxActivite(activiteId) {
  return totaux(donnees.transactions.filter(function (transaction) {
    return transaction.activiteId === activiteId;
  }));
}

function construireCarteActivite(activite, compacte) {
  const chiffres = totauxActivite(activite.id);
  const carte = document.createElement('article');
  carte.className = 'carte carte-element';
  if (compacte) carte.classList.add('carte-compacte');

  const entete = document.createElement('div');
  entete.className = 'ligne-flex';
  const nom = document.createElement('h3');
  nom.textContent = activite.nom;
  const statut = document.createElement('span');
  statut.className = 'badge-statut statut-' + activite.statut;
  statut.textContent = libelleStatutActivite(activite.statut);
  entete.append(nom, statut);
  carte.appendChild(entete);

  if (activite.description) {
    const description = document.createElement('p');
    description.className = 'note';
    description.textContent = activite.description;
    carte.appendChild(description);
  }

  carte.appendChild(construireStats([
    { libelle: 'Reçu', valeur: formaterNombre(chiffres.revenus) },
    { libelle: 'Payé', valeur: formaterNombre(chiffres.depenses) },
    { libelle: 'Résultat', valeur: formaterNombre(chiffres.solde, true), classe: classeSigne(chiffres.solde) }
  ]));

  if (activite.budget !== null && activite.budget !== undefined) {
    const reste = activite.budget - chiffres.depenses;
    const taux = activite.budget > 0 ? chiffres.depenses / activite.budget * 100 : 100;
    carte.appendChild(construireBarre(taux, 'Budget utilisé de ' + activite.nom, reste < 0 ? 'progression-depassee' : (taux >= 80 ? 'progression-alerte' : '')));
    const budget = document.createElement('p');
    budget.className = reste < 0 ? 'texte-alerte' : 'note';
    budget.textContent = 'Budget ' + formaterMontant(activite.budget) + ' · ' +
      (reste >= 0 ? 'reste ' + formaterMontant(reste) : 'dépassé de ' + formaterMontant(Math.abs(reste)));
    carte.appendChild(budget);
  }

  const previsions = [];
  if (activite.revenuPrevu !== null && activite.revenuPrevu !== undefined) previsions.push('Revenu prévu ' + formaterMontant(activite.revenuPrevu));
  if (activite.depensesPrevues !== null && activite.depensesPrevues !== undefined) previsions.push('dépenses prévues ' + formaterMontant(activite.depensesPrevues));
  if (activite.heures > 0) previsions.push(formaterMontant(Math.round(chiffres.solde / activite.heures)) + ' par heure (' + activite.heures.toLocaleString('fr-FR') + ' h)');
  if (previsions.length) {
    const details = document.createElement('p');
    details.className = 'note';
    details.textContent = previsions.join(' · ');
    carte.appendChild(details);
  }

  if (!compacte) {
    const actions = document.createElement('div');
    actions.className = 'actions-carte';
    const modifier = document.createElement('button');
    modifier.type = 'button';
    modifier.className = 'btn btn-texte';
    modifier.textContent = 'Modifier';
    modifier.addEventListener('click', function () { ouvrirFormulaireActivite(activite.id); });
    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'btn btn-texte';
    supprimer.textContent = 'Supprimer';
    supprimer.addEventListener('click', function () { supprimerActivite(activite.id); });
    actions.append(modifier, supprimer);
    carte.appendChild(actions);
  }
  return carte;
}

function rendreActivites() {
  const liste = document.getElementById('liste-activites');
  const vide = document.getElementById('activites-vides');
  liste.replaceChildren();
  vide.hidden = donnees.activites.length > 0;
  for (const activite of donnees.activites) liste.appendChild(construireCarteActivite(activite, false));
}

/* Ligne de résumé de l'accueil : nom, valeur à droite, barre facultative.
   Toucher la ligne ouvre l'écran détaillé. */
function construireLigneResume(nom, valeur, ecran, barre) {
  const ligne = document.createElement('button');
  ligne.type = 'button';
  ligne.className = 'ligne-resume';
  const haut = document.createElement('span');
  haut.className = 'ligne-resume-haut';
  const titre = document.createElement('strong');
  titre.textContent = nom;
  const droite = document.createElement('span');
  droite.textContent = valeur;
  haut.append(titre, droite);
  ligne.appendChild(haut);
  if (barre) ligne.appendChild(barre);
  ligne.addEventListener('click', function () { afficherEcran(ecran); });
  return ligne;
}

function messageVide(texte) {
  const note = document.createElement('p');
  note.className = 'vide';
  note.textContent = texte;
  return note;
}

function rendreResumeActivites() {
  const conteneur = document.getElementById('resume-activites');
  conteneur.replaceChildren();
  const actives = donnees.activites.filter(function (activite) { return activite.statut === 'encours'; }).slice(0, 4);
  if (!actives.length) {
    conteneur.appendChild(messageVide('Aucune activité en cours.'));
    return;
  }
  for (const activite of actives) {
    const chiffres = totauxActivite(activite.id);
    conteneur.appendChild(construireLigneResume(activite.nom, 'Résultat ' + formaterEcart(chiffres.solde), 'activites', null));
  }
}

function moisAlertesTableau() {
  const bornes = bornesPeriode();
  if (periode.mode === 'mois' || periode.mode === 'moisPrecedent') return bornes.debut.slice(0, 7);
  if (bornes.debut && bornes.fin && bornes.debut.slice(0, 7) === bornes.fin.slice(0, 7)) return bornes.debut.slice(0, 7);
  return '';
}

/* Rappel « pense à mettre à jour » si rien n'a été saisi depuis le
   délai choisi dans les paramètres (cahier des charges §4.4). */
function messageRappelMiseAJour() {
  const delai = donnees.reglages.rappelJours;
  if (!delai) return '';
  let derniere = 0;
  const noter = function (element) { if (element.creeLe > derniere) derniere = element.creeLe; };
  donnees.transactions.forEach(noter);
  donnees.objectifs.forEach(function (objectif) { objectif.cotisations.forEach(noter); });
  donnees.investissements.forEach(function (investissement) {
    investissement.operations.forEach(noter);
    investissement.valeurs.forEach(noter);
  });
  if (!derniere) return '';
  const ecoule = joursEntre(versISO(new Date(derniere)), aujourdhuiISO());
  if (ecoule < delai) return '';
  return 'Aucune saisie depuis ' + ecoule + (ecoule > 1 ? ' jours' : ' jour') +
    ' : pense à mettre à jour tes dépenses et revenus.';
}

function rendreAlertesBudget() {
  const liste = document.getElementById('alertes-budget');
  const vide = document.getElementById('alertes-vides');
  liste.replaceChildren();
  const mois = moisAlertesTableau();
  const alertesBudget = mois ? donnees.budgets.filter(function (budget) {
    return budget.mois === mois && depensesBudget(budget) >= budget.montant * budget.seuil / 100;
  }) : [];
  const alertesObjectif = donnees.objectifs.filter(function (objectif) {
    return objectif.statut === 'encours' && (
      (objectif.dateCible && objectif.dateCible < aujourdhuiISO() && montantRestantObjectif(objectif) > 0) || cotisationEnRetard(objectif)
    );
  });
  /* Projet qui dépasse le budget prévu sur sa fiche (toutes dates
     confondues). Une activité terminée ne déclenche plus d'alerte. */
  const alertesActivite = donnees.activites.filter(function (activite) {
    return activite.statut !== 'terminee' && activite.budget !== null && activite.budget !== undefined &&
      totauxActivite(activite.id).depenses > activite.budget;
  });
  const rappel = messageRappelMiseAJour();
  if (rappel) {
    const li = document.createElement('li');
    li.textContent = rappel;
    liste.appendChild(li);
  }
  const nombreAlertes = alertesBudget.length + alertesObjectif.length + alertesActivite.length + (rappel ? 1 : 0);
  vide.hidden = nombreAlertes > 0;
  vide.textContent = mois
    ? 'Aucune alerte de budget, d’activité ou d’objectif pour cette période.'
    : 'Pour afficher les budgets mensuels, choisis une période qui reste dans un seul mois.';
  for (const budget of alertesBudget) {
    const utilise = depensesBudget(budget);
    const li = document.createElement('li');
    const portee = budget.type === 'categorie' ? 'Budget ' + budget.categorie : (budget.type === 'activite' ? 'Budget ' + nomActivite(budget.activiteId) : 'Budget global');
    li.textContent = portee + ' : ' + formaterMontant(utilise) + ' sur ' +
      formaterMontant(budget.montant) + (utilise > budget.montant ? ', budget dépassé.' : ', seuil de ' + budget.seuil + ' % atteint.');
    liste.appendChild(li);
  }
  for (const activite of alertesActivite) {
    const depenses = totauxActivite(activite.id).depenses;
    const li = document.createElement('li');
    li.textContent = 'Activité « ' + activite.nom + ' » : budget de ' + formaterMontant(activite.budget) +
      ' dépassé de ' + formaterMontant(depenses - activite.budget) + '.';
    liste.appendChild(li);
  }
  for (const objectif of alertesObjectif) {
    const li = document.createElement('li');
    const messages = [];
    if (objectif.dateCible && objectif.dateCible < aujourdhuiISO() && montantRestantObjectif(objectif) > 0) {
      messages.push('date souhaitée dépassée, reste ' + formaterMontant(montantRestantObjectif(objectif)));
    }
    if (cotisationEnRetard(objectif)) {
      messages.push('cotisations prévues : ' + formaterMontant(montantCotisationsAttendues(objectif)) +
        ' cumulés, enregistrés : ' + formaterMontant(totalCotisationsEnregistrees(objectif)));
    }
    li.textContent = 'Objectif « ' + objectif.nom + ' » : ' + messages.join(' ; ') + '.';
    liste.appendChild(li);
  }
  /* Chaque alerte reçoit son icône ; le bloc disparaît s'il est vide. */
  liste.querySelectorAll('li').forEach(function (li) {
    const texte = document.createElement('span');
    texte.textContent = li.textContent;
    li.replaceChildren(icone('alerte'), texte);
  });
  document.getElementById('bloc-alertes').hidden = nombreAlertes === 0 && Boolean(mois);
}

function rendreBudgets() {
  const mois = document.getElementById('mois-budget').value || aujourdhuiISO().slice(0, 7);
  const liste = document.getElementById('liste-budgets');
  const vide = document.getElementById('budgets-vides');
  liste.replaceChildren();
  const budgets = donnees.budgets.filter(function (budget) { return budget.mois === mois; });
  vide.hidden = budgets.length > 0;

  for (const budget of budgets) {
    const utilise = depensesBudget(budget);
    const taux = utilise / budget.montant * 100;
    const carte = document.createElement('article');
    carte.className = 'carte carte-element';
    const entete = document.createElement('div');
    entete.className = 'ligne-flex';
    const titre = document.createElement('h3');
    titre.textContent = nomPorteeBudget(budget);
    const seuil = document.createElement('span');
    seuil.className = 'badge-statut ' + (taux >= 100 ? 'statut-depasse' : (taux >= budget.seuil ? 'statut-alerte' : 'statut-normal'));
    seuil.textContent = taux >= 100 ? 'Dépassé' : (taux >= budget.seuil ? 'Seuil atteint' : 'Dans la limite');
    entete.append(titre, seuil);
    carte.appendChild(entete);

    const chiffres = document.createElement('p');
    chiffres.className = 'resume-financier';
    chiffres.textContent = formaterMontant(utilise) + ' dépensés sur ' + formaterMontant(budget.montant) +
      ' · ' + Math.round(taux) + ' % · alerte à ' + budget.seuil + ' %';
    carte.appendChild(chiffres);
    const barre = document.createElement('div');
    barre.className = 'barre-progression';
    barre.setAttribute('role', 'progressbar');
    barre.setAttribute('aria-valuemin', '0');
    barre.setAttribute('aria-valuemax', '100');
    barre.setAttribute('aria-valuenow', String(Math.min(100, Math.round(taux))));
    const progression = document.createElement('span');
    progression.className = taux >= 100 ? 'progression-depassee' : (taux >= budget.seuil ? 'progression-alerte' : '');
    progression.style.width = Math.min(100, taux) + '%';
    barre.appendChild(progression);
    carte.appendChild(barre);

    const actions = document.createElement('div');
    actions.className = 'actions-carte';
    const modifier = document.createElement('button');
    modifier.type = 'button';
    modifier.className = 'btn btn-texte';
    modifier.textContent = 'Modifier';
    modifier.addEventListener('click', function () { ouvrirFormulaireBudget(budget.id); });
    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'btn btn-texte';
    supprimer.textContent = 'Supprimer';
    supprimer.addEventListener('click', function () { supprimerBudget(budget.id); });
    actions.append(modifier, supprimer);
    carte.appendChild(actions);
    liste.appendChild(carte);
  }
}

/* ---------- 8. Objectifs d'épargne et cotisations ---------- */

/* Somme des seules cotisations saisies depuis la création de l'objectif. */
function totalCotisationsEnregistrees(objectif) {
  return objectif.cotisations.reduce(function (total, cotisation) { return total + cotisation.montant; }, 0);
}

/* Tout ce qui est mis de côté : montant initial + cotisations. */
function totalCotise(objectif) {
  return (objectif.montantInitial || 0) + totalCotisationsEnregistrees(objectif);
}

function montantRestantObjectif(objectif) {
  return Math.max(0, objectif.cible - totalCotise(objectif));
}

function montantCotisationsAttendues(objectif) {
  if (!objectif.cotisationPrevue || objectif.statut !== 'encours') return 0;
  /* On ne peut pas attendre plus que ce qui restait à épargner au départ. */
  const plafond = Math.max(0, objectif.cible - (objectif.montantInitial || 0));
  const debutISO = versISO(new Date(objectif.creeLe));
  const debut = new Date(debutISO + 'T12:00:00');
  const aujourdHui = new Date(aujourdhuiISO() + 'T12:00:00');
  if (objectif.frequence === 'hebdomadaire') {
    const periodes = Math.max(0, Math.floor((aujourdHui - debut) / (7 * 86400000)));
    return Math.min(plafond, periodes * objectif.cotisationPrevue);
  }
  let periodes = (aujourdHui.getFullYear() - debut.getFullYear()) * 12 + aujourdHui.getMonth() - debut.getMonth();
  const dernierJourMois = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() + 1, 0).getDate();
  const jourEcheance = Math.min(debut.getDate(), dernierJourMois);
  if (aujourdHui.getDate() < jourEcheance) periodes -= 1;
  return Math.min(plafond, Math.max(0, periodes) * objectif.cotisationPrevue);
}

/* Le montant initial existait avant le plan : il réduit le reste à
   épargner, mais ne remplace pas les cotisations prévues. */
function cotisationEnRetard(objectif) {
  return montantRestantObjectif(objectif) > 0 &&
    totalCotisationsEnregistrees(objectif) < montantCotisationsAttendues(objectif);
}

function periodesRestantesObjectif(objectif) {
  if (!objectif.dateCible) return null;
  const aujourdHui = new Date(aujourdhuiISO() + 'T12:00:00');
  const cible = new Date(objectif.dateCible + 'T12:00:00');
  if (!Number.isFinite(cible.getTime())) return null;
  if (objectif.frequence === 'hebdomadaire') {
    const jours = Math.max(0, Math.ceil((cible - aujourdHui) / 86400000));
    return Math.max(1, Math.ceil(jours / 7));
  }
  const mois = (cible.getFullYear() - aujourdHui.getFullYear()) * 12 + cible.getMonth() - aujourdHui.getMonth();
  return Math.max(1, mois);
}

/* Date à laquelle la cible serait atteinte si l'on continue au
   rythme des cotisations déjà enregistrées. null si impossible à
   estimer (aucune cotisation, objectif atteint ou terminé). */
function estimationObjectif(objectif) {
  const enregistre = totalCotisationsEnregistrees(objectif);
  const restant = montantRestantObjectif(objectif);
  if (objectif.statut !== 'encours' || enregistre === 0 || restant === 0) return null;
  const aujourdHui = aujourdhuiISO();
  let debut = versISO(new Date(objectif.creeLe));
  objectif.cotisations.forEach(function (cotisation) { if (cotisation.date < debut) debut = cotisation.date; });
  /* Au moins une semaine, pour qu'une première cotisation
     ne donne pas un rythme quotidien démesuré. */
  const jours = Math.max(7, joursEntre(debut, aujourdHui));
  const parJour = enregistre / jours;
  const joursRestants = Math.ceil(restant / parJour);
  const parPeriode = Math.round(parJour * (objectif.frequence === 'hebdomadaire' ? 7 : 30.44));
  if (joursRestants > 365 * 50) return { date: null, parPeriode: parPeriode };
  const fin = new Date(aujourdHui + 'T12:00:00');
  fin.setDate(fin.getDate() + joursRestants);
  return { date: versISO(fin), parPeriode: parPeriode };
}

function texteEstimationObjectif(objectif) {
  const estimation = estimationObjectif(objectif);
  if (!estimation) return '';
  const rythme = 'À ton rythme actuel (' + formaterMontant(estimation.parPeriode) + ' par ' +
    (objectif.frequence === 'hebdomadaire' ? 'semaine' : 'mois') + ')';
  if (!estimation.date) return rythme + ' : plus de 50 ans.';
  const tropTard = objectif.dateCible && estimation.date > objectif.dateCible;
  return rythme + ' : vers le ' + formaterDateCourte(estimation.date) +
    (tropTard ? ', après la date souhaitée.' : '.');
}

function resumeRythmeObjectif(objectif) {
  const restant = montantRestantObjectif(objectif);
  if (restant === 0) return 'Montant cible atteint.';
  const rappel = cotisationEnRetard(objectif) ? ' La cotisation prévue semble en retard.' : '';
  if (!objectif.dateCible) return 'Ajoute une date souhaitée pour connaître le rythme à tenir.' + rappel;
  const enRetard = objectif.dateCible < aujourdhuiISO();
  const periodes = periodesRestantesObjectif(objectif);
  const montant = Math.ceil(restant / periodes);
  const frequence = objectif.frequence === 'hebdomadaire' ? 'semaine' : 'mois';
  return (enRetard ? 'Date souhaitée dépassée. ' : '') + 'À mettre de côté : ' +
    formaterMontant(montant) + ' par ' + frequence + ' pendant ' + periodes + (periodes > 1 ? ' ' + (frequence === 'mois' ? 'mois' : 'semaines') + '.' : ' ' + frequence + '.') + rappel;
}

function construireCarteObjectif(objectif, compacte) {
  const cotise = totalCotise(objectif);
  const restant = montantRestantObjectif(objectif);
  const pourcentage = Math.min(100, Math.round(cotise / objectif.cible * 100));
  const carte = document.createElement('article');
  carte.className = 'carte carte-element';
  if (compacte) carte.classList.add('carte-compacte');

  const entete = document.createElement('div');
  entete.className = 'ligne-flex';
  const nom = document.createElement('h3');
  nom.textContent = objectif.nom;
  const badge = document.createElement('span');
  badge.className = 'badge-statut ' + (objectif.statut === 'termine' ? 'statut-terminee' : (objectif.dateCible && objectif.dateCible < aujourdhuiISO() && restant > 0 ? 'statut-alerte' : 'statut-encours'));
  badge.textContent = objectif.statut === 'termine' ? 'Terminé' : (restant === 0 ? 'Montant atteint' : (objectif.dateCible && objectif.dateCible < aujourdhuiISO() ? 'En retard' : 'En cours'));
  entete.append(nom, badge);
  carte.appendChild(entete);

  const chiffres = document.createElement('p');
  chiffres.className = 'montant-principal';
  chiffres.textContent = formaterMontant(cotise) + ' ';
  const sur = document.createElement('small');
  sur.textContent = 'sur ' + formaterMontant(objectif.cible);
  chiffres.appendChild(sur);
  carte.appendChild(chiffres);

  carte.appendChild(construireBarre(pourcentage, 'Progression de ' + objectif.nom, ''));

  const etat = document.createElement('p');
  etat.className = 'note';
  etat.textContent = pourcentage + ' % · reste ' + formaterMontant(restant) +
    (objectif.dateCible ? ' · pour le ' + formaterDateCourte(objectif.dateCible) : '') +
    (objectif.reserve ? ' · ' + objectif.reserve : '');
  carte.appendChild(etat);

  if (objectif.statut === 'encours') {
    const details = document.createElement('p');
    details.className = 'note';
    details.textContent = resumeRythmeObjectif(objectif);
    carte.appendChild(details);
    const estimation = texteEstimationObjectif(objectif);
    if (estimation) {
      const ligneEstimation = document.createElement('p');
      ligneEstimation.className = estimation.indexOf('après la date souhaitée') >= 0 ? 'texte-alerte' : 'note';
      ligneEstimation.textContent = estimation;
      carte.appendChild(ligneEstimation);
    }
  }

  if (objectif.achat) {
    const achat = document.createElement('p');
    achat.className = 'note';
    achat.textContent = 'Achat enregistré comme dépense le ' + formaterDateCourte(objectif.achat.date) +
      ' : ' + formaterMontant(objectif.achat.montant) + '.';
    carte.appendChild(achat);
  }

  if (objectif.cotisations.length) {
    const historique = document.createElement('details');
    historique.className = 'historique-cotisations';
    const titreHistorique = document.createElement('summary');
    titreHistorique.textContent = 'Cotisations (' + objectif.cotisations.length + ')';
    historique.appendChild(titreHistorique);
    const liste = document.createElement('ul');
    liste.className = 'liste-simple';
    if (objectif.montantInitial > 0) {
      const initial = document.createElement('li');
      initial.className = 'ligne-cotisation';
      initial.textContent = 'Au départ · ' + formaterMontant(objectif.montantInitial);
      liste.appendChild(initial);
    }
    objectif.cotisations.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.creeLe - a.creeLe; }).forEach(function (cotisation) {
      const ligne = document.createElement('li');
      ligne.className = 'ligne-cotisation';
      const texte = document.createElement('span');
      texte.textContent = formaterDateCourte(cotisation.date) + ' · ' + formaterMontant(cotisation.montant) +
        (cotisation.note ? ' · ' + cotisation.note : '');
      const retirer = document.createElement('button');
      retirer.type = 'button';
      retirer.className = 'btn btn-secondaire bouton-retirer-cotisation';
      retirer.textContent = 'Retirer';
      retirer.setAttribute('aria-label', 'Retirer la cotisation de ' + formaterMontant(cotisation.montant) + ' du ' + formaterDateCourte(cotisation.date));
      retirer.addEventListener('click', function () { supprimerCotisation(objectif.id, cotisation.id); });
      ligne.append(texte, retirer);
      liste.appendChild(ligne);
    });
    historique.appendChild(liste);
    carte.appendChild(historique);
  }

  const actions = document.createElement('div');
  actions.className = 'actions-carte';
  if (objectif.statut === 'encours') {
    const cotiser = document.createElement('button');
    cotiser.type = 'button';
    cotiser.className = 'btn btn-principal';
    cotiser.textContent = 'Cotiser';
    cotiser.addEventListener('click', function () { ouvrirFormulaireCotisation(objectif.id); });
    actions.appendChild(cotiser);
  }
  if (!objectif.achat && objectif.statut === 'encours') {
    const achat = document.createElement('button');
    achat.type = 'button';
    achat.className = 'btn btn-secondaire';
    achat.textContent = 'Acheté';
    achat.addEventListener('click', function () { ouvrirFormulaireAchat(objectif.id); });
    actions.appendChild(achat);
  }
  const modifier = document.createElement('button');
  modifier.type = 'button';
  modifier.className = 'btn btn-texte';
  modifier.textContent = 'Modifier';
  modifier.addEventListener('click', function () { ouvrirFormulaireObjectif(objectif.id); });
  actions.appendChild(modifier);
  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'btn btn-texte';
  supprimer.textContent = 'Supprimer';
  supprimer.addEventListener('click', function () { supprimerObjectif(objectif.id); });
  actions.appendChild(supprimer);
  carte.appendChild(actions);
  return carte;
}

function objectifsEnCours() {
  return donnees.objectifs.filter(function (objectif) { return objectif.statut === 'encours'; });
}

function rendreObjectifs() {
  const liste = document.getElementById('liste-objectifs');
  const vide = document.getElementById('objectifs-vides');
  liste.replaceChildren();
  const objectifs = donnees.objectifs.slice().sort(function (a, b) {
    if (a.statut !== b.statut) return a.statut === 'encours' ? -1 : 1;
    return b.creeLe - a.creeLe;
  });
  vide.hidden = objectifs.length > 0;
  objectifs.forEach(function (objectif) { liste.appendChild(construireCarteObjectif(objectif, false)); });
}

function rendreResumeObjectifs() {
  const conteneur = document.getElementById('resume-objectifs');
  conteneur.replaceChildren();
  const objectifs = objectifsEnCours().slice(0, 3);
  const aucun = objectifsEnCours().length === 0;
  document.querySelectorAll('[data-action="cotiser"]').forEach(function (bouton) { bouton.disabled = aucun; });
  if (!objectifs.length) {
    conteneur.appendChild(messageVide('Aucun objectif en cours.'));
    return;
  }
  objectifs.forEach(function (objectif) {
    const cotise = totalCotise(objectif);
    const pourcentage = cotise / objectif.cible * 100;
    conteneur.appendChild(construireLigneResume(objectif.nom,
      formaterMontant(cotise) + ' / ' + objectif.cible.toLocaleString('fr-FR'),
      'objectifs', construireBarre(pourcentage, 'Progression de ' + objectif.nom, '')));
  });
}

function ouvrirFormulaireObjectif(id) {
  idObjectifModification = id || null;
  const objectif = id ? donnees.objectifs.find(function (o) { return o.id === id; }) : null;
  document.getElementById('objectif-nom').value = objectif ? objectif.nom : '';
  document.getElementById('objectif-cible').value = objectif ? objectif.cible : '';
  document.getElementById('objectif-montant-initial').value = objectif ? (objectif.montantInitial || 0) : '0';
  document.getElementById('objectif-date').value = objectif ? objectif.dateCible : '';
  document.getElementById('objectif-frequence').value = objectif ? objectif.frequence : 'hebdomadaire';
  document.getElementById('objectif-cotisation-prevue').value = objectif && objectif.cotisationPrevue ? objectif.cotisationPrevue : '';
  document.getElementById('objectif-reserve').value = objectif ? objectif.reserve : '';
  document.getElementById('objectif-statut').value = objectif ? objectif.statut : 'encours';
  document.getElementById('titre-objectif').textContent = objectif ? 'Modifier un objectif' : 'Nouvel objectif';
  document.getElementById('erreur-objectif-formulaire').textContent = '';
  ['objectif-nom', 'objectif-cible', 'objectif-montant-initial', 'objectif-date', 'objectif-cotisation-prevue'].forEach(function (idChamp) {
    const champ = document.getElementById(idChamp);
    champ.closest('.champ').classList.remove('invalide');
  });
  document.getElementById('voile-objectif').classList.remove('cache');
  document.getElementById('objectif-nom').focus();
}

function validerFormulaireObjectif() {
  const nom = document.getElementById('objectif-nom').value.trim();
  const cible = Number(document.getElementById('objectif-cible').value);
  const montantInitialBrut = document.getElementById('objectif-montant-initial').value.trim();
  const montantInitial = montantInitialBrut === '' ? 0 : Number(montantInitialBrut);
  const dateCible = document.getElementById('objectif-date').value;
  const cotisationBrute = document.getElementById('objectif-cotisation-prevue').value.trim();
  const cotisationPrevue = cotisationBrute === '' ? null : Number(cotisationBrute);
  let valide = true;
  document.getElementById('erreur-objectif-formulaire').textContent = '';
  ['erreur-objectif-nom', 'erreur-objectif-cible', 'erreur-objectif-initial', 'erreur-objectif-date', 'erreur-objectif-cotisation'].forEach(function (idErreur) {
    document.getElementById(idErreur).textContent = '';
  });
  if (!nom) { document.getElementById('erreur-objectif-nom').textContent = 'Indique un nom.'; document.getElementById('objectif-nom').closest('.champ').classList.add('invalide'); valide = false; }
  if (!Number.isSafeInteger(cible) || cible < 1) { document.getElementById('erreur-objectif-cible').textContent = 'Entre un prix cible entier supérieur à zéro.'; document.getElementById('objectif-cible').closest('.champ').classList.add('invalide'); valide = false; }
  if (!Number.isSafeInteger(montantInitial) || montantInitial < 0) { document.getElementById('erreur-objectif-initial').textContent = 'Entre un montant entier supérieur ou égal à zéro.'; document.getElementById('objectif-montant-initial').closest('.champ').classList.add('invalide'); valide = false; }
  if (dateCible && !/^\d{4}-\d{2}-\d{2}$/.test(dateCible)) { document.getElementById('erreur-objectif-date').textContent = 'Choisis une date valide.'; valide = false; }
  if (cotisationPrevue !== null && (!Number.isSafeInteger(cotisationPrevue) || cotisationPrevue < 1)) { document.getElementById('erreur-objectif-cotisation').textContent = 'Entre un montant entier supérieur à zéro ou laisse le champ vide.'; document.getElementById('objectif-cotisation-prevue').closest('.champ').classList.add('invalide'); valide = false; }
  if (!valide) return null;
  return { nom: nom, cible: cible, montantInitial: montantInitial, dateCible: dateCible, frequence: document.getElementById('objectif-frequence').value,
    cotisationPrevue: cotisationPrevue, reserve: document.getElementById('objectif-reserve').value.trim(), statut: document.getElementById('objectif-statut').value };
}

function enregistrerObjectif() {
  const valeurs = validerFormulaireObjectif();
  if (!valeurs) return;
  const avant = JSON.stringify(donnees);
  if (idObjectifModification) {
    Object.assign(donnees.objectifs.find(function (o) { return o.id === idObjectifModification; }), valeurs);
  } else {
    donnees.objectifs.push(Object.assign({ id: nouvelIdentifiant(), creeLe: Date.now(), cotisations: [], achat: null }, valeurs));
  }
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  document.getElementById('voile-objectif').classList.add('cache');
  proposerAnnulation(avant, 'Objectif enregistré.');
  rendreTout();
}

function supprimerObjectif(id) {
  const objectif = donnees.objectifs.find(function (o) { return o.id === id; });
  if (!objectif) return;
  const transactionsLiees = donnees.transactions.some(function (t) { return t.objectifId === id; });
  if (objectif.cotisations.length || objectif.achat || transactionsLiees) {
    alert('Cet objectif possède un historique financier ou des transactions liées et ne peut pas être supprimé. Marque-le « Terminé » pour le garder dans la liste.');
    return;
  }
  if (!confirm('Supprimer l’objectif « ' + objectif.nom + ' » ?')) return;
  const avant = JSON.stringify(donnees);
  donnees.objectifs = donnees.objectifs.filter(function (o) { return o.id !== id; });
  if (!enregistrerDonnees()) donnees = JSON.parse(avant);
  else proposerAnnulation(avant, 'Objectif supprimé.');
  rendreTout();
}

function remplirChoixCotisation() {
  const select = document.getElementById('cotisation-objectif');
  select.replaceChildren();
  objectifsEnCours().forEach(function (objectif) {
    const option = document.createElement('option');
    option.value = objectif.id;
    option.textContent = objectif.nom + ' · reste ' + formaterMontant(montantRestantObjectif(objectif));
    select.appendChild(option);
  });
}

function ouvrirFormulaireCotisation(id) {
  remplirChoixCotisation();
  const objectif = donnees.objectifs.find(function (o) { return o.id === id; }) || objectifsEnCours()[0];
  if (!objectif || objectif.statut !== 'encours') return;
  idObjectifCotisation = objectif.id;
  document.getElementById('cotisation-objectif').value = objectif.id;
  document.getElementById('cotisation-montant').value = objectif.cotisationPrevue || '';
  document.getElementById('cotisation-date').value = aujourdhuiISO();
  document.getElementById('cotisation-note').value = '';
  document.getElementById('erreur-cotisation-objectif').textContent = '';
  document.getElementById('erreur-cotisation-montant').textContent = '';
  document.getElementById('erreur-cotisation-date').textContent = '';
  document.getElementById('voile-cotisation').classList.remove('cache');
  document.getElementById('cotisation-montant').focus();
}

function enregistrerCotisation() {
  const id = document.getElementById('cotisation-objectif').value || idObjectifCotisation;
  const objectif = donnees.objectifs.find(function (o) { return o.id === id; });
  const montant = Number(document.getElementById('cotisation-montant').value);
  const date = document.getElementById('cotisation-date').value || aujourdhuiISO();
  document.getElementById('erreur-cotisation-objectif').textContent = '';
  document.getElementById('erreur-cotisation-montant').textContent = '';
  document.getElementById('erreur-cotisation-date').textContent = '';
  if (!objectif || objectif.statut !== 'encours') { document.getElementById('erreur-cotisation-objectif').textContent = 'Choisis un objectif en cours.'; return; }
  if (!Number.isSafeInteger(montant) || montant < 1) { document.getElementById('erreur-cotisation-montant').textContent = 'Entre un montant entier supérieur à zéro.'; return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > aujourdhuiISO()) { document.getElementById('erreur-cotisation-date').textContent = 'Choisis une date valide qui n’est pas dans le futur.'; return; }
  const avant = JSON.stringify(donnees);
  objectif.cotisations.push({ id: nouvelIdentifiant(), montant: montant, date: date, note: document.getElementById('cotisation-note').value.trim(), creeLe: Date.now() });
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  document.getElementById('voile-cotisation').classList.add('cache');
  proposerAnnulation(avant, 'Cotisation de ' + formaterMontant(montant) + ' enregistrée.');
  rendreTout();
}

function supprimerCotisation(objectifId, cotisationId) {
  const objectif = donnees.objectifs.find(function (o) { return o.id === objectifId; });
  if (!objectif) return;
  const cotisation = objectif.cotisations.find(function (c) { return c.id === cotisationId; });
  if (!cotisation || !confirm('Retirer cette cotisation de ' + formaterMontant(cotisation.montant) + ' de l’historique ?')) return;
  const avant = JSON.stringify(donnees);
  objectif.cotisations = objectif.cotisations.filter(function (c) { return c.id !== cotisationId; });
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  proposerAnnulation(avant, 'Cotisation retirée.');
  rendreTout();
}

function ouvrirFormulaireAchat(id) {
  const objectif = donnees.objectifs.find(function (o) { return o.id === id; });
  if (!objectif || objectif.statut !== 'encours' || objectif.achat) return;
  idObjectifAchat = id;
  document.getElementById('resume-achat').textContent = 'Objectif : ' + objectif.nom + ' · prix cible : ' + formaterMontant(objectif.cible) + '.';
  document.getElementById('achat-montant').value = objectif.cible;
  document.getElementById('achat-date').value = aujourdhuiISO();
  const categorie = document.getElementById('achat-categorie');
  categorie.replaceChildren();
  donnees.reglages.categories.forEach(function (nom) { const option = document.createElement('option'); option.value = nom; option.textContent = nom; categorie.appendChild(option); });
  categorie.value = donnees.reglages.categories.includes('Divers') ? 'Divers' : (donnees.reglages.categories[0] || '');
  document.getElementById('achat-clore').checked = true;
  document.getElementById('erreur-achat-montant').textContent = '';
  document.getElementById('voile-achat').classList.remove('cache');
  document.getElementById('achat-montant').focus();
}

function enregistrerAchatObjectif() {
  const objectif = donnees.objectifs.find(function (o) { return o.id === idObjectifAchat; });
  const montant = Number(document.getElementById('achat-montant').value);
  const date = document.getElementById('achat-date').value || aujourdhuiISO();
  const categorie = document.getElementById('achat-categorie').value;
  document.getElementById('erreur-achat-montant').textContent = '';
  if (!objectif || objectif.statut !== 'encours' || objectif.achat) return;
  if (!Number.isSafeInteger(montant) || montant < 1) { document.getElementById('erreur-achat-montant').textContent = 'Entre le prix réellement payé, supérieur à zéro.'; return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > aujourdhuiISO() || !categorie) { document.getElementById('erreur-achat-montant').textContent = 'Vérifie la date et la catégorie de l’achat.'; return; }
  const avant = JSON.stringify(donnees);
  const transactionId = nouvelIdentifiant();
  const statutAvantAchat = objectif.statut;
  donnees.transactions.push({ id: transactionId, creeLe: Date.now(), type: 'depense', montant: montant, date: date,
    categorie: categorie, activiteId: '', objectifId: objectif.id, moyen: '',
    note: 'Achat effectué : ' + objectif.nom, justificatif: '', source: '', destination: '' });
  objectif.achat = { transactionId: transactionId, montant: montant, date: date, categorie: categorie, statutAvantAchat: statutAvantAchat };
  if (document.getElementById('achat-clore').checked) objectif.statut = 'termine';
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  document.getElementById('voile-achat').classList.add('cache');
  moisFiltre = date.slice(0, 7);
  proposerAnnulation(avant, 'Achat enregistré.');
  rendreTout();
}

/* ---------- 8 bis. Investissements ---------- */

/* Les montants sont saisis à la main : l'application ne prévoit
   aucun rendement, elle compare seulement la valeur saisie aux
   apports (cahier des charges §4.6). */

const LIBELLES_OPERATION = {
  apport: 'Apport',
  revenu: 'Revenu perçu',
  frais: 'Frais',
  valeur: 'Valeur estimée'
};

/* Somme des opérations d'un type, éventuellement jusqu'à une date
   incluse (dateMax vide = toutes les dates). */
function sommeOperations(investissement, type, dateMax) {
  return investissement.operations.reduce(function (total, operation) {
    return operation.type === type && (!dateMax || operation.date <= dateMax) ? total + operation.montant : total;
  }, 0);
}

/* Dernière valeur estimée saisie (la plus récente par date),
   éventuellement jusqu'à une date incluse. */
function derniereValeur(investissement, dateMax) {
  let derniere = null;
  for (const valeur of investissement.valeurs) {
    if (dateMax && valeur.date > dateMax) continue;
    if (!derniere || valeur.date > derniere.date || (valeur.date === derniere.date && valeur.creeLe > derniere.creeLe)) {
      derniere = valeur;
    }
  }
  return derniere;
}

function bilanInvestissement(investissement, dateMax) {
  const apports = sommeOperations(investissement, 'apport', dateMax);
  const revenus = sommeOperations(investissement, 'revenu', dateMax);
  const frais = sommeOperations(investissement, 'frais', dateMax);
  const valeur = derniereValeur(investissement, dateMax);
  return {
    apports: apports,
    revenus: revenus,
    frais: frais,
    valeur: valeur ? valeur.montant : null,
    dateValeur: valeur ? valeur.date : '',
    /* écart = valeur saisie − argent placé */
    ecart: valeur ? valeur.montant - apports : null,
    /* résultat = écart + revenus perçus − frais */
    resultat: valeur ? valeur.montant - apports + revenus - frais : null
  };
}

/* Montant signé : "+5 000 FCFA" ou "-5 000 FCFA". */
function formaterEcart(montant) {
  return (montant > 0 ? '+' : '') + formaterMontant(montant);
}

/* Totaux des investissements actifs, pour l'accueil et l'écran. */
function totauxInvestissements() {
  const resultat = { nombre: 0, apports: 0, valeur: 0, ecart: 0, valorises: 0 };
  donnees.investissements.forEach(function (investissement) {
    if (investissement.statut !== 'actif') return;
    const bilan = bilanInvestissement(investissement, '');
    resultat.nombre += 1;
    resultat.apports += bilan.apports;
    if (bilan.valeur !== null) {
      resultat.valorises += 1;
      resultat.valeur += bilan.valeur;
      resultat.ecart += bilan.ecart;
    }
  });
  return resultat;
}

function texteTotauxInvestissements() {
  const t = totauxInvestissements();
  if (!t.nombre) return '';
  let texte = t.nombre + (t.nombre > 1 ? ' investissements actifs' : ' investissement actif') +
    ' · Apports cumulés : ' + formaterMontant(t.apports);
  if (t.valorises) {
    texte += ' · Valeur estimée : ' + formaterMontant(t.valeur) + ' · Écart estimé : ' + formaterEcart(t.ecart);
  }
  if (t.valorises < t.nombre) {
    const sans = t.nombre - t.valorises;
    texte += ' · ' + sans + (sans > 1 ? ' sans valeur saisie, non comptés dans la valeur.' : ' sans valeur saisie, non compté dans la valeur.');
  }
  return texte;
}

function construireCarteInvestissement(investissement) {
  const bilan = bilanInvestissement(investissement, '');
  const carte = document.createElement('article');
  carte.className = 'carte carte-element';

  const entete = document.createElement('div');
  entete.className = 'ligne-flex';
  const nom = document.createElement('h3');
  nom.textContent = investissement.nom;
  const badge = document.createElement('span');
  badge.className = 'badge-statut ' + (investissement.statut === 'actif' ? 'statut-encours' : 'statut-terminee');
  badge.textContent = investissement.statut === 'actif' ? 'Actif' : 'Clos';
  entete.append(nom, badge);
  carte.appendChild(entete);

  const description = [investissement.type, investissement.notes].filter(Boolean).join(' · ');
  if (description) {
    const ligne = document.createElement('p');
    ligne.className = 'note';
    ligne.textContent = description;
    carte.appendChild(ligne);
  }

  carte.appendChild(construireStats([
    { libelle: 'Apports', valeur: formaterNombre(bilan.apports) },
    { libelle: bilan.valeur === null ? 'Valeur' : 'Valeur au ' + formaterDateCourte(bilan.dateValeur).slice(0, 5), valeur: bilan.valeur === null ? '—' : formaterNombre(bilan.valeur) },
    { libelle: 'Écart estimé', valeur: bilan.ecart === null ? '—' : formaterNombre(bilan.ecart, true), classe: bilan.ecart === null ? '' : classeSigne(bilan.ecart) }
  ]));

  const complement = document.createElement('p');
  complement.className = 'note';
  if (bilan.revenus || bilan.frais) {
    complement.textContent = 'Revenus perçus : ' + formaterMontant(bilan.revenus) + ' · Frais : ' + formaterMontant(bilan.frais) +
      (bilan.resultat !== null ? ' · Résultat estimé (écart + revenus − frais) : ' + formaterEcart(bilan.resultat) : '');
  } else if (bilan.valeur === null) {
    complement.textContent = 'Ajoute une « valeur estimée » pour suivre l’écart avec tes apports.';
  }
  if (complement.textContent) carte.appendChild(complement);

  /* Historique : opérations et valeurs, de la plus récente à la plus ancienne. */
  const entrees = investissement.operations.map(function (operation) { return { genre: 'operation', element: operation }; })
    .concat(investissement.valeurs.map(function (valeur) { return { genre: 'valeur', element: valeur }; }))
    .sort(function (a, b) { return b.element.date.localeCompare(a.element.date) || b.element.creeLe - a.element.creeLe; });
  if (entrees.length) {
    const historique = document.createElement('details');
    historique.className = 'historique-cotisations';
    const titre = document.createElement('summary');
    titre.textContent = 'Historique (' + entrees.length + ')';
    historique.appendChild(titre);
    const liste = document.createElement('ul');
    liste.className = 'liste-simple';
    entrees.forEach(function (entree) {
      const element = entree.element;
      const libelle = entree.genre === 'valeur' ? LIBELLES_OPERATION.valeur : LIBELLES_OPERATION[element.type];
      const ligne = document.createElement('li');
      ligne.className = 'ligne-cotisation';
      const texte = document.createElement('span');
      texte.textContent = formaterDateCourte(element.date) + ' · ' + libelle + ' · ' + formaterMontant(element.montant) +
        (element.note ? ' · ' + element.note : '');
      const retirer = document.createElement('button');
      retirer.type = 'button';
      retirer.className = 'btn btn-secondaire bouton-retirer-cotisation';
      retirer.textContent = 'Retirer';
      retirer.setAttribute('aria-label', 'Retirer ' + libelle.toLowerCase() + ' de ' + formaterMontant(element.montant) + ' du ' + formaterDateCourte(element.date));
      retirer.addEventListener('click', function () { retirerEntreeInvestissement(investissement.id, entree.genre, element.id); });
      ligne.append(texte, retirer);
      liste.appendChild(ligne);
    });
    historique.appendChild(liste);
    carte.appendChild(historique);
  }

  const actions = document.createElement('div');
  actions.className = 'actions-carte';
  if (investissement.statut === 'actif') {
    const operation = document.createElement('button');
    operation.type = 'button';
    operation.className = 'btn btn-principal';
    operation.textContent = 'Ajouter une opération';
    operation.addEventListener('click', function () { ouvrirFormulaireOperation(investissement.id); });
    actions.appendChild(operation);
  }
  const modifier = document.createElement('button');
  modifier.type = 'button';
  modifier.className = 'btn btn-texte';
  modifier.textContent = 'Modifier';
  modifier.addEventListener('click', function () { ouvrirFormulaireInvestissement(investissement.id); });
  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'btn btn-texte';
  supprimer.textContent = 'Supprimer';
  supprimer.addEventListener('click', function () { supprimerInvestissement(investissement.id); });
  actions.append(modifier, supprimer);
  carte.appendChild(actions);
  return carte;
}

function rendreInvestissements() {
  const liste = document.getElementById('liste-investissements');
  liste.replaceChildren();
  const investissements = donnees.investissements.slice().sort(function (a, b) {
    if (a.statut !== b.statut) return a.statut === 'actif' ? -1 : 1;
    return b.creeLe - a.creeLe;
  });
  document.getElementById('investissements-vides').hidden = investissements.length > 0;
  investissements.forEach(function (investissement) { liste.appendChild(construireCarteInvestissement(investissement)); });
  const totaux = texteTotauxInvestissements();
  const elementTotaux = document.getElementById('totaux-investissements');
  elementTotaux.textContent = totaux;
  elementTotaux.hidden = totaux === '';
}

function rendreResumeInvestissements() {
  const conteneur = document.getElementById('resume-investissements');
  conteneur.replaceChildren();
  const actifs = donnees.investissements.filter(function (i) { return i.statut === 'actif'; });
  if (!actifs.length) {
    conteneur.appendChild(messageVide('Aucun investissement actif.'));
    return;
  }
  actifs.slice(0, 3).forEach(function (investissement) {
    const bilan = bilanInvestissement(investissement, '');
    conteneur.appendChild(construireLigneResume(investissement.nom,
      bilan.valeur === null ? formaterMontant(bilan.apports) + ' placés' : formaterMontant(bilan.valeur) + ' (' + formaterEcart(bilan.ecart) + ')',
      'investissements', null));
  });
}

function ouvrirFormulaireInvestissement(id) {
  idInvestissementModification = id || null;
  const investissement = id ? donnees.investissements.find(function (i) { return i.id === id; }) : null;
  document.getElementById('investissement-nom').value = investissement ? investissement.nom : '';
  document.getElementById('investissement-type').value = investissement ? investissement.type : '';
  document.getElementById('investissement-statut').value = investissement ? investissement.statut : 'actif';
  document.getElementById('investissement-notes').value = investissement ? investissement.notes : '';
  document.getElementById('investissement-apport').value = '';
  document.getElementById('investissement-date').value = aujourdhuiISO();
  document.getElementById('investissement-valeur').value = '';
  /* Premier apport et valeur : seulement à la création. Ensuite, on
     passe par « Ajouter une opération » pour garder un historique. */
  document.querySelectorAll('.champ-creation-investissement').forEach(function (champ) {
    champ.classList.toggle('cache', Boolean(investissement));
  });
  document.getElementById('titre-investissement').textContent = investissement ? 'Modifier un investissement' : 'Nouvel investissement';
  effacerErreursFormulaire('formulaire-investissement');
  document.getElementById('voile-investissement').classList.remove('cache');
  document.getElementById('investissement-nom').focus();
}

/* Efface messages et cadres d'erreur d'un formulaire donné. */
function effacerErreursFormulaire(idFormulaire) {
  document.querySelectorAll('#' + idFormulaire + ' .message-erreur').forEach(function (el) { el.textContent = ''; });
  document.querySelectorAll('#' + idFormulaire + ' .invalide').forEach(function (el) { el.classList.remove('invalide'); });
}

function marquerErreur(idChamp, idErreur, message) {
  document.getElementById(idChamp).closest('.champ').classList.add('invalide');
  document.getElementById(idErreur).textContent = message;
}

/* Lit un montant entier facultatif : null si vide, NaN si invalide. */
function lireMontantFacultatif(idChamp, minimum) {
  const brut = document.getElementById(idChamp).value.trim();
  if (brut === '') return null;
  const nombre = Number(brut);
  return Number.isSafeInteger(nombre) && nombre >= minimum ? nombre : NaN;
}

function enregistrerInvestissement() {
  effacerErreursFormulaire('formulaire-investissement');
  const nom = document.getElementById('investissement-nom').value.trim();
  let valide = true;
  if (!nom) { marquerErreur('investissement-nom', 'erreur-investissement-nom', 'Indique un nom.'); valide = false; }
  let apport = null;
  let dateApport = '';
  let valeur = null;
  if (!idInvestissementModification) {
    apport = lireMontantFacultatif('investissement-apport', 1);
    dateApport = document.getElementById('investissement-date').value;
    valeur = lireMontantFacultatif('investissement-valeur', 0);
    if (Number.isNaN(apport)) { marquerErreur('investissement-apport', 'erreur-investissement-apport', 'Entre un montant entier supérieur à zéro ou laisse le champ vide.'); valide = false; }
    if (apport !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(dateApport) || dateApport > aujourdhuiISO())) {
      marquerErreur('investissement-date', 'erreur-investissement-date', 'Choisis une date qui n’est pas dans le futur.'); valide = false;
    }
    if (Number.isNaN(valeur)) { marquerErreur('investissement-valeur', 'erreur-investissement-valeur', 'Entre un montant entier positif ou laisse le champ vide.'); valide = false; }
  }
  if (!valide) return;

  const valeurs = {
    nom: nom,
    type: document.getElementById('investissement-type').value.trim(),
    statut: document.getElementById('investissement-statut').value,
    notes: document.getElementById('investissement-notes').value.trim()
  };
  const avant = JSON.stringify(donnees);
  if (idInvestissementModification) {
    Object.assign(donnees.investissements.find(function (i) { return i.id === idInvestissementModification; }), valeurs);
  } else {
    const maintenant = Date.now();
    donnees.investissements.push(Object.assign({
      id: nouvelIdentifiant(),
      creeLe: maintenant,
      operations: apport !== null ? [{ id: nouvelIdentifiant(), type: 'apport', montant: apport, date: dateApport, note: 'Premier apport', creeLe: maintenant }] : [],
      valeurs: valeur !== null ? [{ id: nouvelIdentifiant(), montant: valeur, date: aujourdhuiISO(), note: '', creeLe: maintenant }] : []
    }, valeurs));
  }
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  document.getElementById('voile-investissement').classList.add('cache');
  proposerAnnulation(avant, 'Investissement enregistré.');
  rendreTout();
}

function supprimerInvestissement(id) {
  const investissement = donnees.investissements.find(function (i) { return i.id === id; });
  if (!investissement) return;
  if (investissement.operations.length || investissement.valeurs.length) {
    alert('Cet investissement possède un historique et ne peut pas être supprimé. Marque-le « Clos » pour le garder dans la liste, ou retire d’abord ses opérations.');
    return;
  }
  if (!confirm('Supprimer l’investissement « ' + investissement.nom + ' » ?')) return;
  const avant = JSON.stringify(donnees);
  donnees.investissements = donnees.investissements.filter(function (i) { return i.id !== id; });
  if (!enregistrerDonnees()) donnees = JSON.parse(avant);
  else proposerAnnulation(avant, 'Investissement supprimé.');
  rendreTout();
}

function ouvrirFormulaireOperation(id) {
  const investissement = donnees.investissements.find(function (i) { return i.id === id; });
  if (!investissement || investissement.statut !== 'actif') return;
  idInvestissementOperation = id;
  document.getElementById('resume-operation').textContent = 'Investissement : ' + investissement.nom + '.';
  document.getElementById('operation-type').value = 'apport';
  document.getElementById('operation-montant').value = '';
  document.getElementById('operation-date').value = aujourdhuiISO();
  document.getElementById('operation-note').value = '';
  effacerErreursFormulaire('formulaire-operation');
  actualiserTypeOperation();
  document.getElementById('voile-operation').classList.remove('cache');
  document.getElementById('operation-montant').focus();
}

/* Le libellé et l'aide changent selon le type d'opération. */
function actualiserTypeOperation() {
  const type = document.getElementById('operation-type').value;
  const aides = {
    apport: 'Argent placé dans cet investissement. Il n’est pas compté comme une dépense.',
    revenu: 'Argent rapporté par l’investissement. Pour qu’il compte aussi dans ton solde, enregistre-le comme revenu dans Transactions.',
    frais: 'Frais liés à l’investissement (commission, entretien…).',
    valeur: 'Valeur totale de l’investissement à cette date, telle que tu l’estimes : ce n’est pas une variation.'
  };
  document.getElementById('libelle-operation-montant').firstChild.textContent = type === 'valeur' ? 'Valeur totale estimée (' : 'Montant (';
  document.getElementById('aide-operation').textContent = aides[type];
}

function enregistrerOperationInvestissement() {
  effacerErreursFormulaire('formulaire-operation');
  const investissement = donnees.investissements.find(function (i) { return i.id === idInvestissementOperation; });
  if (!investissement || investissement.statut !== 'actif') return;
  const type = document.getElementById('operation-type').value;
  const montant = lireMontantFacultatif('operation-montant', type === 'valeur' ? 0 : 1);
  const date = document.getElementById('operation-date').value;
  let valide = true;
  if (montant === null || Number.isNaN(montant)) {
    marquerErreur('operation-montant', 'erreur-operation-montant', type === 'valeur'
      ? 'Entre une valeur entière positive ou nulle.'
      : 'Entre un montant entier supérieur à zéro.');
    valide = false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > aujourdhuiISO()) {
    marquerErreur('operation-date', 'erreur-operation-date', 'Choisis une date qui n’est pas dans le futur.');
    valide = false;
  }
  if (!valide) return;
  const avant = JSON.stringify(donnees);
  const entree = { id: nouvelIdentifiant(), montant: montant, date: date, note: document.getElementById('operation-note').value.trim(), creeLe: Date.now() };
  if (type === 'valeur') {
    investissement.valeurs.push(entree);
  } else {
    entree.type = type;
    investissement.operations.push(entree);
  }
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  document.getElementById('voile-operation').classList.add('cache');
  proposerAnnulation(avant, LIBELLES_OPERATION[type] + ' de ' + formaterMontant(montant) + ' enregistré' + (type === 'valeur' ? 'e.' : '.'));
  rendreTout();
}

function retirerEntreeInvestissement(investissementId, genre, entreeId) {
  const investissement = donnees.investissements.find(function (i) { return i.id === investissementId; });
  if (!investissement) return;
  const cle = genre === 'valeur' ? 'valeurs' : 'operations';
  const entree = investissement[cle].find(function (e) { return e.id === entreeId; });
  if (!entree || !confirm('Retirer cette ligne de ' + formaterMontant(entree.montant) + ' de l’historique ?')) return;
  const avant = JSON.stringify(donnees);
  investissement[cle] = investissement[cle].filter(function (e) { return e.id !== entreeId; });
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  proposerAnnulation(avant, 'Ligne retirée de l’historique.');
  rendreTout();
}

/* ---------- 8 ter. Rapports et export CSV ---------- */

/* Veille d'une date "AAAA-MM-JJ". */
function veille(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return versISO(d);
}

/* Liste des mois "AAAA-MM" couverts par une période. */
function moisEntre(debut, fin) {
  const liste = [];
  let annee = Number(debut.slice(0, 4));
  let mois = Number(debut.slice(5, 7));
  const dernier = fin.slice(0, 7);
  for (;;) {
    const courant = annee + '-' + String(mois).padStart(2, '0');
    if (courant > dernier) break;
    liste.push(courant);
    mois += 1;
    if (mois > 12) { mois = 1; annee += 1; }
  }
  return liste;
}

/* Toutes les dates saisies (pour le raccourci « Tout »). */
function datesSaisies() {
  const dates = donnees.transactions.map(function (t) { return t.date; });
  donnees.objectifs.forEach(function (objectif) {
    objectif.cotisations.forEach(function (c) { dates.push(c.date); });
  });
  donnees.investissements.forEach(function (investissement) {
    investissement.operations.forEach(function (o) { dates.push(o.date); });
    investissement.valeurs.forEach(function (v) { dates.push(v.date); });
  });
  return dates.sort();
}

function choisirRaccourciRapport(raccourci) {
  const maintenant = new Date();
  if (raccourci === 'mois') {
    periodeRapport = { debut: premierJourMois(maintenant), fin: dernierJourMois(maintenant) };
  } else if (raccourci === 'moisPrecedent') {
    const precedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
    periodeRapport = { debut: premierJourMois(precedent), fin: dernierJourMois(precedent) };
  } else if (raccourci === 'annee') {
    periodeRapport = { debut: maintenant.getFullYear() + '-01-01', fin: maintenant.getFullYear() + '-12-31' };
  } else {
    const dates = datesSaisies();
    const aujourdHui = aujourdhuiISO();
    periodeRapport = {
      debut: dates.length ? dates[0] : premierJourMois(maintenant),
      fin: dates.length && dates[dates.length - 1] > aujourdHui ? dates[dates.length - 1] : aujourdHui
    };
  }
  document.querySelectorAll('[data-raccourci]').forEach(function (chip) {
    chip.classList.toggle('actif', chip.dataset.raccourci === raccourci);
  });
  document.getElementById('rapport-debut').value = periodeRapport.debut;
  document.getElementById('rapport-fin').value = periodeRapport.fin;
  rendreRapport();
}

function pourcentage(partie, total) {
  return total > 0 ? Math.round(partie / total * 100) : null;
}

/* Calcule toutes les sections du rapport. Chaque section décrit
   ses colonnes (titre + format) et ses lignes de valeurs brutes :
   le même résultat sert à l'affichage et à l'export CSV. */
function calculerRapport(debut, fin) {
  const dansPeriode = function (date) { return date >= debut && date <= fin; };
  const transactions = donnees.transactions.filter(function (t) { return dansPeriode(t.date); });
  const sections = [];
  const montant = function (titre) { return { titre: titre, format: 'montant' }; };

  /* 1. Résumé */
  const total = totaux(transactions);
  sections.push({
    titre: 'Résumé de la période',
    colonnes: [{ titre: 'Indicateur' }, montant('Montant')],
    lignes: [
      ['Revenus reçus', total.revenus],
      ['Dépenses payées', total.depenses],
      ['Résultat net (revenus − dépenses)', total.solde],
      ['Transferts internes (hors résultat)', total.transferts]
    ]
  });

  /* 2. Par mois */
  sections.push({
    titre: 'Par mois',
    colonnes: [{ titre: 'Mois' }, montant('Revenus'), montant('Dépenses'), montant('Résultat')],
    lignes: moisEntre(debut, fin).map(function (mois) {
      const t = totaux(transactions.filter(function (tr) { return tr.date.slice(0, 7) === mois; }));
      return [formaterMoisAnnee(mois + '-01'), t.revenus, t.depenses, t.solde];
    })
  });

  /* 3. Par catégorie */
  const parCategorie = new Map();
  transactions.forEach(function (t) {
    if (t.type === 'transfert') return;
    const cle = t.categorie || 'Sans catégorie';
    const ligne = parCategorie.get(cle) || { revenus: 0, depenses: 0 };
    if (t.type === 'revenu') ligne.revenus += t.montant; else ligne.depenses += t.montant;
    parCategorie.set(cle, ligne);
  });
  sections.push({
    titre: 'Par catégorie',
    colonnes: [{ titre: 'Catégorie' }, montant('Revenus'), montant('Dépenses'), { titre: 'Part des dépenses', format: 'pourcent' }],
    lignes: Array.from(parCategorie.entries())
      .sort(function (a, b) { return b[1].depenses - a[1].depenses || b[1].revenus - a[1].revenus; })
      .map(function (entree) {
        return [entree[0], entree[1].revenus, entree[1].depenses, pourcentage(entree[1].depenses, total.depenses)];
      }),
    vide: 'Aucun revenu ni dépense sur cette période.'
  });

  /* 4. Par activité */
  const lignesActivites = donnees.activites.filter(function (activite) {
    return activite.statut === 'encours' || transactions.some(function (t) { return t.activiteId === activite.id; });
  }).map(function (activite) {
    const t = totaux(transactions.filter(function (tr) { return tr.activiteId === activite.id; }));
    return [activite.nom, t.revenus, t.depenses, t.solde, activite.heures > 0 ? activite.heures : null];
  });
  const sansActivite = transactions.filter(function (t) { return !t.activiteId || !nomActivite(t.activiteId); });
  if (sansActivite.length) {
    const t = totaux(sansActivite);
    lignesActivites.push(['Sans activité', t.revenus, t.depenses, t.solde, null]);
  }
  sections.push({
    titre: 'Par activité',
    note: 'Les heures sont le total saisi sur la fiche de l’activité, toutes dates confondues.',
    colonnes: [{ titre: 'Activité' }, montant('Revenus'), montant('Dépenses'), montant('Résultat'), { titre: 'Heures saisies', format: 'nombre' }],
    lignes: lignesActivites,
    vide: 'Aucune activité en cours ni transaction liée à une activité.'
  });

  /* 5. Prévisions et réel (toutes dates) */
  sections.push({
    titre: 'Prévisions et réel des activités',
    note: 'Comparaison sur toute la durée de chaque activité, indépendamment de la période choisie.',
    colonnes: [{ titre: 'Activité' }, montant('Revenu prévu'), montant('Revenus reçus'), montant('Dépenses prévues'),
      montant('Dépenses payées'), montant('Budget'), montant('Reste du budget')],
    lignes: donnees.activites.filter(function (activite) {
      return [activite.revenuPrevu, activite.depensesPrevues, activite.budget].some(function (v) { return v !== null && v !== undefined; });
    }).map(function (activite) {
      const t = totauxActivite(activite.id);
      const budget = activite.budget !== null && activite.budget !== undefined ? activite.budget : null;
      return [activite.nom, activite.revenuPrevu != null ? activite.revenuPrevu : null, t.revenus,
        activite.depensesPrevues != null ? activite.depensesPrevues : null, t.depenses,
        budget, budget !== null ? budget - t.depenses : null];
    }),
    vide: 'Aucune activité n’a de prévision ou de budget.'
  });

  /* 6. Budgets des mois de la période */
  const moisPeriode = moisEntre(debut, fin);
  sections.push({
    titre: 'Budgets',
    note: 'Budgets des mois couverts, même partiellement, par la période.',
    colonnes: [{ titre: 'Mois' }, { titre: 'Budget' }, montant('Prévu'), montant('Dépensé'), { titre: 'Utilisé', format: 'pourcent' }, { titre: 'État' }],
    lignes: donnees.budgets.filter(function (budget) { return moisPeriode.includes(budget.mois); })
      .sort(function (a, b) { return a.mois.localeCompare(b.mois); })
      .map(function (budget) {
        const utilise = depensesBudget(budget);
        const taux = utilise / budget.montant * 100;
        return [formaterMoisAnnee(budget.mois + '-01'), nomPorteeBudget(budget), budget.montant, utilise, Math.round(taux),
          taux >= 100 ? 'Dépassé' : (taux >= budget.seuil ? 'Seuil atteint' : 'Dans la limite')];
      }),
    vide: 'Aucun budget sur ces mois.'
  });

  /* 7. Objectifs d'épargne */
  sections.push({
    titre: 'Objectifs d’épargne',
    colonnes: [{ titre: 'Objectif' }, montant('Cotisé sur la période'), montant('Total mis de côté'), montant('Cible'),
      { titre: 'Progression', format: 'pourcent' }, { titre: 'Statut' }],
    lignes: donnees.objectifs.filter(function (objectif) { return versISO(new Date(objectif.creeLe)) <= fin; })
      .map(function (objectif) {
        const cotisePeriode = objectif.cotisations.reduce(function (somme, c) { return dansPeriode(c.date) ? somme + c.montant : somme; }, 0);
        const cotise = totalCotise(objectif);
        return [objectif.nom, cotisePeriode, cotise, objectif.cible, Math.min(100, pourcentage(cotise, objectif.cible)),
          objectif.statut === 'termine' ? 'Terminé' : (montantRestantObjectif(objectif) === 0 ? 'Montant atteint' : 'En cours')];
      }),
    vide: 'Aucun objectif sur cette période.'
  });

  /* 8. Investissements : variation estimée sur la période */
  const veilleDebut = veille(debut);
  sections.push({
    titre: 'Investissements',
    note: 'Variation estimée = valeur à la fin − valeur au début − apports de la période. Estimation fondée sur les valeurs saisies.',
    colonnes: [{ titre: 'Investissement' }, montant('Apports sur la période'), montant('Apports cumulés'), montant('Valeur estimée en fin de période'),
      montant('Variation estimée')],
    lignes: donnees.investissements.filter(function (investissement) { return versISO(new Date(investissement.creeLe)) <= fin; })
      .map(function (investissement) {
        const apportsPeriode = investissement.operations.reduce(function (somme, o) {
          return o.type === 'apport' && dansPeriode(o.date) ? somme + o.montant : somme;
        }, 0);
        const valeurFin = derniereValeur(investissement, fin);
        const valeurDebut = derniereValeur(investissement, veilleDebut);
        let variation = null;
        if (valeurFin) {
          if (valeurDebut) variation = valeurFin.montant - valeurDebut.montant - apportsPeriode;
          /* Investissement démarré pendant la période : il valait 0 avant. */
          else if (sommeOperations(investissement, 'apport', veilleDebut) === 0) variation = valeurFin.montant - apportsPeriode;
        }
        return [investissement.nom, apportsPeriode, sommeOperations(investissement, 'apport', fin), valeurFin ? valeurFin.montant : null, variation];
      }),
    vide: 'Aucun investissement sur cette période.'
  });

  return sections;
}

function formaterCellule(valeur, format) {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  if (format === 'montant') return formaterMontant(valeur);
  if (format === 'pourcent') return valeur + ' %';
  if (format === 'nombre') return valeur.toLocaleString('fr-FR');
  return String(valeur);
}

function construireTableau(section) {
  const conteneur = document.createElement('div');
  conteneur.className = 'tableau-defilant';
  const tableau = document.createElement('table');
  tableau.className = 'tableau';
  const entete = document.createElement('thead');
  const ligneEntete = document.createElement('tr');
  section.colonnes.forEach(function (colonne) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = colonne.titre;
    if (colonne.format) th.className = 'nombre';
    ligneEntete.appendChild(th);
  });
  entete.appendChild(ligneEntete);
  const corps = document.createElement('tbody');
  section.lignes.forEach(function (ligne) {
    const tr = document.createElement('tr');
    ligne.forEach(function (valeur, index) {
      const format = section.colonnes[index].format;
      const td = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) td.scope = 'row';
      td.textContent = formaterCellule(valeur, format);
      if (format) td.className = 'nombre';
      tr.appendChild(td);
    });
    corps.appendChild(tr);
  });
  tableau.append(entete, corps);
  conteneur.appendChild(tableau);
  return conteneur;
}

function periodeRapportValide() {
  return /^\d{4}-\d{2}-\d{2}$/.test(periodeRapport.debut) && /^\d{4}-\d{2}-\d{2}$/.test(periodeRapport.fin) &&
    periodeRapport.debut <= periodeRapport.fin;
}

function rendreRapport() {
  const conteneur = document.getElementById('contenu-rapport');
  conteneur.replaceChildren();
  const valide = periodeRapportValide();
  document.getElementById('rapport-erreur').textContent = valide ? '' : 'Choisis deux dates, la première avant ou égale à la seconde.';
  document.getElementById('btn-csv-transactions').disabled = !valide;
  document.getElementById('btn-csv-rapport').disabled = !valide;
  if (!valide) return;
  calculerRapport(periodeRapport.debut, periodeRapport.fin).forEach(function (section) {
    const carte = document.createElement('section');
    carte.className = 'carte';
    const titre = document.createElement('h2');
    titre.textContent = section.titre;
    carte.appendChild(titre);
    if (section.note) {
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = section.note;
      carte.appendChild(note);
    }
    if (section.lignes.length) {
      carte.appendChild(construireTableau(section));
    } else {
      const vide = document.createElement('p');
      vide.className = 'vide';
      vide.textContent = section.vide || 'Aucune donnée sur cette période.';
      carte.appendChild(vide);
    }
    conteneur.appendChild(carte);
  });
}

/* Une cellule CSV : séparateur « ; » (Excel en français), guillemets
   doublés, et apostrophe devant un texte commençant par = + - @ pour
   qu'un tableur ne l'exécute jamais comme une formule. */
function celluleCSV(valeur) {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'number') return Number.isInteger(valeur) ? String(valeur) : String(valeur).replace('.', ',');
  let texte = String(valeur);
  if (/^[=+\-@\t\r]/.test(texte)) texte = "'" + texte;
  return /[";\n\r]/.test(texte) ? '"' + texte.replace(/"/g, '""') + '"' : texte;
}

function versCSV(lignes) {
  /* \uFEFF (BOM) : Excel reconnaît ainsi les accents (UTF-8). */
  return '\uFEFF' + lignes.map(function (ligne) { return ligne.map(celluleCSV).join(';'); }).join('\r\n') + '\r\n';
}

function exporterTransactionsCSV() {
  if (!periodeRapportValide()) return;
  const lignes = [['Date', 'Type', 'Montant (' + donnees.reglages.devise + ')', 'Catégorie', 'Activité', 'Objectif',
    'Moyen de paiement', 'Note', 'Justificatif', 'Origine', 'Destination']];
  const libellesType = { revenu: 'Revenu', depense: 'Dépense', transfert: 'Transfert interne' };
  donnees.transactions
    .filter(function (t) { return t.date >= periodeRapport.debut && t.date <= periodeRapport.fin; })
    .sort(function (a, b) { return a.date.localeCompare(b.date) || a.creeLe - b.creeLe; })
    .forEach(function (t) {
      lignes.push([t.date, libellesType[t.type], t.montant, t.categorie || '', nomActivite(t.activiteId), nomObjectif(t.objectifId),
        t.moyen || '', t.note || '', t.justificatif || '', t.source || '', t.destination || '']);
    });
  telechargerTexte('cap-transactions-' + periodeRapport.debut + '-au-' + periodeRapport.fin + '.csv', versCSV(lignes), 'text/csv;charset=utf-8');
}

function exporterRapportCSV() {
  if (!periodeRapportValide()) return;
  const lignes = [['Rapport Cap', 'Du ' + periodeRapport.debut + ' au ' + periodeRapport.fin, 'Montants en ' + donnees.reglages.devise], []];
  calculerRapport(periodeRapport.debut, periodeRapport.fin).forEach(function (section) {
    lignes.push([section.titre]);
    if (section.note) lignes.push([section.note]);
    lignes.push(section.colonnes.map(function (colonne) { return colonne.format === 'pourcent' ? colonne.titre + ' (%)' : colonne.titre; }));
    section.lignes.forEach(function (ligne) { lignes.push(ligne); });
    if (!section.lignes.length) lignes.push([section.vide || 'Aucune donnée']);
    lignes.push([]);
  });
  telechargerTexte('cap-rapport-' + periodeRapport.debut + '-au-' + periodeRapport.fin + '.csv', versCSV(lignes), 'text/csv;charset=utf-8');
}

/* ---------- 9. Tableau de bord (accueil) ---------- */

/* Met à jour les totaux et le libellé de la période. */
function rendreTableauDeBord() {
  const resume = totaux(transactionsDeLaPeriode());

  document.getElementById('total-revenus').textContent = formaterMontant(resume.revenus);
  document.getElementById('total-depenses').textContent = formaterMontant(resume.depenses);

  /* Le "+" n'est écrit que pour un solde positif ; le signe "-"
     est déjà ajouté automatiquement par le formatage des nombres.
     La devise est affichée plus petite que le montant. */
  const elementSolde = document.getElementById('total-solde');
  elementSolde.textContent = (resume.solde > 0 ? '+' : '') + formaterMontant(resume.solde);
  elementSolde.classList.toggle('positif', resume.solde > 0);
  elementSolde.classList.toggle('negatif', resume.solde < 0);

  /* Libellé de la période, sous les boutons de choix. */
  const bornes = bornesPeriode();
  let libelle;

  if (periode.mode === 'perso') {
    if (bornes.debut === '' || bornes.fin === '') {
      libelle = 'Choisis les deux dates.';
    } else if (bornes.debut > bornes.fin) {
      libelle = 'Dates invalides : le début est après la fin.';
    } else {
      libelle = 'Du ' + formaterDateCourte(bornes.debut) + ' au ' + formaterDateCourte(bornes.fin);
    }
  } else {
    libelle = formaterMoisAnnee(bornes.debut);
  }

  document.getElementById('libelle-periode').textContent = libelle;
  rendreGraphiques();
  rendreOperationsRecentes();
  rendreAlertesBudget();
  rendreResumeActivites();
  rendreResumeObjectifs();
  rendreResumeInvestissements();
}

/* ---------- 9 bis. Graphiques de l'accueil ---------- */

/* Dessinés en SVG, sans bibliothèque : l'application reste utilisable
   hors ligne. Couleurs des catégories vérifiées pour le daltonisme ;
   chaque part est aussi écrite en clair dans la légende. */
const NS_SVG = 'http://www.w3.org/2000/svg';
/* Cyan et violet du logo, complétés par l'ambre et le corail : deux
   couleurs du logo seules (bleu, violet) se confondent pour un daltonien. */
const COULEURS_CATEGORIES = ['#14a3bd', '#e0a019', '#7a52cc', '#e0603f'];
const COULEUR_AUTRES = '#9aa0bd';

function elementSvg(nom, attributs) {
  const element = document.createElementNS(NS_SVG, nom);
  Object.keys(attributs || {}).forEach(function (cle) { element.setAttribute(cle, attributs[cle]); });
  return element;
}

/* 1 250 000 → "1,3 M" ; 45 000 → "45 k" : pour les axes seulement. */
function formaterCompact(nombre) {
  const absolu = Math.abs(nombre);
  if (absolu >= 1000000) return (nombre / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  if (absolu >= 1000) return Math.round(nombre / 1000).toLocaleString('fr-FR') + ' k';
  return String(nombre);
}

function formaterJourCourt(dateISO) {
  return new Date(dateISO + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function rendreGraphiques() {
  rendreGraphiqueEvolution();
  rendreGraphiqueCategories();
}

/* Solde cumulé jour par jour sur la période (jusqu'à aujourd'hui pour
   le mois en cours), avec ligne de repère et infobulle au survol. */
function rendreGraphiqueEvolution() {
  const conteneur = document.getElementById('graphique-evolution');
  conteneur.replaceChildren();
  const bornes = bornesPeriode();
  if (!bornes.debut || !bornes.fin || bornes.debut > bornes.fin) {
    conteneur.appendChild(messageVide('Choisis une période valide.'));
    return;
  }
  const aujourdHui = aujourdhuiISO();
  const fin = bornes.fin > aujourdHui && bornes.debut <= aujourdHui ? aujourdHui : bornes.fin;
  const transactions = donnees.transactions.filter(function (t) { return t.date >= bornes.debut && t.date <= fin && t.type !== 'transfert'; });
  if (!transactions.length) {
    conteneur.appendChild(messageVide('Aucune transaction sur cette période.'));
    return;
  }

  const parJour = new Map();
  transactions.forEach(function (t) {
    parJour.set(t.date, (parJour.get(t.date) || 0) + (t.type === 'revenu' ? t.montant : -t.montant));
  });
  const points = [];
  let cumul = 0;
  const jour = new Date(bornes.debut + 'T12:00:00');
  for (let i = 0; i < 400 && versISO(jour) <= fin; i++) {
    const date = versISO(jour);
    const variation = parJour.get(date) || 0;
    cumul += variation;
    points.push({ date: date, solde: cumul, variation: variation });
    jour.setDate(jour.getDate() + 1);
  }

  const largeur = Math.max(280, conteneur.clientWidth || 560);
  const hauteur = 200;
  const marge = { haut: 12, droite: 12, bas: 26, gauche: 46 };
  const valeurs = points.map(function (p) { return p.solde; });
  let minimum = Math.min(0, Math.min.apply(null, valeurs));
  let maximum = Math.max(0, Math.max.apply(null, valeurs));
  if (minimum === maximum) maximum = minimum + 1;
  const etendue = maximum - minimum;
  minimum -= etendue * 0.05;
  maximum += etendue * 0.08;
  const x = function (i) {
    return marge.gauche + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (largeur - marge.gauche - marge.droite);
  };
  const y = function (v) { return marge.haut + (maximum - v) / (maximum - minimum) * (hauteur - marge.haut - marge.bas); };

  const svg = elementSvg('svg', { viewBox: '0 0 ' + largeur + ' ' + hauteur, width: largeur, height: hauteur, role: 'img',
    'aria-label': 'Solde cumulé du ' + formaterDateCourte(bornes.debut) + ' au ' + formaterDateCourte(fin) + ' : ' +
      formaterMontant(points[points.length - 1].solde) + ' à la fin.' });

  const definitions = elementSvg('defs');
  const degrade = elementSvg('linearGradient', { id: 'degrade-aire', x1: '0', y1: '0', x2: '1', y2: '1' });
  [['0', '#46dde6', '0.32'], ['0.55', '#4a8bc4', '0.18'], ['1', '#7b4fcf', '0.14']].forEach(function (arret) {
    degrade.appendChild(elementSvg('stop', { offset: arret[0], 'stop-color': arret[1], 'stop-opacity': arret[2] }));
  });
  definitions.appendChild(degrade);
  svg.appendChild(definitions);

  /* Repères horizontaux discrets : maximum, zéro, minimum. Un repère
     trop proche d'un autre (moins de 14 px) est omis. */
  const places = [];
  [Math.max.apply(null, valeurs), 0, Math.min.apply(null, valeurs)].forEach(function (v) {
    if (places.some(function (deja) { return Math.abs(y(deja) - y(v)) < 14; })) return;
    places.push(v);
    svg.appendChild(elementSvg('line', { x1: marge.gauche, x2: largeur - marge.droite, y1: y(v), y2: y(v), class: v === 0 ? 'axe-zero' : 'grille' }));
    const etiquette = elementSvg('text', { x: marge.gauche - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'etiquette-axe' });
    etiquette.textContent = formaterCompact(v);
    svg.appendChild(etiquette);
  });

  /* Dates : début, milieu, fin. */
  [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter(function (v, i, liste) { return liste.indexOf(v) === i; })
    .forEach(function (i, rang, liste) {
      const etiquette = elementSvg('text', { x: x(i), y: hauteur - 6, class: 'etiquette-axe',
        'text-anchor': liste.length === 1 ? 'middle' : (rang === 0 ? 'start' : (rang === liste.length - 1 ? 'end' : 'middle')) });
      etiquette.textContent = formaterJourCourt(points[i].date);
      svg.appendChild(etiquette);
    });

  const trace = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.solde).toFixed(1); }).join(' ');
  svg.appendChild(elementSvg('path', { d: trace + ' L' + x(points.length - 1).toFixed(1) + ' ' + y(0).toFixed(1) +
    ' L' + x(0).toFixed(1) + ' ' + y(0).toFixed(1) + ' Z', class: 'aire' }));
  svg.appendChild(elementSvg('path', { d: trace, class: 'courbe' }));
  const dernier = points.length - 1;
  svg.appendChild(elementSvg('circle', { cx: x(dernier), cy: y(points[dernier].solde), r: 4.5, class: 'point' }));

  /* Survol : ligne verticale + point + infobulle sur le jour le plus proche. */
  const repere = elementSvg('line', { y1: marge.haut, y2: hauteur - marge.bas, class: 'repere', visibility: 'hidden' });
  const pointSurvol = elementSvg('circle', { r: 5, class: 'point', visibility: 'hidden' });
  svg.append(repere, pointSurvol);
  const zone = elementSvg('rect', { x: marge.gauche, y: 0, width: largeur - marge.gauche - marge.droite, height: hauteur, fill: 'transparent' });
  svg.appendChild(zone);
  const bulle = document.createElement('div');
  bulle.className = 'infobulle';
  bulle.hidden = true;

  const montrer = function (evenement) {
    const rect = svg.getBoundingClientRect();
    const position = (evenement.clientX - rect.left) * largeur / rect.width;
    const i = Math.max(0, Math.min(dernier, Math.round((position - marge.gauche) / (largeur - marge.gauche - marge.droite) * dernier)));
    const p = points[i];
    repere.setAttribute('x1', x(i));
    repere.setAttribute('x2', x(i));
    pointSurvol.setAttribute('cx', x(i));
    pointSurvol.setAttribute('cy', y(p.solde));
    repere.setAttribute('visibility', 'visible');
    pointSurvol.setAttribute('visibility', 'visible');
    bulle.replaceChildren();
    const date = document.createElement('strong');
    date.textContent = formaterDateLongue(p.date);
    const solde = document.createElement('span');
    solde.textContent = 'Solde : ' + formaterEcart(p.solde);
    bulle.append(date, solde);
    if (p.variation) {
      const variation = document.createElement('span');
      variation.textContent = 'Ce jour-là : ' + formaterEcart(p.variation);
      bulle.appendChild(variation);
    }
    bulle.hidden = false;
    const gauche = x(i) * rect.width / largeur;
    bulle.style.left = Math.min(Math.max(gauche, 70), rect.width - 70) + 'px';
    bulle.style.top = Math.max(0, y(p.solde) * rect.height / hauteur - 8) + 'px';
  };
  const cacher = function () {
    repere.setAttribute('visibility', 'hidden');
    pointSurvol.setAttribute('visibility', 'hidden');
    bulle.hidden = true;
  };
  zone.addEventListener('pointermove', montrer);
  zone.addEventListener('pointerdown', montrer);
  zone.addEventListener('pointerleave', cacher);

  conteneur.append(svg, bulle);
}

/* Anneau des dépenses par catégorie : les 4 plus grosses, puis
   « Autres ». La légende donne montant et part de chacune. */
function rendreGraphiqueCategories() {
  const conteneur = document.getElementById('graphique-categories');
  conteneur.replaceChildren();
  const parCategorie = new Map();
  transactionsDeLaPeriode().forEach(function (t) {
    if (t.type !== 'depense') return;
    const cle = t.categorie || 'Sans catégorie';
    parCategorie.set(cle, (parCategorie.get(cle) || 0) + t.montant);
  });
  const triees = Array.from(parCategorie.entries()).sort(function (a, b) { return b[1] - a[1]; });
  if (!triees.length) {
    conteneur.appendChild(messageVide('Aucune dépense sur cette période.'));
    return;
  }
  const parts = triees.slice(0, 4).map(function (entree, i) { return { nom: entree[0], montant: entree[1], couleur: COULEURS_CATEGORIES[i] }; });
  const reste = triees.slice(4).reduce(function (somme, entree) { return somme + entree[1]; }, 0);
  if (reste > 0) parts.push({ nom: 'Autres', montant: reste, couleur: COULEUR_AUTRES });
  const total = parts.reduce(function (somme, part) { return somme + part.montant; }, 0);

  const taille = 150;
  const rayon = 56;
  const epaisseur = 20;
  const circonference = 2 * Math.PI * rayon;
  const ecart = parts.length > 1 ? 2 : 0;   /* 2 px de fond entre deux parts */
  const svg = elementSvg('svg', { viewBox: '0 0 ' + taille + ' ' + taille, width: taille, height: taille, role: 'img',
    'aria-label': 'Dépenses par catégorie : ' + parts.map(function (part) {
      return part.nom + ' ' + Math.round(part.montant / total * 100) + ' %';
    }).join(', ') });
  const groupe = elementSvg('g', { transform: 'rotate(-90 ' + taille / 2 + ' ' + taille / 2 + ')' });
  let depart = 0;
  parts.forEach(function (part) {
    const longueur = part.montant / total * circonference;
    const segment = elementSvg('circle', { cx: taille / 2, cy: taille / 2, r: rayon, fill: 'none', stroke: part.couleur,
      'stroke-width': epaisseur, 'stroke-dasharray': Math.max(0, longueur - ecart) + ' ' + circonference,
      'stroke-dashoffset': -depart });
    const titre = elementSvg('title');
    titre.textContent = part.nom + ' : ' + formaterMontant(part.montant) + ' (' + Math.round(part.montant / total * 100) + ' %)';
    segment.appendChild(titre);
    groupe.appendChild(segment);
    depart += longueur;
  });
  svg.appendChild(groupe);
  const centre = elementSvg('text', { x: taille / 2, y: taille / 2 + 2, 'text-anchor': 'middle', class: 'centre-anneau' });
  centre.textContent = formaterCompact(total);
  const sousCentre = elementSvg('text', { x: taille / 2, y: taille / 2 + 18, 'text-anchor': 'middle', class: 'etiquette-axe' });
  sousCentre.textContent = donnees.reglages.devise;
  svg.append(centre, sousCentre);

  const legende = document.createElement('ul');
  legende.className = 'legende';
  parts.forEach(function (part) {
    const li = document.createElement('li');
    const pastille = document.createElement('span');
    pastille.className = 'legende-pastille';
    pastille.style.background = part.couleur;
    const nom = document.createElement('span');
    nom.className = 'legende-nom';
    nom.textContent = part.nom;
    const valeur = document.createElement('span');
    valeur.className = 'legende-valeur';
    valeur.textContent = Math.round(part.montant / total * 100) + ' %';
    valeur.title = formaterMontant(part.montant);
    const montant = document.createElement('small');
    montant.textContent = formaterMontant(part.montant);
    nom.appendChild(montant);
    li.append(pastille, nom, valeur);
    legende.appendChild(li);
  });

  const enveloppe = document.createElement('div');
  enveloppe.className = 'anneau';
  enveloppe.append(svg, legende);
  conteneur.appendChild(enveloppe);
}

/* Les six dernières opérations saisies, toutes périodes confondues. */
function rendreOperationsRecentes() {
  const ul = document.getElementById('liste-recentes');
  ul.replaceChildren();
  const recentes = donnees.transactions.slice().sort(comparerTransactions).slice(0, 6);
  document.getElementById('recentes-vides').hidden = recentes.length > 0;
  let jourPrecedent = '';
  recentes.forEach(function (tr) {
    if (tr.date !== jourPrecedent) {
      jourPrecedent = tr.date;
      const titre = document.createElement('li');
      titre.className = 'titre-jour';
      titre.textContent = libelleJour(tr.date);
      ul.appendChild(titre);
    }
    ul.appendChild(construireLigne(tr));
  });
}

/* ---------- 10. Écran Transactions ---------- */

/* Liste les mois qui contiennent des transactions, plus le mois
   courant, du plus récent au plus ancien. */
function remplirFiltreMois() {
  const moisPresents = new Set();
  donnees.transactions.forEach(function (t) {
    moisPresents.add(t.date.slice(0, 7)); /* "2026-09" */
  });
  moisPresents.add(aujourdhuiISO().slice(0, 7));

  const listeMois = Array.from(moisPresents).sort().reverse();

  const select = document.getElementById('filtre-mois');
  select.innerHTML = '';

  for (const m of listeMois) {
    const option = document.createElement('option');
    option.value = m;
    option.textContent = formaterMoisAnnee(m + '-01');
    select.appendChild(option);
  }

  /* Si le mois affiché a disparu (données effacées), on revient
     au mois courant. */
  if (!moisPresents.has(moisFiltre)) {
    moisFiltre = aujourdhuiISO().slice(0, 7);
  }
  select.value = moisFiltre;
}

/* Transactions du mois choisi dans le filtre.
   filter() renvoie une nouvelle liste : on peut donc la trier
   sans toucher aux données enregistrées. */
function transactionsDuMois() {
  return donnees.transactions
    .filter(function (t) { return t.date.slice(0, 7) === moisFiltre; })
    .sort(comparerTransactions);
}

/* Ordre d'affichage : du plus récent au plus ancien ; à date
   égale, la dernière saisie apparaît en premier. */
function comparerTransactions(a, b) {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  return b.creeLe - a.creeLe;
}

/* Met à jour le résumé du mois et la liste groupée par jour. */
function rendreTransactions() {
  const liste = transactionsDuMois();
  const resume = totaux(liste);

  /* Résumé du mois affiché. */
  let texte = 'Entrées ' + formaterMontant(resume.revenus) +
    ' · Sorties ' + formaterMontant(resume.depenses) +
    ' · Solde ' + (resume.solde > 0 ? '+' : '') + formaterMontant(resume.solde);
  if (resume.transferts > 0) {
    texte += ' · Transferts ' + formaterMontant(resume.transferts) + ' (hors solde)';
  }
  document.getElementById('resume-mois').textContent = texte;

  /* Liste des transactions, groupées par journée. */
  const ul = document.getElementById('liste-transactions');
  const messageVide = document.getElementById('transactions-vide');
  ul.innerHTML = '';

  if (liste.length === 0) {
    messageVide.hidden = false;
    return;
  }
  messageVide.hidden = true;

  let jourPrecedent = '';
  for (const tr of liste) {
    /* Une fois par journée : un petit titre avec la date en clair. */
    if (tr.date !== jourPrecedent) {
      jourPrecedent = tr.date;
      const titre = document.createElement('li');
      titre.className = 'titre-jour';
      titre.textContent = libelleJour(tr.date);
      ul.appendChild(titre);
    }
    ul.appendChild(construireLigne(tr));
  }
}

/* Construit une ligne de l'historique : icône, libellé, détails,
   montant signé. Toucher la ligne ouvre la modification (la
   suppression se fait depuis ce formulaire). textContent affiche
   les textes saisis tels quels, sans jamais les interpréter. */
function construireLigne(tr) {
  const li = document.createElement('li');
  li.className = 'operation type-' + tr.type;

  const libelleType = tr.type === 'revenu' ? 'Revenu' : (tr.type === 'depense' ? 'Dépense' : 'Transfert interne');
  const objectifAffiche = nomObjectif(tr.objectifId);
  const titreTexte = tr.note || tr.categorie || libelleType;
  const details = [tr.note ? tr.categorie : '', nomActivite(tr.activiteId), objectifAffiche ? 'Objectif ' + objectifAffiche : '']
    .filter(function (partie) { return partie; });
  if (tr.type === 'transfert') {
    details.unshift((tr.source || 'Origine inconnue') + ' → ' + (tr.destination || 'Destination inconnue'));
  }
  if (!details.length) details.push(libelleType);

  const corps = document.createElement('button');
  corps.type = 'button';
  corps.className = 'corps-operation';
  corps.setAttribute('aria-label', libelleType + ' de ' + formaterMontant(tr.montant) + ', ' + titreTexte + ', le ' + formaterDateCourte(tr.date) + '. Modifier');

  const pastille = document.createElement('span');
  pastille.className = 'op-icone';
  pastille.appendChild(icone(tr.type === 'revenu' ? 'entree' : (tr.type === 'depense' ? 'sortie' : 'transfert')));

  const infos = document.createElement('span');
  infos.className = 'op-infos';
  const titre = document.createElement('strong');
  titre.textContent = titreTexte;
  const sousTitre = document.createElement('small');
  sousTitre.textContent = details.join(' · ');
  infos.append(titre, sousTitre);

  const montant = document.createElement('span');
  montant.className = 'op-montant';
  montant.textContent = (tr.type === 'revenu' ? '+' : (tr.type === 'depense' ? '−' : '')) + formaterMontant(tr.montant);

  corps.append(pastille, infos, montant);
  corps.addEventListener('click', function () { ouvrirFormulaire('modification', tr.id); });
  li.appendChild(corps);
  return li;
}

/* Vrai si la transaction est la dépense d'achat d'un objectif :
   son lien et son type ne doivent alors pas changer. */
function estAchatObjectif(tr) {
  if (!tr || !tr.objectifId) return false;
  const objectif = donnees.objectifs.find(function (o) { return o.id === tr.objectifId; });
  return Boolean(objectif && objectif.achat && objectif.achat.transactionId === tr.id);
}

function nomObjectif(id) {
  if (!id) return '';
  const objectif = donnees.objectifs.find(function (o) { return o.id === id; });
  return objectif ? objectif.nom : '';
}

/* Nom d'une activité à partir de son identifiant. */
function nomActivite(id) {
  if (!id) {
    return '';
  }
  const activite = donnees.activites.find(function (a) { return a.id === id; });
  return activite ? activite.nom : '';
}

/* ---------- 11. Formulaire d'ajout et de modification ---------- */

/* Ouvre le formulaire.
   - mode 'depense', 'revenu' ou 'transfert' : ajout pré-rempli ;
   - mode 'modification' : formulaire rempli avec la transaction
     désignée par id. */
function ouvrirFormulaire(mode, id) {
  modeFormulaire = mode;
  idEnModification = id || null;

  const transactionOuverte = mode === 'modification'
    ? donnees.transactions.find(function (t) { return t.id === id; })
    : null;
  remplirChoixCategories();
  remplirChoixActivites();
  remplirChoixObjectifs(transactionOuverte ? transactionOuverte.objectifId : '');
  const lienAchat = estAchatObjectif(transactionOuverte);
  const choixObjectif = document.getElementById('champ-objectif');
  choixObjectif.disabled = lienAchat;
  document.getElementById('aide-objectif').textContent = lienAchat
    ? "Dépense d'achat de cet objectif : le lien ne peut pas être modifié."
    : "Simple rattachement. Pour faire progresser l'objectif, utilise « Cotiser ».";

  const champType = document.getElementById('champ-type');
  const titre = document.getElementById('titre-formulaire');
  const boutonSupprimer = document.getElementById('btn-supprimer');

  if (mode === 'modification') {
    const tr = donnees.transactions.find(function (t) { return t.id === id; });

    champType.value = tr.type;
    champType.disabled = lienAchat;
    document.getElementById('champ-montant').value = tr.montant;
    document.getElementById('champ-date').value = tr.date;
    document.getElementById('champ-categorie').value = tr.categorie || '';
    document.getElementById('champ-activite').value = tr.activiteId || '';
    choixObjectif.value = tr.objectifId || '';
    document.getElementById('champ-moyen').value = tr.moyen || '';
    document.getElementById('champ-note').value = tr.note || '';
    document.getElementById('champ-justificatif').value = tr.justificatif || '';
    document.getElementById('champ-source').value = tr.source || '';
    document.getElementById('champ-destination').value = tr.destination || '';

    titre.textContent = 'Modifier la transaction';
    boutonSupprimer.hidden = false;
  } else {
    reinitialiserFormulaire();
    champType.disabled = false;
    champType.value = mode; /* 'depense', 'revenu' ou 'transfert' */

    const titres = {
      depense: 'Ajouter une dépense',
      revenu: 'Ajouter un revenu',
      transfert: 'Ajouter un transfert interne'
    };
    titre.textContent = titres[mode] || 'Nouvelle transaction';
    boutonSupprimer.hidden = true;
  }

  actualiserChampsType();
  effacerErreurs();
  document.getElementById('voile-formulaire').classList.remove('cache');
  document.getElementById('champ-montant').focus();
}

/* Ferme le formulaire sans rien enregistrer. */
function fermerFormulaire() {
  document.getElementById('voile-formulaire').classList.add('cache');
}

/* Remet le formulaire à vide, avec la date du jour. */
function reinitialiserFormulaire() {
  const ids = ['champ-montant', 'champ-date', 'champ-moyen', 'champ-note', 'champ-justificatif', 'champ-source', 'champ-destination'];
  for (const id of ids) {
    document.getElementById(id).value = '';
  }
  document.getElementById('champ-type').value = 'depense';
  document.getElementById('champ-categorie').value = '';
  document.getElementById('champ-activite').value = '';
  document.getElementById('champ-objectif').value = '';
  document.getElementById('champ-date').value = aujourdhuiISO();
}

function actualiserChampsType() {
  const estTransfert = document.getElementById('champ-type').value === 'transfert';
  document.querySelectorAll('.champ-transfert').forEach(function (champ) {
    champ.classList.toggle('cache', !estTransfert);
  });
}

/* Remplit la liste déroulante des catégories. */
function remplirChoixCategories() {
  const select = document.getElementById('champ-categorie');
  select.innerHTML = '';

  const optionSans = document.createElement('option');
  optionSans.value = '';
  optionSans.textContent = '— Aucune —';
  select.appendChild(optionSans);

  for (const categorie of donnees.reglages.categories) {
    const option = document.createElement('option');
    option.value = categorie;
    option.textContent = categorie;
    select.appendChild(option);
  }
}

/* Remplit la liste déroulante des activités liées. */
function remplirChoixActivites() {
  const select = document.getElementById('champ-activite');
  select.innerHTML = '';

  const optionSans = document.createElement('option');
  optionSans.value = '';
  optionSans.textContent = '— Aucune —';
  select.appendChild(optionSans);

  for (const activite of donnees.activites) {
    const option = document.createElement('option');
    option.value = activite.id;
    option.textContent = activite.nom;
    select.appendChild(option);
  }
}

/* Remplit la liste des objectifs : ceux en cours, plus celui déjà
   lié à la transaction ouverte même s'il est terminé. */
function remplirChoixObjectifs(objectifIdActuel) {
  const select = document.getElementById('champ-objectif');
  select.replaceChildren();

  const optionSans = document.createElement('option');
  optionSans.value = '';
  optionSans.textContent = '— Aucun —';
  select.appendChild(optionSans);

  for (const objectif of donnees.objectifs) {
    if (objectif.statut !== 'encours' && objectif.id !== objectifIdActuel) continue;
    const option = document.createElement('option');
    option.value = objectif.id;
    option.textContent = objectif.nom + (objectif.statut === 'termine' ? ' (terminé)' : '');
    select.appendChild(option);
  }
}

/* Vérifie le formulaire. Renvoie les valeurs si tout est bon,
   ou null (et affiche les messages d'erreur) sinon. */
function validerFormulaire() {
  effacerErreurs();

  const type = document.getElementById('champ-type').value;
  const montantBrut = document.getElementById('champ-montant').value.trim();
  const date = document.getElementById('champ-date').value;
  const categorie = document.getElementById('champ-categorie').value;
  const source = document.getElementById('champ-source').value.trim();
  const destination = document.getElementById('champ-destination').value.trim();

  /* Number() transforme le texte en nombre ; un montant valide
     est un nombre entier (le FCFA n'a pas de centimes) >= 1. */
  const montant = Number(montantBrut);
  let valide = true;

  if (montantBrut === '' || !Number.isSafeInteger(montant) || montant < 1) {
    signalerErreur('montant', 'Entre un montant entier en ' + donnees.reglages.devise + ' (au moins 1).');
    valide = false;
  }
  if (date === '') {
    signalerErreur('date', 'Choisis une date.');
    valide = false;
  }
  if (type === 'depense' && categorie === '') {
    signalerErreur('categorie', "Une dépense a besoin d'une catégorie.");
    valide = false;
  }
  if (type === 'transfert') {
    if (source === '') {
      signalerErreur('source', "Indique d'où vient l'argent.");
      valide = false;
    }
    if (destination === '') {
      signalerErreur('destination', "Indique où va l'argent.");
      valide = false;
    }
    if (source !== '' && destination !== '' && source.toLocaleLowerCase() === destination.toLocaleLowerCase()) {
      signalerErreur('destination', "La destination doit être différente de l'origine.");
      valide = false;
    }
  }

  if (!valide) {
    return null;
  }

  return {
    type: type,
    montant: montant,
    date: date,
    categorie: type === 'transfert' ? '' : categorie,
    source: type === 'transfert' ? source : '',
    destination: type === 'transfert' ? destination : ''
  };
}

/* Affiche un message d'erreur sous un champ et l'encadre en rouge. */
function signalerErreur(champ, message) {
  document.getElementById('erreur-' + champ).textContent = message;
  document.getElementById('champ-' + champ).closest('.champ').classList.add('invalide');
}

/* Efface tous les messages d'erreur. */
function effacerErreurs() {
  document.querySelectorAll('.message-erreur').forEach(function (m) {
    m.textContent = '';
  });
  document.querySelectorAll('.champ.invalide').forEach(function (c) {
    c.classList.remove('invalide');
  });
}

/* Bouton "Enregistrer" : valide puis ajoute ou modifie. */
function enregistrerFormulaire() {
  const valeurs = validerFormulaire();
  if (valeurs === null) {
    return; /* les messages d'erreur sont déjà affichés */
  }

  const activiteId = document.getElementById('champ-activite').value;
  const objectifChoisi = document.getElementById('champ-objectif').value;
  const moyen = document.getElementById('champ-moyen').value.trim();
  const note = document.getElementById('champ-note').value.trim();
  const justificatif = document.getElementById('champ-justificatif').value.trim();
  const avantModification = JSON.stringify(donnees);

  if (modeFormulaire === 'modification') {
    /* Modification : on retrouve la transaction et on remplace
       ses champs un par un. */
    const tr = donnees.transactions.find(function (t) { return t.id === idEnModification; });
    tr.type = valeurs.type;
    tr.montant = valeurs.montant;
    tr.date = valeurs.date;
    tr.categorie = valeurs.categorie;
    tr.activiteId = activiteId;
    if (!estAchatObjectif(tr)) tr.objectifId = objectifChoisi;
    tr.moyen = moyen;
    tr.note = note;
    tr.justificatif = justificatif;
    tr.source = valeurs.source;
    tr.destination = valeurs.destination;
    if (tr.objectifId) {
      const objectifLie = donnees.objectifs.find(function (o) { return o.id === tr.objectifId; });
      if (objectifLie && objectifLie.achat && objectifLie.achat.transactionId === tr.id) {
        objectifLie.achat.montant = valeurs.montant;
        objectifLie.achat.date = valeurs.date;
        objectifLie.achat.categorie = valeurs.categorie;
      }
    }
  } else {
    /* Ajout : nouvelle transaction avec un identifiant unique.
       creeLe (horodatage de création) sert à trier les saisies
       d'une même journée. */
    donnees.transactions.push({
      id: nouvelIdentifiant(),
      creeLe: Date.now(),
      type: valeurs.type,
      montant: valeurs.montant,
      date: valeurs.date,
      categorie: valeurs.categorie,
      activiteId: activiteId,
      objectifId: objectifChoisi,
      moyen: moyen,
      note: note,
      justificatif: justificatif,
      source: valeurs.source,
      destination: valeurs.destination
    });
  }

  if (!enregistrerDonnees()) {
    donnees = JSON.parse(avantModification);
    rendreTout();
    return;
  }
  fermerFormulaire();
  proposerAnnulation(avantModification, modeFormulaire === 'modification' ? 'Transaction modifiée.' : 'Transaction ajoutée.');

  /* Le filtre saute sur le mois de la transaction enregistrée,
     pour que la saisie soit visible immédiatement. */
  moisFiltre = valeurs.date.slice(0, 7);

  rendreTout();
}

/* Suppression, après une demande de confirmation. */
function supprimerTransaction(id) {
  const tr = donnees.transactions.find(function (t) { return t.id === id; });
  if (!tr) {
    return;
  }

  const libelleType = tr.type === 'revenu' ? 'ce revenu' : (tr.type === 'depense' ? 'cette dépense' : 'ce transfert');
  const objectifLie = estAchatObjectif(tr) ? donnees.objectifs.find(function (o) { return o.id === tr.objectifId; }) : null;
  const confirmation = confirm('Supprimer ' + libelleType + ' de ' + formaterMontant(tr.montant) +
    (objectifLie ? ' ? Cela retirera aussi l’achat de l’objectif « ' + objectifLie.nom + ' » et le rouvrira.' : ' ?'));
  if (!confirmation) {
    return;
  }

  /* filter() garde toutes les transactions sauf celle-ci. */
  const avantSuppression = JSON.stringify(donnees);
  donnees.transactions = donnees.transactions.filter(function (t) { return t.id !== id; });
  if (objectifLie && objectifLie.achat && objectifLie.achat.transactionId === id) {
    objectifLie.statut = objectifLie.achat.statutAvantAchat;
    objectifLie.achat = null;
  }
  if (!enregistrerDonnees()) {
    donnees = JSON.parse(avantSuppression);
    rendreTout();
    return;
  }
  fermerFormulaire();
  proposerAnnulation(avantSuppression, 'Transaction supprimée.');
  rendreTout();
}

/* ---------- 12. Paramètres ---------- */

/* Devise, rappel et catégories dans l'écran Paramètres. */
function rendreParametres() {
  document.querySelectorAll('.libelle-devise').forEach(function (element) {
    element.textContent = donnees.reglages.devise;
  });
  const champDevise = document.getElementById('param-devise');
  if (document.activeElement !== champDevise) champDevise.value = donnees.reglages.devise;
  document.getElementById('param-rappel').value = String(donnees.reglages.rappelJours);

  const ul = document.getElementById('liste-categories-parametres');
  ul.replaceChildren();
  for (const categorie of donnees.reglages.categories) {
    const li = document.createElement('li');
    const nom = document.createElement('span');
    nom.className = 'nom-categorie';
    nom.textContent = categorie;
    const usages = usagesCategorie(categorie);
    if (usages) {
      const detail = document.createElement('small');
      detail.textContent = 'Utilisée ' + usages + ' fois';
      nom.appendChild(detail);
    }
    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'btn btn-secondaire';
    renommer.textContent = 'Renommer';
    renommer.setAttribute('aria-label', 'Renommer la catégorie ' + categorie);
    renommer.addEventListener('click', function () { renommerCategorie(categorie); });
    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'btn btn-secondaire';
    supprimer.textContent = 'Supprimer';
    supprimer.setAttribute('aria-label', 'Supprimer la catégorie ' + categorie);
    supprimer.addEventListener('click', function () { supprimerCategorie(categorie); });
    li.append(nom, renommer, supprimer);
    ul.appendChild(li);
  }
}

/* Nombre de transactions et de budgets qui utilisent une catégorie. */
function usagesCategorie(nom) {
  return donnees.transactions.filter(function (t) { return t.categorie === nom; }).length +
    donnees.budgets.filter(function (b) { return b.type === 'categorie' && b.categorie === nom; }).length;
}

/* Renvoie un message d'erreur, ou '' si le nom convient. */
function verifierNomCategorie(nom, ancien) {
  if (!nom) return 'Indique un nom.';
  if (nom.length > 60) return '60 caractères au maximum.';
  const doublon = donnees.reglages.categories.some(function (categorie) {
    return categorie !== ancien && categorie.toLocaleLowerCase() === nom.toLocaleLowerCase();
  });
  return doublon ? 'Cette catégorie existe déjà.' : '';
}

function ajouterCategorie() {
  const champ = document.getElementById('nouvelle-categorie');
  const nom = champ.value.trim();
  const erreur = verifierNomCategorie(nom, null);
  document.getElementById('erreur-categorie-parametre').textContent = erreur;
  if (erreur) return;
  const avant = JSON.stringify(donnees);
  donnees.reglages.categories.push(nom);
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  champ.value = '';
  proposerAnnulation(avant, 'Catégorie « ' + nom + ' » ajoutée.');
  rendreTout();
}

/* Le nouveau nom est reporté sur les transactions, budgets et achats
   d'objectif qui utilisaient l'ancien. */
function renommerCategorie(ancien) {
  const saisie = prompt('Nouveau nom pour « ' + ancien + ' » :', ancien);
  if (saisie === null) return;
  const nom = saisie.trim();
  if (nom === ancien) return;
  const erreur = verifierNomCategorie(nom, ancien);
  if (erreur) { alert(erreur); return; }
  const avant = JSON.stringify(donnees);
  donnees.reglages.categories = donnees.reglages.categories.map(function (c) { return c === ancien ? nom : c; });
  donnees.transactions.forEach(function (t) { if (t.categorie === ancien) t.categorie = nom; });
  donnees.budgets.forEach(function (b) { if (b.categorie === ancien) b.categorie = nom; });
  donnees.objectifs.forEach(function (o) { if (o.achat && o.achat.categorie === ancien) o.achat.categorie = nom; });
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  proposerAnnulation(avant, 'Catégorie renommée en « ' + nom + ' ».');
  rendreTout();
}

function supprimerCategorie(nom) {
  const usages = usagesCategorie(nom);
  if (usages) {
    alert('« ' + nom + ' » est utilisée ' + usages + ' fois. Renomme-la, ou modifie d’abord les transactions et budgets concernés.');
    return;
  }
  if (donnees.reglages.categories.length <= 1) {
    alert('Garde au moins une catégorie : une dépense en a besoin.');
    return;
  }
  if (!confirm('Supprimer la catégorie « ' + nom + ' » ?')) return;
  const avant = JSON.stringify(donnees);
  donnees.reglages.categories = donnees.reglages.categories.filter(function (c) { return c !== nom; });
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  proposerAnnulation(avant, 'Catégorie « ' + nom + ' » supprimée.');
  rendreTout();
}

function enregistrerDevise() {
  const champ = document.getElementById('param-devise');
  const devise = champ.value.trim();
  const erreur = document.getElementById('erreur-devise');
  if (!reglagesValides({ devise: devise })) {
    erreur.textContent = 'De 1 à 10 lettres ou symboles monétaires (ex : FCFA, €).';
    return;
  }
  erreur.textContent = '';
  if (devise === donnees.reglages.devise) return;
  const avant = JSON.stringify(donnees);
  donnees.reglages.devise = devise;
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  champ.blur();
  proposerAnnulation(avant, 'Devise affichée : ' + devise + '.');
  rendreTout();
}

function enregistrerRappel() {
  const delai = Number(document.getElementById('param-rappel').value);
  if (!DELAIS_RAPPEL.includes(delai)) return;
  const avant = JSON.stringify(donnees);
  donnees.reglages.rappelJours = delai;
  if (!enregistrerDonnees()) { donnees = JSON.parse(avant); rendreTout(); return; }
  proposerAnnulation(avant, delai ? 'Rappel après ' + delai + (delai > 1 ? ' jours' : ' jour') + ' sans saisie.' : 'Rappel désactivé.');
  rendreTout();
}

function ouvrirFormulaireActivite(id) {
  idActiviteModification = id || null;
  const activite = id ? donnees.activites.find(function (a) { return a.id === id; }) : null;
  const valeurs = {
    'activite-nom': activite ? activite.nom : '',
    'activite-statut': activite ? activite.statut : 'idee',
    'activite-heures': activite && activite.heures ? activite.heures : '',
    'activite-budget': activite && activite.budget != null ? activite.budget : '',
    'activite-revenu-prevu': activite && activite.revenuPrevu != null ? activite.revenuPrevu : '',
    'activite-depenses-prevues': activite && activite.depensesPrevues != null ? activite.depensesPrevues : '',
    'activite-date-debut': activite ? activite.dateDebut || '' : '',
    'activite-date-fin': activite ? activite.dateFin || '' : '',
    'activite-description': activite ? activite.description || '' : ''
  };
  Object.keys(valeurs).forEach(function (idChamp) { document.getElementById(idChamp).value = valeurs[idChamp]; });
  document.getElementById('titre-activite').textContent = activite ? 'Modifier une activité' : 'Nouvelle activité';
  document.getElementById('btn-supprimer-activite').hidden = !activite;
  effacerErreursActivite();
  document.getElementById('voile-activite').classList.remove('cache');
  document.getElementById('activite-nom').focus();
}

function effacerErreursActivite() {
  document.querySelectorAll('#formulaire-activite .message-erreur').forEach(function (el) { el.textContent = ''; });
  document.querySelectorAll('#formulaire-activite .invalide').forEach(function (el) { el.classList.remove('invalide'); });
}

function afficherErreurActivite(champId, erreurId, message) {
  document.getElementById(champId).closest('.champ').classList.add('invalide');
  document.getElementById(erreurId).textContent = message;
}

function validerFormulaireActivite() {
  effacerErreursActivite();
  const nom = document.getElementById('activite-nom').value.trim();
  const statut = document.getElementById('activite-statut').value;
  const dateDebut = document.getElementById('activite-date-debut').value;
  const dateFin = document.getElementById('activite-date-fin').value;
  let valide = true;
  if (!nom) {
    afficherErreurActivite('activite-nom', 'erreur-activite-nom', 'Indique un nom.');
    valide = false;
  }
  const nombreOptionnel = function (id, erreurId) {
    const brut = document.getElementById(id).value.trim();
    if (brut === '') return null;
    const nombre = Number(brut);
    if (!Number.isSafeInteger(nombre) || nombre < 0) {
      afficherErreurActivite(id, erreurId, 'Entre un montant entier positif ou laisse le champ vide.');
      valide = false;
      return null;
    }
    return nombre;
  };
  const budget = nombreOptionnel('activite-budget', 'erreur-activite-budget');
  const revenuPrevu = nombreOptionnel('activite-revenu-prevu', 'erreur-activite-revenu');
  const depensesPrevues = nombreOptionnel('activite-depenses-prevues', 'erreur-activite-depenses');
  const heuresBrut = document.getElementById('activite-heures').value.trim();
  const heures = heuresBrut === '' ? 0 : Number(heuresBrut);
  if (!Number.isFinite(heures) || heures < 0) {
    afficherErreurActivite('activite-heures', 'erreur-activite-heures', 'Entre un nombre d’heures égal ou supérieur à zéro.');
    valide = false;
  }
  if (dateDebut && dateFin && dateFin < dateDebut) {
    document.getElementById('erreur-activite-dates').textContent = 'La fin doit être postérieure ou égale au début.';
    valide = false;
  }
  if (!valide) return null;
  return {
    nom: nom,
    statut: statut,
    description: document.getElementById('activite-description').value.trim(),
    dateDebut: dateDebut,
    dateFin: dateFin,
    heures: heures,
    budget: budget,
    revenuPrevu: revenuPrevu,
    depensesPrevues: depensesPrevues
  };
}

function enregistrerActivite() {
  const valeurs = validerFormulaireActivite();
  if (!valeurs) return;
  const avant = JSON.stringify(donnees);
  if (idActiviteModification) {
    Object.assign(donnees.activites.find(function (a) { return a.id === idActiviteModification; }), valeurs);
  } else {
    donnees.activites.push(Object.assign({ id: nouvelIdentifiant(), creeLe: Date.now() }, valeurs));
  }
  if (!enregistrerDonnees()) {
    donnees = JSON.parse(avant);
    rendreTout();
    return;
  }
  document.getElementById('voile-activite').classList.add('cache');
  proposerAnnulation(avant, 'Activité enregistrée.');
  rendreTout();
}

function supprimerActivite(id) {
  const activite = donnees.activites.find(function (a) { return a.id === id; });
  if (!activite) return;
  const liee = donnees.transactions.some(function (t) { return t.activiteId === id; }) ||
    donnees.budgets.some(function (b) { return b.activiteId === id; });
  if (liee) {
    alert('Cette activité est liée à une transaction ou un budget. Marque-la « Terminée » pour conserver son historique.');
    return;
  }
  if (!confirm('Supprimer l’activité « ' + activite.nom + ' » ?')) return;
  const avant = JSON.stringify(donnees);
  donnees.activites = donnees.activites.filter(function (a) { return a.id !== id; });
  if (!enregistrerDonnees()) donnees = JSON.parse(avant);
  else proposerAnnulation(avant, 'Activité supprimée.');
  document.getElementById('voile-activite').classList.add('cache');
  rendreTout();
}

function remplirChoixBudget() {
  const categories = document.getElementById('budget-categorie');
  const activites = document.getElementById('budget-activite');
  categories.replaceChildren();
  activites.replaceChildren();
  donnees.reglages.categories.forEach(function (categorie) {
    const option = document.createElement('option'); option.value = categorie; option.textContent = categorie; categories.appendChild(option);
  });
  donnees.activites.forEach(function (activite) {
    const option = document.createElement('option'); option.value = activite.id; option.textContent = activite.nom; activites.appendChild(option);
  });
}

function ouvrirFormulaireBudget(id) {
  remplirChoixBudget();
  idBudgetModification = id || null;
  const budget = id ? donnees.budgets.find(function (b) { return b.id === id; }) : null;
  document.getElementById('budget-type').value = budget ? budget.type : 'general';
  document.getElementById('budget-mois').value = budget ? budget.mois : (document.getElementById('mois-budget').value || aujourdhuiISO().slice(0, 7));
  document.getElementById('budget-montant').value = budget ? budget.montant : '';
  document.getElementById('budget-seuil').value = budget ? budget.seuil : 80;
  document.getElementById('budget-categorie').value = budget ? budget.categorie || '' : '';
  document.getElementById('budget-activite').value = budget ? budget.activiteId || '' : '';
  document.getElementById('titre-budget').textContent = budget ? 'Modifier un budget' : 'Nouveau budget';
  document.getElementById('btn-supprimer-budget').hidden = !budget;
  effacerErreursBudget();
  actualiserTypeBudget();
  document.getElementById('voile-budget').classList.remove('cache');
  document.getElementById('budget-montant').focus();
}

function actualiserTypeBudget() {
  const type = document.getElementById('budget-type').value;
  document.querySelector('.champ-budget-categorie').classList.toggle('cache', type !== 'categorie');
  document.querySelector('.champ-budget-activite').classList.toggle('cache', type !== 'activite');
}

function effacerErreursBudget() {
  document.querySelectorAll('#formulaire-budget .message-erreur').forEach(function (el) { el.textContent = ''; });
  document.querySelectorAll('#formulaire-budget .invalide').forEach(function (el) { el.classList.remove('invalide'); });
}

function validerFormulaireBudget() {
  effacerErreursBudget();
  const type = document.getElementById('budget-type').value;
  const mois = document.getElementById('budget-mois').value;
  const montant = Number(document.getElementById('budget-montant').value);
  const seuil = Number(document.getElementById('budget-seuil').value);
  const categorie = document.getElementById('budget-categorie').value;
  const activiteId = document.getElementById('budget-activite').value;
  let valide = /^\d{4}-(0[1-9]|1[0-2])$/.test(mois);
  if (!valide) document.getElementById('erreur-budget-mois').textContent = 'Choisis un mois valide.';
  if (!Number.isSafeInteger(montant) || montant < 1) {
    document.getElementById('erreur-budget-montant').textContent = 'Entre un montant entier supérieur à zéro.';
    document.getElementById('budget-montant').closest('.champ').classList.add('invalide'); valide = false;
  }
  if (!Number.isInteger(seuil) || seuil < 1 || seuil > 100) {
    document.getElementById('erreur-budget-seuil').textContent = 'Le seuil doit être compris entre 1 et 100 %.';
    document.getElementById('budget-seuil').closest('.champ').classList.add('invalide'); valide = false;
  }
  let erreurPortee = '';
  if (type === 'categorie' && !categorie) {
    erreurPortee = 'Aucune catégorie disponible. Ajoute une catégorie dans les paramètres avant de créer ce budget.';
    valide = false;
  }
  if (type === 'activite' && !activiteId) {
    erreurPortee = 'Crée d’abord une activité avant de lui affecter un budget.';
    valide = false;
  }
  const doublon = donnees.budgets.some(function (budget) {
    return budget.id !== idBudgetModification && budget.mois === mois && budget.type === type &&
      (type === 'categorie' ? budget.categorie === categorie : (type === 'activite' ? budget.activiteId === activiteId : true));
  });
  if (doublon) {
    document.getElementById('erreur-budget-doublon').textContent = 'Ce budget existe déjà pour ce mois ; modifie le budget existant.';
    valide = false;
  } else {
    document.getElementById('erreur-budget-doublon').textContent = erreurPortee;
  }
  if (!valide) return null;
  return { type: type, mois: mois, montant: montant, seuil: seuil,
    categorie: type === 'categorie' ? categorie : '', activiteId: type === 'activite' ? activiteId : '' };
}

function enregistrerBudget() {
  const valeurs = validerFormulaireBudget();
  if (!valeurs) return;
  const avant = JSON.stringify(donnees);
  if (idBudgetModification) {
    Object.assign(donnees.budgets.find(function (b) { return b.id === idBudgetModification; }), valeurs);
  } else {
    donnees.budgets.push(Object.assign({ id: nouvelIdentifiant() }, valeurs));
  }
  if (!enregistrerDonnees()) {
    donnees = JSON.parse(avant);
    rendreTout();
    return;
  }
  document.getElementById('mois-budget').value = valeurs.mois;
  document.getElementById('voile-budget').classList.add('cache');
  proposerAnnulation(avant, 'Budget enregistré.');
  rendreTout();
}

function supprimerBudget(id) {
  const budget = donnees.budgets.find(function (b) { return b.id === id; });
  if (!budget || !confirm('Supprimer ce budget ? Les transactions ne seront pas modifiées.')) return;
  const avant = JSON.stringify(donnees);
  donnees.budgets = donnees.budgets.filter(function (b) { return b.id !== id; });
  if (!enregistrerDonnees()) donnees = JSON.parse(avant);
  else proposerAnnulation(avant, 'Budget supprimé.');
  document.getElementById('voile-budget').classList.add('cache');
  rendreTout();
}

/* Efface toutes les données de l'appareil, après deux
   confirmations (action définitive). */
function effacerToutesLesDonnees() {
  if (!confirm('Effacer TOUTES les données enregistrées sur cet appareil ?')) {
    return;
  }
  if (!confirm("Cette action est définitive. Confirmer l'effacement ?")) {
    return;
  }
  try {
    localStorage.removeItem(CLE_STOCKAGE);
    donnees = donneesVides();
    stockageEnErreur = false;
    messageErreurStockage = '';
    document.getElementById('alerte-stockage').hidden = true;
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(donnees));
  } catch (erreur) {
    stockageEnErreur = true;
    messageErreurStockage = "Le navigateur n'a pas pu effacer ou réinitialiser les données.";
    afficherErreurStockage();
    return;
  }
  moisFiltre = aujourdhuiISO().slice(0, 7);
  masquerAnnulation();
  rendreTout();
}

/* ---------- 13. Branchement des événements ---------- */

/* Met à jour tout ce qui s'affiche à l'écran. */
function rendreTout() {
  rendreActivites();
  rendreBudgets();
  rendreObjectifs();
  rendreInvestissements();
  rendreTableauDeBord();
  remplirFiltreMois();
  rendreTransactions();
  rendreParametres();
  rendreRappelSauvegarde();
  rendreRapport();
}

/* Associe chaque bouton de la page à sa fonction. */
function installerEcouteurs() {

  /* Navigation par onglets. */
  document.querySelectorAll('[data-ecran]').forEach(function (onglet) {
    onglet.addEventListener('click', function () {
      afficherEcran(onglet.dataset.ecran);
    });
  });

  /* Roue dentée : écran Paramètres. */
  document.getElementById('btn-parametres').addEventListener('click', function () {
    afficherEcran('parametres');
  });

  document.getElementById('btn-nouvelle-activite').addEventListener('click', function () { ouvrirFormulaireActivite(null); });
  document.getElementById('btn-nouveau-budget').addEventListener('click', function () { ouvrirFormulaireBudget(null); });
  document.getElementById('btn-nouvel-objectif').addEventListener('click', function () { ouvrirFormulaireObjectif(null); });
  document.getElementById('mois-budget').addEventListener('change', rendreBudgets);
  document.getElementById('budget-type').addEventListener('change', actualiserTypeBudget);
  document.getElementById('formulaire-activite').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerActivite();
  });
  document.getElementById('formulaire-budget').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerBudget();
  });
  document.getElementById('formulaire-objectif').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerObjectif();
  });
  document.getElementById('formulaire-cotisation').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerCotisation();
  });
  document.getElementById('formulaire-achat').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerAchatObjectif();
  });
  document.querySelectorAll('[data-fermer]').forEach(function (bouton) {
    bouton.addEventListener('click', function () {
      document.getElementById('voile-' + bouton.dataset.fermer).classList.add('cache');
    });
  });
  document.getElementById('btn-supprimer-activite').addEventListener('click', function () { supprimerActivite(idActiviteModification); });
  document.getElementById('btn-supprimer-budget').addEventListener('click', function () { supprimerBudget(idBudgetModification); });

  /* Boutons d'ajout rapide (accueil et écran Transactions).
     data-ouvrir contient 'depense', 'revenu' ou 'transfert'. */
  document.querySelectorAll('[data-ouvrir]').forEach(function (bouton) {
    bouton.addEventListener('click', function () {
      document.getElementById('voile-feuille').classList.add('cache');
      ouvrirFormulaire(bouton.dataset.ouvrir, null);
    });
  });

  /* Choix de la période du tableau de bord. */
  document.getElementById('choix-periode').addEventListener('change', function (e) {
    periode.mode = e.target.value;
    /* Les deux dates ne s'affichent qu'en mode personnalisé. */
    document.getElementById('dates-personnalisees').classList.toggle('cache', periode.mode !== 'perso');
    rendreTableauDeBord();
  });

  /* Bouton + : feuille de choix du type d'opération. */
  const feuille = document.getElementById('voile-feuille');
  document.querySelectorAll('[data-action="feuille"]').forEach(function (bouton) {
    bouton.addEventListener('click', function () { feuille.classList.remove('cache'); });
  });
  document.querySelectorAll('[data-action="cotiser"]').forEach(function (bouton) {
    bouton.addEventListener('click', function () {
      feuille.classList.add('cache');
      ouvrirFormulaireCotisation(null);
    });
  });

  document.getElementById('date-debut').addEventListener('change', function (e) {
    periode.debut = e.target.value;
    rendreTableauDeBord();
  });

  document.getElementById('date-fin').addEventListener('change', function (e) {
    periode.fin = e.target.value;
    rendreTableauDeBord();
  });

  /* Filtre par mois de l'écran Transactions. */
  document.getElementById('filtre-mois').addEventListener('change', function (e) {
    moisFiltre = e.target.value;
    rendreTransactions();
  });

  /* Formulaire : enregistrer, annuler, supprimer. */
  document.getElementById('formulaire-transaction').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerFormulaire();
  });
  document.getElementById('btn-annuler').addEventListener('click', fermerFormulaire);
  document.getElementById('btn-supprimer').addEventListener('click', function () {
    supprimerTransaction(idEnModification);
  });

  /* Cliquer sur le fond sombre (hors carte) ferme le formulaire. */
  document.getElementById('voile-formulaire').addEventListener('click', function (e) {
    if (e.target.id === 'voile-formulaire') {
      fermerFormulaire();
    }
  });
  document.querySelectorAll('.voile').forEach(function (voile) {
    voile.addEventListener('click', function (e) {
      if (e.target === voile) voile.classList.add('cache');
    });
  });

  /* La touche Échap ferme aussi les formulaires. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.voile').forEach(function (voile) { voile.classList.add('cache'); });
    }
  });

  /* Investissements */
  document.getElementById('btn-nouvel-investissement').addEventListener('click', function () { ouvrirFormulaireInvestissement(null); });
  document.getElementById('formulaire-investissement').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerInvestissement();
  });
  document.getElementById('formulaire-operation').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerOperationInvestissement();
  });
  document.getElementById('operation-type').addEventListener('change', actualiserTypeOperation);

  /* Rapports */
  document.querySelectorAll('[data-raccourci]').forEach(function (chip) {
    chip.addEventListener('click', function () { choisirRaccourciRapport(chip.dataset.raccourci); });
  });
  ['rapport-debut', 'rapport-fin'].forEach(function (idChamp) {
    document.getElementById(idChamp).addEventListener('change', function () {
      periodeRapport = { debut: document.getElementById('rapport-debut').value, fin: document.getElementById('rapport-fin').value };
      document.querySelectorAll('[data-raccourci]').forEach(function (chip) { chip.classList.remove('actif'); });
      rendreRapport();
    });
  });
  document.getElementById('btn-csv-transactions').addEventListener('click', exporterTransactionsCSV);
  document.getElementById('btn-csv-rapport').addEventListener('click', exporterRapportCSV);

  /* Paramètres */
  document.getElementById('formulaire-devise').addEventListener('submit', function (e) {
    e.preventDefault();
    enregistrerDevise();
  });
  document.getElementById('formulaire-categorie').addEventListener('submit', function (e) {
    e.preventDefault();
    ajouterCategorie();
  });
  document.getElementById('param-rappel').addEventListener('change', enregistrerRappel);

  /* Dès que l'on corrige un champ, son message d'erreur disparaît. */
  const champsSuivis = ['champ-montant', 'champ-date', 'champ-categorie', 'champ-source', 'champ-destination'];
  for (const id of champsSuivis) {
    const champ = document.getElementById(id);
    const effacerErreurChamp = function () {
      document.getElementById('erreur-' + id.replace('champ-', '')).textContent = '';
      champ.closest('.champ').classList.remove('invalide');
    };
    champ.addEventListener('input', effacerErreurChamp);
    champ.addEventListener('change', effacerErreurChamp);
  }

  document.getElementById('champ-type').addEventListener('change', actualiserChampsType);

  document.getElementById('btn-exporter').addEventListener('click', exporterSauvegarde);
  document.getElementById('btn-rappel-exporter').addEventListener('click', exporterSauvegarde);
  document.getElementById('btn-annuler-derniere').addEventListener('click', annulerDerniereAction);
  document.getElementById('btn-exporter-brut').addEventListener('click', exporterContenuBrut);
  document.getElementById('fichier-sauvegarde').addEventListener('change', function (e) {
    restaurerSauvegarde(e.target.files[0]);
  });

  /* Paramètres : effacement complet des données. */
  document.getElementById('btn-effacer-donnees').addEventListener('click', effacerToutesLesDonnees);
}

/* ---------- 14. Démarrage ---------- */

/* Le script est chargé avec "defer" : le HTML est complètement
   construit quand ces lignes s'exécutent. */
chargerDonnees();
if (stockageEnErreur) afficherErreurStockage();
moisFiltre = aujourdhuiISO().slice(0, 7);
document.getElementById('mois-budget').value = aujourdhuiISO().slice(0, 7);

/* Valeurs de départ de la période personnalisée : tout le mois
   en cours (pratique si l'on veut juste raccourcir la période). */
periode.debut = premierJourMois(new Date());
periode.fin = aujourdhuiISO();
document.getElementById('date-debut').value = periode.debut;
document.getElementById('date-fin').value = periode.fin;

periodeRapport = { debut: premierJourMois(new Date()), fin: dernierJourMois(new Date()) };
document.getElementById('rapport-debut').value = periodeRapport.debut;
document.getElementById('rapport-fin').value = periodeRapport.fin;

installerEcouteurs();
rendreTout();

let minuteurRedimension = null;
window.addEventListener('resize', function () {
  clearTimeout(minuteurRedimension);
  minuteurRedimension = setTimeout(rendreGraphiques, 150);
});
demanderStockagePersistant();

/* Le service worker rend l'application installable et conserve
   une copie de l'interface pour la consultation hors ligne.
   Il nécessite HTTPS ou localhost. */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./service-worker.js').catch(function () {
      /* L'application reste utilisable en ligne si l'enregistrement échoue. */
    });
  });
}
