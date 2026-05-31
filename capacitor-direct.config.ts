import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.app4clients.allinonebilltracker.direct',
  appName: 'All-in-One Bill Tracker',
  webDir: 'dist',
  android: {
    buildOptions: {
      releaseType: 'APK',
      keystorePath: '../keystore-direct.jks',
      keystoreAlias: 'direct-key',
    }
  }
};

export default config;