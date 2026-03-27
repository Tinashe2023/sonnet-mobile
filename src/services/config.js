// ============================================
// BACKEND SERVER URL CONFIGURATION
// ============================================
// Expo uses EXPO_PUBLIC_ prefix to expose env vars to the client bundle.
// Set EXPO_PUBLIC_SERVER_URL in your .env or Vercel environment variables
// to override the default production URL below.
// For local development, create a .env file with:
//   EXPO_PUBLIC_SERVER_URL=http://192.168.x.x:3004
// ============================================
const envServerUrl =
  process.env.EXPO_PUBLIC_SERVER_URL ||
  process.env.REACT_APP_SERVER_URL ||
  process.env.SERVER_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL;

export const SERVER_URL = envServerUrl || "https://sonnet-473j.onrender.com";
