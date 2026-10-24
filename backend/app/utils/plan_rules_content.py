# -*- coding: utf-8 -*-
"""Plans, wallet and account rules - the one plain explanation a fleet owner / driver can open any time (Driver App > Settings > Plans & Account Rules),
and the matching clauses added to the Terms and Conditions. Numbers are placeholders filled from the live settings:
{free_days} {grace_days} {monthly_fee} {yearly_fee} {min_driver_hold} {support_phone} {support_email}.
Admin-editable like the other app content (Admin App > App Content > Plans & Rules). Telugu / Kannada / Hindi were written by an AI - have a native
speaker read them once."""

PLAN_RULES_EN = """PLANS, WALLET AND ACCOUNT RULES - ALL IN ONE PLACE

1. YOUR FIRST {free_days} DAYS ARE FREE
Every new account starts as a Standard account and can use the app free for {free_days} days.

2. THE MONTHLY PLAN
After the free days you need the Monthly plan: Rs {monthly_fee} for every 30 days (a Yearly plan of Rs {yearly_fee} is also available under Menu > Subscription). The plan makes you a Preferred (Trusted Partner) member, with first access to some bookings.

3. AUTOMATIC DEBIT - WE DO NOT ASK EVERY TIME
When your free days end, or when a 30-day plan ends, Drop Cars takes the fee from your Drop Cars wallet by itself, if the wallet has at least Rs {monthly_fee}. The plan starts or renews at once, you get a notification, and your wallet statement shows "Monthly subscription". By accepting the Terms you allow this. The money is taken only from your Drop Cars wallet - never directly from your bank or UPI - and only when the balance covers the full fee. The wallet is never pushed below zero for the plan fee.

4. IF THE WALLET IS SHORT
Nothing is taken. After a plan ends you stay as a Standard member for {grace_days} more days, so you have time to add money. If there is still no plan after that, the account is SUSPENDED.

5. IF YOUR ACCOUNT IS SUSPENDED
The app shows one screen: subscribe, or contact the operations team. You cannot take bookings. Your wallet money stays yours and is safe. Add money so that the wallet has at least Rs {monthly_fee}: the plan starts automatically and the account opens at once. You can also call or WhatsApp the operations team.

6. THE Rs {min_driver_hold} WALLET RULE AND REFUNDS
Wallet balance below Rs {min_driver_hold} is non-refundable - it stays as your booking security hold. Only the amount above Rs {min_driver_hold} can be withdrawn. Subscription fees, commission, fees and penalties that have already been taken are not refunded. A plan you have paid for runs for its full period.

7. SECURITY HOLD ON BOOKINGS
When you accept a booking, a security amount (shown on the booking) is held from your wallet. After the trip the commission is taken and the rest comes back. If you are short, the Accept button tells you exactly how much to add. Details: Settings > Fees & Commission.

8. ACCOUNT SWITCHED OFF (INACTIVE)
Drop Cars can switch an account off for a document check, unpaid dues or a safety review. The app shows the reason. Contact the operations team; when the matter is settled the account is switched on again.

9. PERMANENT BLOCK
An account is blocked for good for fraud, forged or fake documents, an unauthorised car or driver swap, abuse or harassment of a customer, repeated serious violations, or when the account holder leaves the platform. What happens: the account and every driver and car under a fleet owner stop working at once; their stored documents are deleted; the phone numbers, e-mail, Aadhaar, PAN, licence and vehicle numbers are recorded (in a protected form) so they cannot be used to register again; wallet money is first used for dues and penalties and Drop Cars decides about the rest in writing. Only the Drop Cars Owner can lift a block. If it is lifted, the documents must be uploaded again and verified again before work starts.

10. NEED HELP?
Call or WhatsApp the Drop Cars operations team: {support_phone}, or write to {support_email}. You can also ask the Help Bot in the Chats tab. If you think a deduction or a block is a mistake, tell us within 7 days and we will check it.
"""

