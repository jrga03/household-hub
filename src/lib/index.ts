// Currency utilities
export { formatPHP, parsePHP, validateAmount } from "./currency";

// Currency types
export type { AmountCents, CurrencyCode, TransactionType } from "@/types/currency";
export { amountCents, MAX_AMOUNT_CENTS } from "@/types/currency";

// Device management (using production-ready implementation from dexie/)
export { deviceManager, getDeviceId, clearDeviceId, hasDeviceId } from "./dexie/deviceManager";
export type { DeviceInfo, DevicePlatform, DeviceIdSource } from "@/types/device";
