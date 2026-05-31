import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.app4clients.allinonebilltracker.amazon',
  appName: 'All-in-One Bill Tracker',
  webDir: 'dist',
  android: {
    buildOptions: {
      releaseType: 'APK',
      keystorePath: '../keystore-amazon.jks',
      keystoreAlias: 'amazon-key',
    }
  }
};

export default config;