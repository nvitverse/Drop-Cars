// Alarms ring only while the staff member is ON DUTY (the GO ON button). Off duty -> every alarm is silent and a ringing one stops.
// Mount once inside <StaffDutyProvider>, before the alarm hosts (app/_layout.tsx).
import { useEffect } from 'react';
import { useStaffDuty } from '@/context/StaffDutyContext';
import { setAlarmsAllowed } from '@/utils/alarmSound';

export default function AlarmDutyGate() {
  const { isOnDuty } = useStaffDuty();
  useEffect(() => {
    setAlarmsAllowed(!!isOnDuty);
  }, [isOnDuty]);
  useEffect(() => () => setAlarmsAllowed(false), []);
  return null;
}
