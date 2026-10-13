// Fælles hjælpere til visningerne: escaping, datoer, navne og spillerkortet
import { TZ } from "./config.js";

export const ROLES = ["top", "jungle", "mid", "adc", "support"];
export const ROLE_NAME = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };
export const PHASE_NAME = { play_in: "Play-In", swiss: "Swiss", qf: "Kvartfinale", sf: "Semifinale", final: "Finale" };
export const TIER_NAME = {
  favorit: "Favorit", staerk: "Stærk", middel: "Middel", underdog: "Underdog",
  ko_favorit: "Favorit", ko_underdog: "Underdog",
};

// Al tekst fra databasen escapes, før den sættes ind som HTML
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const fmtDay = new Intl.DateTimeFormat("da-DK", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const fmtTime = new Intl.DateTimeFormat("da-DK", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const day = (d) => fmtDay.format(new Date(d));
export const time = (d) => fmtTime.format(new Date(d));
export const dayTime = (d) => `${day(d)} kl. ${time(d)}`;

// Fasens tilstand ud fra tidspunkterne
export function phaseState(p, now = Date.now()) {
  if (now < Date.parse(p.opens_at)) return "soon";
  if (now < Date.parse(p.locks_at)) return "open";
  if (p.ends_at && now >= Date.parse(p.ends_at)) return "done";
  return "live";
}
export const STATE_NAME = { soon: "Åbner senere", open: "Åben", live: "Låst · spilles", done: "Afsluttet" };

// Tierens farve på kortets kant: guld, sølv, bronze eller grå
export function tierClass(tier) {
  return { favorit: "favorit", ko_favorit: "favorit", staerk: "staerk", middel: "middel", underdog: "underdog", ko_underdog: "underdog" }[tier] ?? "fri";
}

export function card(c, attrs = "") {
  const price = c.price ?? "–";
  const tier = c.tier_code ? TIER_NAME[c.tier_code] : "Fri";
  return `<div class="card" data-tier="${tierClass(c.tier_code)}" data-id="${c.player_id}" tabindex="0" ${attrs}>
    <div class="top-row"><div class="price">${esc(price)}<small>${esc(tier)}</small></div><div class="role">${ROLE_NAME[c.role_code]}</div></div>
    <div class="face"><span>${esc(c.handle.slice(0, 2).toUpperCase())}</span></div>
    <div class="name" title="${esc(c.handle)}">${esc(c.handle)}</div>
    <div class="tm">${esc(c.team_code)}</div>
  </div>`;
}

export function errorBox(msg) {
  return `<p class="error" role="alert">${esc(msg)}</p>`;
}
