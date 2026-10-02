"""Default text for the admin-editable app content (Driver App first-login cards + Terms & Conditions).

Nothing here is final: the Admin App (Settings > App Content) saves an edited copy in platform_settings and that copy
wins. These defaults are only what a fresh install / an unedited key shows.

Numbers that the owner can change in System Config are written as placeholders and filled in with the LIVE values when the
content is served, so the cards can never quote a stale amount:
    {commission_min}  {convenience_fee}  {min_driver_hold}  {support_phone}  {support_email}
"""

LANGS = ("en", "ta", "te", "kn", "hi")

# icon -> drawn by the app (lucide names)      color -> one of: emerald blue purple red indigo amber teal rose
DRIVER_ONBOARDING = {
    "version": 2,
    "steps": [
        {
            "icon": "check-circle", "color": "emerald",
            "title": {
                "en": "Welcome to Drop Cars!", "ta": "Drop Cars-க்கு வரவேற்கிறோம்!",
                "te": "Drop Cars కు స్వాగతం!", "hi": "Drop Cars में आपका स्वागत है!",
            },
            "subtitle": {
                "en": "Your cars, your trips, your safety - all in one app",
                "ta": "உங்கள் கார், உங்கள் சவாரி, உங்கள் பாதுகாப்பு - ஒரே ஆப்பில்",
                "te": "మీ కార్లు, మీ ట్రిప్పులు, మీ భద్రత - ఒకే యాప్‌లో",
                "hi": "आपकी गाड़ियाँ, आपकी ट्रिप, आपकी सुरक्षा - एक ही ऐप में",
            },
            "description": {
                "en": "Drop Cars connects fleet owners and drivers with customer and vendor bookings across India. Take bookings that suit your route, run them safely and get paid through your wallet. The next few cards explain how it works - it takes one minute and protects you.",
                "ta": "Drop Cars, இந்தியா முழுவதும் உள்ள வாடிக்கையாளர் மற்றும் வெண்டர் சவாரிகளை ஃப்ளீட் உரிமையாளர்கள் மற்றும் டிரைவர்களுடன் இணைக்கிறது. உங்கள் வழிக்கு ஏற்ற சவாரிகளை எடுத்து, பாதுகாப்பாக ஓட்டி, வாலட் மூலம் பணம் பெறுங்கள். அடுத்த சில கார்டுகள் இது எப்படி வேலை செய்கிறது என்பதை விளக்கும் - ஒரு நிமிடம் போதும், இது உங்களை பாதுகாக்கும்.",
                "te": "Drop Cars దేశవ్యాప్తంగా ఉన్న కస్టమర్ మరియు వెండర్ బుకింగ్‌లను ఫ్లీట్ ఓనర్లు మరియు డ్రైవర్లతో కలుపుతుంది. మీ రూట్‌కు సరిపడే బుకింగ్‌లు తీసుకోండి, సురక్షితంగా నడపండి, వాలెట్ ద్వారా డబ్బు పొందండి. తదుపరి కార్డులు ఇది ఎలా పనిచేస్తుందో చెబుతాయి - ఒక నిమిషం చాలు, ఇది మిమ్మల్ని కాపాడుతుంది.",
                "hi": "Drop Cars पूरे भारत में ग्राहकों और वेंडर की बुकिंग को फ्लीट मालिकों और ड्राइवरों से जोड़ता है। अपने रूट की बुकिंग लें, सुरक्षित चलाएँ और वॉलेट से भुगतान पाएँ। अगले कार्ड बताते हैं कि यह कैसे काम करता है - एक मिनट लगेगा और यह आपकी सुरक्षा करेगा।",
            },
        },
        {
            "icon": "file-text", "color": "blue",
            "title": {
                "en": "Keep your documents valid", "ta": "ஆவணங்களை செல்லுபடியாக வைத்திருங்கள்",
                "te": "మీ పత్రాలను చెల్లుబాటులో ఉంచండి", "hi": "अपने दस्तावेज़ वैध रखें",
            },
            "subtitle": {
                "en": "Licence, RC, Insurance, Fitness, Permit, Pollution, Aadhaar",
                "ta": "லைசென்ஸ், RC, இன்சூரன்ஸ், FC, பர்மிட், புகை சான்று, ஆதார்",
                "te": "లైసెన్స్, RC, ఇన్సూరెన్స్, FC, పర్మిట్, పొల్యూషన్, ఆధార్",
                "hi": "लाइसेंस, RC, बीमा, फिटनेस, परमिट, प्रदूषण, आधार",
            },
            "description": {
                "en": "Upload clear photos of every document and keep them unexpired. The app reminds you before a document expires. Driving a trip with an expired, fake or missing document is unsafe, illegal and puts all financial and legal responsibility on you - your booking can also be blocked.",
                "ta": "ஒவ்வொரு ஆவணத்தின் தெளிவான படத்தையும் பதிவேற்றி, காலாவதியாகாமல் வைத்திருங்கள். ஆவணம் காலாவதியாகும் முன் ஆப் நினைவூட்டும். காலாவதியான, போலி அல்லது இல்லாத ஆவணத்துடன் ஓட்டுவது ஆபத்தானது, சட்டவிரோதம்; அனைத்து நிதி மற்றும் சட்ட பொறுப்பும் உங்களுடையது - உங்கள் புக்கிங்கும் தடுக்கப்படலாம்.",
                "te": "ప్రతి పత్రం యొక్క స్పష్టమైన ఫోటో అప్‌లోడ్ చేసి గడువు తీరకుండా ఉంచండి. గడువు ముగిసే ముందు యాప్ గుర్తు చేస్తుంది. గడువు తీరిన, నకిలీ లేదా లేని పత్రంతో నడపడం ప్రమాదకరం, చట్టవిరుద్ధం; పూర్తి ఆర్థిక, చట్టపరమైన బాధ్యత మీదే - మీ బుకింగ్ కూడా ఆగిపోవచ్చు.",
                "hi": "हर दस्तावेज़ की साफ़ फोटो अपलोड करें और उन्हें एक्सपायर न होने दें। दस्तावेज़ की तारीख़ खत्म होने से पहले ऐप याद दिलाता है। एक्सपायर, नकली या न होने वाले दस्तावेज़ के साथ चलाना असुरक्षित और गैरकानूनी है और सारी आर्थिक व कानूनी जिम्मेदारी आपकी होगी - आपकी बुकिंग भी रोकी जा सकती है।",
            },
        },
        {
            "icon": "map-pin", "color": "purple",
            "title": {
                "en": "Accept, then assign on time", "ta": "ஏற்று, நேரத்தில் ஒதுக்குங்கள்",
                "te": "అంగీకరించి, సమయానికి కేటాయించండి", "hi": "स्वीकारें, फिर समय पर असाइन करें",
            },
            "subtitle": {
                "en": "The exact car and driver, before the deadline on the card",
                "ta": "சரியான கார் மற்றும் டிரைவர், கார்டில் உள்ள கெடுவுக்குள்",
                "te": "సరైన కారు మరియు డ్రైవర్, కార్డులోని గడువుకు ముందే",
                "hi": "सही गाड़ी और ड्राइवर, कार्ड पर दिए समय से पहले",
            },
            "description": {
                "en": "After you accept a booking, assign the car and driver who will really do the trip - the deadline is shown on the booking card. Once assigned, only that car and that driver may run the trip. Swapping in another car or driver is not allowed. If you cannot do the trip, tell the poster in the booking chat early - a late or missed assignment can cost you a penalty and your held amount.",
                "ta": "புக்கிங்கை ஏற்ற பிறகு, உண்மையில் சவாரி செய்யும் கார் மற்றும் டிரைவரை ஒதுக்குங்கள் - கெடு புக்கிங் கார்டில் தெரியும். ஒதுக்கிய பிறகு, அந்த கார் மற்றும் அந்த டிரைவர் மட்டுமே சவாரியை ஓட்ட வேண்டும். வேறு கார் அல்லது டிரைவரை மாற்றுவது அனுமதிக்கப்படாது. சவாரி செய்ய முடியாவிட்டால், புக்கிங் சாட்டில் முன்கூட்டியே சொல்லுங்கள் - தாமதம் அல்லது ஒதுக்காமல் விடுவது அபராதம் மற்றும் ஹோல்டு தொகை இழப்பை ஏற்படுத்தலாம்.",
                "te": "బుకింగ్ అంగీకరించిన తర్వాత, నిజంగా ట్రిప్ చేసే కారు మరియు డ్రైవర్‌ను కేటాయించండి - గడువు బుకింగ్ కార్డులో కనిపిస్తుంది. కేటాయించాక, ఆ కారు, ఆ డ్రైవర్ మాత్రమే ట్రిప్ నడపాలి. మరొక కారు/డ్రైవర్‌ను మార్చడం అనుమతించబడదు. ట్రిప్ చేయలేకపోతే బుకింగ్ చాట్‌లో ముందే చెప్పండి - ఆలస్యం లేదా కేటాయించకపోతే జరిమానా, హోల్డ్ మొత్తం పోవచ్చు.",
                "hi": "बुकिंग स्वीकारने के बाद वही गाड़ी और ड्राइवर असाइन करें जो सच में ट्रिप करेंगे - समय सीमा बुकिंग कार्ड पर दिखती है। असाइन होने के बाद केवल वही गाड़ी और वही ड्राइवर ट्रिप चलाएँगे। दूसरी गाड़ी या ड्राइवर बदलना मना है। ट्रिप नहीं कर सकते तो बुकिंग चैट में पहले बताएँ - देर या असाइन न करने पर जुर्माना और होल्ड राशि जा सकती है।",
            },
        },
        {
            "icon": "clock", "color": "indigo",
            "title": {
                "en": "Start and end every trip with OTP", "ta": "ஒவ்வொரு சவாரியும் OTP உடன் தொடங்கி முடியுங்கள்",
                "te": "ప్రతి ట్రిప్ OTP తో మొదలుపెట్టి ముగించండి", "hi": "हर ट्रिप OTP से शुरू और खत्म करें",
            },
            "subtitle": {
                "en": "It proves the right customer is in the right car",
                "ta": "சரியான வாடிக்கையாளர் சரியான காரில் உள்ளார் என்பதற்கான சான்று",
                "te": "సరైన కస్టమర్ సరైన కారులో ఉన్నారని ఇది రుజువు",
                "hi": "यह साबित करता है कि सही ग्राहक सही गाड़ी में है",
            },
            "description": {
                "en": "At pickup, ask the customer for the Start OTP - never start a trip without it. At the end, enter the closing km, take the odometer photo, and add extras only for items that were NOT included in the fare. Then show the customer the bill, mark the trip Completed and rate the customer. If the km you enter is far from the real route, the app asks for a reason.",
                "ta": "பிக்கப்பில் வாடிக்கையாளரிடம் Start OTP கேளுங்கள் - அது இல்லாமல் சவாரியை தொடங்காதீர்கள். முடிவில் இறுதி கி.மீ. உள்ளிட்டு, ஓடோமீட்டர் படம் எடுத்து, கட்டணத்தில் சேராத பொருட்களுக்கு மட்டும் கூடுதல் தொகை சேர்க்கவும். பிறகு வாடிக்கையாளருக்கு பில்லை காட்டி, சவாரியை 'Completed' ஆக்கி, வாடிக்கையாளருக்கு மதிப்பீடு அளியுங்கள். நீங்கள் உள்ளிடும் கி.மீ. உண்மையான வழியிலிருந்து அதிகம் மாறுபட்டால் ஆப் காரணம் கேட்கும்.",
                "te": "పికప్ వద్ద కస్టమర్ నుండి Start OTP తీసుకోండి - అది లేకుండా ట్రిప్ మొదలుపెట్టకండి. చివర్లో క్లోజింగ్ కి.మీ. నమోదు చేసి, ఓడోమీటర్ ఫోటో తీసి, ఛార్జీలో చేర్చని అంశాలకు మాత్రమే ఎక్స్‌ట్రాలు జోడించండి. తర్వాత కస్టమర్‌కు బిల్లు చూపించి, ట్రిప్ Completed చేసి, కస్టమర్‌కు రేటింగ్ ఇవ్వండి. మీరు ఇచ్చిన కి.మీ. అసలు రూట్‌కు చాలా దూరంగా ఉంటే యాప్ కారణం అడుగుతుంది.",
                "hi": "पिकअप पर ग्राहक से Start OTP लें - इसके बिना ट्रिप शुरू न करें। अंत में क्लोज़िंग किमी डालें, ओडोमीटर की फोटो लें और केवल उन चीज़ों के एक्स्ट्रा जोड़ें जो किराये में शामिल नहीं थीं। फिर ग्राहक को बिल दिखाएँ, ट्रिप Completed करें और ग्राहक को रेटिंग दें। आपके डाले किमी असली रूट से बहुत अलग हों तो ऐप कारण पूछेगा।",
            },
        },
        {
            "icon": "indian-rupee", "color": "teal",
            "title": {
                "en": "Your money, made clear", "ta": "உங்கள் பணம், தெளிவாக",
                "te": "మీ డబ్బు, స్పష్టంగా", "hi": "आपका पैसा, साफ़ हिसाब",
            },
            "subtitle": {
                "en": "You see everything before you accept",
                "ta": "ஏற்பதற்கு முன்பே எல்லாம் தெரியும்",
                "te": "అంగీకరించే ముందే అన్నీ కనిపిస్తాయి",
                "hi": "स्वीकारने से पहले सब कुछ दिखता है",
            },
            "description": {
                "en": "Every booking shows what you earn and what is deducted before you accept it - nothing is taken that is not shown. Toll, parking and permit are paid by the customer at actual. Never take extra cash outside the app bill. Tap any wallet row to see exactly what it means, and find the fee details under Menu > Fees & Commission.",
                "ta": "ஒவ்வொரு புக்கிங்கிலும் நீங்கள் ஏற்பதற்கு முன்பே உங்கள் வருமானமும் பிடித்தங்களும் காட்டப்படும் - காட்டாத எதுவும் பிடிக்கப்படாது. டோல், பார்க்கிங், பர்மிட் வாடிக்கையாளர் உண்மைக் கட்டணப்படி செலுத்துவார். ஆப் பில்லுக்கு வெளியே கூடுதல் ரொக்கம் வாங்காதீர்கள். எந்த வாலட் வரிசையையும் தொட்டால் அதன் விளக்கம் தெரியும்; கட்டண விவரங்களை மெனு > கட்டணம் & கமிஷன் பகுதியில் பார்க்கலாம்.",
                "te": "ప్రతి బుకింగ్‌లో మీరు అంగీకరించే ముందే మీ సంపాదన, కోతలు కనిపిస్తాయి - చూపనిది ఏదీ తీసుకోరు. టోల్, పార్కింగ్, పర్మిట్ కస్టమర్ వాస్తవ ఖర్చుతో చెల్లిస్తారు. యాప్ బిల్లు బయట అదనపు నగదు తీసుకోకండి. ఏ వాలెట్ వరుసనైనా నొక్కితే వివరణ కనిపిస్తుంది; ఫీజు వివరాలు మెనూ > ఫీజులు & కమిషన్ లో చూడవచ్చు.",
                "hi": "हर बुकिंग पर स्वीकारने से पहले आपकी कमाई और कटौती दिखती है - जो दिखाया नहीं गया वह नहीं कटता। टोल, पार्किंग और परमिट ग्राहक असल खर्च पर देगा। ऐप बिल के बाहर अतिरिक्त नकद न लें। किसी भी वॉलेट पंक्ति पर टैप करके उसका मतलब देखें; शुल्क का विवरण मेनू > शुल्क और कमीशन में मिलेगा।",
            },
        },
        {
            "icon": "shield", "color": "rose",
            "title": {
                "en": "Safety first, always", "ta": "எப்போதும் பாதுகாப்பே முதலில்",
                "te": "ఎల్లప్పుడూ భద్రత ముందు", "hi": "हमेशा सुरक्षा पहले",
            },
            "subtitle": {
                "en": "For you, your passengers and your car",
                "ta": "உங்களுக்கும், பயணிகளுக்கும், உங்கள் காருக்கும்",
                "te": "మీకు, ప్రయాణికులకు, మీ కారుకు",
                "hi": "आपके, यात्रियों और आपकी गाड़ी के लिए",
            },
            "description": {
                "en": "Check tyres, brakes, lights, fuel and AC before every trip. Wear your seat belt, follow speed limits and traffic rules, never use the phone while driving, and never drive drunk or tired - stop and rest on long routes. Carry only the passengers on the booking. At night, confirm the pickup with the OTP and keep to the planned route. In an emergency call 112, then tell Drop Cars support at {support_phone}.",
                "ta": "ஒவ்வொரு சவாரிக்கும் முன் டயர், பிரேக், விளக்குகள், எரிபொருள், AC சரிபார்க்கவும். சீட் பெல்ட் அணிந்து, வேக வரம்பு மற்றும் போக்குவரத்து விதிகளை பின்பற்றுங்கள்; ஓட்டும்போது போன் பயன்படுத்தாதீர்கள்; மது அருந்தி அல்லது சோர்வுடன் ஓட்டாதீர்கள் - நீண்ட வழியில் நிறுத்தி ஓய்வெடுங்கள். புக்கிங்கில் உள்ள பயணிகளை மட்டுமே ஏற்றுங்கள். இரவில் OTP மூலம் பிக்கப்பை உறுதிசெய்து திட்டமிட்ட வழியிலேயே செல்லுங்கள். அவசரத்தில் 112-ஐ அழைத்து, பிறகு Drop Cars சப்போர்ட் {support_phone}-க்கு தெரிவியுங்கள்.",
                "te": "ప్రతి ట్రిప్‌కు ముందు టైర్లు, బ్రేకులు, లైట్లు, ఇంధనం, AC చూడండి. సీట్ బెల్ట్ పెట్టుకోండి, వేగ పరిమితి, ట్రాఫిక్ నియమాలు పాటించండి, డ్రైవింగ్‌లో ఫోన్ వాడకండి, మద్యం తాగి లేదా అలసటతో నడపకండి - లాంగ్ రూట్‌లో ఆగి విశ్రాంతి తీసుకోండి. బుకింగ్‌లోని ప్రయాణికులనే ఎక్కించుకోండి. రాత్రి OTP తో పికప్ నిర్ధారించి ప్లాన్ చేసిన రూట్‌లోనే వెళ్లండి. అత్యవసరంలో 112 కు కాల్ చేసి, తర్వాత Drop Cars సపోర్ట్ {support_phone} కు తెలపండి.",
                "hi": "हर ट्रिप से पहले टायर, ब्रेक, लाइट, ईंधन और AC जाँचें। सीट बेल्ट लगाएँ, गति सीमा और ट्रैफिक नियम मानें, चलाते समय फोन न चलाएँ, शराब पीकर या थके हुए न चलाएँ - लंबे रूट पर रुककर आराम करें। केवल बुकिंग वाले यात्री ही बैठाएँ। रात में OTP से पिकअप पक्का करें और तय रूट पर ही चलें। आपात स्थिति में 112 पर कॉल करें, फिर Drop Cars सपोर्ट {support_phone} को बताएँ।",
            },
        },
        {
            "icon": "users", "color": "amber",
            "title": {
                "en": "Treat every customer with respect", "ta": "ஒவ்வொரு வாடிக்கையாளரையும் மரியாதையுடன் நடத்துங்கள்",
                "te": "ప్రతి కస్టమర్‌ను గౌరవంగా చూడండి", "hi": "हर ग्राहक के साथ सम्मान से पेश आएँ",
            },
            "subtitle": {
                "en": "Good ratings bring more bookings and bonus",
                "ta": "நல்ல மதிப்பீடு அதிக புக்கிங் மற்றும் போனஸ் தரும்",
                "te": "మంచి రేటింగ్ ఎక్కువ బుకింగ్‌లు, బోనస్ తెస్తుంది",
                "hi": "अच्छी रेटिंग से ज्यादा बुकिंग और बोनस मिलता है",
            },
            "description": {
                "en": "Be on time, keep the car clean and speak politely. Waiting up to 15 minutes at pickup is free. Do not cancel after you are assigned - it hurts the customer and costs you a penalty. Never share a customer's phone number or trip details with anyone. When a customer rates your trip 3 stars or more through the trip QR, a bonus of Rs 10 per star is added to your wallet after 24 hours.",
                "ta": "நேரத்துக்கு வாருங்கள், காரை சுத்தமாக வைத்து, பணிவுடன் பேசுங்கள். பிக்கப்பில் 15 நிமிடம் வரை காத்திருப்பு இலவசம். ஒதுக்கிய பிறகு ரத்து செய்யாதீர்கள் - வாடிக்கையாளருக்கு பாதிப்பு, உங்களுக்கு அபராதம். வாடிக்கையாளரின் போன் எண் அல்லது சவாரி விவரங்களை யாருடனும் பகிராதீர்கள். சவாரி QR மூலம் வாடிக்கையாளர் 3 நட்சத்திரம் அல்லது அதற்கு மேல் மதிப்பிட்டால், ஒரு நட்சத்திரத்துக்கு ₹10 போனஸ் 24 மணி நேரத்துக்குப் பின் உங்கள் வாலட்டில் சேரும்.",
                "te": "సమయానికి రండి, కారు శుభ్రంగా ఉంచండి, మర్యాదగా మాట్లాడండి. పికప్ వద్ద 15 నిమిషాల వరకు వేచి ఉండటం ఉచితం. కేటాయించాక రద్దు చేయకండి - కస్టమర్‌కు ఇబ్బంది, మీకు జరిమానా. కస్టమర్ ఫోన్ నంబర్ లేదా ట్రిప్ వివరాలను ఎవరితోనూ పంచుకోకండి. ట్రిప్ QR ద్వారా కస్టమర్ 3 స్టార్లు లేదా అంతకంటే ఎక్కువ రేటింగ్ ఇస్తే, స్టార్‌కు ₹10 బోనస్ 24 గంటల తర్వాత మీ వాలెట్‌లో చేరుతుంది.",
                "hi": "समय पर पहुँचें, गाड़ी साफ रखें और विनम्रता से बात करें। पिकअप पर 15 मिनट तक इंतज़ार मुफ़्त है। असाइन होने के बाद कैंसिल न करें - इससे ग्राहक को परेशानी और आपको जुर्माना होता है। ग्राहक का फोन नंबर या ट्रिप की जानकारी किसी से साझा न करें। ट्रिप QR से ग्राहक 3 स्टार या अधिक रेटिंग दे तो हर स्टार पर ₹10 बोनस 24 घंटे बाद आपके वॉलेट में जुड़ता है।",
            },
        },
        {
            "icon": "alert-triangle", "color": "red",
            "title": {
                "en": "You are responsible for what you accept", "ta": "நீங்கள் ஏற்பதற்கு நீங்களே பொறுப்பு",
                "te": "మీరు అంగీకరించిన దానికి మీరే బాధ్యులు", "hi": "जो आप स्वीकारते हैं उसके जिम्मेदार आप हैं",
            },
            "subtitle": {
                "en": "The account that accepts a booking carries full responsibility",
                "ta": "புக்கிங்கை ஏற்கும் கணக்குக்கே முழு பொறுப்பு",
                "te": "బుకింగ్ అంగీకరించిన ఖాతాదారుకే పూర్తి బాధ్యత",
                "hi": "बुकिंग स्वीकारने वाले खाते की पूरी जिम्मेदारी है",
            },
            "description": {
                "en": "Whoever accepts a booking is fully responsible for the trip, the documents, the driver's conduct and any loss or accident. Drop Cars is only the technology platform that connects you with customers. Unauthorised car or driver swaps, fake or expired documents and taking extra cash outside the app can lead to penalties, a permanent block and legal action. A security amount is held from your wallet when you accept and returned when the trip completes.",
                "ta": "புக்கிங்கை ஏற்பவரே சவாரி, ஆவணங்கள், டிரைவரின் நடத்தை மற்றும் எந்த இழப்பு அல்லது விபத்துக்கும் முழு பொறுப்பு. Drop Cars உங்களை வாடிக்கையாளர்களுடன் இணைக்கும் தொழில்நுட்ப தளம் மட்டுமே. அனுமதியற்ற கார் அல்லது டிரைவர் மாற்றம், போலி/காலாவதியான ஆவணங்கள், ஆப்புக்கு வெளியே கூடுதல் ரொக்கம் வாங்குதல் ஆகியவை அபராதம், நிரந்தர தடை மற்றும் சட்ட நடவடிக்கைக்கு வழிவகுக்கும். ஏற்கும்போது உங்கள் வாலட்டில் இருந்து ஒரு பாதுகாப்புத் தொகை ஹோல்டு செய்யப்பட்டு, சவாரி முடிந்ததும் திருப்பி வழங்கப்படும்.",
                "te": "బుకింగ్ అంగీకరించినవారే ట్రిప్, పత్రాలు, డ్రైవర్ ప్రవర్తన మరియు ఏ నష్టం/ప్రమాదానికైనా పూర్తి బాధ్యులు. Drop Cars మిమ్మల్ని కస్టమర్లతో కలిపే టెక్నాలజీ ప్లాట్‌ఫాం మాత్రమే. అనధికార కారు/డ్రైవర్ మార్పు, నకిలీ లేదా గడువు తీరిన పత్రాలు, యాప్ బయట అదనపు నగదు తీసుకోవడం వల్ల జరిమానా, శాశ్వత నిషేధం, చట్టపరమైన చర్యలు ఉండవచ్చు. అంగీకరించినప్పుడు మీ వాలెట్ నుండి భద్రతా మొత్తం హోల్డ్ అవుతుంది, ట్రిప్ పూర్తయ్యాక తిరిగి వస్తుంది.",
                "hi": "जो बुकिंग स्वीकारता है वही ट्रिप, दस्तावेज़, ड्राइवर के व्यवहार और किसी भी नुकसान या दुर्घटना का पूरा जिम्मेदार है। Drop Cars केवल एक तकनीकी प्लेटफ़ॉर्म है जो आपको ग्राहकों से जोड़ता है। बिना अनुमति गाड़ी/ड्राइवर बदलना, नकली या एक्सपायर दस्तावेज़ और ऐप के बाहर अतिरिक्त नकद लेने पर जुर्माना, स्थायी ब्लॉक और कानूनी कार्रवाई हो सकती है। स्वीकारते समय आपके वॉलेट से सुरक्षा राशि होल्ड होती है और ट्रिप पूरी होने पर लौटा दी जाती है।",
            },
        },
        {
            "icon": "shield-check", "color": "indigo",
            "title": {
                "en": "Terms & Platform Policies", "ta": "விதிமுறைகள் மற்றும் கொள்கைகள்",
                "te": "నిబంధనలు & ప్లాట్‌ఫాం విధానాలు", "hi": "नियम और प्लेटफ़ॉर्म नीतियाँ",
            },
            "subtitle": {
                "en": "Read and accept to activate your account",
                "ta": "படித்து ஏற்றுக்கொண்டால் உங்கள் கணக்கு செயல்படும்",
                "te": "చదివి అంగీకరిస్తే మీ ఖాతా యాక్టివేట్ అవుతుంది",
                "hi": "पढ़कर स्वीकार करें, तभी आपका खाता चालू होगा",
            },
            "description": {
                "en": "Our Terms & Conditions protect you, your passengers and Drop Cars. Please read them once, fully, and accept to continue. You can read them again any time from Settings.",
                "ta": "எங்கள் விதிமுறைகள் உங்களை, உங்கள் பயணிகளை மற்றும் Drop Cars-ஐ பாதுகாக்கின்றன. ஒருமுறை முழுமையாக படித்து, தொடர ஏற்றுக்கொள்ளுங்கள். எப்போது வேண்டுமானாலும் Settings-ல் மீண்டும் படிக்கலாம்.",
                "te": "మా నిబంధనలు మిమ్మల్ని, మీ ప్రయాణికులను, Drop Cars ను కాపాడతాయి. ఒకసారి పూర్తిగా చదివి కొనసాగడానికి అంగీకరించండి. ఎప్పుడైనా Settings లో మళ్లీ చదవవచ్చు.",
                "hi": "हमारे नियम आपकी, आपके यात्रियों की और Drop Cars की सुरक्षा करते हैं। इन्हें एक बार पूरा पढ़ें और आगे बढ़ने के लिए स्वीकार करें। आप कभी भी Settings में इन्हें दोबारा पढ़ सकते हैं।",
            },
        },
    ],
}


