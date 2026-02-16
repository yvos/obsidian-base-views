import { App } from 'obsidian';

export interface IconicIconInfo {
  icon: string | null;
  color: string | null;
}

type IconicRule = {
  icon?: string | null;
  color?: string | null;
};

type IconicFileItem = {
  icon?: string | null;
  color?: string | null;
};

type IconicPluginLike = {
  ruleManager?: {
    checkRuling?: (page: string, itemId: string) => IconicRule | null;
  };
  getFileItem?: (itemId: string) => IconicFileItem | null;
};

export function getIconicIconInfo(
  app: App,
  filePath: string,
): IconicIconInfo | null {
  const plugin = (app as any)?.plugins?.getPlugin?.('iconic') as
    | IconicPluginLike
    | undefined;
  if (!plugin) {
    return null;
  }

  try {
    const rule = plugin.ruleManager?.checkRuling?.('file', filePath) ?? null;
    const fileItem = plugin.getFileItem?.(filePath) ?? null;
    const icon = rule?.icon ?? fileItem?.icon ?? null;
    const color = rule?.color ?? fileItem?.color ?? null;
    const normalizedIcon = typeof icon === 'string' && icon.length > 0
      ? icon
      : null;
    const normalizedColor = typeof color === 'string' && color.length > 0
      ? color
      : null;

    if (!normalizedIcon && !normalizedColor) {
      return null;
    }

    return { icon: normalizedIcon, color: normalizedColor };
  } catch {
    return null;
  }
}
