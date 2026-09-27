# Suivre les versions avec Git

Git est initialisé dans ce dossier. Fais les commandes dans le terminal de Qoder, ouvert dans `suivi-activites`.

## Première version

```powershell
git status
git add .
git commit -m "Version initiale de Cap"
```

## Après une modification importante

```powershell
git status
git diff
git add .
git commit -m "Décris la modification"
```

Exemples de messages :

- `Ajoute les sauvegardes JSON`
- `Ajoute les transferts entre réserves`
- `Ajoute le fonctionnement hors ligne`

## Revenir à une version précédente

Consulte les versions avec `git log --oneline`. Pour annuler une modification non enregistrée, examine d'abord `git diff` et utilise les commandes de restauration de Qoder ou Git seulement si tu veux réellement abandonner ce travail.

Les fichiers de sauvegarde financière exportés sont exclus par `.gitignore` et ne doivent pas être ajoutés au dépôt.
