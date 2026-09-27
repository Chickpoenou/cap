/* ============================================================
   Cap — logique de l'application
   Étapes 1 à 3 : navigation, transactions, activités et budgets.
   Toutes les données sont enregistrées dans le stockage local
   du navigateur (localStorage), rien n'est envoyé sur Internet.
   ============================================================ */

/* ---------- 1. Constantes et état ---------- */

/* Nom de la "clé" sous laquelle les données sont enregistrées
   dans le stockage local du navigateur. */
const CLE_STOCKAGE = 'cap-donnees';

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

/* Toutes les données de l'application, chargées au démarrage.
   Les listes activites, objectifs et investissements sont vides
   pour l'instant : elles seront remplies aux étapes 3, 4 et 5. */
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
    const lues = JSON.parse(brut);
    if (!structureValide(lues)) {
      throw new Error('Structure invalide');
    }
    donnees = lues;
    donnees.version = 1;
    donnees.activites = Array.isArray(donnees.activites) ? donnees.activites : [];
    donnees.objectifs = Array.isArray(donnees.objectifs) ? donnees.objectifs : [];
    donnees.investissements = Array.isArray(donnees.investissements) ? donnees.investissements : [];
    donnees.budgets = Array.isArray(donnees.budgets) ? donnees.budgets : [];
    donnees.reglages = donnees.reglages || {};
    donnees.reglages.devise = donnees.reglages.devise || 'FCFA';
    donnees.reglages.categories = Array.isArray(donnees.reglages.categories)
      ? donnees.reglages.categories
      : CATEGORIES_DEFAUT.slice();
  } catch (erreur) {
    donnees = donneesVides();
    stockageEnErreur = true;
    messageErreurStockage = "Les données enregistrées sont illisibles. Elles ont été préservées ; restaure une sauvegarde ou exporte les données endommagées avant de réinitialiser.";
  }
}

function donneesVides() {
  return {
    version: 1,
    transactions: [],
    activites: [],
    objectifs: [],
    investissements: [],
    budgets: [],
    reglages: { devise: 'FCFA', categories: CATEGORIES_DEFAUT.slice() }
  };
}

function structureValide(objet) {
  return objet !== null && typeof objet === 'object' &&
    Array.isArray(objet.transactions) && objet.transactions.every(transactionValide) &&
    (objet.activites === undefined || (Array.isArray(objet.activites) && objet.activites.every(activiteValide))) &&
    objetsValides(objet.objectifs) &&
    objetsValides(objet.investissements) &&
    (objet.budgets === undefined || (Array.isArray(objet.budgets) && objet.budgets.every(budgetValide))) &&
    (objet.reglages === undefined || (objet.reglages !== null && typeof objet.reglages === 'object'));
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

function objetsValides(liste) {
  return liste === undefined || (Array.isArray(liste) && liste.every(function (element) {
    return element !== null && typeof element === 'object' && !Array.isArray(element);
  }));
}

function transactionValide(transaction) {
  return transaction !== null && typeof transaction === 'object' &&
    typeof transaction.id === 'string' &&
    ['revenu', 'depense', 'transfert'].includes(transaction.type) &&
    Number.isSafeInteger(transaction.montant) && transaction.montant > 0 &&
    typeof transaction.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date) &&
    ['categorie', 'activiteId', 'moyen', 'note', 'justificatif', 'source', 'destination'].every(function (cle) {
      return transaction[cle] === undefined || typeof transaction[cle] === 'string';
    }) &&
    (transaction.creeLe === undefined || Number.isFinite(transaction.creeLe));
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
  afficherEtatSauvegarde('Sauvegarde JSON téléchargée. Conserve une copie hors de cet appareil.');
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
    const candidate = contenu && contenu.application === 'Cap' ? contenu.donnees : contenu;
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
    donnees = candidate;
    donnees.version = 1;
    donnees.activites = Array.isArray(donnees.activites) ? donnees.activites : [];
    donnees.objectifs = Array.isArray(donnees.objectifs) ? donnees.objectifs : [];
    donnees.investissements = Array.isArray(donnees.investissements) ? donnees.investissements : [];
    donnees.budgets = Array.isArray(donnees.budgets) ? donnees.budgets : [];
    donnees.reglages = donnees.reglages || {};
    donnees.reglages.devise = donnees.reglages.devise || 'FCFA';
    donnees.reglages.categories = Array.isArray(donnees.reglages.categories) ? donnees.reglages.categories : CATEGORIES_DEFAUT.slice();
    stockageEnErreur = false;
    messageErreurStockage = '';
    document.getElementById('alerte-stockage').hidden = true;
    moisFiltre = aujourdhuiISO().slice(0, 7);
    rendreTout();
    afficherEtatSauvegarde('Sauvegarde restaurée avec succès.');
  } catch (erreur) {
    afficherEtatSauvegarde('Impossible de restaurer ce fichier : vérifie qu’il s’agit d’une sauvegarde JSON valide de Cap.');
  } finally {
    document.getElementById('fichier-sauvegarde').value = '';
  }
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

