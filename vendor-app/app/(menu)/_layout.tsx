// import { Tabs } from 'expo-router';
// import { User, Package, Menu } from 'lucide-react-native';

// export default function TabLayout() {
//   return (
//     <Tabs
//       screenOptions={{
//         headerShown: false,
//         tabBarActiveTintColor: '#1E40AF',
//         tabBarInactiveTintColor: '#6B7280',
//         tabBarStyle: {
//           backgroundColor: '#FFFFFF',
//           borderTopColor: '#E5E7EB',
//           paddingBottom: 8,
//           paddingTop: 8,
//           height: 70,
//         },
//         tabBarLabelStyle: {
//           fontSize: 12,
//           fontWeight: '600',
//           marginTop: 4,
//         },
//       }}>
//       <Tabs.Screen
//         name="index"
//         options={{
//           title: 'Menu',
//           tabBarIcon: ({ size, color }) => (
//             <Menu size={size} color={color} />
//           ),
//         }}
//       />
//       <Tabs.Screen
//         name="orders"
//         options={{
//           title: 'Orders',
//           tabBarIcon: ({ size, color }) => (
//             <Package size={size} color={color} />
//           ),
//         }}
//       />
//       <Tabs.Screen
//         name="profile"
//         options={{
//           title: 'Profile',
//           tabBarIcon: ({ size, color }) => (
//             <User size={size} color={color} />
//           ),
//         }}
//       />
//     </Tabs>
//   );
// }

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="profile" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="order-details" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="notify" />
      <Stack.Screen name="notification" />
      <Stack.Screen name="vacant-cities" />

    </Stack>
  );
}