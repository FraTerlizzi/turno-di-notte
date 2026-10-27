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
2. **SQL Editor** → nuova query → incolla tutto `supabase/migrations/20261027190000_account_e_tutor.sql` → *Run*.
3. **Authentication → URL Configuration**
   - *Site URL*: `https://fraterlizzi.github.io/turno-di-notte/`
   - *Redirect URLs*: aggiungi `https://fraterlizzi.github.io/turno-di-notte/**` e `http://localhost:5173/**`
4. **Authentication → Providers → Email**: lunghezza minima password 8.
   Le email (conferma account, recupero password) con il servizio incluso in Supabase partono solo verso gli indirizzi del team del progetto e in numero molto limitato: per aprire le iscrizioni a tutti configura un SMTP tuo in **Authentication → Emails → SMTP Settings** (per esempio Brevo o Resend, che hanno un piano gratuito).
5. **Project Settings → API Keys**: copia *Project URL* e la chiave **publishable**. Non usare mai la chiave *secret*: non deve finire né nel codice né nel browser.
6. Inserisci i due valori:
   - in locale, in un file `.env.local` (vedi `.env.example`);
   - su GitHub, come variabili del repository `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (Settings → Secrets and variables → Actions → *Variables*). Al push successivo il sito pubblicato avrà gli account.

### Sicurezza e privacy

- Le regole di accesso sono nel database (Row Level Security): ogni giocatore legge e scrive solo i propri dati; il tutor legge solo quelli dei membri dei suoi gruppi. La chiave publishable da sola non dà accesso a nulla.
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
public/icon.svg         icona sorgente: le PNG per PWA e iOS vengono generate in build
src/
  main.js               avvio: font, stili, motore, account, service worker
  game.js               motore: scena, monitor, audio, glossario, Neuro, eventi
  account/              account e area tutor
    session.js          accesso, sincronizzazione dei progressi, coda offline delle partite
    progress.js         fusione dei progressi tra dispositivi (pura, testata)
    report.js           riepiloghi per il tutor (puri, testati)
    tutor.js            gruppi e dati degli studenti
    ui.js               schermate: accesso, profilo, area tutor
  styles/               stili del gioco e delle schermate account
  data/                 contenuti, separati dal codice
    cases.js            i 12 casi clinici e la mappa delle stagioni
    abcde.js            valutazione ABCDE di ogni caso
    physiology.js       "Fisiologia al volo", una voce per tappa
    glossary.js         glossario
    events.js           eventi fuori turno
    costumes.js         costumi e colori dei pazienti
    index.js            assembla i dati prima dell'avvio
supabase/migrations/    schema del database e regole di accesso
tests/                  controlli sui contenuti e sulla logica degli account
legacy/                 il file HTML originale, per confronto
```

### Aggiungere o modificare un caso

I casi sono in `src/data/cases.js`; la spiegazione di fisiologia di ogni tappa è in `src/data/physiology.js`, **nello stesso ordine delle tappe** (la tappa ABCDE viene aggiunta in automatico e non conta). `npm test` segnala gli errori più comuni: tappe senza risposta giusta, opzioni senza feedback, voci di fisiologia in più, collegamenti del glossario rotti.

## Pubblicazione

Ogni push su `main` passa da GitHub Actions (`.github/workflows/ci.yml`): lint, test, build e pubblicazione su GitHub Pages. Le pull request eseguono gli stessi controlli senza pubblicare.
