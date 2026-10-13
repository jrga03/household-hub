const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const STORED = 0;
const DEFLATED = 8;

interface ZipEntry {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const inflated = source.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(inflated).arrayBuffer());
}

/**
 * Opens a zip archive (no zip64, no encryption) and returns a reader for its
 * files as text, or null when the bytes aren't a zip.
 */
export function openZip(
  zip: Uint8Array<ArrayBuffer>
): ((name: string) => Promise<string | undefined>) | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== END_OF_DIRECTORY) end--;
  if (end < 0) return null;

  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  let offset = view.getUint32(end + 16, true);
  for (let count = view.getUint16(end + 10, true); count > 0; count--) {
    if (offset + 46 > zip.byteLength || view.getUint32(offset, true) !== DIRECTORY_ENTRY) {
      return null;
    }
    const nameLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset +=
      46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }

  return async (name) => {
    const entry = entries.get(name);
    if (!entry) return undefined;
    const local = entry.localHeaderOffset;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const bytes = zip.slice(start, start + entry.compressedSize);
    if (entry.method === STORED) return decoder.decode(bytes);
    if (entry.method === DEFLATED) return decoder.decode(await inflateRaw(bytes));
    throw new Error(`Unsupported zip compression method ${entry.method}`);
  };
}
