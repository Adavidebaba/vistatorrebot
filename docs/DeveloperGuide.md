# Guida Sviluppatori – VistaTorre Chatbot

Questa guida descrive l'architettura e le convenzioni operative dell'applicazione in modo che un nuovo sviluppatore possa intervenire in sicurezza e velocemente.

## 1. Visione d'insieme
- **Scopo**: chatbot per gli ospiti con capacità di escalation via email verso il gestore.
- **Componenti principali**: backend Node.js/Express, frontend statico vanilla JS, database SQLite (better-sqlite3), integrazione LLM (OpenAI/xAI) e sistema di notifiche email (Nodemailer).
- **Pattern organizzativi**: ogni responsabilità è incapsulata in classi dedicate (ViewModel, Manager, Coordinator, Service). Evitare classi/funzioni lunghe: <40 linee per funzione, <200 linee per classe.

## 2. Flusso di avvio
1. `src/server.js` crea `EnvironmentConfig`, `DatabaseManager`, esegue le migrazioni con `SchemaMigrator` e poi avvia `AppServer`.
2. `AppServer` costruisce tutte le dipendenze (repository, servizi, router) e registra i middleware Express.
3. Il client statico è servito su `/static` e la dashboard admin è montata su `/admin`.

## 3. Stack e dipendenze principali
| Area | Librerie | Note |
| --- | --- | --- |
| Web server | Express, express-session, cookie-parser | Sessioni salvate in memoria (in produzione usare store esterni).
| DB | better-sqlite3 | File SQLite in `data/`. Tutte le query passano dai repository.
| LLM | openai, servizi personalizzati | Selezione dinamica modello tramite `LlmModelProvider`.
| Email | nodemailer | Configurata via `EnvironmentConfig.smtpConfig`.
| UI | HTML/CSS statico + `public/main.js` | Nessun framework; logica lato client minima.

## 4. Struttura backend
```
src/
  app/             -> Configurazione Express (AppServer)
  config/          -> Accesso variabili ambiente (EnvironmentConfig)
  database/        -> Gestione DB e migrazioni
  middleware/      -> Middleware Express (sessioni, auth admin)
  repositories/    -> Query DB isolate per entità
  routes/          -> Router pubblici e admin (render HTML server side)
  services/        -> Business logic suddivisa per dominio (chat, escalation, admin, logs, llm)
  utils/           -> Helpers trasversali (Logger, LogNotifier)
public/            -> Assets statici (UI chat)
```
Ogni cartella contiene classi dedicate alla singola responsabilità, rispettando il principio di composizione.

## 5. Configurazione ambiente
Le variabili sono lette da `.env` tramite `EnvironmentConfig`. Parametri chiave:
- `PORT`, `ADMIN_PASSWORD`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- Email fallback: `ADMIN_EMAIL_TO`
- LLM: `LLM_API_KEY`, `LLM_MODEL`, `LLM_MODEL_PRIMARY`, `LLM_MODEL_FALLBACK`, `LLM_PROVIDER_*`
- Prompt: `LLM_SYSTEM_PROMPT`
- Documentazione: `GOOGLE_DOC_PUBLIC_URL`

> Se `ADMIN_EMAIL_TO` non è definita, assicurarsi di impostare l'email del gestore dalla dashboard (vedi sezione 7).

## 6. Persistenza e repository
Il database è creato da `SchemaMigrator`:
- **sessions**: stato sessione utente (inizio, ultimo accesso, lingua, flag escalation).
- **messages**: trascrizione chat con ruolo, contenuto, confidenza.
- **escalations**: storico escalation inviate con categoria e dettagli.
- **escalation_contacts**: gestione raccolta contatti/approvazioni durante escalation.
- **docs_cache / doc_chunks**: cache documentazione esterna e embedding.
- **settings**: preferenze editabili da dashboard (prompt, url documentazione, email admin, ecc.).

I repository incapsulano l'accesso ai dati; non usare query raw fuori da essi. Per nuove entità creare sempre un repository dedicato.

