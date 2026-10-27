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

I progressi restano salvati sul dispositivo (`localStorage`).

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
  main.js               avvio: font, stili, motore, service worker
  game.js               motore: scena, monitor, audio, glossario, Neuro, eventi
  styles/main.css       stili
  data/                 contenuti, separati dal codice
    cases.js            i 12 casi clinici e la mappa delle stagioni
    abcde.js            valutazione ABCDE di ogni caso
    physiology.js       "Fisiologia al volo", una voce per tappa
    glossary.js         glossario
    events.js           eventi fuori turno
    costumes.js         costumi e colori dei pazienti
    index.js            assembla i dati prima dell'avvio
tests/data.test.js      controlli di coerenza sui contenuti
legacy/                 il file HTML originale, per confronto
```

### Aggiungere o modificare un caso

I casi sono in `src/data/cases.js`; la spiegazione di fisiologia di ogni tappa è in `src/data/physiology.js`, **nello stesso ordine delle tappe** (la tappa ABCDE viene aggiunta in automatico e non conta). `npm test` segnala gli errori più comuni: tappe senza risposta giusta, opzioni senza feedback, voci di fisiologia in più, collegamenti del glossario rotti.

## Pubblicazione

Ogni push su `main` passa da GitHub Actions (`.github/workflows/ci.yml`): lint, test, build e pubblicazione su GitHub Pages. Le pull request eseguono gli stessi controlli senza pubblicare.