PLAN_RULES_TA = """திட்டங்கள், வாலட் மற்றும் கணக்கு விதிகள் - எல்லாம் ஒரே இடத்தில்

1. முதல் {free_days} நாட்கள் இலவசம்
ஒவ்வொரு புதிய கணக்கும் Standard கணக்காகத் தொடங்கி, {free_days} நாட்கள் ஆப்பை இலவசமாகப் பயன்படுத்தலாம்.

2. மாதாந்திர திட்டம் (Monthly plan)
இலவச நாட்களுக்குப் பிறகு Monthly plan தேவை: ஒவ்வொரு 30 நாட்களுக்கும் ₹{monthly_fee} (Menu > Subscription-ல் ₹{yearly_fee} Yearly plan-உம் உண்டு). இந்த plan உங்களை Preferred (Trusted Partner) உறுப்பினராக்கி, சில booking-களை முதலில் பார்க்கும் வாய்ப்பைத் தரும்.

3. தானியங்கி கழிவு - ஒவ்வொரு முறையும் கேட்க மாட்டோம்
இலவச நாட்கள் முடியும்போது, அல்லது 30 நாள் plan முடியும்போது, உங்கள் Drop Cars வாலட்டில் குறைந்தது ₹{monthly_fee} இருந்தால் Drop Cars தானாகவே கட்டணத்தை எடுத்துக்கொள்ளும். Plan உடனே தொடங்கும் அல்லது புதுப்பிக்கப்படும்; உங்களுக்கு notification வரும்; வாலட் statement-ல் "Monthly subscription" என்று தெரியும். விதிமுறைகளை ஏற்பதன் மூலம் இதற்கு நீங்கள் அனுமதி தருகிறீர்கள். பணம் உங்கள் Drop Cars வாலட்டில் இருந்து மட்டுமே எடுக்கப்படும் - உங்கள் வங்கி அல்லது UPI-ல் இருந்து நேரடியாக ஒருபோதும் இல்லை - முழுக் கட்டணத்தையும் வாலட் தாங்கும்போது மட்டுமே. Plan கட்டணத்துக்காக வாலட் பூஜ்யத்துக்குக் கீழே போகாது.

4. வாலட்டில் பணம் குறைவாக இருந்தால்
எதுவும் எடுக்கப்படாது. Plan முடிந்த பிறகு மேலும் {grace_days} நாட்கள் Standard உறுப்பினராக இருப்பீர்கள்; பணம் சேர்க்க நேரம் கிடைக்கும். அதன் பிறகும் plan இல்லையென்றால் கணக்கு நிறுத்தி வைக்கப்படும் (SUSPENDED).

5. கணக்கு நிறுத்தி வைக்கப்பட்டால்
ஆப்பில் ஒரே திரை வரும்: subscribe செய்யுங்கள், அல்லது operations team-ஐத் தொடர்பு கொள்ளுங்கள். Booking எடுக்க முடியாது. வாலட் பணம் உங்களுடையதே, பாதுகாப்பாக இருக்கும். வாலட்டில் குறைந்தது ₹{monthly_fee} இருக்கும்படி பணம் சேர்த்தால் plan தானாகத் தொடங்கி கணக்கு உடனே திறக்கும். Operations team-ஐ அழைக்கலாம் அல்லது WhatsApp செய்யலாம்.

6. ₹{min_driver_hold} வாலட் விதி மற்றும் திரும்பப் பெறுதல்
வாலட்டில் ₹{min_driver_hold}-க்குக் கீழே உள்ள தொகை திரும்பப் பெற முடியாதது - அது booking security hold-ஆக இருக்கும். ₹{min_driver_hold}-க்கு மேல் உள்ள தொகையை மட்டுமே withdraw செய்ய முடியும். ஏற்கனவே எடுக்கப்பட்ட subscription கட்டணம், commission, கட்டணங்கள், அபராதங்கள் திரும்பத் தரப்படாது. நீங்கள் செலுத்திய plan அதன் முழு காலத்துக்கும் செல்லும்.

7. Booking-ல் security hold
Booking-ஐ ஏற்கும்போது booking-ல் காட்டப்படும் security தொகை வாலட்டில் hold ஆகும். சவாரி முடிந்ததும் commission எடுக்கப்பட்டு மீதம் திரும்பும். குறைவாக இருந்தால் Accept பொத்தான் எவ்வளவு சேர்க்க வேண்டும் என்று சொல்லும். விவரம்: Settings > Fees & Commission.

8. கணக்கு அணைக்கப்பட்டால் (Inactive)
ஆவணச் சரிபார்ப்பு, நிலுவைத் தொகை அல்லது பாதுகாப்பு ஆய்வுக்காக Drop Cars கணக்கை அணைக்கலாம். காரணம் ஆப்பில் தெரியும். Operations team-ஐத் தொடர்பு கொள்ளுங்கள்; பிரச்சனை தீர்ந்ததும் கணக்கு மீண்டும் இயக்கப்படும்.

9. நிரந்தரத் தடை (Permanent block)
மோசடி, போலி ஆவணங்கள், அனுமதியில்லாமல் கார் அல்லது டிரைவரை மாற்றுதல், வாடிக்கையாளரை அவமதித்தல் அல்லது தொந்தரவு செய்தல், மீண்டும் மீண்டும் நடக்கும் கடும் மீறல்கள், அல்லது கணக்கு வைத்திருப்பவர் தளத்தை விட்டு விலகுதல் ஆகியவற்றுக்கு கணக்கு நிரந்தரமாகத் தடை செய்யப்படும். என்ன நடக்கும்: கணக்கும், ஃப்ளீட் உரிமையாளரின் கீழ் உள்ள எல்லா டிரைவர்கள், கார்களும் உடனே செயலிழக்கும்; சேமிக்கப்பட்ட ஆவணங்கள் அழிக்கப்படும்; தொலைபேசி எண்கள், மின்னஞ்சல், ஆதார், PAN, லைசென்ஸ், வாகன எண்கள் (பாதுகாக்கப்பட்ட வடிவில்) பதிவு செய்யப்படும் - அவற்றைக் கொண்டு மீண்டும் பதிவு செய்ய முடியாது; வாலட் பணம் முதலில் நிலுவைகள் மற்றும் அபராதங்களுக்குப் பயன்படுத்தப்படும், மீதியைப் பற்றி Drop Cars எழுத்துப்பூர்வமாக முடிவு செய்யும். தடையை Drop Cars Owner மட்டுமே நீக்க முடியும். நீக்கப்பட்டால், வேலை தொடங்கும் முன் ஆவணங்களை மீண்டும் upload செய்து மீண்டும் சரிபார்க்க வேண்டும்.

10. உதவி வேண்டுமா?
Drop Cars operations team-ஐ அழைக்கவோ WhatsApp செய்யவோ: {support_phone}, அல்லது {support_email}-க்கு எழுதுங்கள். Chats tab-ல் Help Bot-ஐயும் கேட்கலாம். கழிவு அல்லது தடை தவறு என்று நினைத்தால் 7 நாட்களுக்குள் சொல்லுங்கள், நாங்கள் சரிபார்ப்போம்.
"""

