export type DistributionChannel = "play" | "direct";

export const CHANNEL: DistributionChannel =
  (import.meta.env.VITE_DISTRIBUTION_CHANNEL as DistributionChannel) || "play";

export const IS_PLAY = CHANNEL === "play";
export const IS_DIRECT = CHANNEL === "direct";