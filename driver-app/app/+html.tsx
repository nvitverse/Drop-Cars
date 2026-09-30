import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML document used ONLY for the web build (Expo Router's "+html.tsx"
 * convention). This has no effect whatsoever on the native Android/iOS app -
 * it's purely for when the app is opened in a desktop/mobile browser during
 * local testing.
 *
 * Fixes two things:
 * 1. The header/content sitting flush against the very top of the browser
 *    window ("cropped" look) - caused by html/body/#root not having a real
 *    height on web, so React Native's flex:1 + justifyContent:'center'
 *    layouts collapse to the top instead of centering. ScrollViewStyleReset
 *    is Expo's own fix for exactly this.
 * 2. The app stretching edge-to-edge across a wide desktop window (inputs
 *    and buttons spanning the whole monitor) - fixed by capping the app's
 *    width to a phone-sized column and centering it on wider screens, while
 *    leaving narrow/mobile widths completely untouched.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/* Fixes the app not filling the page height on web (the "cropped" look). */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveDesktopFrame }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveDesktopFrame = `
html, body {
  background-color: #e2e8f0;
}
/* Only kicks in on real desktop-width windows - phones and the device
   emulation toolbar in DevTools stay exactly as they were before. */
@media (min-width: 768px) {
  body > div:first-of-type,
  body > #root {
    max-width: 480px;
    min-height: 100vh;
    margin: 0 auto;
    box-shadow: 0 0 60px rgba(0, 0, 0, 0.18);
  }
}
`;