TERMS_EN = """DROP CARS - DRIVER & FLEET PARTNER PLATFORM
TERMS & CONDITIONS AND PLATFORM PROTECTION POLICY

By registering, accessing or using the Drop Cars Driver Partner App, the user (fleet owner, vehicle owner or driver account holder) agrees to the following legally binding terms.

1. PLATFORM ROLE AND LIMITED LIABILITY
Drop Cars is a technology platform that connects independent fleet operators and drivers with customer and vendor booking requests. Drop Cars is not a motor carrier, transport provider, employer or bailee. Drop Cars is not liable for vehicle condition, driver conduct, road accidents, passenger injury, property damage, loss of goods or disputes arising during any trip, to the fullest extent permitted by law.

2. ACCOUNT HOLDER RESPONSIBILITY
The registered account holder who accepts a booking is fully and exclusively responsible for that booking from acceptance to completion - whether the account holder drives personally or assigns a driver.

3. SAFETY OBLIGATIONS (MANDATORY)
3.1. Vehicle: keep the vehicle roadworthy and clean. Before every trip check tyres, brakes, lights, indicators, wipers, fuel and air-conditioning.
3.2. Driving: obey traffic laws and speed limits, wear the seat belt, do not use a mobile phone while driving, and never drive under the influence of alcohol or drugs or while too tired to drive safely. Take rest breaks on long routes.
3.3. Passengers: carry only the passengers and luggage that the booking allows. Never overload the vehicle.
3.4. Start of trip: begin a trip only after verifying the customer with the Start OTP. Do not start, or continue, a trip that feels unsafe - contact Drop Cars support first.
3.5. Night and remote travel: keep to the planned route, do not accept unplanned detours to unsafe places, and share your live position with support if you feel unsafe.
3.6. Emergencies: in an accident, medical emergency or threat, secure people first, call 112 and then inform Drop Cars support at {support_phone}. Do not move a seriously injured person unless there is immediate danger.
3.7. Zero tolerance: harassment, abuse, violence, discrimination, theft, carrying prohibited goods and misuse of a customer's personal information are prohibited and lead to immediate suspension.

4. ACCEPTING AND ASSIGNING BOOKINGS
4.1. A booking must be assigned to a registered car and a registered driver within the deadline shown on the booking card.
4.2. Every accepted trip must be run only by the exact car and driver assigned in the app for that booking.
4.3. UNAUTHORISED SWAP: allowing an unassigned driver, another vehicle or a third party to run a trip is prohibited. The accepting account holder bears full civil and criminal liability for any resulting accident, death, injury, theft, damage, loss or fine. Drop Cars is released from all claims. Violations attract a penalty of up to Rs 10,000, account termination, a permanent block and possible legal action.
4.4. Do not cancel an assigned booking without a valid reason. Late assignment, no-show and cancellation after assignment attract the penalties in clause 9.

5. DOCUMENTS
5.1. Keep genuine, unexpired documents on the platform: driving licence, registration certificate (RC), commercial insurance, fitness certificate, permit, pollution certificate and, for drivers, Aadhaar.
5.2. If a trip is run with expired, forged, suspended or missing documents, the accepting account holder alone bears all financial and legal liability - traffic fines, penalties, rejected insurance claims and third-party damages. Drop Cars does not physically verify documents on the road.
5.3. Documents are verified by Drop Cars. A rejected or expired document may block you from accepting bookings until it is corrected.

6. MONEY: FARE, COMMISSION, FEES AND WALLET
6.1. Fees and commission: the commission and platform charges that apply to a booking are shown in the app on that booking before you accept it, and are explained in the app under Menu > Fees & Commission. Nothing is deducted that is not shown.
6.2. A convenience fee may be added to the customer's bill. Where it applies it is shown on the booking and the bill, and any amount you collect in cash is settled through your wallet.
6.3. Trip billing follows the booking terms, including any minimum billing shown on the booking. Toll, parking, inter-state permit and similar charges are paid by the customer at actuals against receipts.
6.4. Never collect any extra amount from a customer outside the app bill. Doing so is a breach of these terms.
6.5. Wallet: keep a positive balance to accept bookings. When a booking is accepted a security amount, shown on the booking, is held from the wallet and released on completion. It is forfeited as a penalty if the trip is not executed or resources are not assigned on time.
6.6. Registration / yearly attachment fees, commissions, fees and penalties that have been processed are non-refundable, except where Drop Cars decides otherwise in writing.
6.7. Every wallet entry can be opened in the app for an explanation. Report any mistake to support within 7 days.

7. CUSTOMER CONDUCT AND PRIVACY
7.1. Be punctual, courteous and professional. Waiting up to 15 minutes at pickup is free; waiting charges beyond that follow the booking terms.
7.2. Customer phone numbers, addresses and trip details are confidential. Use them only for the trip and never share, sell, post or misuse them. Calls and chats through the app may be recorded and reviewed for safety and dispute resolution.
7.3. Customers may rate the trip. Ratings, complaints and safety reports are used to keep the platform safe and may affect access to bookings.
7.4. A rating bonus (currently Rs 10 per star for 3 stars and above) may be credited to the wallet 24 hours after a genuine customer rating. Self-ratings or manipulation are prohibited and forfeit the bonus.

8. INDEMNITY
The account holder agrees to defend, indemnify and hold harmless Drop Cars, its parent company, directors, employees, affiliates and technology partners against all claims, losses, damages, liabilities, fines, penalties, costs and legal fees arising from: any trip executed or not executed under the account; accidents, injury, death or property damage; unauthorised swaps; expired, fraudulent or missing documents; driver misconduct, negligence or unlawful acts; and collecting extra cash outside the app bill.

9. PENALTIES AND ENFORCEMENT
Penalties are deducted from the wallet or recovered by lawful means:
- Unallocation / no-show: up to Rs 2,000
- Late assignment: up to Rs 500
- Unauthorised vehicle or driver swap: up to Rs 10,000 and permanent block
- Fraudulent or expired documents: up to Rs 5,000 and permanent block
Amounts may be revised by Drop Cars with notice in the app. Penalty decisions are subject to final approval of the Drop Cars administrator, and you may contest one through support with your reasons.

10. SUSPENSION, TERMINATION AND LEGAL ACTION
Drop Cars may suspend, lock or permanently close an account, hold wallet funds against dues and take legal action under Indian law for safety violations, fraud, document misrepresentation or unauthorised trip transfers.

11. ACCOUNT SECURITY
Keep your password and OTPs private. You are responsible for all activity under your account. Report a lost phone or suspected misuse to support immediately.

12. CHANGES TO THESE TERMS
Drop Cars may update these terms and the app's rules. Important changes are shown in the app and you may be asked to accept them again. Continuing to use the app after a change means you accept it.

13. SUPPORT AND DISPUTES
Contact Drop Cars support at {support_email} or {support_phone}. These terms are governed by the laws of India.
"""

