export const DEFAULT_RPC_TIMEOUT_MS = 120_000;
export const DEFAULT_RPC_MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

export class NonRetryableRpcError extends Error {}

/** `url` for an error message, without the query string or hash (API keys). */
function urlForError(url: string): string {
  try {
    const { origin, pathname } = new URL(url);
    return origin + pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? "";
  }
}

/** Read a response body as UTF-8 text, refusing more than `maxBytes`. */
async function readCapped(
  response: Response,
  url: string,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new NonRetryableRpcError(
        `Demos RPC response from ${urlForError(url)} exceeded the ${maxBytes}-byte size cap`,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
}

/**
 * Fetch one RPC URL within `timeoutMs`, headers and body included. With
 * `readBody`, an OK body is read as text up to `maxBytes`; any other body is
 * cancelled so its connection does not outlive the call.
 */
export async function fetchBounded(
  url: string,
  init: RequestInit,
  readBody: boolean,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response | undefined;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    if (!readBody || !response.ok) {
      await response.body?.cancel().catch(() => {});
      return { response, text: "" };
    }
    return { response, text: await readCapped(response, url, maxBytes) };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new NonRetryableRpcError(
        `Demos RPC request to ${urlForError(url)} exceeded the ${timeoutMs} ms deadline`,
        { cause: error },
      );
    }
    // The node has answered, so it may have acted on the request: never resend.
    if (!response || error instanceof NonRetryableRpcError) throw error;
    throw new NonRetryableRpcError(
      `Demos RPC response from ${urlForError(url)} could not be read`,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}
