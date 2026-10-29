'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, Role } from '@/lib/supabase';

export type Employee = {
  id: string; emp_code: string; full_name: string; position: string | null; client_company: string | null;
  start_date: string | null; daily_wage: number; phone: string | null; email: string | null;
  bank_name: string | null; bank_account_name: string | null; bank_account_no: string | null;
};
type Ctx = { session: Session | null; role: Role | null; employee: Employee | null; loading: boolean; reload: () => Promise<void>; signOut: () => Promise<void> };
const C = createContext<Ctx>({ session: null, role: null, employee: null, loading: true, reload: async () => {}, signOut: async () => {} });
export const useAuth = () => useContext(C);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setRole(null); setEmployee(null); setLoading(false); return; }
    await supabase.rpc('link_me');
    const { data: p } = await supabase.from('profiles').select('role').eq('user_id', s.user.id).maybeSingle();
    setRole((p?.role as Role) ?? 'employee');
    const { data: e } = await supabase.from('employees').select('*').eq('user_id', s.user.id).maybeSingle();
    setEmployee((e as Employee) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(prev => (prev?.user.id === s?.user.id ? s : s));
      if (_ev === 'SIGNED_IN' || _ev === 'SIGNED_OUT') load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  return (
    <C.Provider value={{
      session, role, employee, loading,
      reload: () => load(session),
      signOut: async () => { await supabase.auth.signOut(); },
    }}>{children}</C.Provider>
  );
}
