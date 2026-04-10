# All-in-One Bill Tracker - Final Master Specification

## 1) Vision produit finale

Objectif: application simple, rapide et fiable pour ne plus oublier les factures/abonnements, avec un modele Free -> Premium rentable et conforme Google Play.

Positionnement retenu:
- UX prioritaire (actions rapides, peu de friction)
- Localisation utile (FR/EN/AR + devise)
- Premium clair (valeur concrete)
- Securite forte (validation serveur obligatoire pour Premium)

## 2) Fonctionnalites consolidees (sans suppression)

### 2.1 Gestion des depenses
- Ajout d'items (bill/subscription)
- Edition complete d'un item
- Edition rapide inline (amount + due day)
- Suppression item
- Action Mark as paid

### 2.2 Smart Add + Templates
- Templates predefinis (Rent/Internet/Netflix/Gym)
- Application instantanee d'un template
- Gestion templates (create/update/delete)

### 2.3 Dashboard clair
- Total mensuel
- Upcoming payments
- Category breakdown simple
- Timeline des paiements

### 2.4 Smart notifications
- Due today/tomorrow/in N days
- Renewals tomorrow
- Depense inhabituelle (+40% vs mois precedent)
- Notification sonore le jour de paiement (Premium only)

### 2.5 Budget Guard
- Budget mensuel configurable
- Alertes 80% / 100%
- Barre de progression
- Feature Premium

### 2.6 Search & Filter
- Recherche nom
- Filtres due soon / paid / unpaid
- Filtre categorie

### 2.7 Localisation et devise
- Langues FR / EN / AR
- MAD par defaut
- Devise selectionnable: MAD / EUR / USD / GBP
- Taux de change live avec fallback local

### 2.8 Securite utilisateur
- App Lock PIN (set/lock/unlock/remove)
- Toasts de confirmation (PIN saved / removed)

### 2.9 Backup & Restore
- Export JSON
- Import JSON
- Feature Premium

### 2.10 Branding
- Logo integre dans l'app
- Icone web/PWA
- Background thematique

### 2.11 UX feedback
- Glow action sur clic bouton (primary/success/danger)
- Toasts metier (item added/updated/deleted)

## 3) Monnetisation finale retenue (autonome + pertinente)

### 3.1 Plan Free
- Limite creation items: 10
- Ads actives
- Pas de Budget Guard
- Pas de Backup/Restore

### 3.2 Plan Premium (abonnement)
- Items illimites
- Suppression pub
- Backup/Restore
- Budget Guard
- Notifications sonores due day

### 3.3 Prix recommandes
- Mensuel: 19 MAD
- Annuel: 149 MAD

## 4) Architecture technique cible (production)

### 4.1 Frontend (React)
- UI Free/Premium explicite
- Verrouillages fonctionnels par entitlement serveur
- Aucune activation Premium client-only

### 4.2 Android (Google Play Billing)
- Produits: premium_monthly / premium_yearly
- Flux: query offers -> launch billing -> purchaseToken -> backend verify

### 4.3 Backend (Node)
- Endpoint verify Google token
- Endpoint entitlement au demarrage app
- Stockage DB subscriptions + events
- Verification statut actif/refund/expire

## 5) Regles de securite obligatoires

- Ne jamais activer premium uniquement dans l'app
- Valider chaque purchaseToken cote serveur
- Verifier entitlement a chaque ouverture de l'app
- Bloquer reuse d'un token sur un autre user
- Garder la cle service account uniquement sur serveur
- HTTPS obligatoire en prod

## 6) Cas de vie abonnements (doivent etre couverts)

- Achat reussi -> activation Premium apres validation serveur
- Achat annule -> rester Free
- Erreur paiement -> rester Free
- Remboursement -> revocation Premium
- Expiration -> revocation Premium

## 7) Definition of done (version finale stable)

Le projet est considere "pret" quand:
- Build web OK
- Build Android OK
- Billing teste en internal track
- Entitlement serveur confirme au restart app
- Free/Premium gates valides
- Aucun conflit Gradle/Kotlin
- QA fonctionnelle complete passee