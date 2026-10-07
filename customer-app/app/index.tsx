import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

// The app opened straight on the customer Home with no sign-in at all (and the menu showed a made-up name). Now a real, saved
// session is required: no session -> sign in / create account first.
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={(user ? '/(customer)' : '/auth') as any} />;
}