PLAN_RULES_TE = """ప్లాన్లు, వాలెట్ మరియు ఖాతా నియమాలు - అన్నీ ఒకే చోట

1. మొదటి {free_days} రోజులు ఉచితం
ప్రతి కొత్త ఖాతా Standard ఖాతాగా మొదలై {free_days} రోజులు యాప్‌ను ఉచితంగా వాడవచ్చు.

2. నెలవారీ ప్లాన్ (Monthly plan)
ఉచిత రోజుల తర్వాత Monthly plan అవసరం: ప్రతి 30 రోజులకు ₹{monthly_fee} (Menu > Subscription లో ₹{yearly_fee} Yearly plan కూడా ఉంది). ఈ ప్లాన్ మిమ్మల్ని Preferred (Trusted Partner) సభ్యునిగా చేసి, కొన్ని బుకింగ్‌లను ముందుగా చూసే అవకాశం ఇస్తుంది.

3. ఆటోమేటిక్ డెబిట్ - ప్రతిసారీ అడగము
ఉచిత రోజులు ముగిసినప్పుడు, లేదా 30 రోజుల ప్లాన్ ముగిసినప్పుడు, మీ Drop Cars వాలెట్‌లో కనీసం ₹{monthly_fee} ఉంటే Drop Cars దానంతట అదే రుసుమును తీసుకుంటుంది. ప్లాన్ వెంటనే మొదలవుతుంది లేదా రెన్యూ అవుతుంది, మీకు notification వస్తుంది, వాలెట్ statement లో "Monthly subscription" కనిపిస్తుంది. నిబంధనలు అంగీకరించడం ద్వారా మీరు దీనికి అనుమతి ఇస్తున్నారు. డబ్బు మీ Drop Cars వాలెట్ నుండి మాత్రమే తీసుకోబడుతుంది - మీ బ్యాంకు లేదా UPI నుండి నేరుగా ఎప్పటికీ కాదు - పూర్తి రుసుమును వాలెట్ భరించగలిగినప్పుడే. ప్లాన్ రుసుము కోసం వాలెట్ సున్నా కంటే తక్కువకు వెళ్ళదు.

4. వాలెట్‌లో డబ్బు తక్కువగా ఉంటే
ఏమీ తీసుకోబడదు. ప్లాన్ ముగిసిన తర్వాత మరో {grace_days} రోజులు Standard సభ్యునిగా ఉంటారు, డబ్బు జోడించడానికి సమయం ఉంటుంది. ఆ తర్వాత కూడా ప్లాన్ లేకపోతే ఖాతా నిలిపివేయబడుతుంది (SUSPENDED).

5. ఖాతా నిలిపివేయబడితే
యాప్‌లో ఒకే స్క్రీన్ వస్తుంది: subscribe చేయండి, లేదా operations team ను సంప్రదించండి. బుకింగ్‌లు తీసుకోలేరు. మీ వాలెట్ డబ్బు మీదే, సురక్షితం. వాలెట్‌లో కనీసం ₹{monthly_fee} ఉండేలా డబ్బు జోడిస్తే ప్లాన్ ఆటోమేటిక్‌గా మొదలై ఖాతా వెంటనే తెరుచుకుంటుంది. Operations team కు కాల్ లేదా WhatsApp చేయవచ్చు.

6. ₹{min_driver_hold} వాలెట్ నియమం మరియు రీఫండ్‌లు
వాలెట్‌లో ₹{min_driver_hold} కంటే తక్కువ ఉన్న మొత్తం తిరిగి ఇవ్వబడదు - అది బుకింగ్ సెక్యూరిటీ హోల్డ్‌గా ఉంటుంది. ₹{min_driver_hold} కంటే ఎక్కువ ఉన్న మొత్తాన్ని మాత్రమే withdraw చేయవచ్చు. ఇప్పటికే తీసుకున్న subscription రుసుము, commission, ఫీజులు, జరిమానాలు తిరిగి ఇవ్వబడవు. మీరు చెల్లించిన ప్లాన్ దాని పూర్తి కాలం వరకు నడుస్తుంది.

7. బుకింగ్‌పై సెక్యూరిటీ హోల్డ్
బుకింగ్ అంగీకరించినప్పుడు బుకింగ్‌లో చూపిన సెక్యూరిటీ మొత్తం వాలెట్ నుండి hold అవుతుంది. ట్రిప్ తర్వాత commission తీసి మిగతాది తిరిగి వస్తుంది. తక్కువైతే Accept బటన్ ఎంత జోడించాలో చెబుతుంది. వివరాలు: Settings > Fees & Commission.

8. ఖాతా ఆపివేయబడితే (Inactive)
పత్రాల తనిఖీ, బకాయిలు లేదా భద్రతా సమీక్ష కోసం Drop Cars ఖాతాను ఆపివేయవచ్చు. కారణం యాప్‌లో కనిపిస్తుంది. Operations team ను సంప్రదించండి; సమస్య పరిష్కారమయ్యాక ఖాతా మళ్ళీ ఆన్ అవుతుంది.

9. శాశ్వత నిషేధం (Permanent block)
మోసం, నకిలీ పత్రాలు, అనుమతి లేకుండా కారు లేదా డ్రైవర్‌ను మార్చడం, కస్టమర్‌ను దూషించడం లేదా వేధించడం, పదేపదే తీవ్ర ఉల్లంఘనలు, లేదా ఖాతాదారు ప్లాట్‌ఫామ్‌ను వదిలి వెళ్ళడం వంటి వాటికి ఖాతా శాశ్వతంగా నిషేధించబడుతుంది. ఏమవుతుంది: ఖాతా మరియు ఫ్లీట్ యజమాని కింద ఉన్న ప్రతి డ్రైవర్, కారు వెంటనే పనిచేయవు; నిల్వ ఉన్న పత్రాలు తొలగించబడతాయి; ఫోన్ నంబర్లు, ఇమెయిల్, ఆధార్, PAN, లైసెన్స్, వాహన నంబర్లు (రక్షిత రూపంలో) నమోదు చేయబడతాయి - వాటితో మళ్ళీ రిజిస్టర్ చేయలేరు; వాలెట్ డబ్బు మొదట బకాయిలు, జరిమానాలకు వాడబడుతుంది, మిగతాదాని గురించి Drop Cars వ్రాతపూర్వకంగా నిర్ణయిస్తుంది. నిషేధాన్ని Drop Cars Owner మాత్రమే ఎత్తివేయగలరు. ఎత్తివేస్తే, పని మొదలుపెట్టే ముందు పత్రాలను మళ్ళీ upload చేసి మళ్ళీ ధృవీకరించుకోవాలి.

10. సహాయం కావాలా?
Drop Cars operations team కు కాల్ లేదా WhatsApp చేయండి: {support_phone}, లేదా {support_email} కు రాయండి. Chats tab లో Help Bot ను కూడా అడగవచ్చు. కోత లేదా నిషేధం పొరపాటు అనిపిస్తే 7 రోజుల్లో చెప్పండి, మేము పరిశీలిస్తాం.
"""

