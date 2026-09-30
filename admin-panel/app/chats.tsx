import React from 'react';
import { Redirect } from 'expo-router';

export default function RedirectToChatsTab() {
  return <Redirect href="/(tabs)/chats" />;
}
