/* Cosa il motore sa mostrare. L'editor costruisce i suoi comandi da qui e i controlli verificano i casi
   su queste liste: una lente, un ritmo o un aspetto nuovo nel motore = una voce in più in questo file. */

// colori della cute (usati anche dal motore per sfumare l'incarnato)
export const SKIN = { normal: '#e2ad86', pale: '#e3d2c3', grey: '#c3beb4', cyan: '#aab6c6', flushed: '#ef8f78' };
export const SKIN_LABELS = { normal: 'Normale', pale: 'Pallida', grey: 'Grigia', cyan: 'Cianotica', flushed: 'Arrossata' };

// stato del paziente al decesso
export const DEATH = { vit: { hr: 0, sys: 0, dia: 0, spo2: 0, rr: 0, ecg: 'asystole' }, pat: { eyes: 0, skin: 'grey', sweat: 0, tremor: 0 } };

export const DIFFS = ['Base', 'Media', 'Difficile'];

export const VITALS = {
  hr: { label: 'Frequenza cardiaca', unit: 'bpm', min: 0, max: 220, step: 1 },
  sys: { label: 'PA sistolica', unit: 'mmHg', min: 0, max: 260, step: 1 },
  dia: { label: 'PA diastolica', unit: 'mmHg', min: 0, max: 160, step: 1 },
  spo2: { label: 'Saturazione', unit: '%', min: 0, max: 100, step: 1 },
  rr: { label: 'Frequenza respiratoria', unit: 'atti/min', min: 0, max: 60, step: 1 },
  temp: { label: 'Temperatura', unit: '°C', min: 30, max: 43, step: 0.1 },
};

export const ECG = {
  sinus: 'Ritmo sinusale',
  af: 'Fibrillazione atriale',
  peakedT: 'Onde T alte e appuntite (iperkaliemia)',
  vf: 'Fibrillazione ventricolare',
  asystole: 'Asistolia',
};

// aspetto del paziente: valori numerici da 0 a 1 (la postura da 0 a 2)
export const PATIENT = {
  pose: { label: 'Postura', min: 0, max: 2, step: 0.1, hint: '0 sdraiato · 1 semiseduto · 2 seduto' },
  eyes: { label: 'Occhi aperti', min: 0, max: 1, step: 1, hint: '0 chiusi · 1 aperti' },
  sweat: { label: 'Sudorazione', min: 0, max: 1, step: 0.1 },
  tremor: { label: 'Tremore', min: 0, max: 1, step: 0.1 },
  hives: { label: 'Orticaria', min: 0, max: 1, step: 0.1 },
  droop: { label: 'Bocca storta (deficit facciale)', min: 0, max: 1, step: 0.1 },
  collapsed: { label: 'Accasciato', min: 0, max: 1, step: 1 },
  bruise: { label: 'Livido sulla fronte (dopo una caduta)', min: 0, max: 1, step: 0.1 },
  anisocoria: { label: 'Pupilla destra dilatata (anisocoria)', min: 0, max: 1, step: 1, hint: 'si vede solo a occhi aperti' },
};

const p = (label, hint, min = 0, max = 1, step = 0.05) => ({ label, hint, min, max, step });

