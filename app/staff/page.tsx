'use client';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Shell from '@/components/Shell';
import RequestsTab from '@/components/staff/RequestsTab';
import AttendanceTab from '@/components/staff/AttendanceTab';
import EmployeesTab from '@/components/staff/EmployeesTab';
import PeriodsTab from '@/components/staff/PeriodsTab';
import SettingsTab from '@/components/staff/SettingsTab';

export default function Staff() {
  const { role, session } = useAuth();
  const tabs = useMemo(() => {
    const all = [{ key: 'req', label: 'คำขอเบิก' }, { key: 'att', label: 'วันทำงาน' }, { key: 'emp', label: 'พนักงาน' }, { key: 'per', label: 'รอบ/รายงาน' }, { key: 'set', label: 'ตั้งค่า' }];
    if (role === 'admin') return all;
    if (role === 'hr') return all.filter(t => t.key !== 'set');
    return all.filter(t => t.key === 'req' || t.key === 'emp' || t.key === 'per');
  }, [role]);
  const [tab, setTab] = useState('req');
  const name = (session?.user.email || '').split('@')[0];
  const roleTh = role === 'hr' ? 'HR' : role === 'finance' ? 'การเงิน' : 'แอดมิน';

  return (
    <Shell need="staff" tabs={tabs} tab={tab} onTab={setTab}>
      <h1 className="hello">สวัสดี, {name}!</h1>
      <p className="sub">เข้าสู่ระบบในฐานะ {roleTh}</p>
      {role && <>
        {tab === 'req' && <RequestsTab role={role} />}
        {tab === 'att' && <AttendanceTab />}
        {tab === 'emp' && <EmployeesTab canEdit={role === 'hr' || role === 'admin'} />}
        {tab === 'per' && <PeriodsTab role={role} />}
        {tab === 'set' && role === 'admin' && <SettingsTab />}
      </>}
    </Shell>
  );
}