PLAN_RULES_KN = """ಪ್ಲಾನ್, ವಾಲೆಟ್ ಮತ್ತು ಖಾತೆ ನಿಯಮಗಳು - ಎಲ್ಲವೂ ಒಂದೇ ಕಡೆ

1. ಮೊದಲ {free_days} ದಿನ ಉಚಿತ
ಪ್ರತಿ ಹೊಸ ಖಾತೆ Standard ಖಾತೆಯಾಗಿ ಶುರುವಾಗಿ {free_days} ದಿನ ಆ್ಯಪ್ ಅನ್ನು ಉಚಿತವಾಗಿ ಬಳಸಬಹುದು.

2. ಮಾಸಿಕ ಪ್ಲಾನ್ (Monthly plan)
ಉಚಿತ ದಿನಗಳ ನಂತರ Monthly plan ಬೇಕು: ಪ್ರತಿ 30 ದಿನಕ್ಕೆ ₹{monthly_fee} (Menu > Subscription ನಲ್ಲಿ ₹{yearly_fee} Yearly plan ಕೂಡ ಇದೆ). ಈ ಪ್ಲಾನ್ ನಿಮ್ಮನ್ನು Preferred (Trusted Partner) ಸದಸ್ಯರನ್ನಾಗಿ ಮಾಡಿ ಕೆಲವು ಬುಕಿಂಗ್‌ಗಳನ್ನು ಮೊದಲು ನೋಡುವ ಅವಕಾಶ ನೀಡುತ್ತದೆ.

3. ಸ್ವಯಂಚಾಲಿತ ಡೆಬಿಟ್ - ಪ್ರತಿ ಬಾರಿ ಕೇಳುವುದಿಲ್ಲ
ಉಚಿತ ದಿನಗಳು ಮುಗಿದಾಗ, ಅಥವಾ 30 ದಿನದ ಪ್ಲಾನ್ ಮುಗಿದಾಗ, ನಿಮ್ಮ Drop Cars ವಾಲೆಟ್‌ನಲ್ಲಿ ಕನಿಷ್ಠ ₹{monthly_fee} ಇದ್ದರೆ Drop Cars ತಾನಾಗಿ ಶುಲ್ಕ ತೆಗೆದುಕೊಳ್ಳುತ್ತದೆ. ಪ್ಲಾನ್ ತಕ್ಷಣ ಶುರುವಾಗುತ್ತದೆ ಅಥವಾ ನವೀಕರಣವಾಗುತ್ತದೆ, ನಿಮಗೆ notification ಬರುತ್ತದೆ, ವಾಲೆಟ್ statement ನಲ್ಲಿ "Monthly subscription" ಕಾಣಿಸುತ್ತದೆ. ನಿಯಮಗಳನ್ನು ಒಪ್ಪುವ ಮೂಲಕ ನೀವು ಇದಕ್ಕೆ ಅನುಮತಿ ನೀಡುತ್ತೀರಿ. ಹಣ ನಿಮ್ಮ Drop Cars ವಾಲೆಟ್‌ನಿಂದ ಮಾತ್ರ ತೆಗೆದುಕೊಳ್ಳಲಾಗುತ್ತದೆ - ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಅಥವಾ UPI ಯಿಂದ ನೇರವಾಗಿ ಎಂದಿಗೂ ಇಲ್ಲ - ಪೂರ್ಣ ಶುಲ್ಕವನ್ನು ವಾಲೆಟ್ ಭರಿಸುವಾಗ ಮಾತ್ರ. ಪ್ಲಾನ್ ಶುಲ್ಕಕ್ಕಾಗಿ ವಾಲೆಟ್ ಸೊನ್ನೆಗಿಂತ ಕೆಳಗೆ ಹೋಗುವುದಿಲ್ಲ.

4. ವಾಲೆಟ್‌ನಲ್ಲಿ ಹಣ ಕಡಿಮೆ ಇದ್ದರೆ
ಏನೂ ತೆಗೆದುಕೊಳ್ಳುವುದಿಲ್ಲ. ಪ್ಲಾನ್ ಮುಗಿದ ನಂತರ ಇನ್ನೂ {grace_days} ದಿನ Standard ಸದಸ್ಯರಾಗಿರುತ್ತೀರಿ, ಹಣ ಸೇರಿಸಲು ಸಮಯ ಸಿಗುತ್ತದೆ. ಅದರ ನಂತರವೂ ಪ್ಲಾನ್ ಇಲ್ಲದಿದ್ದರೆ ಖಾತೆ ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿಲ್ಲಿಸಲಾಗುತ್ತದೆ (SUSPENDED).

5. ಖಾತೆ ನಿಲ್ಲಿಸಿದರೆ
ಆ್ಯಪ್‌ನಲ್ಲಿ ಒಂದೇ ಪರದೆ ಬರುತ್ತದೆ: subscribe ಮಾಡಿ, ಅಥವಾ operations team ಅನ್ನು ಸಂಪರ್ಕಿಸಿ. ಬುಕಿಂಗ್ ತೆಗೆದುಕೊಳ್ಳಲಾಗುವುದಿಲ್ಲ. ನಿಮ್ಮ ವಾಲೆಟ್ ಹಣ ನಿಮ್ಮದೇ, ಸುರಕ್ಷಿತ. ವಾಲೆಟ್‌ನಲ್ಲಿ ಕನಿಷ್ಠ ₹{monthly_fee} ಇರುವಂತೆ ಹಣ ಸೇರಿಸಿದರೆ ಪ್ಲಾನ್ ತಾನಾಗಿ ಶುರುವಾಗಿ ಖಾತೆ ತಕ್ಷಣ ತೆರೆಯುತ್ತದೆ. Operations team ಗೆ ಕರೆ ಅಥವಾ WhatsApp ಮಾಡಬಹುದು.

6. ₹{min_driver_hold} ವಾಲೆಟ್ ನಿಯಮ ಮತ್ತು ಮರುಪಾವತಿ
ವಾಲೆಟ್‌ನಲ್ಲಿ ₹{min_driver_hold} ಕ್ಕಿಂತ ಕಡಿಮೆ ಇರುವ ಮೊತ್ತ ಹಿಂತಿರುಗಿಸಲಾಗುವುದಿಲ್ಲ - ಅದು ಬುಕಿಂಗ್ ಸೆಕ್ಯೂರಿಟಿ ಹೋಲ್ಡ್ ಆಗಿ ಇರುತ್ತದೆ. ₹{min_driver_hold} ಕ್ಕಿಂತ ಹೆಚ್ಚಿನ ಮೊತ್ತವನ್ನು ಮಾತ್ರ withdraw ಮಾಡಬಹುದು. ಈಗಾಗಲೇ ತೆಗೆದುಕೊಂಡ subscription ಶುಲ್ಕ, commission, ಶುಲ್ಕಗಳು, ದಂಡಗಳನ್ನು ಮರುಪಾವತಿ ಮಾಡುವುದಿಲ್ಲ. ನೀವು ಪಾವತಿಸಿದ ಪ್ಲಾನ್ ಅದರ ಪೂರ್ಣ ಅವಧಿಗೆ ನಡೆಯುತ್ತದೆ.

7. ಬುಕಿಂಗ್ ಮೇಲೆ ಸೆಕ್ಯೂರಿಟಿ ಹೋಲ್ಡ್
ಬುಕಿಂಗ್ ಒಪ್ಪಿಕೊಂಡಾಗ ಬುಕಿಂಗ್‌ನಲ್ಲಿ ತೋರಿಸಿದ ಸೆಕ್ಯೂರಿಟಿ ಮೊತ್ತ ವಾಲೆಟ್‌ನಿಂದ hold ಆಗುತ್ತದೆ. ಟ್ರಿಪ್ ನಂತರ commission ತೆಗೆದು ಉಳಿದದ್ದು ಮರಳುತ್ತದೆ. ಕಡಿಮೆ ಇದ್ದರೆ Accept ಬಟನ್ ಎಷ್ಟು ಸೇರಿಸಬೇಕು ಎಂದು ಹೇಳುತ್ತದೆ. ವಿವರ: Settings > Fees & Commission.

8. ಖಾತೆ ಆಫ್ ಆದರೆ (Inactive)
ದಾಖಲೆ ಪರಿಶೀಲನೆ, ಬಾಕಿ ಅಥವಾ ಸುರಕ್ಷತಾ ಪರಿಶೀಲನೆಗಾಗಿ Drop Cars ಖಾತೆಯನ್ನು ಆಫ್ ಮಾಡಬಹುದು. ಕಾರಣ ಆ್ಯಪ್‌ನಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ. Operations team ಅನ್ನು ಸಂಪರ್ಕಿಸಿ; ವಿಷಯ ಬಗೆಹರಿದ ನಂತರ ಖಾತೆ ಮತ್ತೆ ಆನ್ ಆಗುತ್ತದೆ.

9. ಶಾಶ್ವತ ನಿರ್ಬಂಧ (Permanent block)
ವಂಚನೆ, ನಕಲಿ ದಾಖಲೆ, ಅನುಮತಿ ಇಲ್ಲದೆ ಕಾರು ಅಥವಾ ಡ್ರೈವರ್ ಬದಲಾವಣೆ, ಗ್ರಾಹಕರ ನಿಂದನೆ ಅಥವಾ ಕಿರುಕುಳ, ಪುನರಾವರ್ತಿತ ಗಂಭೀರ ಉಲ್ಲಂಘನೆ, ಅಥವಾ ಖಾತೆದಾರರು ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ಬಿಟ್ಟು ಹೋಗುವುದಕ್ಕೆ ಖಾತೆಯನ್ನು ಶಾಶ್ವತವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗುತ್ತದೆ. ಏನಾಗುತ್ತದೆ: ಖಾತೆ ಮತ್ತು ಫ್ಲೀಟ್ ಮಾಲೀಕರ ಅಡಿಯ ಎಲ್ಲ ಡ್ರೈವರ್, ಕಾರುಗಳು ತಕ್ಷಣ ನಿಷ್ಕ್ರಿಯವಾಗುತ್ತವೆ; ಸಂಗ್ರಹಿತ ದಾಖಲೆಗಳು ಅಳಿಸಲಾಗುತ್ತವೆ; ಫೋನ್ ಸಂಖ್ಯೆ, ಇಮೇಲ್, ಆಧಾರ್, PAN, ಲೈಸೆನ್ಸ್, ವಾಹನ ಸಂಖ್ಯೆಗಳು (ಸುರಕ್ಷಿತ ರೂಪದಲ್ಲಿ) ದಾಖಲಾಗುತ್ತವೆ - ಅವುಗಳಿಂದ ಮತ್ತೆ ನೋಂದಣಿ ಸಾಧ್ಯವಿಲ್ಲ; ವಾಲೆಟ್ ಹಣ ಮೊದಲು ಬಾಕಿ ಮತ್ತು ದಂಡಕ್ಕೆ ಬಳಸಲಾಗುತ್ತದೆ, ಉಳಿದದ್ದರ ಬಗ್ಗೆ Drop Cars ಲಿಖಿತವಾಗಿ ತೀರ್ಮಾನಿಸುತ್ತದೆ. ನಿರ್ಬಂಧವನ್ನು Drop Cars Owner ಮಾತ್ರ ತೆಗೆಯಬಹುದು. ತೆಗೆದರೆ, ಕೆಲಸ ಶುರುವಾಗುವ ಮೊದಲು ದಾಖಲೆಗಳನ್ನು ಮತ್ತೆ upload ಮಾಡಿ ಮತ್ತೆ ಪರಿಶೀಲಿಸಬೇಕು.

10. ಸಹಾಯ ಬೇಕೇ?
Drop Cars operations team ಗೆ ಕರೆ ಅಥವಾ WhatsApp ಮಾಡಿ: {support_phone}, ಅಥವಾ {support_email} ಗೆ ಬರೆಯಿರಿ. Chats tab ನಲ್ಲಿ Help Bot ಅನ್ನೂ ಕೇಳಬಹುದು. ಕಡಿತ ಅಥವಾ ನಿರ್ಬಂಧ ತಪ್ಪು ಎನಿಸಿದರೆ 7 ದಿನಗಳಲ್ಲಿ ತಿಳಿಸಿ, ನಾವು ಪರಿಶೀಲಿಸುತ್ತೇವೆ.
"""