/* Sécurité : remplace les caractères spéciaux (&, <, >...) d'un
   texte saisi par l'utilisateur avant de l'afficher en HTML.
   Cela empêche qu'un texte contenant du code HTML casse la page. */
function echapper(texte) {
  const remplacements = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  return String(texte).replace(/[&<>"']/g, function (c) {
    return remplacements[c];
  });
}

/* ---------- 4. Navigation entre les écrans ---------- */

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
  document.querySelectorAll('.onglet').forEach(function (onglet) {
    onglet.classList.toggle('actif', onglet.dataset.ecran === nom);
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

  const reel = document.createElement('p');
  reel.className = 'resume-financier';
  reel.textContent = 'Revenus reçus : ' + formaterMontant(chiffres.revenus) +
    ' · Dépenses payées : ' + formaterMontant(chiffres.depenses) +
    ' · Résultat : ' + formaterMontant(chiffres.solde);
  carte.appendChild(reel);

  if (activite.budget !== null && activite.budget !== undefined) {
    const reste = activite.budget - chiffres.depenses;
    const budget = document.createElement('p');
    budget.className = reste < 0 ? 'texte-alerte' : 'note';
    budget.textContent = 'Budget prévu : ' + formaterMontant(activite.budget) +
      ' · ' + (reste >= 0 ? 'Reste ' + formaterMontant(reste) : 'Dépassement ' + formaterMontant(Math.abs(reste)));
    carte.appendChild(budget);
  }

  const previsions = [];
  if (activite.revenuPrevu !== null && activite.revenuPrevu !== undefined) previsions.push('Revenu prévu : ' + formaterMontant(activite.revenuPrevu));
  if (activite.depensesPrevues !== null && activite.depensesPrevues !== undefined) previsions.push('Dépenses prévues : ' + formaterMontant(activite.depensesPrevues));
  if (activite.heures > 0) previsions.push('Résultat net par heure : ' + formaterMontant(Math.round(chiffres.solde / activite.heures)));
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
    modifier.className = 'btn btn-secondaire';
    modifier.textContent = 'Modifier';
    modifier.addEventListener('click', function () { ouvrirFormulaireActivite(activite.id); });
    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'btn btn-secondaire';
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

function rendreResumeActivites() {
  const conteneur = document.getElementById('resume-activites');
  conteneur.replaceChildren();
  const actives = donnees.activites.filter(function (activite) { return activite.statut === 'encours'; }).slice(0, 3);
  if (!actives.length) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Aucune activité marquée « En cours ».';
    conteneur.appendChild(note);
    return;
  }
  for (const activite of actives) conteneur.appendChild(construireCarteActivite(activite, true));
}

function moisAlertesTableau() {
  const bornes = bornesPeriode();
  if (periode.mode === 'mois' || periode.mode === 'moisPrecedent') return bornes.debut.slice(0, 7);
  if (bornes.debut && bornes.fin && bornes.debut.slice(0, 7) === bornes.fin.slice(0, 7)) return bornes.debut.slice(0, 7);
  return '';
}

function rendreAlertesBudget() {
  const liste = document.getElementById('alertes-budget');
  const vide = document.getElementById('alertes-vides');
  liste.replaceChildren();
  const mois = moisAlertesTableau();
  if (!mois) {
    vide.textContent = 'Pour afficher les alertes, choisis une période qui reste dans un seul mois.';
    vide.hidden = false;
    return;
  }
  const alertes = donnees.budgets.filter(function (budget) {
    return budget.mois === mois && depensesBudget(budget) >= budget.montant * budget.seuil / 100;
  });
  vide.textContent = alertes.length ? '' : 'Aucune alerte de budget pour cette période.';
  vide.hidden = alertes.length > 0;
  for (const budget of alertes) {
    const utilise = depensesBudget(budget);
    const li = document.createElement('li');
    li.textContent = nomPorteeBudget(budget) + ' : ' + formaterMontant(utilise) + ' dépensés sur ' +
      formaterMontant(budget.montant) + (utilise > budget.montant ? ' — budget dépassé.' : ' — seuil de ' + budget.seuil + ' % atteint.');
    liste.appendChild(li);
  }
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
    modifier.className = 'btn btn-secondaire';
    modifier.textContent = 'Modifier';
    modifier.addEventListener('click', function () { ouvrirFormulaireBudget(budget.id); });
    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'btn btn-secondaire';
    supprimer.textContent = 'Supprimer';
    supprimer.addEventListener('click', function () { supprimerBudget(budget.id); });
    actions.append(modifier, supprimer);
    carte.appendChild(actions);
    liste.appendChild(carte);
  }
}