TERMS_TA = """DROP CARS - டிரைவர் & ஃப்ளீட் பார்ட்னர் தளம்
விதிமுறைகள் மற்றும் தள பாதுகாப்புக் கொள்கை

Drop Cars டிரைவர் பார்ட்னர் ஆப்பில் பதிவு செய்வதன் மூலம் அல்லது பயன்படுத்துவதன் மூலம், பயனர் (ஃப்ளீட் உரிமையாளர், வாகன உரிமையாளர் அல்லது டிரைவர் கணக்கு வைத்திருப்பவர்) கீழ்க்கண்ட சட்டப்பூர்வ விதிமுறைகளை ஏற்றுக்கொள்கிறார்.

1. தளத்தின் பங்கு மற்றும் வரையறுக்கப்பட்ட பொறுப்பு
Drop Cars என்பது சுயாதீன ஃப்ளீட் ஆபரேட்டர்கள் மற்றும் டிரைவர்களை வாடிக்கையாளர் மற்றும் வெண்டர் புக்கிங் கோரிக்கைகளுடன் இணைக்கும் தொழில்நுட்ப தளம். Drop Cars ஒரு போக்குவரத்து நிறுவனம், வேலையளிப்பவர் அல்லது பாதுகாவலர் அல்ல. சட்டம் அனுமதிக்கும் அதிகபட்ச அளவில், எந்த சவாரியிலும் ஏற்படும் வாகன நிலை, டிரைவர் நடத்தை, விபத்து, பயணி காயம், சொத்து சேதம், பொருள் இழப்பு அல்லது தகராறுகளுக்கு Drop Cars பொறுப்பல்ல.

2. கணக்கு உரிமையாளரின் பொறுப்பு
புக்கிங்கை ஏற்கும் பதிவு பெற்ற கணக்கு உரிமையாளர், ஏற்றது முதல் முடிவு வரை அந்த புக்கிங்குக்கு முழுமையாகவும் தனிப்பட்ட முறையிலும் பொறுப்பு - தானே ஓட்டினாலும் டிரைவரை ஒதுக்கினாலும்.

3. பாதுகாப்பு கடமைகள் (கட்டாயம்)
3.1. வாகனம்: வாகனத்தை சாலைக்கு தகுதியாகவும் சுத்தமாகவும் வைத்திருங்கள். ஒவ்வொரு சவாரிக்கும் முன் டயர், பிரேக், விளக்குகள், இண்டிகேட்டர், வைப்பர், எரிபொருள், AC சரிபார்க்கவும்.
3.2. ஓட்டுதல்: போக்குவரத்து விதிகள், வேக வரம்பை பின்பற்றுங்கள்; சீட் பெல்ட் அணியுங்கள்; ஓட்டும்போது மொபைல் பயன்படுத்தாதீர்கள்; மது அல்லது போதைப்பொருள் உட்கொண்டு அல்லது சோர்வுடன் ஒருபோதும் ஓட்டாதீர்கள். நீண்ட வழியில் ஓய்வு எடுங்கள்.
3.3. பயணிகள்: புக்கிங்கில் அனுமதிக்கப்பட்ட பயணிகள் மற்றும் லக்கேஜ் மட்டுமே ஏற்றுங்கள். அதிக சுமை ஏற்றாதீர்கள்.
3.4. சவாரி தொடக்கம்: Start OTP மூலம் வாடிக்கையாளரை சரிபார்த்த பிறகே சவாரியை தொடங்குங்கள். பாதுகாப்பற்றதாக தோன்றும் சவாரியை தொடங்கவோ தொடரவோ வேண்டாம் - முதலில் Drop Cars சப்போர்ட்டை தொடர்பு கொள்ளுங்கள்.
3.5. இரவு மற்றும் தனிமையான பயணம்: திட்டமிட்ட வழியில் செல்லுங்கள்; பாதுகாப்பற்ற இடங்களுக்கு திட்டமிடாத மாற்றுப்பாதையை ஏற்காதீர்கள்; பாதுகாப்பற்றதாக உணர்ந்தால் உங்கள் இருப்பிடத்தை சப்போர்ட்டுடன் பகிருங்கள்.
3.6. அவசரநிலை: விபத்து, மருத்துவ அவசரம் அல்லது அச்சுறுத்தலில் முதலில் மக்களை பாதுகாத்து, 112-ஐ அழைத்து, பிறகு Drop Cars சப்போர்ட் {support_phone}-க்கு தெரிவியுங்கள். உடனடி ஆபத்து இல்லாத வரை கடுமையாக காயமடைந்தவரை நகர்த்தாதீர்கள்.
3.7. பூஜ்ய சகிப்புத்தன்மை: துன்புறுத்தல், வசவு, வன்முறை, பாகுபாடு, திருட்டு, தடைசெய்யப்பட்ட பொருட்கள் எடுத்துச் செல்லுதல், வாடிக்கையாளரின் தனிப்பட்ட தகவலை தவறாக பயன்படுத்துதல் ஆகியவை தடை; உடனடி இடைநீக்கம் செய்யப்படும்.

4. புக்கிங்குகளை ஏற்றல் மற்றும் ஒதுக்குதல்
4.1. புக்கிங் கார்டில் காட்டப்படும் கெடுவுக்குள் பதிவு செய்த கார் மற்றும் பதிவு செய்த டிரைவரை ஒதுக்க வேண்டும்.
4.2. ஏற்கப்பட்ட ஒவ்வொரு சவாரியும், ஆப்பில் அந்த புக்கிங்குக்கு ஒதுக்கப்பட்ட சரியான கார் மற்றும் டிரைவரால் மட்டுமே ஓட்டப்பட வேண்டும்.
4.3. அனுமதியற்ற மாற்றம்: ஒதுக்கப்படாத டிரைவர், வேறு வாகனம் அல்லது மூன்றாம் நபர் சவாரியை ஓட்ட அனுமதிப்பது தடை. அதனால் ஏற்படும் விபத்து, மரணம், காயம், திருட்டு, சேதம், இழப்பு அல்லது அபராதத்திற்கு ஏற்ற கணக்கு உரிமையாளர் முழு சிவில் மற்றும் குற்றவியல் பொறுப்பை ஏற்கிறார். Drop Cars அனைத்து உரிமைகோரல்களிலிருந்தும் விடுவிக்கப்படுகிறது. மீறலுக்கு ₹10,000 வரை அபராதம், கணக்கு நீக்கம், நிரந்தர தடை மற்றும் சட்ட நடவடிக்கை உண்டு.
4.4. ஒதுக்கிய புக்கிங்கை தகுந்த காரணமின்றி ரத்து செய்யாதீர்கள். தாமதமாக ஒதுக்குதல், வராமல் இருத்தல், ஒதுக்கிய பிறகு ரத்து செய்தல் ஆகியவற்றுக்கு பிரிவு 9-ல் உள்ள அபராதங்கள் பொருந்தும்.

5. ஆவணங்கள்
5.1. உண்மையான, காலாவதியாகாத ஆவணங்களை தளத்தில் வைத்திருங்கள்: ஓட்டுநர் உரிமம், RC, வணிக இன்சூரன்ஸ், தகுதிச் சான்று (FC), பர்மிட், புகை சான்று, டிரைவர்களுக்கு ஆதார்.
5.2. காலாவதியான, போலி, இடைநிறுத்தப்பட்ட அல்லது இல்லாத ஆவணங்களுடன் சவாரி ஓட்டப்பட்டால், போக்குவரத்து அபராதம், தண்டனைகள், நிராகரிக்கப்பட்ட இன்சூரன்ஸ் கோரிக்கை, மூன்றாம் நபர் சேதம் என அனைத்து நிதி மற்றும் சட்ட பொறுப்பும் ஏற்கும் கணக்கு உரிமையாளருக்கே. சாலையில் ஆவணங்களை Drop Cars நேரடியாக சரிபார்ப்பதில்லை.
5.3. ஆவணங்களை Drop Cars சரிபார்க்கும். நிராகரிக்கப்பட்ட அல்லது காலாவதியான ஆவணம் சரிசெய்யப்படும் வரை புக்கிங் ஏற்பது தடுக்கப்படலாம்.

6. பணம்: கட்டணம், கமிஷன், கட்டணங்கள் மற்றும் வாலட்
6.1. கட்டணமும் கமிஷனும்: ஒரு புக்கிங்குக்கு பொருந்தும் கமிஷன் மற்றும் தளக் கட்டணங்கள், நீங்கள் ஏற்பதற்கு முன்பே அந்த புக்கிங்கில் ஆப்பில் காட்டப்படும்; மெனு > கட்டணம் & கமிஷன் பகுதியிலும் விளக்கப்பட்டிருக்கும். காட்டாத எதுவும் பிடிக்கப்படாது.
6.2. வாடிக்கையாளர் பில்லில் கன்வீனியன்ஸ் கட்டணம் சேர்க்கப்படலாம். பொருந்தும் இடத்தில் அது புக்கிங்கிலும் பில்லிலும் காட்டப்படும்; நீங்கள் ரொக்கமாக வசூலிக்கும் தொகை உங்கள் வாலட் மூலம் செட்டில் செய்யப்படும்.
6.3. சவாரி பில்லிங் புக்கிங் விதிகளின்படி நடக்கும்; புக்கிங்கில் காட்டப்பட்ட குறைந்தபட்ச பில்லிங் இருந்தால் அதுவும் பொருந்தும். டோல், பார்க்கிங், மாநிலங்களுக்கிடையேயான பர்மிட் போன்றவற்றை வாடிக்கையாளர் ரசீதுப்படி உண்மைக் கட்டணத்தில் செலுத்துவார்.
6.4. ஆப் பில்லுக்கு வெளியே வாடிக்கையாளரிடம் கூடுதல் தொகை வசூலிக்காதீர்கள். அது இந்த விதிமுறைகளை மீறுவதாகும்.
6.5. வாலட்: புக்கிங் ஏற்க பாசிட்டிவ் இருப்பு வைத்திருங்கள். புக்கிங் ஏற்கும்போது புக்கிங்கில் காட்டப்படும் பாதுகாப்புத் தொகை வாலட்டில் இருந்து ஹோல்டு செய்யப்பட்டு, சவாரி முடிந்ததும் விடுவிக்கப்படும். சவாரி நடைபெறாவிட்டால் அல்லது நேரத்தில் ஒதுக்காவிட்டால் அது அபராதமாக பறிமுதல் செய்யப்படும்.
6.6. பதிவுக் கட்டணம் / வருடாந்திர இணைப்புக் கட்டணம், செயல்படுத்தப்பட்ட கமிஷன், கட்டணங்கள், அபராதங்கள் திரும்பப் பெற முடியாதவை; Drop Cars எழுத்துப்பூர்வமாக வேறு முடிவு எடுத்தால் தவிர.
6.7. ஒவ்வொரு வாலட் பதிவையும் ஆப்பில் திறந்து விளக்கம் பார்க்கலாம். ஏதேனும் தவறு இருந்தால் 7 நாட்களுக்குள் சப்போர்ட்டுக்கு தெரிவியுங்கள்.

7. வாடிக்கையாளர் நடத்தை மற்றும் தனியுரிமை
7.1. நேரம் தவறாமை, மரியாதை, தொழில்முறை. பிக்கப்பில் 15 நிமிடம் வரை காத்திருப்பு இலவசம்; அதற்குப் பிறகு காத்திருப்பு கட்டணம் புக்கிங் விதிகளின்படி.
7.2. வாடிக்கையாளரின் போன் எண், முகவரி, சவாரி விவரங்கள் ரகசியமானவை. சவாரிக்கு மட்டுமே பயன்படுத்துங்கள்; பகிரவோ, விற்கவோ, பதிவிடவோ, தவறாக பயன்படுத்தவோ கூடாது. பாதுகாப்பு மற்றும் தகராறு தீர்வுக்காக ஆப் வழி அழைப்புகள் மற்றும் சாட்கள் பதிவு செய்யப்பட்டு பரிசீலிக்கப்படலாம்.
7.3. வாடிக்கையாளர் சவாரியை மதிப்பிடலாம். மதிப்பீடுகள், புகார்கள், பாதுகாப்பு அறிக்கைகள் தளத்தை பாதுகாப்பாக வைக்க பயன்படுத்தப்படும்; புக்கிங் கிடைப்பதையும் பாதிக்கலாம்.
7.4. உண்மையான வாடிக்கையாளர் மதிப்பீட்டுக்கு 24 மணி நேரத்துக்குப் பிறகு (தற்போது 3 நட்சத்திரம் மற்றும் அதற்கு மேல் ஒரு நட்சத்திரத்துக்கு ₹10) போனஸ் வாலட்டில் சேர்க்கப்படலாம். சுய மதிப்பீடு அல்லது முறைகேடு தடை; போனஸ் பறிமுதல் செய்யப்படும்.

8. இழப்பீட்டு உறுதி
எந்த சவாரி (நடத்தப்பட்டது/நடத்தப்படாதது), விபத்து, காயம், மரணம், சொத்து சேதம், அனுமதியற்ற மாற்றம், காலாவதியான/போலி/இல்லாத ஆவணங்கள், டிரைவரின் தவறான நடத்தை/அலட்சியம்/சட்டவிரோத செயல், ஆப் பில்லுக்கு வெளியே கூடுதல் ரொக்கம் வசூலித்தல் ஆகியவற்றால் ஏற்படும் அனைத்து உரிமைகோரல்கள், இழப்புகள், சேதங்கள், அபராதங்கள், செலவுகள் மற்றும் சட்டக் கட்டணங்களுக்கு எதிராக Drop Cars, அதன் தாய் நிறுவனம், இயக்குநர்கள், ஊழியர்கள், இணை நிறுவனங்கள் மற்றும் தொழில்நுட்ப பங்காளர்களை பாதுகாக்க கணக்கு உரிமையாளர் ஒப்புக்கொள்கிறார்.

9. அபராதங்கள் மற்றும் அமலாக்கம்
அபராதங்கள் வாலட்டிலிருந்து பிடிக்கப்படும் அல்லது சட்டப்படி வசூலிக்கப்படும்:
- ஒதுக்காமை / வராமை: ₹2,000 வரை
- தாமதமாக ஒதுக்குதல்: ₹500 வரை
- அனுமதியற்ற வாகனம்/டிரைவர் மாற்றம்: ₹10,000 வரை மற்றும் நிரந்தர தடை
- போலி அல்லது காலாவதியான ஆவணங்கள்: ₹5,000 வரை மற்றும் நிரந்தர தடை
தொகைகளை Drop Cars ஆப்பில் அறிவிப்புடன் மாற்றலாம். அபராத முடிவுகள் Drop Cars நிர்வாகியின் இறுதி ஒப்புதலுக்கு உட்பட்டவை; உங்கள் காரணங்களுடன் சப்போர்ட் மூலம் மறுக்கலாம்.

10. இடைநீக்கம், நீக்கம் மற்றும் சட்ட நடவடிக்கை
பாதுகாப்பு மீறல், மோசடி, ஆவணத் தவறான தகவல் அல்லது அனுமதியற்ற சவாரி மாற்றத்திற்காக Drop Cars கணக்கை இடைநீக்கம் செய்யவோ, பூட்டவோ, நிரந்தரமாக மூடவோ, நிலுவைக்கு எதிராக வாலட் தொகையை நிறுத்தி வைக்கவோ, இந்திய சட்டப்படி நடவடிக்கை எடுக்கவோ உரிமை உண்டு.

11. கணக்குப் பாதுகாப்பு
உங்கள் கடவுச்சொல் மற்றும் OTP-களை ரகசியமாக வைத்திருங்கள். உங்கள் கணக்கில் நடக்கும் அனைத்துக்கும் நீங்களே பொறுப்பு. போன் தொலைந்தால் அல்லது தவறான பயன்பாடு சந்தேகித்தால் உடனே சப்போர்ட்டுக்கு தெரிவியுங்கள்.

12. விதிமுறைகளில் மாற்றங்கள்
Drop Cars இந்த விதிமுறைகளையும் ஆப் விதிகளையும் புதுப்பிக்கலாம். முக்கிய மாற்றங்கள் ஆப்பில் காட்டப்படும்; மீண்டும் ஏற்றுக்கொள்ளுமாறு கேட்கப்படலாம். மாற்றத்திற்குப் பிறகும் ஆப்பை தொடர்ந்து பயன்படுத்துவது அதை ஏற்றுக்கொள்வதாகும்.

13. சப்போர்ட் மற்றும் தகராறுகள்
Drop Cars சப்போர்ட்டை {support_email} அல்லது {support_phone}-ல் தொடர்பு கொள்ளுங்கள். இந்த விதிமுறைகள் இந்திய சட்டங்களுக்கு உட்பட்டவை.
"""