PLAN_RULES_HI = """प्लान, वॉलेट और खाता नियम - सब एक जगह

1. पहले {free_days} दिन मुफ़्त
हर नया खाता Standard खाते के रूप में शुरू होता है और {free_days} दिन ऐप मुफ़्त चला सकता है।

2. मंथली प्लान (Monthly plan)
मुफ़्त दिनों के बाद Monthly plan चाहिए: हर 30 दिन के लिए ₹{monthly_fee} (Menu > Subscription में ₹{yearly_fee} का Yearly plan भी है)। यह प्लान आपको Preferred (Trusted Partner) सदस्य बनाता है, जिससे कुछ बुकिंग पहले देखने को मिलती हैं।

3. ऑटोमैटिक डेबिट - हर बार नहीं पूछेंगे
मुफ़्त दिन खत्म होने पर, या 30 दिन का प्लान खत्म होने पर, अगर आपके Drop Cars वॉलेट में कम से कम ₹{monthly_fee} है तो Drop Cars अपने आप शुल्क ले लेता है। प्लान तुरंत शुरू या रिन्यू हो जाता है, आपको notification मिलता है और वॉलेट statement में "Monthly subscription" दिखता है। शर्तें मानकर आप इसकी अनुमति देते हैं। पैसा सिर्फ़ आपके Drop Cars वॉलेट से लिया जाता है - आपके बैंक या UPI से सीधे कभी नहीं - और तभी जब बैलेंस पूरी फ़ीस के लिए काफ़ी हो। प्लान फ़ीस के लिए वॉलेट शून्य से नीचे नहीं जाता।

4. अगर वॉलेट में पैसा कम है
कुछ नहीं कटता। प्लान खत्म होने के बाद आप {grace_days} दिन और Standard सदस्य रहते हैं, ताकि पैसा जोड़ने का समय मिले। उसके बाद भी प्लान न हो तो खाता निलंबित (SUSPENDED) हो जाता है।

5. अगर खाता निलंबित हो जाए
ऐप में एक ही स्क्रीन दिखती है: subscribe करें, या operations team से संपर्क करें। आप बुकिंग नहीं ले सकते। वॉलेट का पैसा आपका ही है और सुरक्षित है। वॉलेट में कम से कम ₹{monthly_fee} हो जाए इतना पैसा जोड़ें - प्लान अपने आप शुरू होगा और खाता तुरंत खुल जाएगा। आप operations team को कॉल या WhatsApp भी कर सकते हैं।

6. ₹{min_driver_hold} वॉलेट नियम और रिफ़ंड
वॉलेट में ₹{min_driver_hold} से कम राशि वापस नहीं की जाती - वह बुकिंग सिक्योरिटी होल्ड के रूप में रहती है। सिर्फ़ ₹{min_driver_hold} से ऊपर की राशि निकाली जा सकती है। जो subscription फ़ीस, कमीशन, शुल्क और जुर्माने कट चुके हैं वे वापस नहीं होते। आपका चुकाया हुआ प्लान पूरी अवधि तक चलता है।

7. बुकिंग पर सिक्योरिटी होल्ड
बुकिंग स्वीकार करने पर बुकिंग में दिखाई गई सिक्योरिटी राशि वॉलेट से hold होती है। ट्रिप के बाद कमीशन कटकर बाकी लौट आता है। कम पड़े तो Accept बटन बताता है कितना जोड़ना है। विवरण: Settings > Fees & Commission।

8. खाता बंद किया गया (Inactive)
दस्तावेज़ जाँच, बकाया या सुरक्षा समीक्षा के लिए Drop Cars खाता बंद कर सकता है। कारण ऐप में दिखता है। Operations team से संपर्क करें; मामला सुलझने पर खाता फिर चालू हो जाता है।

9. स्थायी ब्लॉक (Permanent block)
धोखाधड़ी, नकली दस्तावेज़, बिना अनुमति गाड़ी या ड्राइवर बदलना, ग्राहक से दुर्व्यवहार या उत्पीड़न, बार-बार गंभीर उल्लंघन, या खाताधारक के प्लेटफ़ॉर्म छोड़ने पर खाता हमेशा के लिए ब्लॉक किया जाता है। क्या होता है: खाता और फ़्लीट मालिक के नीचे के सभी ड्राइवर व गाड़ियाँ तुरंत बंद हो जाते हैं; रखे हुए दस्तावेज़ मिटा दिए जाते हैं; फ़ोन नंबर, ईमेल, आधार, PAN, लाइसेंस और वाहन नंबर (सुरक्षित रूप में) दर्ज कर लिए जाते हैं ताकि उनसे दोबारा रजिस्ट्रेशन न हो; वॉलेट का पैसा पहले बकाया और जुर्माने में लगता है, बाकी पर Drop Cars लिखित में फ़ैसला करता है। ब्लॉक सिर्फ़ Drop Cars Owner हटा सकता है। हटने पर काम शुरू होने से पहले दस्तावेज़ दोबारा upload और दोबारा verify करने होंगे।

10. मदद चाहिए?
Drop Cars operations team को कॉल या WhatsApp करें: {support_phone}, या {support_email} पर लिखें। Chats tab में Help Bot से भी पूछ सकते हैं। अगर कोई कटौती या ब्लॉक गलत लगे तो 7 दिन के भीतर बताएँ, हम जाँच करेंगे।
"""

