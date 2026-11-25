// Hestra reference data (from the team's Förhandlingsplan). Edit here.
export const HESTRA = {
  floor: 600000,
  target: 750000,
  stores: 3,
  packages: {
    start: { name: 'Hestra Start', price: 600000, leadDays: '25 + 10' },
    smart: { name: 'Hestra Smart', price: 650000, leadDays: '60 + 10' },
    signatur: { name: 'Hestra Signatur', price: 750000, leadDays: '90 + 10' },
  },
  concessions: {
    projektledarstod: { name: 'Projektledarstöd', value: 15000 },
    visualisering: { name: '2D-, 3D- och VR-lösningar', value: 15000 },
    expressleverans: { name: 'Expressleverans', value: 35000 },
    montering: { name: 'Montering/nedmontering', value: 75000 },
    lagerhallning: { name: 'Lagerhållning', value: 60000 },
    betalningsvillkor: { name: 'Förlängda betalningsvillkor (45–60 dagar)', value: 0 },
  },
  wantsBack: [
    'Volymåtagande', 'Ramavtal', 'Skriftligt åtagande om framtida projekt',
    'Snabba beslut och godkända ritningar', 'Tydliga betalnings- och leveransvillkor',
  ],
  dates: { negotiation: '3–4 december 2026', drawings: '7 december 2026', opening: '1 februari 2027' },
};

export const ROLES = [
  { key: 'kelli', name: 'Kelli', area: 'Leder mötet och sammanfattar' },
  { key: 'tova', name: 'Tova', area: 'Pris och villkor' },
  { key: 'erika', name: 'Erika', area: 'Design och kvalitet' },
  { key: 'madelene', name: 'Madelene', area: 'Produktion och leverans' },
];

export const PHASES = [
  { key: 'inledning', name: 'Inledning', next: 'Formalia och artigheter är avklarade' },
  { key: 'utforskning', name: 'Utforskning', next: 'Båda förstår varandras position' },
  { key: 'kopslaende', name: 'Köpslående', next: 'Båda förstår och accepterar vad en affär skulle innehålla' },
  { key: 'avtal', name: 'Avtal', next: 'Affären är tydlig och båda är överens' },
  { key: 'avslut', name: 'Avslut', next: '' },
];

export const AGENDA = [
  { key: 'priser', name: 'Priser' },
  { key: 'logistik', name: 'Logistik' },
  { key: 'montering', name: 'Montering och installation' },
  { key: 'design', name: 'Design och kvalitet' },
  { key: 'uppfoljning', name: 'Uppföljning' },
  { key: 'kommunikation', name: 'Kommunikation' },
  { key: 'varderingar', name: 'Värderingar' },
  { key: 'sammanfattning', name: 'Sammanfattning' },
];