# Short "key points" shown inside the app; the full text is one tap away (link + in-app). One point per line: "Title: sentence".
TERMS_SUMMARY = {
    "en": """Your responsibility: The account that accepts a booking is fully responsible for the trip, the car, the driver and the documents.
Right car, right driver: Only the car and driver assigned in the app may run the trip. Swapping them is not allowed.
Valid documents: Keep licence, RC, insurance, fitness, permit and pollution papers valid. Expired or fake papers are your risk and can block your account.
Safety first: Follow traffic rules, wear the seat belt, no phone while driving, never drive tired or drunk. In an emergency call 112, then Drop Cars support.
OTP and the app bill only: Start and end every trip with the OTP. Never take extra cash outside the app bill.
Money: Commission and fees are shown on every booking. A security amount is held when you accept and returned after the trip.
Penalties: Late assignment, no-show and cancelling after assignment can cost a penalty and your held amount.
Privacy: Never share a customer's phone number or trip details.
Support: Reach Drop Cars support any time. You can contest a penalty with your reasons.""",
    "ta": """உங்கள் பொறுப்பு: புக்கிங்கை ஏற்கும் கணக்குதான் சவாரி, கார், டிரைவர், ஆவணங்கள் அனைத்துக்கும் முழு பொறுப்பு.
சரியான கார், சரியான டிரைவர்: ஆப்பில் ஒதுக்கிய கார், டிரைவர் மட்டுமே சவாரி ஓட்ட வேண்டும். மாற்றுவது கூடாது.
செல்லுபடியாகும் ஆவணங்கள்: லைசென்ஸ், RC, இன்சூரன்ஸ், FC, பர்மிட், புகை சான்று எல்லாம் காலாவதியாகாமல் இருக்க வேண்டும். காலாவதி அல்லது போலி ஆவணத்தால் ஏற்படும் ஆபத்து உங்களுடையது; கணக்கும் தடுக்கப்படலாம்.
பாதுகாப்பே முதலில்: போக்குவரத்து விதிகளை பின்பற்றுங்கள், சீட் பெல்ட் அணியுங்கள், ஓட்டும்போது போன் வேண்டாம், சோர்வுடன் அல்லது மது அருந்தி ஓட்டாதீர்கள். அவசரத்தில் 112-ஐ அழைத்து, பிறகு Drop Cars சப்போர்ட்டை தொடர்பு கொள்ளுங்கள்.
OTP மற்றும் ஆப் பில் மட்டும்: ஒவ்வொரு சவாரியையும் OTP உடன் தொடங்கி முடியுங்கள். ஆப் பில்லுக்கு வெளியே கூடுதல் ரொக்கம் வாங்காதீர்கள்.
பணம்: கமிஷன் மற்றும் கட்டணங்கள் ஒவ்வொரு புக்கிங்கிலும் காட்டப்படும். ஏற்கும்போது பாதுகாப்புத் தொகை ஹோல்டு ஆகி, சவாரி முடிந்ததும் திரும்பக் கிடைக்கும்.
அபராதம்: தாமதமாக ஒதுக்குதல், வராமல் இருத்தல், ஒதுக்கிய பிறகு ரத்து செய்தல் ஆகியவற்றுக்கு அபராதம் மற்றும் ஹோல்டு தொகை இழப்பு ஏற்படலாம்.
தனியுரிமை: வாடிக்கையாளரின் போன் எண் அல்லது சவாரி விவரங்களை யாருடனும் பகிராதீர்கள்.
உதவி: Drop Cars சப்போர்ட்டை எப்போது வேண்டுமானாலும் தொடர்பு கொள்ளலாம். அபராதத்தை உங்கள் காரணங்களுடன் மறுக்கலாம்.""",
    "te": """మీ బాధ్యత: బుకింగ్ అంగీకరించిన ఖాతాదారే ట్రిప్, కారు, డ్రైవర్, పత్రాలన్నింటికీ పూర్తి బాధ్యులు.
సరైన కారు, సరైన డ్రైవర్: యాప్‌లో కేటాయించిన కారు, డ్రైవర్ మాత్రమే ట్రిప్ నడపాలి. మార్చడం అనుమతించబడదు.
చెల్లుబాటు అయ్యే పత్రాలు: లైసెన్స్, RC, ఇన్సూరెన్స్, FC, పర్మిట్, పొల్యూషన్ పత్రాలు గడువు తీరకుండా ఉంచండి. గడువు తీరిన లేదా నకిలీ పత్రాల రిస్క్ మీదే, ఖాతా కూడా ఆగిపోవచ్చు.
ముందు భద్రత: ట్రాఫిక్ నియమాలు పాటించండి, సీట్ బెల్ట్ పెట్టుకోండి, డ్రైవింగ్‌లో ఫోన్ వాడకండి, అలసటతో లేదా మద్యం తాగి నడపకండి. అత్యవసరంలో 112 కు కాల్ చేసి, తర్వాత Drop Cars సపోర్ట్‌ను సంప్రదించండి.
OTP మరియు యాప్ బిల్లు మాత్రమే: ప్రతి ట్రిప్‌ను OTP తో మొదలుపెట్టి ముగించండి. యాప్ బిల్లు బయట అదనపు నగదు తీసుకోకండి.
డబ్బు: కమిషన్, ఫీజులు ప్రతి బుకింగ్‌లో కనిపిస్తాయి. అంగీకరించినప్పుడు భద్రతా మొత్తం హోల్డ్ అవుతుంది, ట్రిప్ తర్వాత తిరిగి వస్తుంది.
జరిమానాలు: ఆలస్యంగా కేటాయించడం, రాకపోవడం, కేటాయించాక రద్దు చేయడం వల్ల జరిమానా, హోల్డ్ మొత్తం పోవచ్చు.
గోప్యత: కస్టమర్ ఫోన్ నంబర్ లేదా ట్రిప్ వివరాలను ఎవరితోనూ పంచుకోకండి.
సహాయం: Drop Cars సపోర్ట్‌ను ఎప్పుడైనా సంప్రదించవచ్చు. జరిమానాను మీ కారణాలతో వివాదం చేయవచ్చు.""",
    "kn": """ನಿಮ್ಮ ಜವಾಬ್ದಾರಿ: ಬುಕಿಂಗ್ ಒಪ್ಪಿಕೊಳ್ಳುವ ಖಾತೆದಾರರೇ ಟ್ರಿಪ್, ಕಾರು, ಡ್ರೈವರ್ ಮತ್ತು ದಾಖಲೆಗಳಿಗೆ ಸಂಪೂರ್ಣ ಜವಾಬ್ದಾರರು.
ಸರಿಯಾದ ಕಾರು, ಸರಿಯಾದ ಡ್ರೈವರ್: ಆ್ಯಪ್‌ನಲ್ಲಿ ನಿಯೋಜಿಸಿದ ಕಾರು ಮತ್ತು ಡ್ರೈವರ್ ಮಾತ್ರ ಟ್ರಿಪ್ ನಡೆಸಬೇಕು. ಬದಲಾಯಿಸುವುದು ಅನುಮತಿಯಿಲ್ಲ.
ಮಾನ್ಯ ದಾಖಲೆಗಳು: ಲೈಸೆನ್ಸ್, RC, ಇನ್ಶೂರೆನ್ಸ್, FC, ಪರ್ಮಿಟ್, ಮಾಲಿನ್ಯ ಪ್ರಮಾಣಪತ್ರ ಅವಧಿ ಮುಗಿಯದಂತೆ ಇಡಿ. ಅವಧಿ ಮುಗಿದ ಅಥವಾ ನಕಲಿ ದಾಖಲೆಗಳ ಅಪಾಯ ನಿಮ್ಮದೇ; ಖಾತೆಯೂ ನಿರ್ಬಂಧಿತವಾಗಬಹುದು.
ಮೊದಲು ಸುರಕ್ಷತೆ: ಸಂಚಾರ ನಿಯಮ ಪಾಲಿಸಿ, ಸೀಟ್ ಬೆಲ್ಟ್ ಧರಿಸಿ, ಚಾಲನೆ ವೇಳೆ ಫೋನ್ ಬಳಸಬೇಡಿ, ಆಯಾಸ ಅಥವಾ ಮದ್ಯಪಾನದಲ್ಲಿ ಚಲಾಯಿಸಬೇಡಿ. ತುರ್ತು ಸ್ಥಿತಿಯಲ್ಲಿ 112 ಗೆ ಕರೆ ಮಾಡಿ, ನಂತರ Drop Cars ಸಪೋರ್ಟ್ ಸಂಪರ್ಕಿಸಿ.
OTP ಮತ್ತು ಆ್ಯಪ್ ಬಿಲ್ ಮಾತ್ರ: ಪ್ರತಿ ಟ್ರಿಪ್ ಅನ್ನು OTP ಯೊಂದಿಗೆ ಶುರು ಮಾಡಿ ಮುಗಿಸಿ. ಆ್ಯಪ್ ಬಿಲ್ ಹೊರತಾಗಿ ಹೆಚ್ಚುವರಿ ನಗದು ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ.
ಹಣ: ಕಮಿಷನ್ ಮತ್ತು ಶುಲ್ಕಗಳು ಪ್ರತಿ ಬುಕಿಂಗ್‌ನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತದೆ. ಒಪ್ಪಿಕೊಂಡಾಗ ಭದ್ರತಾ ಮೊತ್ತ ಹೋಲ್ಡ್ ಆಗುತ್ತದೆ, ಟ್ರಿಪ್ ನಂತರ ಹಿಂತಿರುಗುತ್ತದೆ.
ದಂಡ: ತಡವಾಗಿ ನಿಯೋಜನೆ, ಬಾರದಿರುವುದು, ನಿಯೋಜನೆಯ ನಂತರ ರದ್ದುಪಡಿಸುವುದಕ್ಕೆ ದಂಡ ಮತ್ತು ಹೋಲ್ಡ್ ಮೊತ್ತದ ನಷ್ಟವಾಗಬಹುದು.
ಗೌಪ್ಯತೆ: ಗ್ರಾಹಕರ ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಟ್ರಿಪ್ ವಿವರಗಳನ್ನು ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.
ಸಹಾಯ: Drop Cars ಸಪೋರ್ಟ್ ಅನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ ಸಂಪರ್ಕಿಸಬಹುದು. ದಂಡವನ್ನು ನಿಮ್ಮ ಕಾರಣಗಳೊಂದಿಗೆ ಪ್ರಶ್ನಿಸಬಹುದು.""",
    "hi": """आपकी जिम्मेदारी: बुकिंग स्वीकारने वाला खाता ही ट्रिप, गाड़ी, ड्राइवर और दस्तावेज़ों का पूरा जिम्मेदार है।
सही गाड़ी, सही ड्राइवर: ऐप में असाइन की गई गाड़ी और ड्राइवर ही ट्रिप चलाएँगे। इन्हें बदलना मना है।
वैध दस्तावेज़: लाइसेंस, RC, बीमा, फिटनेस, परमिट और प्रदूषण पेपर वैध रखें। एक्सपायर या नकली कागज़ों का जोखिम आपका है और खाता ब्लॉक हो सकता है।
पहले सुरक्षा: ट्रैफिक नियम मानें, सीट बेल्ट लगाएँ, चलाते समय फोन न चलाएँ, थके हुए या नशे में गाड़ी न चलाएँ। आपात स्थिति में 112 पर कॉल करें, फिर Drop Cars सपोर्ट से संपर्क करें।
सिर्फ OTP और ऐप बिल: हर ट्रिप OTP से शुरू और खत्म करें। ऐप बिल के बाहर अतिरिक्त नकद न लें।
पैसा: कमीशन और शुल्क हर बुकिंग पर दिखते हैं। स्वीकारते समय सुरक्षा राशि होल्ड होती है और ट्रिप के बाद लौटा दी जाती है।
जुर्माना: देर से असाइन, न आना और असाइन के बाद कैंसिल करने पर जुर्माना और होल्ड राशि जा सकती है।
गोपनीयता: ग्राहक का फोन नंबर या ट्रिप की जानकारी किसी से साझा न करें।
सहायता: Drop Cars सपोर्ट से कभी भी संपर्क करें। जुर्माने को अपने कारणों के साथ चुनौती दे सकते हैं।""",
}

