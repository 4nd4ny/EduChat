# UC-23 — Dicter et écouter les réponses

| | |
|---|---|
| **Acteur principal** | Apprenant (souvent sur smartphone), avec sa clé personnelle ou en classe |
| **Acteurs secondaires** | Fournisseur de transcription (OpenAI `gpt-4o-mini-transcribe` / `whisper-1`, Mistral Voxtral), synthèse vocale Voxtral (Mistral), synthèse du navigateur (repli), école (paie sur son réseau) |
| **Déclencheur** | Clic sur le micro (dictée) ou activation du haut-parleur (mode vocal) dans la zone de saisie du chat |
| **Pages** | `src/chat/VoiceControls.tsx` (rendu par `src/chat/ChatInput.tsx` si `(clé utilisable ou clé interne) && voice`), `src/pages/chat.tsx` |
| **API** | `POST /api/transcribe`, `POST /api/speak` |
| **Code serveur** | `src/pages/api/transcribe.ts`, `src/pages/api/speak.ts`, `src/server/access.ts` (`mayUseServerKeys`, `isRateLimited`), `src/server/userKeys.ts` (`readUserKey`), `src/server/etablissements.ts` (`resolveEtablissementByIp`), `src/shared/providers.ts` (`voice`, `ERR`) |

## Objectif

