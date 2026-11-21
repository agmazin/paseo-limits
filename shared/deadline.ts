export async function withTimeout<T>(task: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    stop = () => { clearTimeout(timer); reject(new Error("Request cancelled")); };
    if (signal?.aborted) return stop();
    signal?.addEventListener("abort", stop, { once: true });
    timer = setTimeout(() => reject(new Error("Request timed out")), ms);
  });
  try {
    return await Promise.race([task, deadline]);
  } finally {
    clearTimeout(timer);
    if (stop) signal?.removeEventListener("abort", stop);
  }
}
