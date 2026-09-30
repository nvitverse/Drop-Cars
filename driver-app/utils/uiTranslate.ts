// Runtime translation of on-screen English text.
//
// Why: ~2,000 labels, messages and alerts are written directly in the screens (not through t()), so choosing Tamil / Telugu /
// Kannada / Hindi left them in English. Instead of rewriting every screen, every <Text>, TextInput placeholder and alert that
// reaches the screen passes through tr(): if the English sentence is in the language dictionary (locales/ui/<lang>.json) it is
// replaced by the translation, otherwise it is shown unchanged. English is never touched.
//
//  * exact sentences:     "Save"                      -> "சேமி"
//  * sentences with data: "Booking #{0} accepted"     -> matched with a pattern, {0} keeps the real value ("Booking #52 accepted")
//  * admin overrides:     the server can send extra / corrected entries (see setRemoteOverrides) so a wrong translation is fixed
//                         without a new app release
import { Text, TextInput } from 'react-native';
import ta from '@/locales/ui/ta.json';
import te from '@/locales/ui/te.json';
import kn from '@/locales/ui/kn.json';
import hi from '@/locales/ui/hi.json';

type Dict = Record<string, string>;
export type UiLang = 'en' | 'ta' | 'te' | 'kn' | 'hi';

const bundled: Record<string, Dict> = { ta: ta as Dict, te: te as Dict, kn: kn as Dict, hi: hi as Dict };
let overrides: Record<string, Dict> = {};

let current: UiLang = 'en';
let exact = new Map<string, string>();
let patterns: { re: RegExp; tpl: string; groups: number }[] = [];
const cache = new Map<string, string>();

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const PLACEHOLDER = /\{(\d+)\}/g;

function build(lang: UiLang) {
  exact = new Map();
  patterns = [];
  cache.clear();
  if (lang === 'en') return;
  const merged: Dict = { ...(bundled[lang] || {}), ...(overrides[lang] || {}) };
  for (const [en, loc] of Object.entries(merged)) {
    if (!loc) continue;
    if (/\{\d+\}/.test(en)) {
      // {n} -> lazy capture group; everything else is matched literally
      const src = collapse(en).replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d+)\}/g, '(.+?)');
      try {
        patterns.push({ re: new RegExp('^' + src + '$'), tpl: loc, groups: (en.match(/\{\d+\}/g) || []).length });
      } catch {
        // ignore a bad entry
      }
    } else {
      exact.set(collapse(en), loc);
    }
  }
  // most specific (longest) patterns first
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
}

export function setUiLanguage(lang: string) {
  const next = (['en', 'ta', 'te', 'kn', 'hi'].includes(lang) ? lang : 'en') as UiLang;
  if (next === current && (next === 'en' || exact.size + patterns.length > 0)) return;
  current = next;
  build(next);
}

/** Server-sent corrections / additions: { ta: { "English text": "தமிழ்" }, ... } */
export function setRemoteOverrides(map: Record<string, Dict>) {
  overrides = map || {};
  build(current);
}

export function getUiLanguage(): UiLang {
  return current;
}

function translateCore(core: string, depth: number): string {
  const hit = exact.get(collapse(core));
  if (hit !== undefined) return hit;
  if (depth < 2) {
    const c = collapse(core);
    for (const p of patterns) {
      const m = p.re.exec(c);
      if (m) {
        return p.tpl.replace(PLACEHOLDER, (_x, i) => {
          const v = m[Number(i) + 1] ?? '';
          return depth < 1 ? translateCore(v, depth + 1) : v;
        });
      }
    }
  }
  return core;
}

/** Translate one English string for the current language (returns it unchanged when there is no translation). */
export function tr(s: any): any {
  if (current === 'en' || typeof s !== 'string' || s.length < 2) return s;
  const cached = cache.get(s);
  if (cached !== undefined) return cached;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  const lead = m ? m[1] : '';
  const core = m ? m[2] : s;
  const trail = m ? m[3] : '';
  let out = s;
  if (core && /[A-Za-z]/.test(core)) {
    const t = translateCore(core, 0);
    if (t !== core) out = lead + t + trail;
  }
  if (cache.size > 4000) cache.clear();
  cache.set(s, out);
  return out;
}

/** Translate string children (a string, or an array mixing strings / numbers / elements). */
function trChildren(children: any): any {
  if (typeof children === 'string') return tr(children);
  if (Array.isArray(children)) {
    let changed = false;
    const next = children.map((c) => {
      if (typeof c === 'string') {
        const t = tr(c);
        if (t !== c) changed = true;
        return t;
      }
      return c;
    });
    return changed ? next : children;
  }
  return children;
}

let installed = false;

/** Call once at startup: makes every <Text> and TextInput placeholder go through tr(). */
export function installUiTranslation() {
  if (installed) return;
  installed = true;
  try {
    const T: any = Text;
    if (T && typeof T.render === 'function') {
      const original = T.render;
      T.render = function patchedTextRender(props: any, ref: any) {
        if (current !== 'en' && props && props.children !== undefined) {
          const nc = trChildren(props.children);
          if (nc !== props.children) props = { ...props, children: nc };
        }
        return original.call(this, props, ref);
      };
    }
  } catch {
    // never break the app for a translation layer
  }
  try {
    const I: any = TextInput;
    if (I && typeof I.render === 'function') {
      const original = I.render;
      I.render = function patchedInputRender(props: any, ref: any) {
        if (current !== 'en' && props && typeof props.placeholder === 'string') {
          const p = tr(props.placeholder);
          if (p !== props.placeholder) props = { ...props, placeholder: p };
        }
        return original.call(this, props, ref);
      };
    }
  } catch {
    // ignore
  }
}
