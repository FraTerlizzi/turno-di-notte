/* Contenuti del gioco: i dati restano separati dal motore. Qui vengono assemblati
   (fisiologia agganciata alle tappe, tappa ABCDE in testa a ogni caso) prima dell'avvio. */
import { SKIN, DEATH, CASES, ROAD } from './cases.js';
import { GL } from './glossary.js';
import { PHY } from './physiology.js';
import { SKINS, GOWN, HAIR } from './costumes.js';
import { EVENTS } from './events.js';
import { ABC_L, ABCDE, ABC_PHY, ABC_ACT } from './abcde.js';

// la fisiologia segue l'indice delle tappe originali: va agganciata prima di inserire la tappa ABCDE
CASES.forEach(c=>{const arr=PHY[c.id]||[];c.steps.forEach((s,i)=>{if(arr[i])s.phy=arr[i]})});
// costruisce la tappa ABCDE e la mette in testa a ogni caso
CASES.forEach(c=>{const ab=ABCDE[c.id];if(!ab||c.steps[0].abcde)return;
  const s0=c.steps[0];const seq=s0.seq;if(seq){delete s0.seq}
  const order=['A','B','C','D','E'];const fi=order.indexOf(ab.first);
  const opts=order.map((L,i)=>{const lab=`${L} · ${ABC_L[L][0]} (${ABC_L[L][1]})`;
    if(L===ab.first)return{t:lab,ok:1,fb:`${ab[L]} ${ab.why}`};
    const before=i<fi;
    return{t:lab,fb:before?`${ABC_L[L][0]}: ${ab[L]} Qui non serve un intervento immediato: prosegui con la lettera successiva.`:`${ABC_L[L][0]}: ${ab[L]} C'è però un problema prima, in ${ab.first} (${ABC_L[ab.first][0].toLowerCase()}): nell'ABCDE si interviene sul primo problema trovato, nell'ordine.`}});
  c.steps.unshift({tag:'ABCDE',kn:1,abcde:ab,seq,text:seq?"Ecco cosa succede. Poi valuta il paziente lettera per lettera, nell'ordine.":"Prima di qualsiasi decisione, valuta il paziente lettera per lettera, nell'ordine.",
    q:"In quale lettera trovi il primo problema che richiede un intervento immediato?",win:"Priorità trovata",opts,learn:"Nei casi di trauma con emorragia massiva si parte dal controllo del sanguinamento (cABCDE). Dopo ogni intervento, e a ogni cambiamento, si ricomincia da A.",phy:ABC_PHY});
});

export { SKIN, DEATH, CASES, ROAD, GL, PHY, SKINS, GOWN, HAIR, EVENTS, ABC_L, ABCDE, ABC_PHY, ABC_ACT };
