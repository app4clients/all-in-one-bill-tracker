import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.app4clients.allinonebilltracker",
  appName: "All-in-One Bill Tracker",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    LocalNotifications: {
      // Monochrome status-bar icon for local notifications.
      smallIcon: "ic_stat_bill_tracker",
    },
  },
};

export default config;