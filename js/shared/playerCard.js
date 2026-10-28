// Ansvar: Spillerens billede – det store spillerkort i draften og det lille runde portræt i lister
import { escapeHtml, priceTierOf, ROLE_NAME } from "./displayText.js";

// Spillerens portræt; mangler billedet eller fejler det, vises forbogstaverne i stedet
export function playerPortrait(handle, imageUrl, altText = "") {
  const initials = `<span class="initials" aria-hidden="true" ${imageUrl ? "hidden" : ""}>${escapeHtml(handle.slice(0, 2).toUpperCase())}</span>`;
  if (!imageUrl) return initials;
  const image = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}" loading="lazy"
    onerror="this.hidden = true; this.nextElementSibling.hidden = false">`;
  return image + initials;
}

// Beskrivelse til skærmlæsere, fx "Canna, Top, KC, pris 26"
function screenReaderLabel(card) {
  const price = card.price ? `, pris ${card.price}` : "";
  return `${card.handle}, ${ROLE_NAME[card.role_code]}, ${card.team_code}${price}`;
}

// statusText (fx "Valgt") vises oven på kortet og læses op sammen med navnet
export function playerCard(card, extraAttributes = "", statusText = "") {
  const priceTier = priceTierOf(card.tier_code);
  const label = statusText ? `${screenReaderLabel(card)}, ${statusText}` : screenReaderLabel(card);
  return `<div class="card" data-tier="${priceTier.borderColor}" data-id="${card.player_id}" tabindex="0" role="button"
      aria-label="${escapeHtml(label)}" ${extraAttributes}>
    <div class="top-row"><div class="price">${escapeHtml(card.price ?? "–")}<small>${priceTier.label}</small></div><div class="role">${ROLE_NAME[card.role_code]}</div></div>
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
