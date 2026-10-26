import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    user: null,
    admin: false,
    loading: Boolean(supabase),
  });
  useEffect(() => {
    if (!supabase) return;
    let alive = true,
      generation = 0;
    async function update(session) {
      const current = ++generation;
      if (alive)
        setAuth({ user: session?.user || null, admin: false, loading: true });
      let admin = false;
      if (session) {
        const { data } = await supabase.rpc("is_admin");
        admin = data === true;
      }
      if (alive && current === generation)
        setAuth({ user: session?.user || null, admin, loading: false });
    }
    supabase.auth.getSession().then(({ data }) => update(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => update(session), 0);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
