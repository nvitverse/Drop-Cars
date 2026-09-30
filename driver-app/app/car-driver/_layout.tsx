import { Stack } from 'expo-router';

export default function CarDriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="signin" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
