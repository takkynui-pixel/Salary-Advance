'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function Home() {
  const { session, role, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else router.replace(role === 'hr' || role === 'finance' || role === 'admin' ? '/staff' : '/me');
  }, [loading, session, role, router]);
  return <div className="shell"><div className="panel"><p className="sub">กำลังโหลด...</p></div></div>;
}
