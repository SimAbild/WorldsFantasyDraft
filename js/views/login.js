// Login og oprettelse med brugernavn og password
import * as api from "../api.js";
import { errorBox } from "../ui.js";

export function render(root, { onLoggedIn }) {
  let mode = "login";
  const draw = (err = "") => {
    const signup = mode === "signup";
    root.innerHTML = `<div class="login"><form id="lf" novalidate>
      <h2>${signup ? "Opret bruger" : "Log ind"}</h2>
      <label for="lu">Brugernavn<input id="lu" autocomplete="username" required pattern="[a-z0-9_]{3,20}"></label>
      <label for="lp">Password<input id="lp" type="password" autocomplete="${signup ? "new-password" : "current-password"}" required minlength="6"></label>
      ${signup ? `<p class="muted small">3–20 tegn: små bogstaver, tal og _. Password mindst 6 tegn.</p>` : ""}
      ${err ? errorBox(err) : ""}
      <button class="btn" type="submit">${signup ? "Opret bruger" : "Log ind"}</button>
      <button class="btn ghost" type="button" id="switch">${signup ? "Jeg har en bruger" : "Opret bruger"}</button>
      <p class="muted small">Glemt password? Skriv til Simon, så nulstiller han det.</p>
    </form></div>`;
    root.querySelector("#switch").onclick = () => { mode = signup ? "login" : "signup"; draw(); };
    root.querySelector("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const u = root.querySelector("#lu").value.trim().toLowerCase();
      const p = root.querySelector("#lp").value;
      if (!/^[a-z0-9_]{3,20}$/.test(u)) return draw("Brugernavnet skal være 3–20 tegn: små bogstaver, tal og _.");
      if (p.length < 6) return draw("Password skal være mindst 6 tegn.");
      try {
        if (signup) await api.signUp(u, p); else await api.signIn(u, p);
        onLoggedIn();
      } catch (ex) {
        const msg = /Invalid login/i.test(ex.message) ? "Forkert brugernavn eller password."
          : /already registered/i.test(ex.message) ? "Brugernavnet er taget." : ex.message;
        draw(msg);
      }
    };
  };
  draw();
}
