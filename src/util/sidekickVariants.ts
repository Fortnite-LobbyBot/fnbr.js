import type { CosmeticVariant } from '../../resources/structs';

export interface SidekickVariantChannel {
  t: string;
  n?: string;
  o?: { t: string; n?: string }[];
}

const SIDEKICK_VARIANT_LEADING_PADDING = 2;

export function encodeSidekickLoadoutVariants(
  _sidekickId: string,
  channels: SidekickVariantChannel[] = [],
  selected: CosmeticVariant[] = []
): string[] {
  const indices = channels.length
    ? channels.map((_, channelIndex) => String(selected[channelIndex]?.variantIndex ?? 0))
    : selected.map((variant) => variant.variantIndex.toString());

  return [...Array(SIDEKICK_VARIANT_LEADING_PADDING).fill(''), ...indices];
}

export function decodeSidekickLoadoutVariants(
  value: Record<string, string> | string[] | undefined
): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(String);
  return Object.entries(value)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, entry]) => entry);
}
