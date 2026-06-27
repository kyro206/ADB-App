import debloatData from '../assets/debloat-data.json';

export interface DebloatInfo {
  id: string;
  label?: string;
  description: string;
  removal: "delete" | "replace" | "caution" | "unsafe";
  warning?: string;
}

const REMOVAL_MAP = ["delete", "replace", "caution", "unsafe"] as const;

export function getDebloatInfo(packageName: string): DebloatInfo | undefined {
  for (const removal of REMOVAL_MAP) {
    // @ts-ignore
    const item = debloatData[removal]?.[packageName];
    if (item) {
      return {
        id: packageName,
        removal: removal,
        description: typeof item === "string" ? item : item[0],
        warning: typeof item === "string" ? undefined : item[1]
      };
    }
  }
  return undefined;
}