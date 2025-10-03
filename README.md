# Chatbot Affittacamere – MVP

Questo progetto fornisce un MVP per un assistente virtuale dedicato a una struttura con quattro camere. L'applicazione è composta da un backend Node.js/Express con database SQLite, un'integrazione con un modello LLM e una semplice interfaccia web per gli ospiti e un pannello amministrativo protetto.

## Requisiti

- Node.js 20+
- Dipendenze definite in `package.json`
- File `.env` configurato (vedi `.env.example`)

## Setup

```bash
npm install
cp .env.example .env
# aggiornare lo `.env` con le credenziali reali (OpenAI e, se usato, xAI)
```

Variabili principali legate ai modelli LLM:

- `LLM_MODEL_PRIMARY` / `LLM_PROVIDER_PRIMARY`: modello e provider predefiniti (`openai` o `xai`).
- `LLM_MODEL_FALLBACK` / `LLM_PROVIDER_FALLBACK`: coppia alternativa usata in fallback automatico.
- `LLM_API_KEY`: chiave OpenAI.
- `XAI_API_KEY`: chiave xAI (richiesta solo se selezioni un modello Grok).

## Avvio

```bash
npm run dev
# oppure
npm start
```

L'applicazione espone la chat su `http://localhost:3000/` e l'area amministrativa su `http://localhost:3000/admin`.

## Funzionalità principali

- Gestione sessioni tramite cookie UUID salvate nel database
- Registrazione messaggi e escalation con email via Nodemailer
- Recupero conoscenza da Google Docs con caching e chunking dinamico
- Ricerca semantica tramite embeddings e chiamata all'LLM con prompt JSON-only
- Selezione runtime del modello LLM (OpenAI o xAI) con fallback configurabile dal pannello admin
- Dashboard amministrativa con filtro temporale, dettaglio conversazioni, refresh documento e export CSV

## Testing manuale suggerito

1. Verificare la risposta in lingua quando si inviano messaggi in italiano, inglese o spagnolo
2. Porre domande non presenti nel documento per verificare l'escalation `missing_info`
3. Simulare scenari urgenti (es. "odore di gas") per l'escalation `urgent`
4. Controllare la visibilità delle conversazioni e l'export CSV nell'area admin
5. Usare il pulsante "Aggiorna documento" per forzare il refresh della knowledge base

## Backup database

Prima di eseguire eventuali test automatici o manovre invasive, effettuare un backup dei file nella cartella `data/` come indicato nelle istruzioni operative.
