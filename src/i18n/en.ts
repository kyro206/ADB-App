export const en = {
  'app.name': 'ADB App',
  'app.version': '1.0.0',

  // Navigation
  'nav.home': 'Overview',
  'nav.display': 'Display',
  'nav.mirroring': 'Mirroring',
  'nav.control': 'Input',
  'nav.apps': 'Apps',
  'nav.files': 'Files',
  'nav.system': 'System',
  'nav.settings': 'Settings',

  // Top bar
  'main.device.label': 'Device:',
  'main.refresh': 'Refresh devices',
  'main.wireless': 'Wi-Fi assistant',
  'main.tcpip': 'Connect USB over TCP/IP',

  // Common
  'common.noData': 'No data',
  'common.none': 'none',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.loading': 'Loading...',
  'common.error': 'Error',

  // Home
  'home.capture': 'Capture screenshot',
  'home.saveCapture': 'Save screenshot',
  'home.field.state': 'State',
  'home.field.deviceType': 'Type',
  'home.field.serial': 'Serial',
  'home.field.manufacturer': 'Manufacturer',
  'home.field.brand': 'Brand',
  'home.field.model': 'Model',
  'home.field.codename': 'Codename',
  'home.field.product': 'Product',
  'home.field.architecture': 'Architecture',
  'home.field.battery': 'Battery',
  'home.ram.inUse': 'RAM in use',
  'home.storage.inUse': 'Storage in use',
  'home.summary.empty': 'Select a connected device to view its summary',
  'home.preview.empty.title': 'No screenshots yet',
  'home.preview.empty.subtitle': 'The latest screenshot will appear here',

  // States
  'state.connected': 'Connected',
  'state.connecting': 'Connecting',
  'state.unauthorized': 'Unauthorized',
  'state.offline': 'Offline',
  'state.recovery': 'Recovery',
  'state.unknown': 'Unknown',

  // Device types
  'device.type.phone': 'Phone',
  'device.type.tablet': 'Tablet',
  'device.type.foldable': 'Foldable',
  'device.type.watch': 'Watch',
  'device.type.tv': 'TV',
  'device.type.automotive': 'Automotive',
  'device.type.desktop': 'Desktop',
  'device.type.embedded': 'Embedded',
  'device.type.device': 'Device',
  'device.type.unknown': 'Unknown',

  // Settings
  'settings.title': 'Settings',
  'settings.subtitle': 'Customize the app and adjust its general behavior.',
  'settings.theme': 'Theme',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.language': 'Language',
  'settings.language.english': 'English',
  'settings.language.spanish': 'Spanish',

  // Errors
  'error.devices.load': 'Could not load devices.',
  'error.capture': 'Could not capture the screenshot.',
  'error.capture.invalidImage': 'ADB returned screenshot data in an invalid format.',
} as const;

export type TranslationKey = keyof typeof en;