/* ---------- 7. Tableau de bord (accueil) ---------- */

/* Met à jour les totaux et le libellé de la période. */
function rendreTableauDeBord() {
  const resume = totaux(transactionsDeLaPeriode());

  document.getElementById('total-revenus').textContent = formaterMontant(resume.revenus);
  document.getElementById('total-depenses').textContent = formaterMontant(resume.depenses);

  const elementSolde = document.getElementById('total-solde');
  /* Le "+" n'est écrit que pour un solde positif ; le signe "-"
   est déjà ajouté automatiquement par le formatage des nombres. */
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
  rendreAlertesBudget();
  rendreResumeActivites();
}

/* ---------- 8. Écran Transactions ---------- */

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
  let texte = 'Revenus : ' + formaterMontant(resume.revenus) +
    ' · Dépenses : ' + formaterMontant(resume.depenses) +
    ' · Solde : ' + (resume.solde > 0 ? '+' : '') + formaterMontant(resume.solde);
  if (resume.transferts > 0) {
    texte += ' · Transferts internes : ' + formaterMontant(resume.transferts) + ' (non comptés dans le solde)';
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
      titre.textContent = formaterDateLongue(tr.date);
      ul.appendChild(titre);
    }
    ul.appendChild(construireLigne(tr));
  }
}

/* Construit une ligne de l'historique pour une transaction. */
function construireLigne(tr) {
  const li = document.createElement('li');
  li.className = 'transaction';

  /* Libellés selon le type. */
  const signe = tr.type === 'revenu' ? '+' : (tr.type === 'depense' ? '−' : '⇄');
  const libelleType = tr.type === 'revenu' ? 'Revenu' : (tr.type === 'depense' ? 'Dépense' : 'Transfert interne');

  /* Détail affiché en petit : type, catégorie, activité liée. */
  const details = [libelleType, tr.categorie, nomActivite(tr.activiteId)]
    .filter(function (partie) { return partie !== '' && partie !== undefined; })
    .join(' · ');
  const detailsTransfert = tr.type === 'transfert' && (tr.source || tr.destination)
    ? ' · ' + echapper(tr.source || 'Origine inconnue') + ' → ' + echapper(tr.destination || 'Destination inconnue')
    : '';

  /* Le corps de la ligne est un bouton : le toucher ouvre la
     modification. echapper() protège l'affichage des textes saisis. */
  const noteAffichee = tr.note ? echapper(tr.note) : libelleType;
  const corps = document.createElement('button');
  corps.type = 'button';
  corps.className = 'corps-transaction';
  corps.title = 'Modifier cette transaction';
  corps.innerHTML =
    '<span class="t-sens type-' + tr.type + '">' + signe + '</span>' +
    '<span class="t-infos">' +
    '<strong>' + noteAffichee + '</strong>' +
    '<small>' + echapper(details) + detailsTransfert + '</small>' +
    '</span>' +
    '<span class="t-montant type-' + tr.type + '">' +
    (tr.type === 'revenu' ? '+' : (tr.type === 'depense' ? '−' : '')) + formaterMontant(tr.montant) +
    '</span>';
  corps.addEventListener('click', function () { ouvrirFormulaire('modification', tr.id); });
  li.appendChild(corps);

  /* Petit bouton "×" pour supprimer, à droite de la ligne. */
  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'bouton-supprimer';
  supprimer.textContent = '×';
  supprimer.title = 'Supprimer cette transaction';
  supprimer.setAttribute('aria-label', 'Supprimer la transaction du ' + formaterDateCourte(tr.date));
  supprimer.addEventListener('click', function () { supprimerTransaction(tr.id); });
  li.appendChild(supprimer);

  return li;
}

/* Nom d'une activité à partir de son identifiant. */
function nomActivite(id) {
  if (!id) {
    return '';
  }
  const activite = donnees.activites.find(function (a) { return a.id === id; });
  return activite ? activite.nom : '';
}

/* ---------- 9. Formulaire d'ajout et de modification ---------- */

/* Ouvre le formulaire.
   - mode 'depense', 'revenu' ou 'transfert' : ajout pré-rempli ;
   - mode 'modification' : formulaire rempli avec la transaction
     désignée par id. */
