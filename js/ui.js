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
  favorit: { label: "Favorit", borderColor: "favorit" },
  staerk: { label: "Stærk", borderColor: "staerk" },
  middel: { label: "Middel", borderColor: "middel" },
  underdog: { label: "Underdog", borderColor: "underdog" },
  ko_favorit: { label: "Favorit", borderColor: "favorit" },
  ko_underdog: { label: "Underdog", borderColor: "underdog" },
};
const FREE_TIER = { label: "Fri", borderColor: "fri" };
export const priceTierOf = (tierCode) => TIERS[tierCode] ?? FREE_TIER;

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

// Spillerens portræt; mangler billedet eller fejler det, vises forbogstaverne i stedet
export function playerPortrait(handle, imageUrl, altText = "") {
  const initials = `<span class="initials" aria-hidden="true" ${imageUrl ? "hidden" : ""}>${escapeHtml(handle.slice(0, 2).toUpperCase())}</span>`;
  if (!imageUrl) return initials;
  const image = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}" loading="lazy"
    onerror="this.hidden = true; this.nextElementSibling.hidden = false">`;
  return image + initials;
}

// Beskrivelse til skærmlæsere, fx "Canna, Top, KC, pris 26"
function cardLabel(card) {
  const price = card.price ? `, pris ${card.price}` : "";
  return `${card.handle}, ${ROLE_NAME[card.role_code]}, ${card.team_code}${price}`;
}

// statusText (fx "Valgt") vises oven på kortet og læses op sammen med navnet
export function playerCard(card, extraAttributes = "", statusText = "") {
  const tier = priceTierOf(card.tier_code);
  const label = statusText ? `${cardLabel(card)}, ${statusText}` : cardLabel(card);
  return `<div class="card" data-tier="${tier.borderColor}" data-id="${card.player_id}" tabindex="0" role="button"
      aria-label="${escapeHtml(label)}" ${extraAttributes}>
    <div class="top-row"><div class="price">${escapeHtml(card.price ?? "–")}<small>${tier.label}</small></div><div class="role">${ROLE_NAME[card.role_code]}</div></div>
    <div class="face">${playerPortrait(card.handle, card.image_url)}</div>
    <div class="name" title="${escapeHtml(card.handle)}">${escapeHtml(card.handle)}</div>
    <div class="card-team">${escapeHtml(card.team_code)}</div>
    ${statusText ? `<div class="card-status">${escapeHtml(statusText)}</div>` : ""}
  </div>`;
}

// Lille rundt portræt til lister og tabeller
export function avatar(handle, imageUrl) {
  return `<span class="avatar">${playerPortrait(handle, imageUrl)}</span>`;
}

export const errorBox = (message) => `<p class="error" role="alert">${escapeHtml(message)}</p>`;
export const emptyBox = (message) => `<div class="empty">${escapeHtml(message)}</div>`;
