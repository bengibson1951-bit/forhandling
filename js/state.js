// Deal state: pure reducer over per-turn model updates.
import { HESTRA, PHASES, AGENDA } from '../supabase/functions/_shared/hestra.js';

const PHASE_KEYS = PHASES.map((p) => p.key);
const AGENDA_KEYS = AGENDA.map((a) => a.key);

export const WARNING_TEXT = {
  gift_without_return: 'Ni gav bort något utan att be om något tillbaka',
  below_floor: 'Priset är under ert golv på 600 000 kr per butik',
  promised_all_feb1: 'Ni lovade att allt blir klart i alla butiker 1 februari',
  discount_before_asking: 'Ni gav rabatt innan ni frågat "hur mycket för högt är priset?"',
};

export function initialState() {
  return {
    phase: 'inledning',
    agenda: Object.fromEntries(AGENDA_KEYS.map((k) => [k, false])),
    proposal: { package: null, pricePerStore: null, delivery: null, paymentDays: null },
    gives: [],
    gets: [],
    revealed: [],
    warnings: [],
    relation: 0,
    relationNote: null,
    walkout: false,
    dealReached: false,
  };
}

export function toKr(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const digits = v.replace(/[\s .,]/g, '').replace(/kr$/i, '');
    if (/^\d+$/.test(digits)) return Number(digits);
  }
  return null;
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function applyUpdate(state, update, turn) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return state;
  const s = structuredClone(state);
  const warn = (type) => s.warnings.push({ type, text: WARNING_TEXT[type], turn });

  if (PHASE_KEYS.includes(update.phase)) s.phase = update.phase;

  if (Array.isArray(update.agenda)) {
    for (const k of update.agenda) if (AGENDA_KEYS.includes(k)) s.agenda[k] = true;
  }

  if (Array.isArray(update.gives)) {
    for (const g of update.gives) {
      if (!g || typeof g !== 'object') continue;
      const ref = HESTRA.concessions[g.key];
      const item = str(g.item) || ref?.name;
      if (!item) continue;
      const value = toKr(g.value) ?? ref?.value ?? 0;
      const inReturn = str(g.inReturn);
      s.gives.push({ key: ref ? g.key : null, item, value, inReturn, turn });
      if (!inReturn) warn('gift_without_return');
    }
  }

  if (Array.isArray(update.gets)) {
    for (const g of update.gets) {
      const item = str(g?.item);
      if (item) s.gets.push({ item, turn });
    }
  }

  const p = update.proposal;
  if (p && typeof p === 'object') {
    if (p.package && HESTRA.packages[p.package]) s.proposal.package = p.package;
    const price = toKr(p.pricePerStore);
    if (price && price > 1000) {
      const prev = s.proposal.pricePerStore;
      s.proposal.pricePerStore = price;
      if (price < HESTRA.floor && price !== prev) warn('below_floor');
    }
    if (str(p.delivery)) s.proposal.delivery = str(p.delivery);
    const days = toKr(p.paymentDays);
    if (days && days < 365) s.proposal.paymentDays = days;
  }

  if (Array.isArray(update.revealed)) {
    for (const id of update.revealed) if (typeof id === 'string' && !s.revealed.includes(id)) s.revealed.push(id);
  }

  const f = update.flags;
  if (f && typeof f === 'object') {
    if (f.giftWithoutReturn && !(update.gives || []).length) warn('gift_without_return');
    if (f.promisedAllFeb1) warn('promised_all_feb1');
    if (f.discountBeforeAsking) warn('discount_before_asking');
  }

  if (update.relation !== undefined && update.relation !== null && Number.isFinite(Number(update.relation))) {
    const r = Math.max(-3, Math.min(3, Math.round(Number(update.relation))));
    if (r !== s.relation) s.relationNote = str(update.relationNote) || s.relationNote;
    s.relation = r;
  }
  if (update.walkout === true) s.walkout = true;
  if (update.dealReached === true) s.dealReached = true;
  return s;
}

export function totalGiven(state) {
  return state.gives.reduce((sum, g) => sum + (g.value || 0), 0);
}