PLAN_RULES_SUMMARY = {
    "en": """First {free_days} days free: a new account is Standard and free for {free_days} days.
Monthly plan: Rs {monthly_fee} for 30 days after that.
Automatic debit: if your wallet has Rs {monthly_fee}, the plan fee is taken from it by itself - no question asked.
Wallet short: nothing is taken; {grace_days} more days to add money, then the account is suspended.
Suspended: wallet money is safe; add money and the plan starts and the account opens at once.
Wallet below Rs {min_driver_hold}: not refundable (it is your booking security hold).
Permanent block: for fraud, fake documents or unauthorised swaps - documents deleted and the numbers cannot register again.""",
    "ta": """முதல் {free_days} நாட்கள் இலவசம்: புதிய கணக்கு Standard, {free_days} நாட்கள் இலவசம்.
Monthly plan: அதன் பிறகு 30 நாட்களுக்கு ₹{monthly_fee}.
தானியங்கி கழிவு: வாலட்டில் ₹{monthly_fee} இருந்தால் plan கட்டணம் கேட்காமலே தானாக எடுக்கப்படும்.
வாலட்டில் குறைவு: எதுவும் எடுக்கப்படாது; பணம் சேர்க்க மேலும் {grace_days} நாட்கள்; பிறகு கணக்கு நிறுத்தப்படும்.
நிறுத்தப்பட்டால்: வாலட் பணம் பாதுகாப்பு; பணம் சேர்த்ததும் plan தொடங்கி கணக்கு உடனே திறக்கும்.
வாலட்டில் ₹{min_driver_hold}-க்குக் கீழ்: திரும்பப் பெற முடியாது (booking security hold).
நிரந்தரத் தடை: மோசடி, போலி ஆவணம், அனுமதியில்லா மாற்றம் - ஆவணங்கள் அழிக்கப்படும்; அந்த எண்களால் மீண்டும் பதிவு செய்ய முடியாது.""",
    "te": """మొదటి {free_days} రోజులు ఉచితం: కొత్త ఖాతా Standard, {free_days} రోజులు ఉచితం.
Monthly plan: ఆ తర్వాత 30 రోజులకు ₹{monthly_fee}.
ఆటోమేటిక్ డెబిట్: వాలెట్‌లో ₹{monthly_fee} ఉంటే అడగకుండానే ప్లాన్ రుసుము తీసుకుంటారు.
వాలెట్ తక్కువైతే: ఏమీ తీసుకోరు; డబ్బు జోడించడానికి మరో {grace_days} రోజులు; తర్వాత ఖాతా నిలిపివేయబడుతుంది.
నిలిపివేస్తే: వాలెట్ డబ్బు సురక్షితం; డబ్బు జోడిస్తే ప్లాన్ మొదలై ఖాతా వెంటనే తెరుచుకుంటుంది.
వాలెట్‌లో ₹{min_driver_hold} కంటే తక్కువ: తిరిగి ఇవ్వబడదు (బుకింగ్ సెక్యూరిటీ హోల్డ్).
శాశ్వత నిషేధం: మోసం, నకిలీ పత్రాలు, అనుమతి లేని మార్పులకు - పత్రాలు తొలగించబడతాయి; ఆ నంబర్లతో మళ్ళీ రిజిస్టర్ చేయలేరు.""",
    "kn": """ಮೊದಲ {free_days} ದಿನ ಉಚಿತ: ಹೊಸ ಖಾತೆ Standard, {free_days} ದಿನ ಉಚಿತ.
Monthly plan: ನಂತರ 30 ದಿನಕ್ಕೆ ₹{monthly_fee}.
ಸ್ವಯಂ ಡೆಬಿಟ್: ವಾಲೆಟ್‌ನಲ್ಲಿ ₹{monthly_fee} ಇದ್ದರೆ ಕೇಳದೆಯೇ ಪ್ಲಾನ್ ಶುಲ್ಕ ತೆಗೆದುಕೊಳ್ಳಲಾಗುತ್ತದೆ.
ವಾಲೆಟ್ ಕಡಿಮೆ ಇದ್ದರೆ: ಏನೂ ತೆಗೆಯುವುದಿಲ್ಲ; ಹಣ ಸೇರಿಸಲು ಇನ್ನೂ {grace_days} ದಿನ; ನಂತರ ಖಾತೆ ನಿಲ್ಲಿಸಲಾಗುತ್ತದೆ.
ನಿಲ್ಲಿಸಿದರೆ: ವಾಲೆಟ್ ಹಣ ಸುರಕ್ಷಿತ; ಹಣ ಸೇರಿಸಿದರೆ ಪ್ಲಾನ್ ಶುರುವಾಗಿ ಖಾತೆ ತಕ್ಷಣ ತೆರೆಯುತ್ತದೆ.
ವಾಲೆಟ್‌ನಲ್ಲಿ ₹{min_driver_hold} ಕ್ಕಿಂತ ಕಡಿಮೆ: ಹಿಂತಿರುಗಿಸುವುದಿಲ್ಲ (ಬುಕಿಂಗ್ ಸೆಕ್ಯೂರಿಟಿ ಹೋಲ್ಡ್).
ಶಾಶ್ವತ ನಿರ್ಬಂಧ: ವಂಚನೆ, ನಕಲಿ ದಾಖಲೆ, ಅನುಮತಿ ಇಲ್ಲದ ಬದಲಾವಣೆಗೆ - ದಾಖಲೆಗಳು ಅಳಿಸಲಾಗುತ್ತವೆ; ಆ ಸಂಖ್ಯೆಗಳಿಂದ ಮತ್ತೆ ನೋಂದಣಿ ಸಾಧ್ಯವಿಲ್ಲ.""",
    "hi": """पहले {free_days} दिन मुफ़्त: नया खाता Standard है और {free_days} दिन मुफ़्त।
Monthly plan: उसके बाद 30 दिन के लिए ₹{monthly_fee}।
ऑटोमैटिक डेबिट: वॉलेट में ₹{monthly_fee} हो तो प्लान फ़ीस बिना पूछे अपने आप कट जाती है।
वॉलेट में कमी: कुछ नहीं कटता; पैसा जोड़ने के लिए {grace_days} दिन और; फिर खाता निलंबित।
निलंबित होने पर: वॉलेट का पैसा सुरक्षित; पैसा जोड़ते ही प्लान शुरू होकर खाता तुरंत खुल जाता है।
वॉलेट में ₹{min_driver_hold} से कम: वापस नहीं होता (बुकिंग सिक्योरिटी होल्ड)।
स्थायी ब्लॉक: धोखाधड़ी, नकली दस्तावेज़, बिना अनुमति बदलाव पर - दस्तावेज़ मिटते हैं; उन नंबरों से दोबारा रजिस्ट्रेशन नहीं हो सकता।""",
}