Parler au tuteur plutôt que taper, et entendre ses réponses. L'audio enregistré est **transcrit**
par le fournisseur choisi (sans être stocké ni journalisé côté EduChat) ; la réponse est **lue**
par Voxtral quand le fournisseur est Mistral et qu'une voix existe dans la langue du lecteur,
sinon par la synthèse du navigateur (gratuite, rien ne quitte l'appareil).

## Préconditions

- Fournisseur doté d'une transcription (`voice` : OpenAI, Mistral).
- Une clé : saisie dans la page, mémorisée sur le compte, ou — sur le réseau ouvert d'une école —
  la clé interne de l'école.
- Navigateur autorisé à utiliser le micro (MediaRecorder : `audio/webm` ou `audio/mp4` sur Safari).

## Scénario nominal — dictée puis lecture, clé personnelle

1. L'apprenant clique sur le micro : `getUserMedia`, enregistrement ; second clic : arrêt.
2. Le navigateur envoie `POST /api/transcribe { provider, apiKey?, mimeType, audio (base64) }`
   avec le jeton de compte.
3. Le serveur prend la clé tapée, sinon la clé **mémorisée** du compte, vérifie la capacité `voice`,
   le type audio (base, codec ignoré) et la taille (15 Mo), puis relaie en multipart
   (`audio.<ext>`) : OpenAI `gpt-4o-mini-transcribe` (repli `whisper-1`) ou Mistral
   `voxtral-mini-latest`. Réponse `200 { text }`, **aucune ligne de journal**.
4. Mode vocal inactif : le texte est ajouté à la zone de saisie (dictée). Mode vocal actif : il est
   **envoyé** directement (UC-11).
5. Mode vocal actif et réponse complète : sur Mistral, `POST /api/speak { text, locale, apiKey? }`.
   Le serveur (texte nettoyé, borné à 2000 caractères) interroge le catalogue des voix (gardé 24 h
   en mémoire), choisit la voix de la langue (deux premières lettres), appelle
   `voxtral-mini-tts-latest` et rend un MP3 (`audio/mpeg`, `Cache-Control: private, no-store`).

## Scénarios alternatifs

- **A1 — Clé mémorisée.** Champ vide + jeton : `readUserKey(email, provider)` (dictée) ou
  `readUserKey(email, 'mistral')` (lecture).
- **A2 — En classe.** Sans clé personnelle, sur le réseau d'une école dont la salle est ouverte ou
  dans ses horaires : clé interne du fournisseur. Dictée journalisée (`voxtral-mini-latest (dictée)`
  ou `transcription`), lecture journalisée (`voxtral-mini-tts (lecture)`), avec IP et établissement,
  jetons **estimés** à `max(1, round(caractères / 4))`. La dictée refuse un fournisseur écarté ou à
  drapeau rouge (`403 ERR_PROVIDER_NOT_ALLOWED`) avant tout contrôle de capacité.
- **A3 — Lecture par le navigateur.** Fournisseur autre que Mistral, ou toute réponse non 200 de
  `/api/speak` (pas de clé, pas de voix dans la langue, refus) : `speechSynthesis` du navigateur,
  langue `fr-FR`/`en-US`/`it-IT`/`de-DE`, texte débarrassé du Markdown.
- **A4 — Repli whisper-1.** Si `gpt-4o-mini-transcribe` échoue chez OpenAI.

## Scénarios d'erreur

| Cas | Réponse |
|---|---|
| Méthode autre que `POST` (les deux routes) | `405 ERR_METHOD_NOT_ALLOWED` |
| Plus de 20 requêtes / min / IP (par route) | `429 ERR_RATE_LIMIT` |
| Dictée : fournisseur inconnu | `400 ERR_PROVIDER_UNSUPPORTED` |
| Dictée : aucune clé (ni tapée, ni mémorisée, ni école ouverte) | `403 ERR_VOICE_KEY` |
| Dictée : clé d'école pour un fournisseur écarté / drapeau rouge | `403 ERR_PROVIDER_NOT_ALLOWED` |
| Dictée : fournisseur sans transcription | `400 ERR_VOICE_UNSUPPORTED` |
| Dictée : type non admis, audio absent, > 15 Mo, ou vide après décodage | `400 ERR_VOICE_INVALID` |
| Dictée : fournisseur en erreur | `502 ERR_UPSTREAM` |
| Lecture : texte vide | `400 ERR_EMPTY_CONVERSATION` |
| Lecture : aucune clé Mistral | `403 ERR_VOICE_KEY` |
| Lecture : pas de voix dans la langue, ou catalogue injoignable | `415 ERR_TTS_NO_VOICE` |
| Lecture : synthèse refusée ou sans audio | `502 ERR_TTS_FAILED` |

## Règles métier et sécurité

- L'audio n'est ni stocké ni journalisé ; une clé personnelle ne laisse **aucune** trace en base.
- Une clé mémorisée ne repart jamais vers le navigateur (déchiffrée côté serveur au moment d'appeler).
- La clé de l'école ne se dépense que **depuis son réseau** (`mayUseServerKeys` : IP de l'école et
  salle ouverte ou horaire) — jamais pour un visiteur hors campus.
- Un français ne sera jamais lu par une voix anglaise : sans voix de la langue, le serveur répond
  415 et le navigateur prend le relais.

## Postconditions

- Clé d'école : une ligne `usage_log` (`used_server_key = 1`, IP, établissement, `montant = 0`).
- Sinon : aucun effet persistant.

## Tests

### Unitaires — `tests/unit/uc23-voix/`

| Fichier | Code testé | Cas couverts |
|---|---|---|
| `voix.test.ts` | `providerDefaults.voice`, `ERR`, `storeUserKey`/`readUserKey`/`forgetUserKey`/`listUserKeyProviders`, `mayUseServerKeys` | fournisseurs vocaux et leur admissibilité scolaire, clé chiffrée en base et relue, clé altérée illisible, clé d'école : hors réseau, sans verrou, verrou refermé, horaires |

### Fonctionnels — `tests/functional/uc23-voix/`

| Scénario | Test |
|---|---|
| Nominal (dictée) | `dictee.test.ts` : OpenAI multipart, modèle, nom et contenu du fichier, aucun journal |
| A4 | repli whisper-1 |
| Nominal / A1 | Mistral Voxtral, extensions par type ; clé mémorisée |
| A2 (dictée) | salle ouverte Mistral / OpenAI : clé interne et journal avec IP ; drapeaux rouges et écartés refusés ; réseau fermé → `ERR_VOICE_KEY` ; école à sec servie (anomalie) |
| Erreurs (dictée) | sans clé ; fournisseur sans voix ; inconnu ; audio invalide (type, vide, taille, base64) ; amont en erreur ; méthode ; 20 req/min |
| Nominal (lecture) | `lecture.test.ts` : voix de la langue, MP3, en-têtes, aucun journal ; `en-GB` ; cache du catalogue ; texte borné ; clé mémorisée |
| A2 (lecture) | salle ouverte : clé interne Mistral, journal avec IP |
| A3 / erreurs | pas de voix → 415 sans synthèse ; catalogue injoignable → 415 ; synthèse refusée ou vide → 502 ; sans clé → 403 ; texte vide ; méthode ; 20 req/min |

## Anomalies constatées

- **Commentaires contredits par le code.** `src/pages/api/transcribe.ts:10-17` annonce une
  transcription « STRICTEMENT en clé personnelle… Aucune clé serveur n'est jamais utilisée », et
  `src/chat/VoiceControls.tsx:8` « réservé à la clé PERSONNELLE » ; or `transcribe.ts:75-91` (et
  `speak.ts:75-78`) dépensent la clé interne de l'école sur son réseau, et `ChatInput.tsx:50` affiche
  le micro avec la seule clé interne.
- **Clé de l'école dépensée sans contrôle ni décompte.** Contrairement à `/api/completion`
  (`ERR_SCHOOL_NO_CREDIT`, quotas mensuel et par élève, fournisseurs de la séance, `decompter`),
  `transcribe.ts:75-91` et `speak.ts:75-78` ne vérifient ni le crédit, ni les quotas, ni la séance,
  et les lignes `usage_log` (`transcribe.ts:137`, `speak.ts:106`) ne portent ni tarif ni `montant` :
  une école à sec continue de payer dictée et lecture chez le fournisseur sans que son porte-monnaie
  ne soit débité. Test : « porte-monnaie de l'école à sec : la dictée est quand même servie… ».
