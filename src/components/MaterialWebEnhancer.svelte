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
    const pendingElements = new Set<HTMLElement>();
    let animationFrame = 0;

    const flushPendingElements = () => {
      animationFrame = 0;
      for (const element of pendingElements) {
        if (element instanceof HTMLButtonElement) enhanceButton(element);
        element.querySelectorAll<HTMLButtonElement>('button').forEach(enhanceButton);
      }
      pendingElements.clear();
    };

    const queueElement = (element: HTMLElement) => {
      pendingElements.add(element);
      if (!animationFrame) {
        animationFrame = requestAnimationFrame(flushPendingElements);
      }
    };

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          queueElement(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      observer.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
      pendingElements.clear();
    };
  });
</script>
