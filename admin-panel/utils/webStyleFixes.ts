import { Platform, ScrollView, FlatList } from 'react-native';

// Set global React Native defaults to hide scrollbars on native & web
try {
  (ScrollView as any).defaultProps = {
    ...((ScrollView as any).defaultProps || {}),
    showsVerticalScrollIndicator: false,
    showsHorizontalScrollIndicator: false,
  };
  (FlatList as any).defaultProps = {
    ...((FlatList as any).defaultProps || {}),
    showsVerticalScrollIndicator: false,
    showsHorizontalScrollIndicator: false,
  };
} catch (e) {
  // Ignore if frozen
}

/**
 * Call once at app startup (web only). Fixes a real, confirmed
 * react-native-web rendering bug with no per-component workaround:
 *
 * SVG icons (lucide-react-native) placed as the first child in a flex row
 * next to a `flex: 1` sibling (e.g. an icon-prefixed TextInput) render at
 * 0 width on web - the icon just vanishes. Root cause: these <svg> elements
 * only get their size from the HTML `width`/`height` presentation
 * attributes, which carry far lower priority than normal CSS, so the
 * browser's flex algorithm shrinks them to make room for the sibling before
 * respecting that size. Confirmed via computed style (0px instead of 20px)
 * and confirmed fixed by giving every <svg> a real `flex-shrink: 0`.
 *
 * Also fixes: focusing a TextInput shows the browser's raw default focus
 * ring (square corners) directly on the <input>, which sits inside a
 * rounded, bordered pill container - the square ring pokes out past the
 * pill's rounded corners and reads as a broken "overlap". Fixed by
 * suppressing the default outline and drawing a proper rounded replacement
 * with box-shadow (which respects border-radius) in the app's own brand
 * color instead.
 *
 * Also fixes: multiple TextInputs sharing one row via `flex: N` (e.g. a
 * segmented number/code entry) refuse to shrink below the browser's default
 * <input> width (~211px each) on narrow screens, so a few boxes can demand
 * far more width than the screen has and overflow off-screen instead of
 * sharing the row per their flex ratios. Fixed globally so any current or
 * future multi-box row is protected.
 */
export function installWebStyleFixes() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const styleId = 'web-style-fixes';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
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
       width when sharing a row with siblings - see above. */
    input, textarea {
      min-width: 0;
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