# --- new clauses for the Terms and Conditions (inserted before "CHANGES TO THESE TERMS") ---------------------------------------------
TERMS_PLAN_EN = """12. SUBSCRIPTION, FREE PERIOD AND AUTOMATIC DEBIT
12.1. A new account is a Standard account and may use the app free for {free_days} days. After that a Monthly plan (Rs {monthly_fee} for 30 days) or a Yearly plan (Rs {yearly_fee}) is required to continue.
12.2. AUTOMATIC DEBIT: by accepting these terms you authorise Drop Cars to take the plan fee from your Drop Cars wallet automatically, without asking each time, (a) when the free period ends and (b) at the end of every 30-day plan period. The fee is taken only from the wallet, only when the balance covers the full fee, and never pushes the wallet below zero. Each debit is shown in the wallet statement and notified in the app.
12.3. If the wallet cannot cover the fee, nothing is taken. The account stays Standard for {grace_days} more days so that money can be added. If there is still no plan after that, the account is suspended.
12.4. A suspended account cannot take bookings. Only paying, the wallet, support and viewing status remain available. Wallet money stays with the account holder. When the wallet is topped up to cover the fee, the plan starts automatically and the suspension ends.
12.5. Subscription fees that have been taken are non-refundable. A paid plan runs for its full period.

13. WALLET BALANCE AND WITHDRAWALS
13.1. Wallet balance below Rs {min_driver_hold} is non-refundable; it stays as the booking security hold. Only the amount above Rs {min_driver_hold} can be withdrawn, after Drop Cars checks the request.
13.2. Dues, penalties and held amounts are settled from the wallet first.

14. ACCOUNT SWITCH-OFF AND PERMANENT BLOCK
14.1. Drop Cars may switch an account off (inactive) for a document check, unpaid dues or a safety review. The reason is shown in the app.
14.2. Drop Cars may block an account permanently for fraud, forged or fake documents, an unauthorised car or driver swap, abuse or harassment of a customer, repeated serious violations, or when the account holder leaves the platform.
14.3. Effect of a permanent block: the account stops working at once; when the account is a fleet owner, every driver and car under it stops working too; stored documents are deleted; the phone numbers, e-mail, Aadhaar, PAN, licence and vehicle numbers are recorded in a protected (hashed) form so that they cannot be used to register again; wallet money is first used for dues and penalties and Drop Cars decides about any balance in writing. Drop Cars may keep the records the law requires.
14.4. Only the Drop Cars Owner can lift a permanent block. If it is lifted, the documents must be uploaded and verified again before work starts.

"""