/* lenti sul corpo: modalità di fisiologia con i parametri che l'animazione legge */
export const LENSES = {
  glucose: {
    label: 'Glucosio e insulina', where: 'Nel sangue', at: 'arm',
    params: {
      glu: p('Glicemia', 'mg/dL', 0, 700, 1), insulin: p('Insulina in circolo', '0 assente · 1 abbondante'),
      ketones: p('Chetoni', '0 assenti · 1 molti'), kshift: p('Potassio che entra nelle cellule', 'con insulina e glucosio'),
    },
  },
  heart: {
    label: 'Ventricolo sinistro e valvola aortica', where: 'Nel cuore', at: 'chest',
    params: { stenosis: p('Stenosi della valvola', '0 valvola sana · 1 molto stretta'), preload: p('Riempimento del ventricolo (precarico)'), backflow: p('Rigurgito') },
  },
  alveolus: {
    label: 'Alveolo e capillare', where: 'Nel polmone', at: 'chest',
    params: { fluid: p('Liquido nell\'alveolo', 'edema'), perfusion: p('Sangue che arriva al capillare'), co2: p('CO₂ nel sangue', '0 bassa · 1 molto alta') },
  },
  vessel: {
    label: 'Vaso sanguigno e tessuti', where: 'Nel vaso', at: 'arm',
    params: {
      dilation: p('Dilatazione del vaso'), leak: p('Perdita di liquido nei tessuti'), bacteria: p('Batteri'),
      hemolysis: p('Globuli rossi distrutti (emolisi)'), histamine: p('Istamina'),
    },
  },
  brain: {
    label: 'Circolo cerebrale', where: 'Nel cervello', at: 'head',
    params: { occlusion: p('Arteria chiusa', '0 aperta · 1 chiusa'), penumbra: p('Tessuto a rischio (penombra)') },
  },
  myocyte: {
    label: 'Membrana della cellula cardiaca', where: 'Nella cellula', at: 'chest',
    params: { k: p('Potassio', 'mmol/L', 1.5, 10, 0.1), calcium: p('Calcio che protegge la membrana') },
  },
  brainstem: {
    label: 'Centri respiratori del bulbo', where: 'Nel tronco encefalico', at: 'head',
    params: { opioid: p('Oppioide', '0 assente · 1 dose alta'), naloxone: p('Naloxone') },
  },
  skull: {
    label: 'Cranio e pressione intracranica', where: 'Nel cranio', at: 'head',
    params: {
      hematoma: p('Ematoma subdurale destro', '0 assente · 1 molto grande'),
      active: p('Sanguinamento attivo', 'la vena a ponte gocciola'),
      icp: p('Pressione intracranica', '×40 = mmHg (0,5 = 20 mmHg, soglia di trattamento)'),
      gcs: p('Glasgow Coma Scale', 'da 3 a 15', 3, 15, 1),
      elevation: p('Testa sollevata', '1 = 30°: migliora il ritorno venoso'),
      reversal: p("Antidoto dell'anticoagulante", 'si forma il coagulo e il sanguinamento si ferma'),
    },
  },
};

/* tipi di tappa; "ragionamento" = una risposta sbagliata costa un cuore ma non peggiora il paziente */
export const STEP_TAGS = {
  Valutazione: { label: 'Valutazione', flags: {} },
  Decisione: { label: 'Decisione', flags: {} },
  Rivalutazione: { label: 'Rivalutazione', flags: {} },
  Fisiologia: { label: 'Fisiologia', flags: { fis: 1, kn: 1 } },
  Anatomia: { label: 'Anatomia', flags: { ana: 1, kn: 1 } },
};

/* esito di una risposta sbagliata: x e dead nel file del caso */
export const OUTCOMES = {
  none: { label: 'Nessun effetto sul paziente', x: 0 },
  worse: { label: 'Il paziente peggiora', x: 1 },
  critical: { label: 'Evento critico', x: 2 },
  death: { label: 'Decesso', x: 2, dead: 1 },
};
export function outcomeOf(opt, step) {
  const x = opt.x != null ? opt.x : step.kn ? 0 : 1;
  if (opt.dead) return 'death';
  return x === 0 ? 'none' : x === 2 ? 'critical' : 'worse';
}

/* fonti dei valori extra del monitor */
export const HUD_SOURCES = {
  ...Object.fromEntries(Object.entries(VITALS).map(([k, v]) => [`vit.${k}`, v.label])),
  'calc.map': 'Pressione arteriosa media (calcolata)',
  ...Object.fromEntries(Object.values(LENSES).flatMap((l) => Object.entries(l.params).map(([k, v]) => [`phys.${k}`, `${v.label} (lente: ${l.label})`]))),
};
