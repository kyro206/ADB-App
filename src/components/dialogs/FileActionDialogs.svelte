<script lang="ts" module>
  export type FilePromptConfig = {
    open: boolean;
    title: string;
    initialValue: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  };

  export type FilePermissionsConfig = {
    open: boolean;
    title: string;
    initialMode: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  };

  export type FileConfirmConfig = {
    open: boolean;
    title: string;
    message: string;
    isDanger: boolean;
    confirmText: string;
    onConfirm: () => void;
    onCancel: () => void;
  };
</script>

<script lang="ts">
  import PromptDialog from './PromptDialog.svelte';
  import PermissionsDialog from './PermissionsDialog.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let {
    promptConfig,
    permissionsConfig,
    confirmConfig,
  } = $props<{
    promptConfig: FilePromptConfig | null;
    permissionsConfig: FilePermissionsConfig | null;
    confirmConfig: FileConfirmConfig | null;
  }>();
</script>

{#if promptConfig}
  <PromptDialog
    open={promptConfig.open}
    title={promptConfig.title}
    initialValue={promptConfig.initialValue}
    onConfirm={promptConfig.onConfirm}
    onCancel={promptConfig.onCancel}
  />
{/if}

{#if permissionsConfig}
  <PermissionsDialog
    open={permissionsConfig.open}
    title={permissionsConfig.title}
    initialMode={permissionsConfig.initialMode}
    onConfirm={permissionsConfig.onConfirm}
    onCancel={permissionsConfig.onCancel}
  />
{/if}

{#if confirmConfig}
  <ConfirmDialog
    open={confirmConfig.open}
    title={confirmConfig.title}
    message={confirmConfig.message}
    confirmText={confirmConfig.confirmText}
    isDanger={confirmConfig.isDanger}
    onConfirm={confirmConfig.onConfirm}
    onCancel={confirmConfig.onCancel}
  />
{/if}
