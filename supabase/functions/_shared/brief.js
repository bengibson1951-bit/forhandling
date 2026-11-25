// Byggmax hidden brief (RAQSCI). Default content is an assumption; editable on the setup screen.
// reveal: 'volunteer' = Byggmax raises it itself; 'asked' = only when the team asks about it.
export const DEFAULT_REQUIREMENTS = [
  { id: 'r1', level: 'Regulatory', type: 'Must', reveal: 'asked',
    text: 'Leverantören skriver under Byggmax uppförandekod för leverantörer (arbetsmiljö, miljö, antikorruption); produkterna uppfyller säkerhetskrav.' },
  { id: 'a1', level: 'Assurance of supply', type: 'Must', reveal: 'volunteer',
    text: 'Tre butiker (Malmö, Stockholm, Göteborg) kan öppna 1 februari 2027; grundläggande hyllor och displayer på plats till dess. Etappvis leverans är okej om det grundläggande fungerar vid öppning.' },
  { id: 'q1', level: 'Quality', type: 'Must', reveal: 'asked',
    text: 'Stabila hyllor för tunga trädgårdsvaror.' },
  { id: 'q2', level: 'Quality', type: 'Want', reveal: 'asked',
    text: 'Samma utseende i alla tre butikerna.' },
  { id: 'q3', level: 'Quality', type: 'Want', reveal: 'asked',
    text: 'Inredningen ska kunna återanvändas efter pop-up-perioden.' },
  { id: 's1', level: 'Service', type: 'Want', reveal: 'asked',
    text: 'Leverantören sköter installationen.' },
  { id: 's2', level: 'Service', type: 'Want', reveal: 'asked',
    text: 'En namngiven kontaktperson.' },
  { id: 's3', level: 'Service', type: 'Want', reveal: 'asked',
    text: 'Nedmontering och lagring efteråt.' },
  { id: 'c1', level: 'Cost', type: 'Negotiable', reveal: 'volunteer',
    text: 'Budgettak per butik (enligt nivå). Vill ha 60 dagars betalningsvillkor.' },
  { id: 'i1', level: 'Innovation', type: 'Nice to have', reveal: 'asked',
    text: '3D/VR-förhandsvisning före produktion.' },
  { id: 'i2', level: 'Innovation', type: 'Nice to have', reveal: 'asked',
    text: 'Hållbarhetsdokumentation.' },
  { id: 'i3', level: 'Innovation', type: 'Nice to have', reveal: 'asked',
    text: 'Modulärt koncept för framtida butiker.' },
];

export const BATNA = 'Andra leverantörer, till exempel HL Display. Byggmax vet inte om de hinner leverera i tid till 1 februari.';

export function defaultBrief() {
  return { requirements: DEFAULT_REQUIREMENTS.map((r) => ({ ...r })), batna: BATNA };
}
