<script lang="ts">
  import { onMount } from 'svelte';
  import '@material/web/ripple/ripple.js';

  function enhanceButton(button: HTMLButtonElement) {
    if (button.dataset.materialWeb === 'true' || button.dataset.noMaterialRipple === 'true' || button.classList.contains('topbar__window-control')) return;
    const ripple = document.createElement('md-ripple');
    ripple.setAttribute('aria-hidden', 'true');
    button.prepend(ripple);
    button.dataset.materialWeb = 'true';
  }

  onMount(() => {
    document.querySelectorAll<HTMLButtonElement>('button').forEach(enhanceButton);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node instanceof HTMLButtonElement) enhanceButton(node);
          node.querySelectorAll<HTMLButtonElement>('button').forEach(enhanceButton);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => observer.disconnect();
  });
</script>
