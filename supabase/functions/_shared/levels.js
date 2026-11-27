// Agreeability levels. Budget numbers are assumptions — adjust freely.
export const LEVELS = [
  {
    level: 1, name: 'Samarbetsvillig', ceiling: 760000, opening: 700000,
    behaviour: 'Öppen om behov, svarar fullständigt på frågor, värdesätter kvalitet och partnerskap, ger efter gärna när ni får ett skäl. Använder taktiker sällan. När teamet sammanfattar ett konkret förslag som ligger inom budgettaket och uppfyller Must-kraven: acceptera affären (dealReached=true). Be då inte om fler eftergifter och ta inte upp nya frågor; småfrågor kan lösas efteråt.',
    tacticFrequency: 'sällan',
  },
  {
    level: 2, name: 'Affärsmässig', ceiling: 720000, opening: 640000,
    behaviour: 'Vänlig, positiv och rättvis, men vill ha valuta för pengarna. Avslöjar behov när ni blir tillfrågade. Byter eftergift mot eftergift. Säger ja till en rimlig, sammanfattad affär inom budget efter ett par byten.',
    tacticFrequency: 'sällan, och alltid på ett vänligt sätt',
  },
  {
    level: 3, name: 'Prispressad', ceiling: 680000, opening: 590000,
    behaviour: 'Lågprisprofilen dominerar. Upprepar "för dyrt". Nämner konkurrerande offert. Ger lite utan att få något tillbaka.',
    tacticFrequency: 'ofta',
  },
  {
    level: 4, name: 'Tuff förhandlare', ceiling: 650000, opening: 550000,
    behaviour: 'Använder taktiker aktivt. Håller inne med information. Små, långsamma eftergifter. Testar om Hestra ger bort saker gratis.',
    tacticFrequency: 'mycket ofta',
  },
  {
    level: 5, name: 'Blockerande', ceiling: 620000, opening: 500000,
    behaviour: 'Blockerar och förhalar. Hotar att gå. Rör sig bara när Hestra använder något-för-något och visar konkret värde. Avslutar mötet utan affär om Hestra hanterar det dåligt (ger bort mycket utan motprestation, går under golvet i panik, eller lovar orealistiskt).',
    tacticFrequency: 'hela tiden',
  },
];

export const DEFAULT_LEVEL = 2;

export const TACTICS = [
  '"Fakta och data" — hänvisar till siffror för att försvaga Hestras position.',
  '"Den stora bilden" — trycker på för en helhetsöverenskommelse för att hoppa över detaljer.',
  '"Det betyder inget för mig" — förminskar värdet av det Hestra erbjuder.',
  '"Ni behöver oss" — betonar att Hestra vill ha relationen med Byggmax.',
  '"Fortsätt fråga" — fortsätter be om mer tills någon säger nej.',
  'Driver Hestra mot sitt lägsta acceptabla bud med upprepade små krav.',
];

export const MODIFIERS = {
  konkurrentoffert: {
    name: 'Konkurrentoffert',
    text: 'Byggmax har en lägre skriftlig offert från en annan leverantör (cirka 10 % under Hestras nivå) men vet inte om den leverantören hinner till 1 februari. Använd den som påtryckning.',
  },
  beslutsfattarenSaknas: {
    name: 'Beslutsfattaren saknas',
    text: 'Personerna i rummet kan inte skriva under. Allt "måste stämmas av" med ledningen. Ni kan som mest komma fram till en rekommendation.',
  },
  tidspanik: {
    name: 'Tidspanik',
    text: 'Byggmax är mer orolig för 1 februari än för priset. Leveranssäkerhet väger tyngre än några tusenlappar.',
  },
};

export function levelByNumber(n) {
  return LEVELS.find((l) => l.level === Number(n)) || LEVELS[DEFAULT_LEVEL - 1];
}

// Level for a session, with optional edited budget numbers: settings.levelValues = {3: {ceiling, opening}}
export function effectiveLevel(settings = {}) {
  const base = levelByNumber(settings.level);
  const o = settings.levelValues?.[base.level] || {};
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 100000 ? Math.round(Number(v)) : d);
  return { ...base, ceiling: num(o.ceiling, base.ceiling), opening: num(o.opening, base.opening) };
}
