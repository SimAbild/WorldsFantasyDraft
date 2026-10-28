// Ansvar: Tekst som brugeren ser – escaping, datoer i dansk tid, visningsnavne, prisklasser og fejl-/tom-bokse
import { TIME_ZONE } from "../config.js";
import { PHASE_STATE } from "../domain/phase.js";

export const ROLE_NAME = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };
export const PHASE_NAME = { play_in: "Play-In", swiss: "Swiss", qf: "Kvartfinale", sf: "Semifinale", final: "Finale" };
export const PHASE_STATE_NAME = {
  [PHASE_STATE.SOON]: "Åbner senere", [PHASE_STATE.OPEN]: "Åben",
  [PHASE_STATE.LIVE]: "Låst · spilles", [PHASE_STATE.DONE]: "Afsluttet",
};

// Prisklasser: visningsnavn og kortets kantfarve samlet ét sted
const PRICE_TIERS = {
  favorit: { label: "Favorit", borderColor: "favorit" },
  staerk: { label: "Stærk", borderColor: "staerk" },
  middel: { label: "Middel", borderColor: "middel" },
  underdog: { label: "Underdog", borderColor: "underdog" },
  ko_favorit: { label: "Favorit", borderColor: "favorit" },
  ko_underdog: { label: "Underdog", borderColor: "underdog" },
};
const FREE_TIER = { label: "Fri", borderColor: "fri" };
export const priceTierOf = (tierCode) => PRICE_TIERS[tierCode] ?? FREE_TIER;

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

export const errorBox = (message) => `<p class="error" role="alert">${escapeHtml(message)}</p>`;
export const emptyBox = (message) => `<div class="empty">${escapeHtml(message)}</div>`;
