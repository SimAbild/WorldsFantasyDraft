// Ansvar: Konfiguration samlet ét sted – forbindelse til Supabase og tidszone.
// Den offentlige nøgle må gerne ligge her, fordi RLS styrer adgangen.

export const SUPABASE_URL = "https://upeazblgasdqxmyaievq.supabase.co";
export const SUPABASE_KEY = "sb_publishable_pQRwbR5du-bdUEElpgydXQ_uTTGul3m";

// Supabase Auth kræver en e-mail, så brugernavnet bliver til en intern adresse
export const EMAIL_DOMAIN = "users.worldsfantasy.app";

// Alle tider vises i dansk tid
export const TIME_ZONE = "Europe/Copenhagen";
