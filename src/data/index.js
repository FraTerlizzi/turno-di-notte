/* Contenuti del gioco. I casi e i capitoli stanno in content/ (un file per caso, lo stesso che scrive l'editor)
   e vengono compilati qui nella forma che usa il motore. */
import { SKIN, DEATH } from '../content/catalog.js';
import { compileCase } from '../content/compile.js';
import { GL } from './glossary.js';
import { SKINS, GOWN, HAIR } from './costumes.js';
import { EVENTS } from './events.js';
import { ABC_L, ABC_PHY, ABC_ACT } from './abcde.js';
import CHAPTERS from '../../content/chapters.json';

const files = import.meta.glob('../../content/cases/*.json', { eager: true, import: 'default' });
export const CASE_FILES = Object.keys(files).sort().map((k) => files[k]);
const CASES = CASE_FILES.map(compileCase).sort((a, b) => a.id - b.id);

export { SKIN, DEATH, CASES, CHAPTERS, GL, SKINS, GOWN, HAIR, EVENTS, ABC_L, ABC_PHY, ABC_ACT };
