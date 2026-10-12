const uuidBytes = (uuid: string) =>
  Uint8Array.from(uuid.replace(/-/g, "").match(/../g) ?? [], (pair) => parseInt(pair, 16));

/** RFC 9562 UUIDv5: the same namespace and name give the same ID on every device. */
export async function uuidV5(namespace: string, name: string): Promise<string> {
  const input = new Uint8Array([...uuidBytes(namespace), ...new TextEncoder().encode(name)]);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
