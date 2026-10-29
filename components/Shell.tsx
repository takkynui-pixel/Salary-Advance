'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export type Tab = { key: string; label: string };

export default function Shell({ tabs, tab, onTab, children, need }: {
  tabs?: Tab[]; tab?: string; onTab?: (k: string) => void; children: React.ReactNode; need: 'employee' | 'staff';
}) {
  const { session, role, loading, signOut, employee } = useAuth();
  const router = useRouter();
  const staff = role === 'hr' || role === 'finance' || role === 'admin';

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (need === 'staff' && !staff) router.replace('/me');
    else if (need === 'employee' && staff && !employee) router.replace('/staff');
  }, [loading, session, staff, need, employee, router]);

  if (loading || !session) return <div className="shell"><div className="panel"><p className="sub">กำลังโหลด...</p></div></div>;
  const initial = (employee?.full_name || session.user.email || 'A').trim().charAt(0).toUpperCase();

  return (
    <div className="shell"><div className="panel">
      <header className="topbar">
        <img className="logo" src="/logo.png" alt="VTA Service" />
        <nav className="nav" aria-label="เมนูหลัก">
          {tabs?.map(t => (
            <button key={t.key} className={'pill' + (tab === t.key ? ' active' : '')} onClick={() => onTab?.(t.key)}>{t.label}</button>
          ))}
        </nav>
        <button className="avatar" title="ออกจากระบบ" aria-label="ออกจากระบบ"
          onClick={async () => { await signOut(); router.replace('/login'); }}>{initial}</button>
      </header>
      {children}
    </div></div>
  );
}
