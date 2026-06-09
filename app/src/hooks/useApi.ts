import { useState, useCallback, useRef, useEffect } from "react";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiOptions {
  retryCount?: number;
  retryDelayMs?: number;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  options: UseApiOptions = {}
) {
  const { retryCount = 0, retryDelayMs = 1000 } = options;
  const [state, setState] = useState<UseApiState<T>>({ data: null, loading: true, error: null });
  const retriesRef = useRef(0);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    retriesRef.current = 0;

    const attempt = async (): Promise<void> => {
      try {
        const result = await fetcher();
        if (mountedRef.current) {
          setState({ data: result, loading: false, error: null });
        }
      } catch (err) {
        if (retriesRef.current < retryCount) {
          retriesRef.current++;
          await new Promise(r => setTimeout(r, retryDelayMs * Math.pow(2, retriesRef.current - 1)));
          return attempt();
        }
        if (mountedRef.current) {
          setState({
            data: null,
            loading: false,
            error: err?.detail || err?.message || "An unexpected error occurred.",
          });
        }
      }
    };

    await attempt();
  }, [fetcher, retryCount, retryDelayMs]);

  useEffect(() => {
    mountedRef.current = true;
    execute();
    return () => { mountedRef.current = false; };
  }, [execute]);

  return { ...state, refetch: execute };
}
