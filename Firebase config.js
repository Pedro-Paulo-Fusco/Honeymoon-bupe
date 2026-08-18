// ─────────────────────────────────────────────────────────────
//  Projeto: Honeymoon-2026 (honeymoon-2026-bupe)
//
//  Estas chaves ficam visíveis no navegador por design — o que
//  protege os dados são as regras do Realtime Database, não elas.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCe4nziLU7Ihh6nyLfVETm-JYROP9EEclI",
  authDomain: "honeymoon-2026-bupe.firebaseapp.com",
  databaseURL: "https://honeymoon-2026-bupe-default-rtdb.firebaseio.com",
  projectId: "honeymoon-2026-bupe",
  storageBucket: "honeymoon-2026-bupe.firebasestorage.app",
  messagingSenderId: "460028716679",
  appId: "1:460028716679:web:9dbc54d11851131db07a22"
};

// Não precisa mexer daqui para baixo.
export const configurado = !JSON.stringify(firebaseConfig).includes("COLE_AQUI");