import type { CapacitorConfig } from "@capacitor/cli";

// The Android app: the client portal only (login, signup and /portal/*),
// built into client/dist-portal by `npm run build:portal`. Staff and admin
// screens stay on the web (client/dist) and are never packaged. One app for
// every shop: each shop's name, colour and logo come from /shop after login.
const config: CapacitorConfig = {
  appId: "com.purespaexperience.app",
  appName: "Pure Spa Experience",
  webDir: "client/dist-portal",
  // Android's WebView serves the app from https://localhost, which the
  // server's CORS lets through (step 7.3).
  server: { androidScheme: "https" },
  plugins: {
    // Hidden by the app after its first paint, so the shop's colours are on screen first.
    SplashScreen: { launchAutoHide: false, backgroundColor: "#faf7f2" },
    LocalNotifications: { smallIcon: "ic_stat_icon", iconColor: "#8B6F4E" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