TERMS_PLAN_TA = """12. சந்தா, இலவச காலம் மற்றும் தானியங்கி கழிவு
12.1. புதிய கணக்கு Standard கணக்கு; {free_days} நாட்கள் ஆப்பை இலவசமாகப் பயன்படுத்தலாம். அதன் பிறகு தொடர Monthly plan (30 நாட்களுக்கு ₹{monthly_fee}) அல்லது Yearly plan (₹{yearly_fee}) தேவை.
12.2. தானியங்கி கழிவு: இந்த விதிமுறைகளை ஏற்பதன் மூலம், (அ) இலவச காலம் முடியும்போதும் (ஆ) ஒவ்வொரு 30 நாள் plan காலம் முடியும்போதும், ஒவ்வொரு முறையும் கேட்காமல் plan கட்டணத்தை உங்கள் Drop Cars வாலட்டில் இருந்து தானாக எடுக்க Drop Cars-க்கு அனுமதி அளிக்கிறீர்கள். கட்டணம் வாலட்டில் இருந்து மட்டுமே, இருப்பு முழுக் கட்டணத்தையும் ஈடுசெய்யும்போது மட்டுமே எடுக்கப்படும்; வாலட்டை பூஜ்யத்துக்குக் கீழே கொண்டு செல்லாது. ஒவ்வொரு கழிவும் வாலட் statement-ல் தெரியும்; ஆப்பில் அறிவிக்கப்படும்.
12.3. வாலட் கட்டணத்தை ஈடுசெய்யாவிட்டால் எதுவும் எடுக்கப்படாது. பணம் சேர்க்க கணக்கு மேலும் {grace_days} நாட்கள் Standard-ஆக இருக்கும். அதன் பிறகும் plan இல்லையென்றால் கணக்கு நிறுத்தி வைக்கப்படும்.
12.4. நிறுத்தப்பட்ட கணக்கில் booking எடுக்க முடியாது. பணம் செலுத்துதல், வாலட், சப்போர்ட், நிலையைப் பார்த்தல் மட்டுமே கிடைக்கும். வாலட் பணம் கணக்குதாரரிடமே இருக்கும். கட்டணத்தை ஈடுசெய்யும் அளவுக்கு வாலட்டில் பணம் சேர்த்ததும் plan தானாகத் தொடங்கி நிறுத்தம் முடிவடையும்.
12.5. எடுக்கப்பட்ட subscription கட்டணம் திரும்பத் தரப்படாது. செலுத்திய plan அதன் முழு காலத்துக்கும் செல்லும்.

13. வாலட் இருப்பு மற்றும் பணம் எடுத்தல்
13.1. வாலட்டில் ₹{min_driver_hold}-க்குக் கீழே உள்ள இருப்பு திரும்பப் பெற முடியாதது; அது booking security hold-ஆக இருக்கும். Drop Cars கோரிக்கையைச் சரிபார்த்த பிறகு ₹{min_driver_hold}-க்கு மேல் உள்ள தொகையை மட்டுமே withdraw செய்ய முடியும்.
13.2. நிலுவைகள், அபராதங்கள், hold தொகைகள் முதலில் வாலட்டில் இருந்து தீர்க்கப்படும்.

14. கணக்கை அணைத்தல் மற்றும் நிரந்தரத் தடை
14.1. ஆவணச் சரிபார்ப்பு, நிலுவை அல்லது பாதுகாப்பு ஆய்வுக்காக Drop Cars கணக்கை அணைக்கலாம் (inactive). காரணம் ஆப்பில் காட்டப்படும்.
14.2. மோசடி, போலி ஆவணங்கள், அனுமதியில்லாமல் கார் அல்லது டிரைவரை மாற்றுதல், வாடிக்கையாளரை அவமதித்தல் அல்லது தொந்தரவு செய்தல், மீண்டும் மீண்டும் நடக்கும் கடும் மீறல்கள், அல்லது கணக்குதாரர் தளத்தை விட்டு விலகுதல் ஆகியவற்றுக்கு Drop Cars கணக்கை நிரந்தரமாகத் தடை செய்யலாம்.
14.3. நிரந்தரத் தடையின் விளைவு: கணக்கு உடனே செயலிழக்கும்; அது ஃப்ளீட் உரிமையாளர் கணக்கு என்றால் அதன் கீழ் உள்ள எல்லா டிரைவர்கள், கார்களும் செயலிழக்கும்; சேமிக்கப்பட்ட ஆவணங்கள் அழிக்கப்படும்; தொலைபேசி எண்கள், மின்னஞ்சல், ஆதார், PAN, லைசென்ஸ், வாகன எண்கள் பாதுகாக்கப்பட்ட (hash) வடிவில் பதிவு செய்யப்படும் - அவற்றால் மீண்டும் பதிவு செய்ய முடியாது; வாலட் பணம் முதலில் நிலுவைகள், அபராதங்களுக்குப் பயன்படுத்தப்படும்; மீதி இருந்தால் Drop Cars எழுத்துப்பூர்வமாக முடிவு செய்யும். சட்டம் கோரும் பதிவுகளை Drop Cars வைத்திருக்கலாம்.
14.4. நிரந்தரத் தடையை Drop Cars Owner மட்டுமே நீக்க முடியும். நீக்கப்பட்டால், வேலை தொடங்கும் முன் ஆவணங்களை மீண்டும் upload செய்து சரிபார்க்க வேண்டும்.

"""
