/// <reference types="vite/client" />
import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'md-dialog': any;
      'md-filled-button': any;
      'md-tonal-button': any;
      'md-outlined-button': any;
      'md-text-button': any;
      'md-icon-button': any;
      'md-filled-icon-button': any;
      'md-filled-tonal-icon-button': any;
      'md-assist-chip': any;
      'md-linear-progress': any;
      'md-outlined-text-field': any;
      'md-checkbox': any;
      'md-tabs': any;
      'md-primary-tab': any;
      'md-elevation': any;
      'md-divider': any;
      'md-circular-progress': any;
    }
  }
}