function ouvrirFormulaire(mode, id) {
  modeFormulaire = mode;
  idEnModification = id || null;

  remplirChoixCategories();
  remplirChoixActivites();

  const champType = document.getElementById('champ-type');
  const titre = document.getElementById('titre-formulaire');
  const boutonSupprimer = document.getElementById('btn-supprimer');

  if (mode === 'modification') {
    const tr = donnees.transactions.find(function (t) { return t.id === id; });

    champType.value = tr.type;
    document.getElementById('champ-montant').value = tr.montant;
    document.getElementById('champ-date').value = tr.date;
    document.getElementById('champ-categorie').value = tr.categorie || '';
    document.getElementById('champ-activite').value = tr.activiteId || '';
    document.getElementById('champ-moyen').value = tr.moyen || '';
    document.getElementById('champ-note').value = tr.note || '';
    document.getElementById('champ-justificatif').value = tr.justificatif || '';
    document.getElementById('champ-source').value = tr.source || '';
    document.getElementById('champ-destination').value = tr.destination || '';

    titre.textContent = 'Modifier la transaction';
    boutonSupprimer.hidden = false;
  } else {
    reinitialiserFormulaire();
    champType.value = mode; /* 'depense', 'revenu' ou 'transfert' */

    const titres = {
      depense: 'Ajouter une dépense',
      revenu: 'Ajouter un revenu',
      transfert: 'Ajouter un transfert interne'
    };
    titre.textContent = titres[mode] || 'Ajouter une transaction';
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
    signalerErreur('montant', 'Entre un montant entier en FCFA (au moins 1).');
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
    tr.moyen = moyen;
    tr.note = note;
    tr.justificatif = justificatif;
    tr.source = valeurs.source;
    tr.destination = valeurs.destination;
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
  const confirmation = confirm('Supprimer ' + libelleType + ' de ' + formaterMontant(tr.montant) + ' ?');
  if (!confirmation) {
    return;
  }

  /* filter() garde toutes les transactions sauf celle-ci. */
  const avantSuppression = JSON.stringify(donnees);
  donnees.transactions = donnees.transactions.filter(function (t) { return t.id !== id; });
  if (!enregistrerDonnees()) {
    donnees = JSON.parse(avantSuppression);
    rendreTout();
    return;
  }
  fermerFormulaire();
  rendreTout();
}

/* ---------- 10. Paramètres ---------- */

/* Affiche la liste des catégories dans l'écran Paramètres. */
function rendreParametres() {
  const ul = document.getElementById('liste-categories-parametres');
  ul.innerHTML = '';

  for (const categorie of donnees.reglages.categories) {
    const li = document.createElement('li');
    li.textContent = categorie;
    ul.appendChild(li);
  }
}

/* Efface toutes les données de l'appareil, après deux
   confirmations (action définitive). */
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
  rendreTout();
}

function supprimerBudget(id) {
  const budget = donnees.budgets.find(function (b) { return b.id === id; });
  if (!budget || !confirm('Supprimer ce budget ? Les transactions ne seront pas modifiées.')) return;
  const avant = JSON.stringify(donnees);
  donnees.budgets = donnees.budgets.filter(function (b) { return b.id !== id; });
  if (!enregistrerDonnees()) donnees = JSON.parse(avant);
  rendreTout();
}

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
  rendreTout();
}

/* ---------- 11. Branchement des événements ---------- */

/* Met à jour tout ce qui s'affiche à l'écran. */
function rendreTout() {
  rendreActivites();
  rendreBudgets();
  rendreTableauDeBord();
  remplirFiltreMois();
  rendreTransactions();
  rendreParametres();
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
      ouvrirFormulaire(bouton.dataset.ouvrir, null);
    });
  });

  /* Choix de la période du tableau de bord. */
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('actif'); });
      chip.classList.add('actif');
      periode.mode = chip.dataset.periode;
      /* Les deux dates ne s'affichent qu'en mode personnalisé. */
      document.getElementById('dates-personnalisees').classList.toggle('cache', periode.mode !== 'perso');
      rendreTableauDeBord();
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
  ['voile-activite', 'voile-budget'].forEach(function (idVoile) {
    document.getElementById(idVoile).addEventListener('click', function (e) {
      if (e.target.id === idVoile) e.target.classList.add('cache');
    });
  });

  /* La touche Échap ferme aussi le formulaire. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      fermerFormulaire();
      document.getElementById('voile-activite').classList.add('cache');
      document.getElementById('voile-budget').classList.add('cache');
    }
  });

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
  document.getElementById('btn-exporter-brut').addEventListener('click', exporterContenuBrut);
  document.getElementById('fichier-sauvegarde').addEventListener('change', function (e) {
    restaurerSauvegarde(e.target.files[0]);
  });

  /* Paramètres : effacement complet des données. */
  document.getElementById('btn-effacer-donnees').addEventListener('click', effacerToutesLesDonnees);
}

/* ---------- 12. Démarrage ---------- */

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

installerEcouteurs();
rendreTout();

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
