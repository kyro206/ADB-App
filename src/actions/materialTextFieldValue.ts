type MaterialTextField = HTMLElement & { value?: string };

export function materialTextFieldValue(node: MaterialTextField, value: string | number | null | undefined) {
  const setValue = (nextValue: string | number | null | undefined) => {
    const next = nextValue == null ? '' : String(nextValue);
    if (node.value !== next) {
      node.value = next;
    }
  };

  setValue(value);

  return {
    update: setValue,
  };
}
