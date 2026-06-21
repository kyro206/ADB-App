<script lang="ts">
  let {
    name,
    filled = false,
    size,
    class: className = '',
    slot,
    title,
    style: customStyle = ''
  } = $props<{
    name: string;
    filled?: boolean;
    size?: number | string;
    class?: string;
    slot?: string;
    title?: string;
    style?: string;
  }>();

  let inlineStyle = $derived(
    `font-variation-settings: 'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24;` +
    (size ? `font-size: ${typeof size === 'number' ? size + 'px' : size};` : '') +
    (customStyle ? `${customStyle}` : '')
  );

  function applySlot(node: HTMLElement, slotName: string | undefined = undefined) {
    if (slotName) node.setAttribute('slot', slotName);
    return {
      update(newSlotName: string | undefined = undefined) {
        if (newSlotName) node.setAttribute('slot', newSlotName);
        else node.removeAttribute('slot');
      }
    };
  }
</script>

<span 
  class="material-symbols-rounded {className}" 
  style={inlineStyle} 
  aria-hidden="true" 
  use:applySlot={slot}
  {title}
>
  {name}
</span>
