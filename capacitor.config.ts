import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.app4clients.allinonebilltracker.play',
  appName: 'All-in-One Bill Tracker',
  webDir: 'dist',
  android: {
    buildOptions: {
      releaseType: 'APK',
      keystorePath: '../keystore-playstore.jks',
      keystoreAlias: 'playstore-key',
    }
  }
};

export default config;