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
  // @ts-ignore: debloatData is a dictionary mapping strings to tuples
  const item = debloatData[packageName];
  if (!item) return undefined;
  
  return {
    id: packageName,
    removal: REMOVAL_MAP[item[0]],
    description: item[1] || "",
    warning: item[2]
  };
}