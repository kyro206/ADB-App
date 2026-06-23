<script lang="ts">
  import { themeState } from '../context/theme.svelte';

  let { size = 24, color = undefined } = $props<{
    size?: number;
    color?: string;
  }>();

  let useDynamicColors = $derived(themeState.materialYouEnabled && themeState.hasActiveDynamicPalette);
  let logoColor = $derived(color ?? (useDynamicColors ? 'var(--md-sys-color-primary)' : '#34a853'));

  // ID único para evitar conflictos si hay varios logos en la misma página
  const maskId = `logo-mask-${Math.random().toString(36).slice(2, 11)}`;
</script>

<svg
  class="logo-svg"
  width={size}
  height={size}
  viewBox="0 0 100 100"
  role="img"
  aria-label="Cute ghost app logo"
  data-tauri-drag-region
  xmlns="http://www.w3.org/2000/svg"
  style:color={logoColor}
>
  <defs>
    <mask id={maskId}>
      <rect width="100" height="100" fill="white" />

      <!-- Ojos -->
      <circle cx="36" cy="40" r="4.2" fill="black" />
      <circle cx="64" cy="40" r="4.2" fill="black" />

      <!-- Sonrisa -->
      <path
        d="M44.5 54.5 C47.5 56.4 52.5 56.4 55.5 54.5"
        fill="none"
        stroke="black"
        stroke-width="2.9"
        stroke-linecap="round"
      />
    </mask>
  </defs>

  <g class="logo-fill" mask={`url(#${maskId})`} data-tauri-drag-region>
    <!-- Palitos -->
    <path
      d="M36.5 27 L30.5 14.5"
      fill="none"
      stroke-width="5.4"
      stroke-linecap="round"
    />
    <path
      d="M63.5 27 L69.5 14.5"
      fill="none"
      stroke-width="5.4"
      stroke-linecap="round"
    />

    <!-- Cuerpo -->
    <path
      d="
        M50 21
        C31.5 21 20.5 33.5 19.5 52
        C19 61.5 17.3 69.7 14.8 76.8
        C12.9 82.2 16.4 86.7 22.1 86.1
        C28 85.5 30.6 80.8 36.6 80.8
        C42.4 80.8 44.1 86.5 50 86.5
        C55.9 86.5 57.6 80.8 63.4 80.8
        C69.4 80.8 72 85.5 77.9 86.1
        C83.6 86.7 87.1 82.2 85.2 76.8
        C82.7 69.7 81 61.5 80.5 52
        C79.5 33.5 68.5 21 50 21
        Z
      "
      stroke="none"
    />
  </g>
</svg>

<style>
  .logo-svg {
    display: inline-block;
    user-select: none;
    -webkit-user-drag: none;
    flex-shrink: 0;
    pointer-events: none;
    overflow: visible;
    transition: color var(--transition-fast, 150ms ease);
  }

  .logo-fill {
    fill: currentColor;
    stroke: currentColor;
  }
</style>
