import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/vendor/DrawerContent';

export default function VendorLayout() {
  const { user } = useAuth();

  if (!user || user.type !== 'vendor') {
    return <Redirect href="/auth" />;
  }

  return (
    <Drawer
      drawerContent={DrawerContent}
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