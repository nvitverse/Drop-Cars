"""Prints every screen text / translation key that the NEW bundle no longer has compared with the bundle that is live now.
Usage: python scripts/ota_text_diff.py <new bundle file> <live latest.json url>
It only reports (exit 0). Read the list: every line is something drivers see today and will NOT see after this update.
Added 2026-10-16 after features were found to vanish between updates without anyone noticing."""
import json, os, re, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hbc_strings as hbc

code_like = re.compile(r'[{};=<>\\]|=>|function|\bthis\b|undefined|Invariant|Warning|React|Expo|Hermes|\bnode\b|Cannot|Failed to|is not|must be|Unexpected|Expected|should|invalid|Invalid|not supported|deprecated|Firebase|firebase|reCAPTCHA|credential|AuthError|multi-factor|tenant')
key_re = re.compile(r'^[a-z][A-Za-z0-9]+(\.[A-Za-z0-9_]+)+$')


def visible(s):
    if len(s) < 6 or len(s) > 200:
        return False
    if key_re.match(s) and not s.endswith(('.js', '.ts', '.tsx', '.png', '.json', '.com', '.in')):
        return True
    if ' ' in s and re.search(r'[A-Za-z]{3,}', s) and not code_like.search(s) and len(s.split()) >= 2:
        return True
    return bool(re.search(r'[஀-௿]', s) and ' ' in s)


def main():
    new_path, live_url = sys.argv[1], sys.argv[2]
    try:
        live = json.load(urllib.request.urlopen(live_url, timeout=30))
        old_bytes = urllib.request.urlopen(live['launchAsset']['url'], timeout=120).read()
    except Exception as e:
        print('text diff skipped (could not read the live bundle):', e)
        return
    new_strings = {s for s in hbc.strings(open(new_path, 'rb').read())[0] if visible(s)}
    old_strings = {s for s in hbc.strings(old_bytes)[0] if visible(s)}
    removed = sorted(old_strings - new_strings)
    added = sorted(new_strings - old_strings)
    print(f'\n=== TEXT DIFF vs the live update: +{len(added)} new, -{len(removed)} no longer there ===')
    for s in removed[:80]:
        print('  - ' + s[:140].replace('\n', ' '))
    if len(removed) > 80:
        print(f'  ... and {len(removed) - 80} more')
    print('=== check the "-" lines: anything a driver uses must not be there ===\n')


if __name__ == '__main__':
    main()
