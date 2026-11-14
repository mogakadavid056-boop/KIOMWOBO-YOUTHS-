import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.kiomwobo.youths',
  appName: 'KIOMWOBO YOUTHS',
  webDir: 'dist',
  backgroundColor: '#080610',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#080610',
    allowMixedContent: false,
  },
};

export default config;
