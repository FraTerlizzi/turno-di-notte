# Turno di Notte

Casi clinici animati di infermieristica. Ogni livello è un episodio: guardi la scena, leggi i parametri al monitor, apri la lente sul corpo per vedere cosa succede dentro, poi decidi cosa fare e perché.

- **Stagione 1 · Primo turno**: 12 episodi, ognuno con valutazione ABCDE, decisioni, fisiologia al volo e fonti.
- **Fuori turno**: 10 emergenze fuori dall'ospedale, giocate in un terminale 8-bit.
- **Glossario**: farmaci, termini clinici ed esami, collegati automaticamente al testo del gioco.
- **Neuro**: il cervellino che dà fino a 3 aiuti per caso.
- Colonna sonora chiptune originale, sintetizzata nel browser.

> Gioco didattico. Dosi e procedure seguono linee guida internazionali, ma in reparto valgono sempre la prescrizione medica e i protocolli della propria struttura.

## Installarlo come app

Il gioco è una **PWA**: si installa dal browser, funziona offline e si aggiorna da solo.

| Dispositivo | Come |
| --- | --- |
| PC (Chrome o Edge) | Apri il sito, poi l'icona *Installa* nella barra degli indirizzi |
| Android (Chrome) | Menu ⋮ → *Installa app* (o *Aggiungi a schermata Home*) |
| iPhone / iPad (Safari) | Condividi → *Aggiungi alla schermata Home* |

Senza account i progressi restano salvati sul dispositivo (`localStorage`).

## Account e area tutor

Con un account (email e password) i progressi si sincronizzano su tutti i dispositivi, anche dopo aver giocato offline. Chiunque può fare da **tutor**: crea un gruppo dal Profilo, riceve un codice e lo dà agli studenti. Chi si unisce con il codice compare nell'area tutor con progressi, partite e risposte sbagliate; il tutor vede il nome da giocatore, mai l'email.

