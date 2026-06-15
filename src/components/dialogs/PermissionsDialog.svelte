<script lang="ts">
import * as m from '../../paraglide/messages';

  
  import AppModal from './AppModal.svelte';
  import './PermissionsDialog.css';

  let {
    open = false,
    title,
    initialMode = '755',
    onConfirm,
    onCancel
  } = $props<{
    open: boolean;
    title: string;
    initialMode?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  }>();

  let octal = $state('755');

  $effect(() => {
    if (open) {
      const match = initialMode.match(/([0-7]{3})$/);
      octal = match ? match[1] : '755';
    }
  });

  function parseOctal(o: string) {
    const num = parseInt(o || '0', 8);
    if (isNaN(num)) return [0, 0, 0];
    return [
      (num >> 6) & 7,
      (num >> 3) & 7,
      num & 7
    ];
  }

  let perms = $derived(parseOctal(octal));

  function toggleBit(groupIndex: number, bit: number) {
    const newPerms = [...perms];
    newPerms[groupIndex] ^= bit;
    octal = newPerms.map(p => p.toString(8)).join('');
  }

  function handleOctalInput(e: any) {
    let val = e.target.value.replace(/[^0-7]/g, '').slice(0, 3);
    octal = val;
  }

  function handleConfirm() {
    let finalOctal = octal;
    while (finalOctal.length < 3) finalOctal += '0';
    onConfirm(finalOctal);
  }

  function hasBit(p: number, bit: number) {
    return (p & bit) === bit;
  }
</script>

<AppModal {open} {title} onClose={onCancel} width="compact">
  <div class="permissions-dialog-content">
    <div class="permissions-grid">
      <div></div>
      <div class="header">{m.files_permissions_read()}</div>
      <div class="header">{m.files_permissions_write()}</div>
      <div class="header">{m.files_permissions_execute()}</div>

      <div class="row-label">{m.files_permissions_owner()}</div>
      <md-checkbox checked={hasBit(perms[0], 4) ? true : undefined} oninput={() => toggleBit(0, 4)}></md-checkbox>
      <md-checkbox checked={hasBit(perms[0], 2) ? true : undefined} oninput={() => toggleBit(0, 2)}></md-checkbox>
      <md-checkbox checked={hasBit(perms[0], 1) ? true : undefined} oninput={() => toggleBit(0, 1)}></md-checkbox>

      <div class="row-label">{m.files_permissions_group()}</div>
      <md-checkbox checked={hasBit(perms[1], 4) ? true : undefined} oninput={() => toggleBit(1, 4)}></md-checkbox>
      <md-checkbox checked={hasBit(perms[1], 2) ? true : undefined} oninput={() => toggleBit(1, 2)}></md-checkbox>
      <md-checkbox checked={hasBit(perms[1], 1) ? true : undefined} oninput={() => toggleBit(1, 1)}></md-checkbox>

      <div class="row-label">{m.files_permissions_others()}</div>
      <md-checkbox checked={hasBit(perms[2], 4) ? true : undefined} oninput={() => toggleBit(2, 4)}></md-checkbox>
      <md-checkbox checked={hasBit(perms[2], 2) ? true : undefined} oninput={() => toggleBit(2, 2)}></md-checkbox>
      <md-checkbox checked={hasBit(perms[2], 1) ? true : undefined} oninput={() => toggleBit(2, 1)}></md-checkbox>
    </div>
    
    <div class="permissions-octal">
      <span>{m.files_permissions_octal()}</span>
      <md-outlined-text-field 
        value={octal} 
        oninput={handleOctalInput} 
      ></md-outlined-text-field>
    </div>
  </div>

  {#snippet actions()}
    <md-text-button onclick={onCancel}>{m.common_cancel()}</md-text-button>
    <md-filled-button onclick={handleConfirm}>{m.common_confirm()}</md-filled-button>
  {/snippet}
</AppModal>
