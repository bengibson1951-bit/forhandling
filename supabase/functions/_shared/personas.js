// Byggmax personas (fictional). Voice ids are MiniMax system voices on Replicate;
// browser fallback uses pitch/rate to tell them apart.
export const PERSONAS = [
  {
    key: 'inkop',
    tag: 'Inköpschef',
    name: 'Annika Ström',
    role: 'Inköpschef, leder för Byggmax, äger budget och leverantörsval',
    caresAbout: 'Pris, villkor, jämförelse mellan leverantörer',
    voice: { replicate: 'Wise_Woman', browserPitch: 1.0, browserRate: 1.05 },
  },
  {
    key: 'projekt',
    tag: 'Projektledare',
    name: 'Johan Berg',
    role: 'Projektledare pop-up, äger öppningen av de tre butikerna',
    caresAbout: 'Öppning 1 februari, funktion, installation',
    voice: { replicate: 'Determined_Man', browserPitch: 0.8, browserRate: 1.0 },
  },
];

export function personaByTag(tag) {
  return PERSONAS.find((p) => p.tag === tag || p.key === tag) || PERSONAS[0];
}
