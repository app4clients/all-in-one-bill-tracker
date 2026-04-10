# All-in-One Bill Tracker - Guide Final (Complet)

## 1) Etat final du projet

Ce projet regroupe les besoins fonctionnels et techniques demandes:

- Gestion des bills/subscriptions (add/edit/delete/mark paid)
- Smart Add avec templates (predefinis + edition templates)
- Recherche et filtres (nom/statut/categorie)
- Dashboard simple (total, upcoming, categories, timeline)
- Smart notifications (due soon, renewals, unusual spending)
- Notification sonore le jour d'echeance (Premium uniquement)
- Budget Guard avec alertes 80% et 100% (Premium)
- Backup & Restore JSON (Premium)
- App Lock PIN (set/unlock/remove)
- Localisation FR/EN/AR + devises MAD/EUR/USD/GBP
- Conversion devise en temps reel (fallback local si API indisponible)
- UX feedback: glow boutons + toasts metier
- Branding: logo dans l'app + favicon/PWA icon
- Free vs Premium avec limites fonctionnelles claires
- Prix recommandes: 19 MAD/mois, 149 MAD/an

## 2) Structure monnetisation retenue (optimale)

### Free
- Limite creation items: 10
- Publicite active
- Pas de Budget Guard
- Pas de Backup/Restore

### Premium
- Items illimites
- Pas de publicite
- Budget Guard
- Backup/Restore
- Notification sonore due day

## 3) Billing production (Google Play uniquement pour Android)

- Produits Play Console:
  - `premium_monthly`
  - `premium_yearly`
- Flux securise:
  1. App charge les offres Billing
  2. Achat in-app
  3. Recuperation `purchaseToken`
  4. Envoi au backend
  5. Verification Google Play Developer API
  6. Activation entitlement cote serveur uniquement

Important:
- Ne jamais activer Premium uniquement cote application.
- Verifier entitlement a chaque ouverture de l'app.

## 4) Backend securise disponible

Fichiers backend:
- `server/index.js`
- `server/googlePlay.js`
- `server/db.js`
- `server/schema.sql`

Fonctions backend:
- Validation purchase token
- Verification actif/refund/expiration
- Persistance abonnements + events
- Endpoint entitlement pour rafraichissement au lancement

## 5) Correctifs Android Studio (bloquants)

Consulter `ANDROID_STUDIO_FIXES.md` pour details complets.

### A) Invalid Gradle JDK
- Mettre Gradle JDK sur Embedded JDK:
  - `C:\Program Files\Android\Android Studio\jbr`

### B) Duplicate Kotlin classes
- Forcer `kotlin_version = '1.8.22'`
- Exclure `kotlin-stdlib-jdk7/jdk8`
- Ajouter Kotlin BOM dans `android/app/build.gradle`
- Nettoyer cache dependencies puis rebuild

### C) minSdk Cordova
- Si `cordovaAndroidVersion = 12.0.1`, imposer `minSdkVersion = 24`

## 6) Etapes build et test APK (pas a pas)

### 6.1 Build web
```bash
npm install
npm run build
```

### 6.2 Ajouter/sync Android
```bash
npx cap add android
npx cap sync android
npx cap open android
```

Si Android existe deja, ignorer `add android`.

### 6.3 Build APK debug (Android Studio)
1. `Build > Build Bundle(s) / APK(s) > Build APK(s)`
2. Recuperer:
   - `android/app/build/outputs/apk/debug/app-debug.apk`

### 6.4 Build AAB release (Play Store)
1. `Build > Generate Signed Bundle / APK`
2. Choisir `Android App Bundle`
3. Choisir/creer keystore
4. Variant `release`
5. Recuperer:
   - `android/app/build/outputs/bundle/release/app-release.aab`

## 7) Checklist QA avant publication

- Signup/Login + message "Bonjour [username]"
- Logout et retour login
- Free limit items OK
- Upgrade Premium via Billing OK
- Restore purchase OK
- Backup/Restore Premium OK
- Budget Guard Premium OK
- Smart notifications OK
- Son due-day Premium OK
- App Lock PIN OK
- Entitlement serveur correct apres restart

## 8) Fichiers de reference dans le projet

- Vision complete: `PROJECT_FINAL_MASTER_SPEC.md`
- Correctifs Android: `ANDROID_STUDIO_FIXES.md`
- Billing prod: `BILLING_PRODUCTION_GUIDE.md`
- Signup prod: `SIGNUP_PRODUCTION_GUIDE.md`
