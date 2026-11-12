import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zombieheadstudios.superbreaker',
  appName: 'Super Breaker',
  webDir: 'dist',
  backgroundColor: '#0b0820',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0b0820',
      showSpinner: false,
    },
  },
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#0b0820' },
};

export default config;
