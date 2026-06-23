<script lang="ts" generics="T">
  import { type Snippet } from 'svelte';

  let { 
    items, 
    itemHeight, 
    minItemWidth = '100%', 
    gap = 0, 
    key,
    row 
  } = $props<{
    items: T[];
    itemHeight: number;
    minItemWidth?: string | number;
    gap?: number;
    key?: (item: T) => string | number;
    row: Snippet<[T, number]>;
  }>();

  let containerElement: HTMLElement | undefined = $state();
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let scrollTop = $state(0);

  let columns = $derived.by(() => {
    if (typeof minItemWidth === 'string' && minItemWidth.endsWith('%')) {
      return 1;
    }
    const minW = typeof minItemWidth === 'number' ? minItemWidth : parseFloat(minItemWidth);
    if (!minW || containerWidth === 0) return 1;
    return Math.max(1, Math.floor((containerWidth + gap) / (minW + gap)));
  });

  let totalRows = $derived(Math.ceil(items.length / columns));
  let totalHeight = $derived(totalRows * itemHeight + Math.max(0, totalRows - 1) * gap);

  let startRow = $derived(Math.max(0, Math.floor(scrollTop / (itemHeight + gap))));
  let visibleRows = $derived(containerHeight === 0 ? 10 : Math.ceil(containerHeight / (itemHeight + gap)));
  
  let overscan = 4;
  
  let renderStartRow = $derived(Math.max(0, startRow - overscan));
  let renderEndRow = $derived(Math.min(totalRows, startRow + visibleRows + overscan));

  let visibleItems = $derived.by(() => {
    const startIndex = renderStartRow * columns;
    const endIndex = Math.min(items.length, renderEndRow * columns);
    const result = [];
    for (let i = startIndex; i < endIndex; i++) {
      const rowIndex = Math.floor(i / columns);
      const colIndex = i % columns;
      const top = rowIndex * (itemHeight + gap);
      
      result.push({
        index: i,
        data: items[i],
        top,
        colIndex,
      });
    }
    return result;
  });

  let ticking = false;
  function handleScroll() {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (containerElement) {
          scrollTop = containerElement.scrollTop;
        }
        ticking = false;
      });
      ticking = true;
    }
  }

  $effect(() => {
    if (!containerElement) return;
    
    // Configurar estado inicial
    containerWidth = containerElement.clientWidth;
    containerHeight = containerElement.clientHeight;
    scrollTop = containerElement.scrollTop;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth = entry.contentRect.width;
        containerHeight = entry.contentRect.height;
      }
    });
    
    observer.observe(containerElement);
    
    return () => {
      observer.disconnect();
    };
  });
</script>

<div 
  class="virtual-grid-container" 
  bind:this={containerElement} 
  onscroll={handleScroll}
>
  <div class="virtual-grid-inner" style="height: {totalHeight}px;">
    {#each visibleItems as item (key ? key(item.data) : item.index)}
      <div 
        class="virtual-grid-item" 
        style="
          top: {item.top}px;
          height: {itemHeight}px;
          width: calc((100% - {(columns - 1) * gap}px) / {columns});
          left: calc({item.colIndex} * ((100% - {(columns - 1) * gap}px) / {columns} + {gap}px));
        "
      >
        {@render row(item.data, item.index)}
      </div>
    {/each}
  </div>
</div>

<style>
  .virtual-grid-container {
    height: 100%;
    width: 100%;
    overflow-y: auto;
    position: relative;
    /* Optimización extra para el scroll en virtual lists */
    will-change: transform, scroll-position;
  }
  
  .virtual-grid-container::-webkit-scrollbar {
    width: 14px;
  }
  
  .virtual-grid-container::-webkit-scrollbar-thumb {
    background-color: var(--outline-variant);
    border: 4px solid var(--surface-container-low);
    border-radius: 99px;
  }

  .virtual-grid-inner {
    position: relative;
    width: 100%;
  }

  .virtual-grid-item {
    position: absolute;
    box-sizing: border-box;
    /* Se remueve display flex para no alterar el layout de los hijos a menos que lo deseen */
  }
</style>
