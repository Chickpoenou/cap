# Cahier des charges — application personnelle de suivi financier et d'activités

**Dossier du projet :** `suivi-activites`
**Date :** 27 septembre 2026
**Statut :** version 2 — base validée ; étapes 1 à 6 implémentées (application en version 0.6), en attente de validation à l'usage

---

## 1. Présentation

**Nom provisoire :** Cap  
**Type :** application web installable (PWA), utilisable sur téléphone et ordinateur.  
**Langue initiale :** français.  
**Devise initiale :** FCFA (XOF), modifiable.  
**Utilisation :** saisie manuelle, avec accès hors ligne et synchronisation facultative en ligne.

### Objectif

Permettre à Nettanel de suivre ses revenus, dépenses, activités, investissements et objectifs d'épargne, de comparer ses prévisions à ses résultats réels et de recevoir des alertes lorsqu'un budget ou un objectif dévie.

L'application aide à suivre et à décider. Elle ne garantit pas le rendement d'une activité ou d'un investissement et ne remplace pas un conseil financier.

## 2. Utilisateur cible

Une personne qui souhaite :

- organiser ses activités professionnelles et personnelles ;
- connaître ses revenus, ses dépenses et son solde ;
- estimer si une activité couvre ses coûts ;
- épargner pour un achat en suivant les cotisations ;
- recevoir des alertes de budget ou de retard ;
- retrouver ses données sur téléphone et ordinateur, y compris hors ligne.

## 3. Principes de fonctionnement

1. **Saisie manuelle en première version.** Aucun accès bancaire automatique n'est requis.
2. **Utilisation hors ligne.** Les données sont enregistrées sur l'appareil et l'interface reste utilisable sans connexion.
3. **Sauvegarde.** L'application doit permettre d'exporter une sauvegarde lisible et de la restaurer.
4. **Synchronisation facultative.** La synchronisation entre appareils sera proposée dans une version ultérieure, avec une gestion explicite des conflits.
5. **Séparation des flux.** Une cotisation à un objectif d'épargne est une affectation interne de l'argent, pas une dépense supplémentaire. Le véritable achat est compté comme dépense au moment où il est effectué.

## 4. Modules fonctionnels

### 4.1 Tableau de bord

Afficher pour la période sélectionnée :

- revenus reçus ;
- dépenses payées ;
- solde net de la période ;
- budgets consommés et alertes ;
- activités en cours ;
- objectifs d'épargne et leur progression ;
- valeur ou solde des investissements saisis manuellement.

L'utilisateur peut choisir une période : mois en cours, mois précédent ou dates personnalisées.

### 4.2 Activités et projets

Exemples de départ :

- Génie civil ;
- Soutien scolaire ;
- Création de sites web ;
- Travaux de maison ;
- Sport et santé.

Pour chaque activité, l'utilisateur peut renseigner :

- nom, catégorie, description et statut ;
- budget ou montant investi ;
- revenus attendus et revenus reçus ;
- dépenses prévues et dépenses payées ;
- heures travaillées ;
- date de début et, si nécessaire, date de fin ;
- objectif financier facultatif.

**Calculs affichés :**

- résultat de trésorerie = revenus reçus − dépenses payées ;
- reste du budget = budget fixé − dépenses payées ;
- revenu net par heure, si des heures et des revenus ont été saisis ;
- comparaison entre prévisions et résultats réels.

Une activité peut être marquée comme idée, en cours, en pause ou terminée.

### 4.3 Transactions

L'utilisateur peut ajouter, modifier ou supprimer une entrée ou une sortie.

Champs :

- type : revenu, dépense ou transfert interne ;
- montant et devise ;
- date ;
- catégorie ;
- activité ou objectif lié, facultatif ;
- moyen de paiement, facultatif ;
- note et justificatif, facultatifs.

Pour un transfert interne, l'origine et la destination sont obligatoires. Le transfert ne compte ni comme revenu ni comme dépense ; il sert à suivre le déplacement ou l'affectation de l'argent, notamment vers un objectif d'épargne.