Gli account usano [Supabase](https://supabase.com). Se non è configurato, il gioco funziona come prima, solo in locale.

### Configurare Supabase (una volta)

1. Crea un progetto su supabase.com. Regione: **Central EU (Frankfurt)**, così i dati restano nell'Unione europea.
2. **SQL Editor** → nuova query → incolla tutto `supabase/migrations/20261027190000_account_e_tutor.sql` → *Run*. Poi, in una nuova query, fai lo stesso con `supabase/migrations/20261028090000_editor.sql` (ruoli e bozze dell'editor dei casi, vedi sotto). Le migrazioni vanno eseguite una volta sola e in ordine di data.
3. **Authentication → URL Configuration**
   - *Site URL*: `https://fraterlizzi.github.io/turno-di-notte/`
   - *Redirect URLs*: aggiungi `https://fraterlizzi.github.io/turno-di-notte/**` e `http://localhost:5173/**`
4. **Authentication → Providers → Email**: lunghezza minima password 8.
   Le email (conferma account, recupero password) con il servizio incluso in Supabase partono solo verso gli indirizzi del team del progetto e in numero molto limitato: per aprire le iscrizioni a tutti configura un SMTP tuo in **Authentication → Emails → SMTP Settings** (per esempio Brevo o Resend, che hanno un piano gratuito).
5. **Project Settings → API Keys**: copia *Project URL* e la chiave **publishable**. Non usare mai la chiave *secret*: non deve finire né nel codice né nel browser.
6. Inserisci i due valori:
   - in locale, in un file `.env.local` (vedi `.env.example`);
   - su GitHub, come variabili del repository `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (Settings → Secrets and variables → Actions → *Variables*). Al push successivo il sito pubblicato avrà gli account.

### Editor dei casi: redazione e bozze

I casi e i capitoli si preparano online come **bozze**, visibili solo alla redazione (tabella `editors`):

- **autore**: crea bozze, modifica le proprie finché sono in stato *bozza* e le invia in revisione;
- **amministratore**: modifica qualsiasi bozza, la approva o la rimanda all'autore con una nota, la elimina e decide chi fa parte della redazione.

Ciclo di una bozza: *bozza* → *in-revisione* → *approvato* (oppure di nuovo *bozza*, con la nota dell'amministratore) → *pubblicato*. Ogni modifica al contenuto salva una versione nella cronologia (`case_versions`, `chapter_versions`), che nessuno può cambiare; se ne possono aggiungere con una nota (`save_version`). Le operazioni con regole proprie passano da funzioni del database: `submit_draft`, `review_draft`, `save_version`, `add_editor`, `remove_editor`, `list_editors`.

**Diventare il primo amministratore** (una volta sola): registrati nel gioco e conferma l'email, poi nel **SQL Editor** esegui la riga commentata in fondo a `supabase/migrations/20261028090000_editor.sql`, senza `-- ` iniziale e con la tua email. Gli altri membri li aggiunge un amministratore dall'editor (funzione `add_editor`), con la loro email: devono essersi già registrati nel gioco. Il ruolo si legge all'accesso (`state.role` in `src/account/session.js`): dopo una nomina la persona deve ricaricare la pagina. Deve restare sempre almeno un amministratore; se l'ultimo elimina il proprio account, rinominane uno con la stessa riga.

### Usare l'editor

L'editor è all'indirizzo **`/editor/`** del sito (es. `https://fraterlizzi.github.io/turno-di-notte/editor/`): non è collegato dal gioco e non va nella cache offline dei giocatori. Si entra con l'account del gioco; chi non è nella redazione vede "accesso riservato".

- **Casi e bozze**: "Nuovo caso" (con il primo numero libero), "Modifica" su un caso pubblicato (crea una bozza: il gioco cambia solo dopo la pubblicazione), "Duplica" per partire da un caso esistente.
- **Modulo a schede**: generale, scheda clinica, paziente e monitor, ABCDE, tappe, fonti e note. A destra i **controlli** dal vivo (errori e avvisi: un clic porta al campo) e le **versioni** (cosa è cambiato, ripristino).
- **▶ Anteprima**: il caso si gioca nel gioco vero, anche da una tappa scelta ("Prova da qui"); in anteprima non si salvano progressi né partite.
- **Salvataggio**: copia continua su questo dispositivo, salvataggio online un minuto dopo l'ultima modifica o con "Salva". Ogni salvataggio online è una versione.
- **Revisione**: l'autore invia in revisione (solo se non ci sono errori), l'amministratore approva o rimanda con una nota.
- **Capitoli**: proposta dell'elenco dei capitoli (titoli, stato *aperto* / *in arrivo* / *bozza*, ordine dei casi, capitoli nuovi), con lo stesso ciclo di revisione.
- **Note per lo sviluppo**: in ogni caso si annota cosa servirebbe nel gioco (scena, tipo di paziente, lente) che oggi non c'è.

### Pubblicare i casi approvati

I casi approvati diventano file in `content/` con una Pull Request, così ogni cambiamento resta nella cronologia di GitHub.

1. Una volta sola, su GitHub:
   - **Settings → Secrets and variables → Actions → Secrets**: nuovo secret `SUPABASE_SECRET_KEY` con la chiave *secret* del progetto Supabase (Project Settings → API Keys). È l'unico posto in cui va messa.
   - **Settings → Actions → General → Workflow permissions**: attiva *Allow GitHub Actions to create and approve pull requests*.
2. Ogni volta: **Actions → Pubblica i casi approvati → Run workflow**. La workflow scrive i file, esegue tutti i controlli e apre una Pull Request con l'elenco dei casi; se qualcosa non va, la pubblicazione si ferma e il resoconto dice cosa correggere.
3. Controlla la Pull Request e uniscila: il sito si aggiorna e le bozze passano a *pubblicato*.

In alternativa, "Scarica il file" nell'editor produce il file del caso da aggiungere a mano in `content/cases/`.

### Sicurezza e privacy

- Le regole di accesso sono nel database (Row Level Security): ogni giocatore legge e scrive solo i propri dati; il tutor legge solo quelli dei membri dei suoi gruppi; bozze e versioni dell'editor le vede solo la redazione. La chiave publishable da sola non dà accesso a nulla.
- Nella redazione si compare con il nome da giocatore: l'email serve all'amministratore solo per aggiungere qualcuno e non viene mai mostrata.
- Ogni utente può uscire da un gruppo ed eliminare l'account dal Profilo: la cancellazione è immediata e comprende progressi e partite.
- Prima di aprire le iscrizioni va completata l'informativa privacy (`index.html`, sezione `privacy`) con nome e contatto del titolare.

## Sviluppo

Serve [Node.js](https://nodejs.org/) 22 o superiore.

```bash
npm install        # dipendenze
npm run dev        # server di sviluppo su http://localhost:5173
npm run check      # lint + test + build: da far passare prima di ogni push
npm run preview    # prova la build di produzione (con service worker)
```

### Struttura

```
index.html              pagina e markup delle schermate
editor/index.html       pagina dell'editor dei casi
public/icon.svg         icona sorgente: le PNG per PWA e iOS vengono generate in build
content/
  cases/NNN-slug.json   un file per caso, con tutto dentro (lo stesso formato che scrive l'editor)
  chapters.json         capitoli e stagioni: stato e ordine dei casi
src/
  main.js               avvio: font, stili, motore, account, anteprima, service worker
  game.js               motore: scena, monitor, audio, glossario, Neuro, eventi
  content/              dai file dei casi al motore
    compile.js          file del caso → forma del motore (tappa ABCDE generata, valori del monitor)
    catalog.js          cosa il motore sa mostrare: lenti e parametri, ritmi, aspetto, tipi di tappa
    validate.js         controlli usati da test ed editor
    export.js           dalle bozze approvate ai nuovi file
  editor/               editor dei casi (modulo, bozze, anteprima, capitoli, redazione)
  account/              account e area tutor
    session.js          accesso, sincronizzazione dei progressi, coda offline delle partite
    progress.js         fusione dei progressi tra dispositivi (pura, testata)
    report.js           riepiloghi per il tutor (puri, testati)
    tutor.js            gruppi e dati degli studenti
    ui.js               schermate: accesso, profilo, area tutor
  styles/               stili del gioco e delle schermate account
  data/                 parti del gioco che non sono casi
    index.js            carica e compila i casi da content/
    abcde.js            parti comuni della tappa ABCDE
    glossary.js         glossario
    events.js           eventi fuori turno
    costumes.js         costumi e colori di riserva dei pazienti
scripts/                pubblicazione dei casi approvati, conversione iniziale (storica)
supabase/migrations/    schema del database e regole di accesso
tests/                  controlli su contenuti, editor, pubblicazione e account
legacy/                 il file HTML originale, per confronto
```

### Aggiungere o modificare un caso

Il modo previsto è l'editor. A mano: ogni caso è un file in `content/cases/` (nome `NNN-slug.json`) e va inserito in un capitolo in `content/chapters.json`; la tappa ABCDE si genera dai dati `abcde` del caso. `npm test` esegue sugli stessi file i controlli dell'editor.

Nuove lenti, ritmi o aspetti del paziente richiedono codice nel motore (`src/game.js`) e una voce nel catalogo (`src/content/catalog.js`): da quel momento l'editor li offre da solo.

## Pubblicazione

Ogni push su `main` passa da GitHub Actions (`.github/workflows/ci.yml`): lint, test, build e pubblicazione su GitHub Pages. Le pull request eseguono gli stessi controlli senza pubblicare. I casi dell'editor arrivano su `main` con la workflow `publish-content.yml` (vedi sopra).
