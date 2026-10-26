import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabase";
export function useLiveData(loader, dependencies = []) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
    updated: null,
  });
  const [connection, setConnection] = useState(
    supabase ? "Connecting" : "Not connected",
  );
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await loaderRef.current();
      if (request === sequence.current)
        setState({ data, loading: false, error: null, updated: new Date() });
    } catch (error) {
      if (request === sequence.current)
        setState((old) => ({ ...old, loading: false, error: error.message }));
    }
  }, []);
  useEffect(() => {
    let alive = true,
      timer;
    const run = () => {
      if (alive) refresh();
    };
    run();
    if (!supabase)
      return () => {
        alive = false;
        sequence.current++;
      };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    };
    const channel = supabase.channel(`pulse-${crypto.randomUUID()}`);
    for (const table of ["voting_sessions", "teams", "result_signals"])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule,
      );
    channel.subscribe((status) => {
      if (alive) {
        setConnection(
          status === "SUBSCRIBED"
            ? "Live"
            : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? "Reconnecting · polling"
              : "Connecting",
        );
        if (status === "SUBSCRIBED") run();
      }
    });
    const polling = setInterval(run, 10000);
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    return () => {
      alive = false;
      sequence.current++;
      clearTimeout(timer);
      clearInterval(polling);
      supabase.removeChannel(channel);
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
    };
    // Stable caller-supplied dependencies control the query scope.
  }, [refresh, ...dependencies]);
  return { ...state, refresh, connection };
}
