// router.back() silently does nothing when there is no screen to go back to
// - which is exactly the case after the app is opened straight into a
// screen (relaunch into Add Driver, notification tap, router.replace from
// login...). Every header back arrow and every "Leave" button that used
// plain router.back() looked frozen. Fall back to a real destination.
export function safeBack(router: any, fallback: string = '/(tabs)') {
  try {
    if (router?.canGoBack && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {}
  try {
    router.replace(fallback as any);
  } catch {}
}