DRIVER_TERMS = {
    "version": 2,
    "title": {
        "en": "Terms and Conditions", "ta": "விதிமுறைகள் மற்றும் நிபந்தனைகள்",
        "te": "నిబంధనలు మరియు షరతులు", "hi": "नियम और शर्तें",
    },
    # Telugu / Hindi fall back to English until an admin adds a translation - a legal text should not be machine-translated
    "body": {"en": TERMS_EN, "ta": TERMS_TA},
    "summary": TERMS_SUMMARY,
}


FEE_INFO_EN = """FEES AND COMMISSION - HOW IT WORKS

This page explains how money works on a booking. The exact amounts for a booking are always shown on the booking before you accept it.

1. COMMISSION
On bookings posted by a vendor or another driver, the commission is 10% of the km fare, at least Rs {commission_min} on outstation bookings. Local bookings have no minimum. Bookings marked "10% CC OFF" have no commission.

2. WHO GETS WHAT
Out of the commission, Drop Cars keeps its platform share and the rest goes to whoever posted the booking. Nothing else is deducted from your fare.

3. CONVENIENCE FEE
A Rs {convenience_fee} convenience fee is added to the customer's bill. You collect it in cash from the customer and it is settled from your wallet.

4. MINIMUM BILLING
At trip close, one-way trips are billed for at least 130 km and round trips / multi-city trips for at least 250 km per day, unless the booking shows otherwise.

5. TOLL, PARKING, PERMIT AND OTHER EXTRAS
These are paid by the customer at actuals against receipts. Enter only the items that were not included in the fare. Never take extra cash outside the app bill.

6. SECURITY HOLD
When you accept a booking, an amount is held from your wallet: at least Rs {min_driver_hold}, or your commission with extras if that is more. When the trip completes the commission is deducted and the rest is refunded to your wallet.

7. WALLET
Tap any wallet row to see exactly what it means. If something looks wrong, tell support within 7 days.
"""

