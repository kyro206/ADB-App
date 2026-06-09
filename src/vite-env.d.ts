/// <reference types="vite/client" />
import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'md-filled-button': any;
      'md-filled-tonal-button': any;
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
      'md-switch': any;
      'md-tabs': any;
      'md-primary-tab': any;
      'md-outlined-select': any;
      'md-select-option': any;
      'md-menu': any;
      'md-menu-item': any;
      'md-ripple': any;
      'md-elevation': any;
      'md-divider': any;
      'md-circular-progress': any;
      'md-slider': any;
    }
  }
}