Les totaux doivent être recalculés immédiatement après chaque modification.

### 4.4 Budgets et alertes

L'utilisateur peut créer un budget mensuel général ou des budgets par catégorie et activité.

Seuils d'alerte proposés par défaut, entièrement modifiables :

- notification à 80 % du budget consommé ;
- notification à 100 % ou en cas de dépassement ;
- avertissement si un projet dépasse son budget prévu ;
- rappel à la date choisie pour mettre à jour les dépenses et revenus.

Les alertes apparaissent dans l'application. Les notifications du téléphone ou de l'ordinateur sont facultatives et nécessitent l'autorisation de l'utilisateur. Sans autorisation ou connexion, les alertes restent visibles dans l'application.

### 4.5 Objectifs d'épargne et cotisations

L'utilisateur peut créer un objectif d'achat ou d'épargne avec :

- nom de l'objectif ;
- prix cible ;
- montant déjà épargné ;
- date à laquelle l'argent est souhaité ;
- fréquence de cotisation : hebdomadaire ou mensuelle ;
- montant facultatif de cotisation ;
- compte ou réserve concernée, facultatif.

**Calculs affichés :**

- montant restant = prix cible − montant affecté à l'objectif ;
- cotisation nécessaire par période = montant restant ÷ périodes restantes jusqu'à la date cible ;
- progression en pourcentage ;
- date estimée d'atteinte, si les cotisations enregistrées permettent de l'estimer.

À chaque cotisation enregistrée, les montants restants, la progression et le rythme conseillé sont recalculés immédiatement.

L'application peut signaler qu'une cotisation prévue est manquante ou que la date cible risque d'être dépassée, sur la base des données saisies. Elle ne déplace pas réellement l'argent entre comptes.

**Cycle d'achat :**

1. L'utilisateur crée l'objectif d'achat.
2. Il enregistre ses cotisations au fil du temps.
3. Lorsqu'il effectue l'achat, il choisit « Achat effectué » et saisit le prix réel.
4. L'application enregistre une seule dépense réelle, clôt l'objectif ou le laisse ouvert selon le choix de l'utilisateur.
5. Si le prix change ou la date est repoussée, l'application recalcule le plan.

### 4.6 Investissements

L'utilisateur peut suivre séparément un investissement en saisissant :

- nom ou type ;
- montant investi ;
- dates des apports ;
- valeur actuelle estimée, saisie manuellement ;
- frais ou revenus associés ;
- notes.

L'application affiche les apports cumulés, la valeur saisie et l'écart estimé. Elle n'effectue pas de recommandation d'achat, de vente ou de rendement futur.

### 4.7 Rapports

Rapports consultables par mois, période, catégorie ou activité :

- revenus et dépenses ;
- résultat net ;
- budgets et dépassements ;
- temps passé par activité ;
- progrès des objectifs d'épargne ;
- investissements saisis et variation estimée.

Les données peuvent être exportées en CSV. Une sauvegarde complète peut être exportée en JSON et restaurée. Une restauration remplace les données existantes après confirmation.

## 5. Écrans

1. **Accueil / Tableau de bord**
2. **Ajouter une transaction**
3. **Activités et détail d'une activité**
4. **Budgets et alertes**
5. **Objectifs d'épargne et détail d'un objectif**
6. **Investissements**
7. **Rapports**
8. **Paramètres et sauvegarde**

Sur téléphone, l'ajout rapide d'une dépense, d'un revenu ou d'une cotisation doit être accessible depuis l'accueil.

## 6. Exigences d'interface et d'accessibilité

- Interface en français, adaptée aux petits et grands écrans.
- Montants affichés avec une séparation claire des milliers et la devise.
- Les revenus, dépenses, prévisions et valeurs estimées doivent être distingués visuellement et par libellé, pas uniquement par couleur.
- Les formulaires doivent signaler les champs manquants et les montants invalides.
- L'utilisateur doit pouvoir annuler ou corriger une saisie récente.

## 7. Données et confidentialité