FEE_INFO_TA = """கட்டணம் & கமிஷன் - எப்படி வேலை செய்கிறது

ஒரு புக்கிங்கில் பணம் எப்படி கணக்கிடப்படுகிறது என்பதை இந்த பக்கம் விளக்குகிறது. புக்கிங்கின் சரியான தொகைகள் நீங்கள் ஏற்பதற்கு முன்பே அந்த புக்கிங்கில் காட்டப்படும்.

1. கமிஷன்
வெண்டர் அல்லது மற்றொரு டிரைவர் பதிவிட்ட புக்கிங்குகளில் கமிஷன் கி.மீ. கட்டணத்தின் 10%; அவுட்ஸ்டேஷன் புக்கிங்கில் குறைந்தது ₹{commission_min}. லோக்கல் புக்கிங்குக்கு குறைந்தபட்சம் இல்லை. "10% CC OFF" குறியிட்ட புக்கிங்குகளுக்கு கமிஷன் இல்லை.

2. யாருக்கு என்ன
கமிஷனிலிருந்து Drop Cars தன் தளப் பங்கை வைத்துக்கொள்ளும்; மீதி புக்கிங்கை பதிவிட்டவருக்குச் செல்லும். உங்கள் கட்டணத்திலிருந்து வேறு எதுவும் பிடிக்கப்படாது.

3. கன்வீனியன்ஸ் கட்டணம்
வாடிக்கையாளர் பில்லில் ₹{convenience_fee} கன்வீனியன்ஸ் கட்டணம் சேர்க்கப்படும். அதை நீங்கள் வாடிக்கையாளரிடம் ரொக்கமாக வசூலிப்பீர்கள்; உங்கள் வாலட்டில் இருந்து செட்டில் ஆகும்.

4. குறைந்தபட்ச பில்லிங்
சவாரி முடிவில், புக்கிங்கில் வேறுவிதமாக காட்டப்படாவிட்டால், ஒருவழிப் பயணத்துக்கு குறைந்தது 130 கி.மீ.; ரவுண்ட் ட்ரிப் / மல்டி சிட்டிக்கு நாளுக்கு குறைந்தது 250 கி.மீ. பில் செய்யப்படும்.

5. டோல், பார்க்கிங், பர்மிட் மற்றும் பிற கூடுதல் கட்டணங்கள்
இவற்றை வாடிக்கையாளர் ரசீதுப்படி உண்மைக் கட்டணத்தில் செலுத்துவார். கட்டணத்தில் சேராத பொருட்களை மட்டும் உள்ளிடுங்கள். ஆப் பில்லுக்கு வெளியே கூடுதல் ரொக்கம் வாங்காதீர்கள்.

6. பாதுகாப்பு ஹோல்டு
புக்கிங்கை ஏற்கும்போது உங்கள் வாலட்டில் இருந்து குறைந்தது ₹{min_driver_hold} (கமிஷன் + கூடுதல் கட்டணம் அதைவிட அதிகமாக இருந்தால் அந்தத் தொகை) ஹோல்டு செய்யப்படும். சவாரி முடிந்ததும் கமிஷன் கழிக்கப்பட்டு மீதித் தொகை வாலட்டிற்குத் திருப்பி வழங்கப்படும்.

7. வாலட்
எந்த வாலட் வரிசையையும் தொட்டால் அதன் விளக்கம் தெரியும். ஏதாவது தவறாக தெரிந்தால் 7 நாட்களுக்குள் சப்போர்ட்டுக்கு தெரிவியுங்கள்.
"""

