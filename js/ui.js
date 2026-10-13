// Ansvar: Fælles præsentation – escaping, datoer i dansk tid, visningsnavne og spillerkortet
import { TIME_ZONE } from "./config.js";
import { PHASE_STATE } from "./domain/phase.js";

export const ROLE_NAME = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };
export const PHASE_NAME = { play_in: "Play-In", swiss: "Swiss", qf: "Kvartfinale", sf: "Semifinale", final: "Finale" };
export const PHASE_STATE_NAME = {
  [PHASE_STATE.SOON]: "Åbner senere", [PHASE_STATE.OPEN]: "Åben",
  [PHASE_STATE.LIVE]: "Låst · spilles", [PHASE_STATE.DONE]: "Afsluttet",
};

// Prisklasser: visningsnavn og kortets kantfarve samlet ét sted
const TIERS = {
  favorit: { label: "Favorit", rim: "favorit" },
  staerk: { label: "Stærk", rim: "staerk" },
  middel: { label: "Middel", rim: "middel" },
  underdog: { label: "Underdog", rim: "underdog" },
  ko_favorit: { label: "Favorit", rim: "favorit" },
  ko_underdog: { label: "Underdog", rim: "underdog" },
};
const FREE_TIER = { label: "Fri", rim: "fri" };
export const tierOf = (tierCode) => TIERS[tierCode] ?? FREE_TIER;

// Al tekst fra databasen escapes, før den sættes ind som HTML
const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

const dayFormat = new Intl.DateTimeFormat("da-DK", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("da-DK", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
export const formatDay = (date) => dayFormat.format(new Date(date));
export const formatTime = (date) => timeFormat.format(new Date(date));
export const formatDayTime = (date) => `${formatDay(date)} kl. ${formatTime(date)}`;

export function playerCard(card, extraAttributes = "") {
  const tier = tierOf(card.tier_code);
  return `<div class="card" data-tier="${tier.rim}" data-id="${card.player_id}" tabindex="0" ${extraAttributes}>
    <div class="top-row"><div class="price">${escapeHtml(card.price ?? "–")}<small>${tier.label}</small></div><div class="role">${ROLE_NAME[card.role_code]}</div></div>
    <div class="face"><span>${escapeHtml(card.handle.slice(0, 2).toUpperCase())}</span></div>
    <div class="name" title="${escapeHtml(card.handle)}">${escapeHtml(card.handle)}</div>
    <div class="tm">${escapeHtml(card.team_code)}</div>
  </div>`;
}

export const errorBox = (message) => `<p class="error" role="alert">${escapeHtml(message)}</p>`;
export const emptyBox = (message) => `<div class="empty">${escapeHtml(message)}</div>`;
