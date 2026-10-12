# Drop Cars Multi-Language Translation Glossary & Style Guide

## 1. Tone & Philosophy
- **Natural Spoken Language:** Use words and phrases the way taxi and auto drivers, fleet partners, and everyday passengers actually speak. Avoid rigid, formal-bookish textbook translations.
- **Register:** Use the polite and respectful **"நீங்கள்" (Neengal / You)** register across all customer, driver, and vendor communications. Never use dismissive singular "நீ".
- **Loan Words:** Retain common industry loan words that drivers and passengers universally use in daily life, transliterated in native script or English acronym format:
  - `OTP`, `Booking`, `Wallet`, `GPS`, `Trip`, `Toll`, `Permit`, `RC`, `FC`, `Insurance`, `Licence / DL`, `App`, `Update`, `Call`, `WhatsApp`, `Bata / Batta`, `Fastag`, `Car`, `Sedan`, `SUV`, `Fast Track`.
- **Dynamic Variable Interpolation:** Always use `{0}`, `{1}`, or `{count}` tokens rather than concatenating hardcoded strings.

---

## 2. Tamil (தமிழ்) Core Terminology

| English Term | Natural Spoken Tamil (Recommended) | Literal/Bookish (Do NOT use) |
| :--- | :--- | :--- |
| **New Booking Received** | புதிய Booking கிடைச்சிருக்கு | புதிய முன்பதிவு பெறப்பட்டது |
| **Accept Booking** | Booking-ஐ Accept பண்ணுங்க | முன்பதிவை ஏற்றுக்கொள்ளுங்கள் |
| **Reject / Decline** | Reject பண்ணுங்க / வேண்டாம் | நிராகரிக்கவும் |
| **Trip In Progress** | Trip போய்க்கிட்டு இருக்கு | பயணம் செயல்பாட்டில் உள்ளது |
| **Start Trip** | Trip-ஐ Start பண்ணுங்க | பயணத்தை தொடங்குங்கள் |
| **End Trip** | Trip-ஐ End பண்ணுங்க | பயணத்தை முடிக்கவும் |
| **Enter Start OTP** | Start OTP-ஐ பதிவு பண்ணுங்க | தொடக்க ஒருமுறை கடவுச்சொல்லை உள்ளிடவும் |
| **Your Wallet Balance** | உங்க Wallet-ல ₹{0} இருக்கு | உங்கள் பணப்பை இருப்பு |
| **Low Wallet Balance** | Wallet Balance கம்மியா இருக்கு | குறைந்த பணப்பை இருப்பு |
| **Recharge Wallet** | Wallet-ஐ Recharge பண்ணுங்க | பணப்பையை நிரப்பவும் |
| **Document Expired** | {0} expire ஆகிடுச்சு | ஆவணம் காலாவதியானது |
| **Upload Document** | புது {0} photo upload பண்ணுங்க | புதிய ஆவணத்தைப் பதிவேற்றவும் |
| **Verification Pending** | Verification நடக்குது (Office சரிபார்க்கிறது) | சரிபார்ப்பு நிலுவையில் உள்ளது |
| **Document Verified** | {0} Verified ஆயிடுச்சு | ஆவணம் சரிபார்க்கப்பட்டது |
| **Document Rejected** | {0} Reject செய்யப்பட்டுள்ளது - காரணம்: {1} | ஆவணம் நிராகரிக்கப்பட்டது |
| **Toll Charges** | Toll Gate கட்டணம் | சுங்க கட்டணம் |
| **Driver Bata** | Driver Bata (படி) | ஓட்டுநர் படி |
| **Extra KM Rate** | Extra KM கட்டணம்: ₹{0}/KM | கூடுதல் கிலோமீட்டர் கட்டணம் |
| **Customer Phone** | Customer நம்பர் | வாடிக்கையாளர் எண் |
| **Call Customer** | Customer-க்கு Call பண்ணுங்க | வாடிக்கையாளரை அழைக்கவும் |
| **Please Wait** | கொஞ்சம் பொறுங்க, Loading ஆகுது | தயவுசெய்து காத்திருங்கள் |
| **Something went wrong** | ஏதோ தவறு நடந்துவிட்டது (Error: {0}) | ஏதோ தவறு நடந்துவிட்டது |

---

## 3. Telugu (తెలుగు) Core Terminology

| English Term | Natural Spoken Telugu |
| :--- | :--- |
| **New Booking** | కొత్త Booking వచ్చింది |
| **Accept Booking** | Booking Accept చేయండి |
| **Your Wallet Balance** | మీ Wallet లో ₹{0} ఉంది |
| **Document Expired** | {0} Expire అయింది - కొత్తది Upload చేయండి |
| **Toll Charges** | Toll Gate ఛార్జీలు |
| **Call Customer** | Customer కి Call చేయండి |

---

## 4. Kannada (ಕನ್ನಡ) Core Terminology

| English Term | Natural Spoken Kannada |
| :--- | :--- |
| **New Booking** | ಹೊಸ Booking ಬಂದಿದೆ |
| **Accept Booking** | Booking Accept ಮಾಡಿ |
| **Your Wallet Balance** | ನಿಮ್ಮ Wallet ನಲ್ಲಿ ₹{0} ಇದೆ |
| **Document Expired** | {0} Expire ಆಗಿದೆ - ಹೊಸ Photo Upload ಮಾಡಿ |
| **Toll Charges** | Toll Gate ಶುಲ್ಕಗಳು |
| **Call Customer** | Customer ಗೆ Call ಮಾಡಿ |

---

## 5. Hindi (हिंदी) Core Terminology

| English Term | Natural Spoken Hindi |
| :--- | :--- |
| **New Booking** | नई Booking मिली है |
| **Accept Booking** | Booking Accept करें |
| **Your Wallet Balance** | आपके Wallet में ₹{0} हैं |
| **Document Expired** | {0} Expire हो गया है - नया Photo Upload करें |
| **Toll Charges** | Toll Gate चार्ज |
| **Call Customer** | Customer को Call करें |

---

## 6. Open Questions for Owner Review
1. For driver daily batta, do drivers prefer **"Driver Bata"** or **"Driver படி"**? (Currently using *"Driver Bata"* as primary).
2. For cancellation fee, do drivers prefer **"Cancellation கட்டணம்"** or **"Cancel Fee"**? (Currently using *"Cancel கட்டணம்"*).
