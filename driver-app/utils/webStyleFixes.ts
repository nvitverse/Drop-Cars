import { Platform } from 'react-native';

/**
 * Call once at app startup (web only). Fixes real, confirmed react-native-web
 * rendering bugs that have no per-component workaround:
 *
 * - SVG icons (lucide-react-native) placed as the first child in a flex row
 *   next to a `flex: 1` sibling (almost every icon-prefixed TextInput in this
 *   app) render at 0 width on web - the icon just vanishes. Root cause:
 *   these <svg> elements only get their size from the HTML `width`/`height`
 *   presentation attributes, which carry far lower priority than normal CSS,
 *   so the browser's flex algorithm shrinks them to make room for the
 *   sibling before respecting that size. Confirmed via computed style
 *   (0px instead of 20px) and confirmed fixed by giving every <svg> a real
 *   `flex-shrink: 0`.
 *
 * - Focusing a TextInput shows the browser's raw default focus ring (square
 *   corners, orange on this OS/browser) directly on the <input>, which sits
 *   inside a rounded, bordered pill container - the square ring pokes out
 *   past the pill's rounded corners and reads as a broken "overlap". Fixed
 *   by suppressing the default outline and drawing a proper rounded
 *   replacement with box-shadow (which respects border-radius) in the app's
 *   own brand color instead.
 *
 * - Multiple TextInputs sharing one row via `flex: N` (e.g. the car
 *   registration plate's 4 boxes: State/RTO/Series/Number) refuse to shrink
 *   below the browser's default <input> width (~211px each) on narrow
 *   screens, so 4 boxes demand ~900px in a ~375px-wide viewport and overflow
 *   off-screen instead of sharing the row per their flex ratios. Confirmed:
 *   forcing min-width:0 dropped combined width from ~900px to ~300px and the
 *   boxes correctly redistributed by their flex ratio. Fixed globally so any
 *   current or future multi-box row is protected, not just this one screen.
 *
 * - Firebase Phone Auth's `RecaptchaVerifier` (size:'invisible' - see
 *   utils/phoneAuth.ts) never shows an actual checkbox/image-matching
 *   challenge, but Google still injects a small floating "protected by
 *   reCAPTCHA" badge (`.grecaptcha-badge`) in the bottom-right corner of the
 *   screen, which read as a leftover captcha widget. Google's terms allow
 *   hiding this badge as long as the equivalent disclosure text is shown
 *   somewhere else in the UI instead (see the phone-OTP section of
 *   forgot-password.tsx, which now carries that text) - hidden here, once,
 *   for every screen that ever mounts a RecaptchaVerifier.
 */
export function installWebStyleFixes() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const styleId = 'web-style-fixes';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Dynamic Viewport & Safe Area bounds for mobile web screens */
    html, body, #root {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      min-height: 100dvh;
      margin: 0;
      padding: 0;
      overflow-x: hidden;
      background-color: transparent;
    }

    /* Support iOS Safe Area variables on Web */
    :root {
      --sat: env(safe-area-inset-top);
      --sar: env(safe-area-inset-right);
      --sab: env(safe-area-inset-bottom);
      --sal: env(safe-area-inset-left);
    }

    /* Icons must never shrink away next to a flex:1 sibling (e.g. an
       icon-prefixed TextInput row) - see installWebStyleFixes() above. */
    svg {
      flex-shrink: 0;
    }

    /* Replace the browser's clashing square default focus ring with a
       rounded one that respects the input's own border-radius. */
    input:focus, textarea:focus {
      outline: none;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
    }

    /* Text inputs must be allowed to shrink below the browser's default
       width when sharing a row with siblings (e.g. segmented number/plate
       entry) - see installWebStyleFixes() above. */
    input, textarea {
      min-width: 0;
    }

    /* Hide the floating invisible-reCAPTCHA badge - see doc comment above.
       Required disclosure text is shown in-app instead. */
    .grecaptcha-badge {
      visibility: hidden !important;
    }

    /* Universal global scrollbar removal for Web Browsers & React Native Web */
    html, body, #root, div, section, main, article, aside, nav,
    *, *::before, *::after {
      -ms-overflow-style: none !important;  /* IE and Edge */
      scrollbar-width: none !important;  /* Firefox */
    }

    ::-webkit-scrollbar,
    *::-webkit-scrollbar,
    ::-webkit-scrollbar-thumb,
    *::-webkit-scrollbar-thumb,
    ::-webkit-scrollbar-track,
    *::-webkit-scrollbar-track,
    ::-webkit-scrollbar-corner,
    *::-webkit-scrollbar-corner {
      display: none !important;
      width: 0px !important;
      height: 0px !important;
      background: transparent !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;
  document.head.appendChild(style);
}