## 7. Dashboard amministrativa
- **Accesso**: `/admin` protetto da password (`ADMIN_PASSWORD`).
- **Preferenze modificabili** (`/admin/preferences`):
  - Link documentazione
  - Email amministratore (usata per tutte le notifiche)
  - Prompt di sistema LLM
- **Modello LLM**: selezionabile se configurati modelli multipli.
- **Sessioni**: elenco con filtri (7/30 giorni), dettaglio conversazioni, export CSV, pulizia.
- **Documentazione**: pulsante per forzare refresh del documento esterno.

Il rendering HTML è gestito da `AdminPageRenderer`. Modifiche UI importanti devono rimanere sotto le 400 linee complessive.

## 8. Gestione chat e escalation
- **ChatCoordinator** orchestration layer. Dipendenze principali:
  - `LlmChatService`: invoca i modelli e interpreta la risposta (`LlmResponseParser`).
  - `EscalationPromptManager`: prepara messaggi di conferma lato client.
  - `EscalationContactManager`: persiste stato raccolta contatti e promemoria.
  - `EmailNotificationService`: invia email per escalation e alert log.
  - `DocumentManager`: gestisce contenuti contestuali dal documento pubblico.
  - `EscalationIntentDetector`: fallback per classificare l'intenzione dell'assistente.
- I messaggi sono salvati via `MessageRepository`; lo stato sessione aggiornato via `SessionRepository`.

### 8.1 Sequenza di gestione messaggi
1. **Entrata messaggio**: `ChatCoordinator.handleMessage` salva subito il messaggio utente e aggiorna la lingua di sessione.
2. **Stato escalation**: se la sessione è in attesa di conferma (`EscalationContactManager.isAwaitingConfirmation`) viene inviata la richiesta di conferma; se è in attesa contatto (`isAwaitingContact`) viene sollecitato il dato mancante.
3. **Richiesta LLM**: per messaggi regolari, `LlmChatService.generateResponse` compone il prompt, seleziona il modello attivo e invia la richiesta. Con `LOG_LEVEL=debug` vengono loggati payload completi inviati e ricevuti.
4. **Decisione**: `ChatCoordinator.resolveEscalationDecision` analizza la risposta LLM e stabilisce se è necessaria l’escalation (uso di `interaction_type`, `should_collect_contact`, o fallback intent con `EscalationIntentDetector`).
5. **Prompt utente**: se serve conferma, `EscalationPromptManager` costruisce il prompt localizzato e lo spedisce al frontend insieme alla risposta LLM.
6. **Persistenza**: la risposta finale (eventualmente arricchita con richiesta contatto) viene salvata in `messages` e la sessione aggiornata.

### 8.2 Stati escalation e raccolta contatti
- `EscalationContactManager` mantiene per sessione:
  - `awaiting_confirmation`: l’utente deve confermare che desidera l’escalation.
  - `pending`: è richiesto un contatto (es. telefono) prima di notificare il gestore.
  - `ready`: tutte le informazioni sono disponibili, si procede all’invio.
- I metodi principali:
  - `markAwaitingConfirmation` registra il motivo e se servono contatti aggiuntivi.
  - `ensurePending` crea/aggiorna il record quando manca il contatto.
  - `storeManagerMessage` conserva eventuali note LLM da inoltrare al gestore.
  - `buildContactRequestMessage` genera il testo localizzato da inviare all’utente (usando `EscalationLocalizationService`).
  - `clear` azzera lo stato dopo invio email.

### 8.3 Invio escalation
1. Quando la sessione è pronta, `ChatCoordinator.processEscalation` marca la sessione come escalata in `sessions`.
2. `handleEscalation` recupera gli ultimi 6 messaggi (`MessageRepository.getRecentMessages`), eventuali contatti e note gestore.
3. `EmailNotificationService.sendEscalationEmail` costruisce il corpo email con tipo, motivo, contatti e conversazione.
4. Viene registrato un record in `escalations` con categoria (`missing_info`, `non_urgent`, `urgent`) e dettagli.
5. Errori invio email sono loggati con livello error (e quindi notificati via `LogAlertManager`).

