import { tr, getUiLanguage } from '@/utils/uiTranslate';

const KNOWN_REASON_MAP: Record<string, Record<string, string>> = {
  ta: {
    'Blurry or unreadable photo': 'புகைப்படம் தெளிவாக இல்லை / மங்கலாக உள்ளது',
    'Name does not match': 'பெயர் ஆவணத்துடன் பொருந்தவில்லை',
    'Expired document': 'ஆவணத்தின் காலாவதி தேதி முடிந்துவிட்டது',
    'Vehicle number mismatch': 'வண்டி எண் ஆவணத்துடன் பொருந்தவில்லை',
    'Invalid document': 'செல்லுபடியாகாத ஆவணம்',
    'Please re-upload clear photo': 'தெளிவான புகைப்படத்தை மீண்டும் பதிவேற்றவும்',
    'Edges cut off': 'ஆவணத்தின் விளிம்புகள் வெட்டப்பட்டுள்ளன',
    'Needs front and back photo': 'முன்புறம் மற்றும் பின்புறம் புகைப்படம் தேவை',
    'Document rejected by admin': 'நிர்வாகியால் ஆவணம் நிராகரிக்கப்பட்டது',
    'Unclear image': 'தெளிவற்ற புகைப்படம்',
    'Document not accepted': 'ஆவணம் ஏற்றுக்கொள்ளப்படவில்லை',
  },
  te: {
    'Blurry or unreadable photo': 'ఫోటో స్పష్టంగా లేదు / అస్పష్టంగా ఉంది',
    'Name does not match': 'పేరు సరిపోలలేదు',
    'Expired document': 'పత్రం గడువు ముగిసింది',
    'Vehicle number mismatch': 'వాహనం నంబర్ సరిపోలలేదు',
    'Invalid document': 'చెల్లని పత్రం',
    'Please re-upload clear photo': 'దయచేసి స్పష్టమైన ఫోటోను మళ్లీ అప్‌లోడ్ చేయండి',
    'Document rejected by admin': 'అడ్మిన్ ద్వారా పత్రం తిరస్కరించబడింది',
  },
  kn: {
    'Blurry or unreadable photo': 'ಫೋಟೋ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ / ಮಸುಕಾಗಿದೆ',
    'Name does not match': 'ಹೆಸರು ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ',
    'Expired document': 'ದಾಖಲೆಯ ಅವಧಿ ಮುಗಿದಿದೆ',
    'Vehicle number mismatch': 'ವಾಹನ ಸಂಖ್ಯೆ ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ',
    'Invalid document': 'ಅಮಾನ್ಯ ದಾಖಲೆ',
    'Please re-upload clear photo': 'ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾದ ಫೋಟೋವನ್ನು ಮರು-ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
    'Document rejected by admin': 'ನಿರ್ವಾಹಕರಿಂದ ದಾಖಲೆ ತಿರಸ್ಕರಿಸಲ್ಪಟ್ಟಿದೆ',
  },
  hi: {
    'Blurry or unreadable photo': 'फोटो साफ नहीं है / धुंधला है',
    'Name does not match': 'नाम मेल नहीं खा रहा है',
    'Expired document': 'दस्तावेज़ की समय सीमा समाप्त हो गई है',
    'Vehicle number mismatch': 'वाहन संख्या मेल नहीं खाती',
    'Invalid document': 'अमान्य दस्तावेज़',
    'Please re-upload clear photo': 'कृपया स्पष्ट फोटो पुनः अपलोड करें',
    'Document rejected by admin': 'व्यवस्थापक द्वारा दस्तावेज़ अस्वीकार कर दिया गया',
  },
};

/**
 * A4. Localize server document rejection reasons into plain words in ta / te / kn / hi / en.
 * Unknown strings are passed through runtime translator tr() or shown as-is.
 */
export function localizeDocumentReason(reason: string | null | undefined): string | null {
  if (!reason || typeof reason !== 'string' || !reason.trim()) return null;
  const clean = reason.trim();
  const lang = getUiLanguage();

  if (lang !== 'en') {
    const langMap = KNOWN_REASON_MAP[lang];
    if (langMap && langMap[clean]) return langMap[clean];
    if (langMap) {
      for (const [pattern, translation] of Object.entries(langMap)) {
        if (clean.toLowerCase().includes(pattern.toLowerCase())) {
          return translation;
        }
      }
    }
  }

  return tr(clean);
}
