import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DriverDrawerContent } from '@/components/driver/DriverDrawerContent';

export default function DriverLayout() {
  const { user } = useAuth();

  if (!user || user.type !== 'driver') {
    return <Redirect href="/auth" />;
  }

  return (
    <Drawer
      drawerContent={DriverDrawerContent}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#F9FAFB',
          width: 280,
        },
      }}
    >
      <Drawer.Screen name="(tabs)" options={{ drawerLabel: 'Dashboard' }} />
    </Drawer>
  );
}