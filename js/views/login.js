// Ansvar: Login-siden – login og oprettelse med brugernavn og password
import * as database from "../database.js";
import { errorBox } from "../shared/displayText.js";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;

// Oversætter Supabase' engelske fejl til dansk
function translateLoginError(message) {
  if (/Invalid login/i.test(message)) return "Forkert brugernavn eller password. Er du ny, så tryk Opret bruger.";
  if (/already registered/i.test(message)) return "Brugernavnet er taget. Vælg et andet.";
  if (/rate limit/i.test(message)) return "For mange forsøg lige nu. Vent et par minutter, og prøv igen.";
  return message;
}

function validate(username, password) {
  if (!USERNAME_PATTERN.test(username)) return "Brugernavnet skal være 3–20 tegn: små bogstaver, tal og _.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password skal være mindst ${MIN_PASSWORD_LENGTH} tegn.`;
  return null;
}

function formHtml(isSignUp, errorMessage) {
  return `<div class="login"><form id="login-form" novalidate>
    <h2>${isSignUp ? "Opret bruger" : "Log ind"}</h2>
    <label for="username">Brugernavn<input id="username" autocomplete="username" required></label>
    <label for="password">Password<input id="password" type="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" required></label>
    ${isSignUp ? `<p class="muted small">3–20 tegn: små bogstaver, tal og _. Password mindst ${MIN_PASSWORD_LENGTH} tegn.</p>` : ""}
    ${errorMessage ? errorBox(errorMessage) : ""}
    <button class="btn" type="submit">${isSignUp ? "Opret bruger" : "Log ind"}</button>
    <button class="btn ghost" type="button" id="switch-mode">${isSignUp ? "Jeg har en bruger" : "Opret bruger"}</button>
    <p class="muted small">Glemt password? Skriv til Simon, så nulstiller han det.</p>
  </form></div>`;
}

export function render(pageElement, { onLoggedIn }) {
  let isSignUp = false;

  const drawForm = (errorMessage = "") => {
    pageElement.innerHTML = formHtml(isSignUp, errorMessage);
    pageElement.querySelector("#switch-mode").onclick = () => { isSignUp = !isSignUp; drawForm(); };
    pageElement.querySelector("#login-form").onsubmit = submit;
  };

  async function submit(event) {
    event.preventDefault();
    const username = pageElement.querySelector("#username").value.trim().toLowerCase();
    const password = pageElement.querySelector("#password").value;
    const validationError = validate(username, password);
    if (validationError) return drawForm(validationError);
    try {
      await (isSignUp ? database.signUp(username, password) : database.signIn(username, password));
      onLoggedIn();
    } catch (error) {
      drawForm(translateLoginError(error.message));
    }
  }

  drawForm();
}
