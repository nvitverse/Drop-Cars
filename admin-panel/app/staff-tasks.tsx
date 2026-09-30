import React from 'react';
import { Redirect } from 'expo-router';

export default function RedirectToTasksTab() {
  return <Redirect href="/(tabs)/tasks" />;
}