FEE_INFO_TE = """ఫీజులు & కమిషన్ - ఎలా పనిచేస్తుంది

బుకింగ్‌లో డబ్బు ఎలా లెక్కిస్తారో ఈ పేజీ వివరిస్తుంది. బుకింగ్ యొక్క ఖచ్చితమైన మొత్తాలు మీరు అంగీకరించే ముందే ఆ బుకింగ్‌లో కనిపిస్తాయి.

1. కమిషన్
వెండర్ లేదా మరో డ్రైవర్ పోస్ట్ చేసిన బుకింగ్‌లపై కమిషన్ కి.మీ. ఛార్జీలో 10%; అవుట్‌స్టేషన్ బుకింగ్‌లో కనీసం ₹{commission_min}. లోకల్ బుకింగ్‌లకు కనీసం లేదు. "10% CC OFF" గుర్తు ఉన్న బుకింగ్‌లకు కమిషన్ లేదు.

2. ఎవరికి ఏమి
కమిషన్ నుండి Drop Cars తన ప్లాట్‌ఫాం వాటా తీసుకుంటుంది; మిగతాది బుకింగ్ పోస్ట్ చేసినవారికి వెళ్తుంది. మీ ఛార్జీ నుండి మరేమీ కోత ఉండదు.

3. కన్వీనియెన్స్ ఫీ
కస్టమర్ బిల్లుకు ₹{convenience_fee} కన్వీనియెన్స్ ఫీ చేరుతుంది. మీరు కస్టమర్ నుండి నగదుగా వసూలు చేస్తారు; మీ వాలెట్ నుండి సెటిల్ అవుతుంది.

4. కనీస బిల్లింగ్
ట్రిప్ ముగింపులో, బుకింగ్‌లో వేరేలా చూపితే తప్ప, వన్-వే ట్రిప్‌కు కనీసం 130 కి.మీ., రౌండ్ ట్రిప్ / మల్టీ-సిటీకి రోజుకు కనీసం 250 కి.మీ. బిల్ చేస్తారు.

5. టోల్, పార్కింగ్, పర్మిట్ మరియు ఇతర ఎక్స్‌ట్రాలు
ఇవి కస్టమర్ రసీదుల ప్రకారం వాస్తవ ఖర్చుతో చెల్లిస్తారు. ఛార్జీలో చేర్చని అంశాలను మాత్రమే నమోదు చేయండి. యాప్ బిల్లు బయట అదనపు నగదు తీసుకోకండి.

6. భద్రతా హోల్డ్
బుకింగ్ అంగీకరించినప్పుడు మీ వాలెట్ నుండి కనీసం ₹{min_driver_hold} (కమిషన్ + ఎక్స్‌ట్రాలు దానికంటే ఎక్కువైతే ఆ మొత్తం) హోల్డ్ అవుతుంది. ట్రిప్ పూర్తయ్యాక కమిషన్ మినహాయించి మిగిలినది వాలెట్‌కు తిరిగి వస్తుంది.

7. వాలెట్
ఏ వాలెట్ వరుసనైనా నొక్కితే వివరణ కనిపిస్తుంది. ఏదైనా తప్పుగా అనిపిస్తే 7 రోజుల్లో సపోర్ట్‌కు తెలపండి.
"""

