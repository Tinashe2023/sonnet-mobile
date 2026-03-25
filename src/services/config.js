// ============================================
// UPDATE THIS URL TO YOUR BACKEND SERVER URL
// ============================================
const envServerUrl =
  process.env.REACT_APP_SERVER_URL ||
  process.env.SERVER_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL;
export const SERVER_URL = envServerUrl || "http://localhost:3004";

// Example: 'https://sonnet-xxxx.onrender.com'
// For local development: 'http://192.168.x.x:3004'