- Les données financières appartiennent à l'utilisateur.
- La première version ne demande ni identifiant bancaire ni accès à un compte financier.
- L'utilisateur doit pouvoir exporter ses données et effacer toutes ses données locales depuis les paramètres.
- L'application doit indiquer clairement si les données sont enregistrées seulement sur l'appareil ou synchronisées.
- Une sauvegarde régulière est recommandée ; l'application doit rappeler que la saisie hors ligne seule ne protège pas contre la perte de l'appareil.

## 8. Critères d'acceptation

La première version est considérée utilisable si l'utilisateur peut :

- installer l'application depuis un navigateur compatible et l'utiliser sur téléphone et ordinateur ;
- créer une activité et lui associer revenus, dépenses et heures ;
- consulter le résultat réel d'une activité ;
- créer un budget et voir une alerte au seuil défini ;
- créer un objectif d'achat, saisir une cotisation et voir le montant restant recalculé immédiatement ;
- saisir l'achat effectué sans compter les cotisations comme des dépenses supplémentaires ;
- continuer à saisir et consulter les données hors ligne ;
- exporter puis restaurer ses données ;
- consulter des totaux mensuels cohérents avec les opérations saisies.

## 9. Périmètre de la première version

**Inclus :**

- suivi manuel des opérations ;
- activités et projets ;
- budgets et alertes dans l'application ;
- objectifs d'épargne et cotisations ;
- suivi manuel des investissements ;
- fonctionnement hors ligne ;
- export et sauvegarde.

**Reporté :**

- connexion bancaire automatique ;
- synchronisation multiappareil en temps réel ;
- paiements ou transferts d'argent ;
- prédiction garantie de rentabilité ;
- conseils d'investissement ;
- notifications fiables lorsque l'application est fermée sur tous les appareils.

## 10. Ordre de réalisation recommandé

1. Définir les écrans et les catégories.
2. Construire le tableau de bord, la saisie des transactions et les sauvegardes JSON.
3. Ajouter et suivre les activités, budgets et alertes (implémenté en version 0.3).
4. Ajouter objectifs d'épargne et calcul des cotisations (implémenté en version 0.4 ; date estimée, rappel de sauvegarde et annulation en version 0.5).
5. Ajouter investissements et rapports (implémenté en version 0.6, avec export CSV).
   - 5 bis (à faire) : pré-remplir une transaction en collant un SMS de confirmation Mobile Money ; analyse sur l'appareil uniquement, validation par l'utilisateur.
6. Vérifier l'utilisation hors ligne, l'export et la restauration (vérifié en version 0.6 ; catégories, devise et rappel de mise à jour modifiables dans Paramètres).
7. Ajouter la synchronisation en ligne seulement après validation de la version personnelle hors ligne.

---

## Annexe — choix techniques (atelier Qoder)

- **HTML + CSS + JavaScript simples**, sans framework ni compilation : code expliquable ligne par ligne.
- **Commentaires en français** dans le code.
- **Stockage local** du navigateur (localStorage) + export/import d'un fichier `.json` ; export CSV pour les rapports.
- **PWA** : `manifest.json` + `service-worker.js` + icônes pour l'installation et le hors ligne.
- **Hébergement** : site statique sur Render, https://cap-ook7.onrender.com, redéployé automatiquement à chaque envoi sur la branche `main` du dépôt GitHub. Les données étant liées à l'adresse du site, c'est la seule adresse à utiliser.
- **Devise** : FCFA (XOF), formatée avec séparation des milliers.

### Précisions de la version 0.6

- Les apports à un investissement, comme les cotisations, ne sont pas comptés comme dépenses. Un revenu perçu d'un investissement ne compte dans le solde que s'il est aussi saisi comme revenu dans Transactions.
- Variation estimée d'un investissement sur une période = valeur saisie à la fin − valeur au début − apports de la période.
- Les exports CSV utilisent le séparateur « ; » et l'encodage UTF-8 pour Excel en français ; ils sont exclus du dépôt Git.
- Le rappel de mise à jour apparaît dans les alertes de l'accueil ; les notifications du système ne sont pas gérées.

### Charte graphique (version 0.9)