### 8.4 Flussi di fallback
- Se il modello LLM non restituisce `interaction_type`, `EscalationIntentDetector` analizza il testo per dedurre se è urgente.
- Se il modello restituisce contenuto non JSON, `LlmChatService` usa il fallback e conserva l’output raw.
- In caso di errori LLM, viene restituito un messaggio standard e non si forza escalation.
- Il frontend mostra badge “Escalation” per le risposte con `escalated=true` o prompt di conferma da `escalationPrompt`.
## 9. Notifiche email
- **Escalation**: `EmailNotificationService.sendEscalationEmail` costruisce un riepilogo (ultimi 6 messaggi) e lo invia al destinatario configurato.
- **Alert log**: `LogAlertManager` ascolta il `logNotifier` e spedisce email per log `warn`/`error`. I logger usano sempre `Logger.for('<Classe>')`.
- **Configurazione destinatario**: `AdminEmailSettingsManager` risolve l'email dall'impostazione dashboard o dalle variabili ambiente.

Per nuove tipologie di email, aggiungere metodi dedicati su `EmailNotificationService` mantenendo separata la formattazione dal trasporto.

## 10. Frontend pubblico
- Lato client, `public/main.js` gestisce l'interfaccia chat, lo stato di caricamento, e l'invio dei messaggi.
- Vengono mostrati badge e prompt di escalation basandosi sulla risposta del backend.
- Qualsiasi nuova funzionalità UI deve mantenere la logica in funzioni piccole. Per interazioni complesse creare controller dedicati simili a `EscalationPromptController`.

## 11. Logging
- `Logger` centralizza i log: imposta `LOG_LEVEL` per filtrare (default `info`).
- Ogni warn/error genera notifiche via `logNotifier`. Se l'email admin non è configurata, gli alert vengono ignorati ma la console continua a loggare.

## 12. Workflow di sviluppo
1. **Installazione**: `npm install`.
2. **Avvio**: `npm run dev` (con nodemon) o `npm start`.
3. **Variabili ambiente**: preparare `.env` copiando da un template condiviso.
4. **Database**: i file risiedono in `data/`. Prima di eseguire script o test automatizzati, creare un backup di tutti i file `data/easyroom.db*` e ripristinarli appena terminata l'esecuzione per evitare perdita dati.
5. **Stile**: mantenere file <500 linee; quando una classe cresce valutare estrazione in nuove classi/servizi.
6. **Testing manuale**: verificare sempre flusso escalation (chat -> email) e accesso dashboard dopo modifiche rilevanti.

## 13. Estensioni e best practice
- **Nuovi servizi**: posizionare in `src/services/<dominio>`; fornire dipendenze tramite costruttore ed esporre metodi con responsabilità unica.
- **Nuovi endpoint**: creare router dedicati o estendere quelli esistenti mantenendo metodi corti. Validare input e delegare a servizi/manager.
- **Integrazioni esterne**: incapsulare in classi separate (es. `DocumentManager`).
- **Traduzioni/UI**: usare `EscalationLocalizationService` come riferimento per generare fallback locali.
- **Configurabilità**: nuove preferenze utente devono passare per `SettingsRepository` tramite manager dedicati.

## 14. Troubleshooting rapido
| Problema | Possibile causa | Rimedio |
| --- | --- | --- |
| Email non inviate | SMTP non configurato o email admin vuota | Verificare `.env` e campo in dashboard. Controllare log warn/error. |
| Prompt escalation non tradotto | Errore localizzazione | Consultare log (verrà inviata email di alert) e aggiornare `EscalationLocalizationService`. |
| Chat non risponde | LLM offline o chiave errata | Controllare log, testare chiave via `curl` o dashboard provider. |
| Dashboard inaccessibile | Password admin errata o sessioni corrotte | Resettare `ADMIN_PASSWORD`, riavviare server. |

Per dubbi aperti documentare la soluzione direttamente in `docs/` mantenendo i file sotto 400 linee.