FEE_INFO_HI = """शुल्क और कमीशन - कैसे काम करता है

यह पेज बताता है कि बुकिंग में पैसा कैसे गिना जाता है। बुकिंग की सही रकम स्वीकारने से पहले उसी बुकिंग पर दिखती है।

1. कमीशन
वेंडर या दूसरे ड्राइवर की पोस्ट की बुकिंग पर कमीशन किमी किराये का 10% है; आउटस्टेशन बुकिंग में कम से कम ₹{commission_min}। लोकल बुकिंग में कोई न्यूनतम नहीं। "10% CC OFF" वाली बुकिंग पर कमीशन नहीं लगता।

2. किसे क्या मिलता है
कमीशन में से Drop Cars अपना प्लेटफ़ॉर्म हिस्सा रखता है और बाकी बुकिंग पोस्ट करने वाले को जाता है। आपके किराये से और कुछ नहीं कटता।

3. सुविधा शुल्क
ग्राहक के बिल में ₹{convenience_fee} सुविधा शुल्क जुड़ता है। आप इसे ग्राहक से नकद लेते हैं और यह आपके वॉलेट से सेटल होता है।

4. न्यूनतम बिलिंग
ट्रिप खत्म होने पर, बुकिंग में अलग न दिखाया हो तो, वन-वे ट्रिप के लिए कम से कम 130 किमी और राउंड ट्रिप / मल्टी-सिटी के लिए प्रतिदिन कम से कम 250 किमी का बिल बनता है।

5. टोल, पार्किंग, परमिट और अन्य अतिरिक्त
ये ग्राहक रसीद के अनुसार असल खर्च पर देता है। केवल वही चीज़ें डालें जो किराये में शामिल नहीं थीं। ऐप बिल के बाहर अतिरिक्त नकद न लें।

6. सुरक्षा होल्ड
बुकिंग स्वीकारते समय आपके वॉलेट से कम से कम ₹{min_driver_hold} (या कमीशन + एक्स्ट्रा इससे ज़्यादा हो तो वह राशि) होल्ड होती है। ट्रिप पूरी होने पर कमीशन काटकर बाकी राशि वॉलेट में वापस कर दी जाती है।

7. वॉलेट
किसी भी वॉलेट पंक्ति पर टैप करके उसका मतलब देखें। कुछ गलत लगे तो 7 दिन में सपोर्ट को बताएँ।
"""

DRIVER_FEE_INFO = {
    "version": 1,
    "title": {"en": "Fees & Commission", "ta": "கட்டணம் & கமிஷன்", "te": "ఫీజులు & కమిషన్", "hi": "शुल्क और कमीशन"},
    "body": {"en": FEE_INFO_EN, "ta": FEE_INFO_TA, "te": FEE_INFO_TE, "hi": FEE_INFO_HI},
}

BOT_KNOWLEDGE = {
    "version": 1,
    "text": (
        "APP MAP (Driver App): Bottom tabs - Home (new bookings, accept), Duty (My Trips | Live Radar), Rides/Bookings (your accepted trips, "
        "Upcoming / Executed), Chats (booking chats, Help Bot, Drop Cars support), Wallet (balance, ledger, add money, payout), Menu (profile, "
        "My Cars, My Drivers, Vacant City, Documents, Feedbacks, Settings, Terms).\n"
        "HOW TO: add a car -> Menu > My Cars > Add. Add a driver -> Menu > My Drivers > Add (Aadhaar photo + number needed). Update a document -> "
        "the document card on My Cars / My Drivers or the KYC pop-up. Assign a driver -> after accepting, open the booking and choose car and driver. "
        "Talk to the booking's poster -> the Chat button on the booking card. Talk to a person -> Chats > Drop Cars Support > Talk to a person.\n"
        "OFF-TOPIC HANDLING: politely say you help only with Drop Cars and steer back to what the user can do in the app (bookings, wallet, "
        "documents, trip rules, support). For general knowledge, politics, personal advice, coding, or anything unrelated, do not answer it; "
        "offer two Drop Cars topics instead. Never discuss servers, databases, code, keys, admin tools or how Drop Cars is built - say that is "
        "internal and offer help with the app instead."
    ),
}

DEFAULTS = {
    "driver_onboarding": DRIVER_ONBOARDING,
    "driver_terms": DRIVER_TERMS,
    "driver_fee_info": DRIVER_FEE_INFO,
    "bot_knowledge": BOT_KNOWLEDGE,
}