Logo : pastille de verre « CAP » vue de face, au dégradé cyan → violet, avec barres montantes et flèche de croissance. Les icônes sont découpées dans l'image d'origine, fond transparent ; sur Android et iPhone, la pièce est posée sur l'indigo profond de l'application.

| Rôle | Couleur | Usage |
|---|---|---|
| Cyan du logo | `#46dde6` | début du dégradé de marque |
| Bleu du logo | `#4a8bc4` | milieu du dégradé |
| Indigo du logo | `#4f58b6` | courbe du graphique |
| Violet du logo | `#7b4fcf` | fin du dégradé, contour de focus |
| Dégradé de marque | `#46dde6 → #4a8bc4 → #6a4fc4 → #7b3cbf` | bouton +, barres de progression, aire du graphique |
| Dégradé sombre | `#1f3f8a → #33307f → #4e2a8e` | carte « Solde net » |
| Indigo profond | `#1c1a4d` | menu, barre d'onglets, infobulles |
| Cyan d'action | `#2fd3e0` (texte `#10123a`) | boutons principaux, onglet actif |
| Violet des liens | `#5b47d1` | liens (« Tout voir ») |
| Revenus | `#0a7f93` sur `#dbf7fa` | montants et icônes d'entrée |
| Dépenses | `#d0453a` sur `#fde3df` | icônes de sortie, dépassements |
| Épargne | `#6a45c9` sur `#eee8fc` | cotisations |
| Attention | `#7a5200` sur `#fdf3d6` | alertes, rappel de sauvegarde |
| Fond / blocs | `#f1f3fb` / `#ffffff` | arrière-plan et cartes |
| Texte / secondaire | `#141a3a` / `#5c6385` | encre principale et secondaire |
| Catégories (graphique) | `#14a3bd`, `#e0a019`, `#7a52cc`, `#e0603f`, autres `#9aa0bd` | cyan et violet du logo + ambre et corail, pour rester distinguables par les daltoniens |

### Interface (version 0.8)

- Ordinateur : menu bleu nuit à gauche avec un accès direct à chaque écran (Paramètres en bas), contenu centré.
- Accueil « Aperçu financier » : période et bouton « Nouvelle saisie » en haut, rappel de sauvegarde, trois chiffres clés (revenus, dépenses, solde net sur carte sombre), graphique du solde cumulé jour par jour avec infobulle, anneau des dépenses par catégorie (4 plus grosses + « Autres », montant et part écrits dans la légende), objectifs, alertes, dernières transactions, activités et investissements.
- Téléphone : barre d'onglets en bas (Accueil, Transactions, Activités, Épargne, Plus) et bouton + flottant ; Budgets, Rapports et Paramètres sont dans « Plus », Investissements dans « Épargne ».
- Graphiques dessinés en SVG sans bibliothèque externe, pour rester utilisables hors ligne ; palette des catégories vérifiée pour le daltonisme.
- La suppression d'une transaction se fait depuis son formulaire de modification.

### Catégories de dépenses par défaut (modifiables dans Paramètres)

1. Transport
2. Matériel et fournitures
3. Formation et cours
4. Internet et crédit
5. Alimentation
6. Santé et sport
7. Maison et travaux
8. Outils et services
9. Divers

### Fichiers prévus

```
suivi-activites/
├── CAHIER_DES_CHARGES.md   <- ce document
├── index.html              <- structure des écrans
├── style.css               <- apparence (mobile et PC)
├── app.js                  <- logique : données, calculs, alertes
├── manifest.json           <- métadonnées d'installation PWA
├── service-worker.js       <- cache de l'interface hors ligne
├── logo-96.png             <- logo (menu de l'application)
├── favicon-48.png          <- icône de l'onglet du navigateur
├── icone-*.png             <- icônes d'installation (192, 512, maskable)
├── apple-touch-icon.png    <- icône d'écran d'accueil sur iPhone
├── .gitignore              <- exclusions des fichiers personnels
└── VERSIONNAGE_GIT.md      <- aide-mémoire des versions locales
```
