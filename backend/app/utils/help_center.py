# -*- coding: utf-8 -*-
"""Driver Help Center - answers a driver's "how do I ..." / "why was ... deducted" questions inside the chat, in his own language, so he
does not have to phone the owner.

  * topics     one short answer per topic in English, Tamil, Hindi, Telugu and Kannada (numbers are filled from the LIVE settings:
               hold, commission, fees, plan prices, helpline - never typed in here)
  * matching   forgiving: typing mistakes ("walet holld"), Tanglish ("wallet la panam eduthutanga") and native script all work. A
               confident match answers directly; an unsure one asks "Did you mean ...?" with tappable choices
  * wallet     "why was money deducted?" is answered from the caller's OWN ledger, entry by entry, in plain words
The 3 non-English languages besides Tamil were written by an AI: have a native speaker read them once and fix anything that sounds odd."""
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

LANGS = ("en", "ta", "hi", "te", "kn")

# --------------------------------------------------------------------------------------------------------------------
# Topics: id -> {title: {lang: text}, kw: [keywords in any language / spelling], a: {lang: answer}}
# Placeholders: {hold} {comm_min} {conv} {pct} {monthly} {yearly} {phone}
# --------------------------------------------------------------------------------------------------------------------
TOPICS: Dict[str, Dict[str, Any]] = {
    "wallet_hold": {
        "title": {"en": "Why is money held when I accept?", "ta": "Accept செய்யும்போது பணம் ஏன் hold ஆகிறது?", "hi": "Accept करने पर पैसा hold क्यों होता है?",
                  "te": "Accept చేసినప్పుడు డబ్బు ఎందుకు hold అవుతుంది?", "kn": "Accept ಮಾಡಿದಾಗ ಹಣ ಏಕೆ hold ಆಗುತ್ತದೆ?"},
        "kw": ["hold", "wallet hold", "security hold", "held", "block money", "accept hold", "add to wallet to accept", "hold panrathu", "hold aagudhu", "होल्ड", "హోల్డ్", "ಹೋಲ್ಡ್", "ஹோல்டு", "பணம் hold"],
        "a": {
            "en": "💳 When you accept a booking, Drop Cars HOLDS a small amount in your wallet (at least ₹{hold}, more for a bigger booking). It is NOT a charge.\n• Trip completed → the hold is used for the commission and the rest comes back to your wallet.\n• Booking cancelled by the customer / Drop Cars → the full hold comes back.\n• If your balance is low, the Accept button says how much to add.",
            "ta": "💳 Booking-ஐ Accept செய்யும்போது உங்கள் wallet-ல் சிறிய தொகை (குறைந்தது ₹{hold}, பெரிய booking-க்கு அதிகம்) HOLD செய்யப்படும். இது கட்டணம் அல்ல.\n• Trip முடிந்தால் → hold-ல் இருந்து commission எடுத்து மீதம் உங்கள் wallet-க்கு திரும்பும்.\n• Customer / Drop Cars cancel செய்தால் → முழு hold-உம் திரும்பும்.\n• Balance குறைவாக இருந்தால் Accept பொத்தான் எவ்வளவு சேர்க்க வேண்டும் என்று சொல்லும்.",
            "hi": "💳 Booking Accept करने पर आपके wallet में थोड़ी रकम (कम से कम ₹{hold}, बड़ी booking पर ज़्यादा) HOLD होती है। यह कटौती नहीं है।\n• Trip पूरी होने पर → hold से commission लेकर बाकी wallet में लौट आता है।\n• Customer / Drop Cars cancel करे → पूरा hold वापस।\n• Balance कम हो तो Accept बटन बताता है कितना जोड़ना है।",
            "te": "💳 Booking Accept చేసినప్పుడు మీ wallet లో కొంత మొత్తం (కనీసం ₹{hold}, పెద్ద booking కి ఎక్కువ) HOLD అవుతుంది. ఇది ఛార్జ్ కాదు.\n• Trip పూర్తైతే → hold నుండి commission తీసి మిగతా wallet కి తిరిగి వస్తుంది.\n• Customer / Drop Cars cancel చేస్తే → మొత్తం hold తిరిగి వస్తుంది.\n• Balance తక్కువగా ఉంటే Accept బటన్ ఎంత జోడించాలో చెబుతుంది.",
            "kn": "💳 Booking Accept ಮಾಡಿದಾಗ ನಿಮ್ಮ wallet ನಲ್ಲಿ ಸ್ವಲ್ಪ ಮೊತ್ತ (ಕನಿಷ್ಠ ₹{hold}, ದೊಡ್ಡ booking ಗೆ ಹೆಚ್ಚು) HOLD ಆಗುತ್ತದೆ. ಇದು ಶುಲ್ಕ ಅಲ್ಲ.\n• Trip ಮುಗಿದರೆ → hold ನಿಂದ commission ತೆಗೆದು ಉಳಿದದ್ದು wallet ಗೆ ಮರಳುತ್ತದೆ.\n• Customer / Drop Cars cancel ಮಾಡಿದರೆ → ಪೂರ್ಣ hold ಮರಳುತ್ತದೆ.\n• Balance ಕಡಿಮೆ ಇದ್ದರೆ Accept ಬಟನ್ ಎಷ್ಟು ಸೇರಿಸಬೇಕು ಎಂದು ಹೇಳುತ್ತದೆ."},
    },
    "wallet_deduction": {
        "title": {"en": "Why was money deducted from my wallet?", "ta": "என் wallet-ல் இருந்து பணம் ஏன் எடுத்தார்கள்?", "hi": "मेरे wallet से पैसा क्यों कटा?",
                  "te": "నా wallet నుండి డబ్బు ఎందుకు తీశారు?", "kn": "ನನ್ನ wallet ನಿಂದ ಹಣ ಏಕೆ ಕಡಿತವಾಯಿತು?"},
        "kw": ["deduct", "deducted", "deduction", "money taken", "money cut", "amount cut", "penalty", "charged", "why money gone", "wallet balance reduced", "paisa", "panam eduthutanga", "panam kuranjuduchu", "panam cut", "balance kammi", "பணம் எடுத்த", "பணம் குறைந்த", "கழிக்க", "कटा", "कट गया", "कटौती", "पैसा कटा", "తీసేశారు", "తగ్గింది", "కట్", "ಕಡಿತ", "ಹಣ ಕಡಿಮೆ", "wallet history", "wallet statement", "ledger", "transactions"],
        "dynamic": "ledger",
        "a": {
            "en": "💳 Here is what happened in your wallet recently, in plain words:",
            "ta": "💳 உங்கள் wallet-ல் சமீபத்தில் நடந்தது எளிய மொழியில்:",
            "hi": "💳 आपके wallet में हाल में क्या हुआ, आसान शब्दों में:",
            "te": "💳 మీ wallet లో ఇటీవల జరిగినది సులభంగా:",
            "kn": "💳 ನಿಮ್ಮ wallet ನಲ್ಲಿ ಇತ್ತೀಚೆಗೆ ಏನಾಯಿತು, ಸರಳವಾಗಿ:"},
    },
    "add_money": {
        "title": {"en": "How do I add money to my wallet?", "ta": "Wallet-ல் பணம் எப்படி சேர்ப்பது?", "hi": "Wallet में पैसा कैसे जोड़ें?",
                  "te": "Wallet లో డబ్బు ఎలా జోడించాలి?", "kn": "Wallet ಗೆ ಹಣ ಹೇಗೆ ಸೇರಿಸುವುದು?"},
        "kw": ["add money", "recharge", "top up", "topup", "wallet add", "add balance", "deposit", "razorpay", "upi pay", "panam serkka", "recharge panna", "paisa daalna", "பணம் சேர்", "ரீசார்ஜ்", "पैसा जोड़", "रिचार्ज", "డబ్బు జోడ", "రీఛార్జ్", "ಹಣ ಸೇರಿಸ", "ರೀಚಾರ್ಜ್"],
        "a": {
            "en": "➕ Wallet tab → Add Money → type the amount → pay with UPI / card (Razorpay). It is added by itself in a minute.\n• Paid but not added? Wait 10 minutes, then Wallet → 'I have paid - report my payment' and send the UTR (the 12-digit number in your payment app). We credit it after checking.\n• If your bank declines, try UPI (GPay / PhonePe).",
            "ta": "➕ Wallet tab → Add Money → தொகையை உள்ளிடுங்கள் → UPI / card (Razorpay) மூலம் செலுத்துங்கள். ஒரு நிமிடத்தில் தானாகச் சேரும்.\n• செலுத்தியும் சேரவில்லையா? 10 நிமிடம் காத்திருங்கள். பிறகு Wallet → 'I have paid - report my payment' தட்டி UTR (payment app-ல் உள்ள 12 இலக்க எண்) அனுப்புங்கள். சரிபார்த்து சேர்ப்போம்.\n• Bank decline செய்தால் UPI (GPay / PhonePe) முயலுங்கள்.",
            "hi": "➕ Wallet tab → Add Money → रकम लिखें → UPI / card (Razorpay) से भुगतान करें। एक मिनट में अपने आप जुड़ जाता है।\n• भुगतान हुआ पर नहीं जुड़ा? 10 मिनट रुकें, फिर Wallet → 'I have paid - report my payment' में UTR (payment app का 12 अंकों का नंबर) भेजें। जाँच कर जोड़ देंगे।\n• Bank decline करे तो UPI (GPay / PhonePe) आज़माएँ।",
            "te": "➕ Wallet tab → Add Money → మొత్తం టైప్ చేయండి → UPI / card (Razorpay) తో చెల్లించండి. ఒక నిమిషంలో ఆటోమేటిక్‌గా చేరుతుంది.\n• చెల్లించినా చేరలేదా? 10 నిమిషాలు ఆగండి, తర్వాత Wallet → 'I have paid - report my payment' లో UTR (payment app లోని 12 అంకెల నంబర్) పంపండి. పరిశీలించి జమ చేస్తాం.\n• Bank decline చేస్తే UPI (GPay / PhonePe) ప్రయత్నించండి.",
            "kn": "➕ Wallet tab → Add Money → ಮೊತ್ತ ಟೈಪ್ ಮಾಡಿ → UPI / card (Razorpay) ಮೂಲಕ ಪಾವತಿಸಿ. ಒಂದು ನಿಮಿಷದಲ್ಲಿ ತಾನಾಗಿ ಸೇರುತ್ತದೆ.\n• ಪಾವತಿಸಿದರೂ ಸೇರಿಲ್ಲವೇ? 10 ನಿಮಿಷ ಕಾಯಿರಿ, ನಂತರ Wallet → 'I have paid - report my payment' ನಲ್ಲಿ UTR (payment app ನ 12 ಅಂಕಿಯ ಸಂಖ್ಯೆ) ಕಳುಹಿಸಿ. ಪರಿಶೀಲಿಸಿ ಜಮೆ ಮಾಡುತ್ತೇವೆ.\n• Bank decline ಮಾಡಿದರೆ UPI (GPay / PhonePe) ಪ್ರಯತ್ನಿಸಿ."},
    },
    "paid_not_added": {
        "title": {"en": "I paid but it was not added", "ta": "பணம் செலுத்தினேன், ஆனால் சேரவில்லை", "hi": "पैसा दिया पर नहीं जुड़ा", "te": "చెల్లించాను కానీ చేరలేదు", "kn": "ಪಾವತಿಸಿದೆ ಆದರೆ ಸೇರಿಲ್ಲ"},
        "kw": ["paid not added", "payment not credited", "paid but", "money not added", "amount not credited", "payment failed", "payment pending", "utr", "panam potten serala", "panam serala", "payment aagala", "செலுத்தினேன்", "சேரவில்லை", "வரவில்லை", "भुगतान किया", "नहीं जुड़ा", "नहीं आया", "చెల్లించాను", "చేరలేదు", "ಪಾವತಿಸಿದೆ", "ಸೇರಿಲ್ಲ"],
        "a": {
            "en": "🔎 Don't worry. Do this:\n1. Wait 10 minutes - Razorpay payments are matched automatically.\n2. Still not there? Wallet → 'I have paid - report my payment' → type the amount and the UTR (or upload the payment screenshot - we read the UTR for you).\n3. We check our bank and credit it, usually within a few hours. You get a notification.\nIf your bank or wallet shows a deduction but the payment failed, the bank returns it by itself in 3-7 working days.",
            "ta": "🔎 கவலை வேண்டாம். இப்படிச் செய்யுங்கள்:\n1. 10 நிமிடம் காத்திருங்கள் - Razorpay payment தானாகப் பொருந்தும்.\n2. அப்படியும் வரவில்லையா? Wallet → 'I have paid - report my payment' → தொகை, UTR-ஐ உள்ளிடுங்கள் (அல்லது payment screenshot-ஐ upload செய்யுங்கள் - UTR-ஐ நாங்களே படிப்போம்).\n3. நாங்கள் bank-ஐப் பார்த்து சேர்ப்போம், பொதுவாக சில மணி நேரத்தில். Notification வரும்.\nBank / wallet-ல் பணம் போய் payment fail ஆனால், bank 3-7 வேலை நாட்களில் தானாகத் திருப்பும்.",
            "hi": "🔎 चिंता न करें। ऐसा करें:\n1. 10 मिनट रुकें - Razorpay का भुगतान अपने आप मिल जाता है।\n2. फिर भी नहीं आया? Wallet → 'I have paid - report my payment' → रकम और UTR लिखें (या payment screenshot upload करें - UTR हम पढ़ लेंगे)।\n3. हम bank देखकर जोड़ देंगे, आम तौर पर कुछ घंटों में। Notification आएगा।\nBank/wallet में कटा पर payment fail हुआ तो bank 3-7 कार्य दिनों में खुद लौटा देता है।",
            "te": "🔎 భయపడకండి. ఇలా చేయండి:\n1. 10 నిమిషాలు ఆగండి - Razorpay చెల్లింపులు ఆటోమేటిక్‌గా సరిపోతాయి.\n2. ఇంకా రాలేదా? Wallet → 'I have paid - report my payment' → మొత్తం, UTR టైప్ చేయండి (లేదా payment screenshot upload చేయండి - UTR మేమే చదువుతాం).\n3. మేము bank చూసి జమ చేస్తాం, సాధారణంగా కొన్ని గంటల్లో. Notification వస్తుంది.\nBank/wallet లో కట్ అయి payment fail అయితే bank 3-7 పని దినాల్లో తిరిగి ఇస్తుంది.",
            "kn": "🔎 ಚಿಂತೆ ಬೇಡ. ಹೀಗೆ ಮಾಡಿ:\n1. 10 ನಿಮಿಷ ಕಾಯಿರಿ - Razorpay ಪಾವತಿ ತಾನಾಗಿ ಹೊಂದಿಕೆಯಾಗುತ್ತದೆ.\n2. ಇನ್ನೂ ಬಂದಿಲ್ಲವೇ? Wallet → 'I have paid - report my payment' → ಮೊತ್ತ, UTR ಟೈಪ್ ಮಾಡಿ (ಅಥವಾ payment screenshot upload ಮಾಡಿ - UTR ನಾವೇ ಓದುತ್ತೇವೆ).\n3. ನಾವು bank ನೋಡಿ ಜಮೆ ಮಾಡುತ್ತೇವೆ, ಸಾಮಾನ್ಯವಾಗಿ ಕೆಲವು ಗಂಟೆಗಳಲ್ಲಿ. Notification ಬರುತ್ತದೆ.\nBank/wallet ನಲ್ಲಿ ಕಡಿತವಾಗಿ payment fail ಆದರೆ bank 3-7 ಕೆಲಸದ ದಿನಗಳಲ್ಲಿ ತಾನಾಗಿ ಮರಳಿಸುತ್ತದೆ."},
    },
    "withdraw": {
        "title": {"en": "How do I withdraw money?", "ta": "பணத்தை எப்படி எடுப்பது (withdraw)?", "hi": "पैसा कैसे निकालें?", "te": "డబ్బు ఎలా తీసుకోవాలి?", "kn": "ಹಣ ಹೇಗೆ ಹಿಂಪಡೆಯುವುದು?"},
        "kw": ["withdraw", "withdrawal", "payout", "cash out", "take money", "transfer to bank", "panam edukka", "bank la poda", "பணம் எடுக்க", "withdraw பண்ண", "निकाल", "విత్‌డ్రా", "తీసుకోవాలి", "ಹಿಂಪಡೆ", "ವಿತ್‌ಡ್ರಾ"],
        "a": {
            "en": "🏦 Wallet tab → Withdraw → enter the amount and your UPI / bank details → Submit. Drop Cars checks it and pays it to you. You see the status in the same screen.",
            "ta": "🏦 Wallet tab → Withdraw → தொகை, உங்கள் UPI / bank விவரம் → Submit. Drop Cars சரிபார்த்து உங்களுக்குச் செலுத்தும். நிலை அதே திரையில் தெரியும்.",
            "hi": "🏦 Wallet tab → Withdraw → रकम और अपना UPI / bank विवरण → Submit। Drop Cars जाँच कर आपको भुगतान करता है। स्थिति उसी स्क्रीन पर दिखती है।",
            "te": "🏦 Wallet tab → Withdraw → మొత్తం, మీ UPI / bank వివరాలు → Submit. Drop Cars పరిశీలించి చెల్లిస్తుంది. స్థితి అదే స్క్రీన్‌లో కనిపిస్తుంది.",
            "kn": "🏦 Wallet tab → Withdraw → ಮೊತ್ತ, ನಿಮ್ಮ UPI / bank ವಿವರ → Submit. Drop Cars ಪರಿಶೀಲಿಸಿ ಪಾವತಿಸುತ್ತದೆ. ಸ್ಥಿತಿ ಅದೇ ಪರದೆಯಲ್ಲಿ ಕಾಣುತ್ತದೆ."},
    },
    "commission": {
        "title": {"en": "How much commission / fee do I pay?", "ta": "Commission / கட்டணம் எவ்வளவு?", "hi": "Commission / fee कितनी लगती है?", "te": "Commission / fee ఎంత?", "kn": "Commission / fee ಎಷ್ಟು?"},
        "kw": ["commission", "cc", "fee", "fees", "charges", "convenience fee", "service charge", "platform fee", "kamishan", "commission evlo", "commission kuraikka", "கமிஷன்", "கட்டணம்", "कमीशन", "शुल्क", "కమిషన్", "ఫీజు", "ಕಮಿಷನ್", "ಶುಲ್ಕ"],
        "a": {
            "en": "💰 Standard booking: you pay {pct}% commission on the km fare (at least ₹{comm_min}). Local Drop bookings have their own lower-minimum rate. The ₹{conv} convenience fee is added to the customer's bill and collected by you in cash. Nothing else is cut from your earnings. Every booking card shows 'You earn ₹...' before you accept.",
            "ta": "💰 Standard booking: km fare-ல் {pct}% commission (குறைந்தது ₹{comm_min}). Local Drop-க்கு தனி rate உண்டு. ₹{conv} convenience fee customer bill-ல் சேரும், நீங்கள் cash-ஆக வாங்குவீர்கள். வேறு எதுவும் உங்கள் வருமானத்தில் கழிக்கப்படாது. Accept செய்வதற்கு முன் ஒவ்வொரு booking card-லும் 'You earn ₹...' தெரியும்.",
            "hi": "💰 Standard booking: km fare पर {pct}% commission (कम से कम ₹{comm_min})। Local Drop का अलग rate है। ₹{conv} convenience fee customer के bill में जुड़ती है और आप नकद लेते हैं। आपकी कमाई से और कुछ नहीं कटता। Accept से पहले हर booking card पर 'You earn ₹...' दिखता है।",
            "te": "💰 Standard booking: km fare పై {pct}% commission (కనీసం ₹{comm_min}). Local Drop కి వేరే rate ఉంది. ₹{conv} convenience fee customer bill లో కలుస్తుంది, మీరు నగదుగా తీసుకుంటారు. మీ సంపాదన నుండి ఇంకేమీ కట్ కాదు. Accept చేసే ముందు ప్రతి booking card లో 'You earn ₹...' కనిపిస్తుంది.",
            "kn": "💰 Standard booking: km fare ಮೇಲೆ {pct}% commission (ಕನಿಷ್ಠ ₹{comm_min}). Local Drop ಗೆ ಪ್ರತ್ಯೇಕ rate ಇದೆ. ₹{conv} convenience fee customer bill ಗೆ ಸೇರುತ್ತದೆ, ನೀವು ನಗದು ಪಡೆಯುತ್ತೀರಿ. ನಿಮ್ಮ ಗಳಿಕೆಯಿಂದ ಬೇರೇನೂ ಕಡಿತವಿಲ್ಲ. Accept ಮಾಡುವ ಮೊದಲು ಪ್ರತಿ booking card ನಲ್ಲಿ 'You earn ₹...' ಕಾಣುತ್ತದೆ."},
    },
    "accept_assign": {
        "title": {"en": "I accepted a booking - how do I assign a driver and start?", "ta": "Booking accept செய்தேன் - driver assign செய்து எப்படி start செய்வது?", "hi": "Booking accept की - driver कैसे assign करें और शुरू करें?",
                  "te": "Booking accept చేశాను - driver ని ఎలా assign చేసి start చేయాలి?", "kn": "Booking accept ಮಾಡಿದೆ - driver assign ಮಾಡಿ ಹೇಗೆ start ಮಾಡುವುದು?"},
        "kw": ["assign", "assign driver", "assign car", "after accept", "accepted booking", "what next", "start trip", "start ride", "trip start", "where to start", "driver assign", "driver assign panrathu", "accept pannitu", "trip start panrathu", "நியமி", "assign செய்", "ட்ரிப் ஸ்டார்ட்", "असाइन", "ट्रिप शुरू", "అసైన్", "ట్రిప్ స్టార్ట్", "ಅಸೈನ್", "ಟ್ರಿಪ್ ಸ್ಟಾರ್ಟ್"],
        "a": {
            "en": "🚖 After you accept:\n1. Home → Upcoming → Unassigned → tap 'Assign Driver & Cab' on the booking. Pick the driver, then the car. Do it before the countdown on the card ends. Driving it yourself? Choose your own name.\n2. The driver gets it in his Duty tab. Call the customer once to confirm.\n3. At pickup the driver taps Start Ride, takes the odometer photo, enters the start km and the customer's 4-digit Start OTP.\n4. At drop: enter toll / parking and extra km, then the End OTP. The trip closes and your payment is released.",
            "ta": "🚖 Accept செய்த பிறகு:\n1. Home → Upcoming → Unassigned → booking-ல் 'Assign Driver & Cab' தட்டுங்கள். Driver, பிறகு car தேர்ந்தெடுங்கள். Card-ல் உள்ள countdown முடிவதற்குள் செய்யுங்கள். நீங்களே ஓட்டினால் உங்கள் பெயரைத் தேர்ந்தெடுங்கள்.\n2. Driver-க்கு Duty tab-ல் booking வரும். Customer-க்கு ஒருமுறை call செய்து உறுதி செய்யுங்கள்.\n3. Pickup-ல் driver Start Ride தட்டி, odometer photo எடுத்து, start km மற்றும் customer-ன் 4 இலக்க Start OTP-ஐ உள்ளிட வேண்டும்.\n4. Drop-ல்: toll / parking, extra km உள்ளிட்டு End OTP கொடுங்கள். Trip முடிந்து உங்கள் பணம் வெளியாகும்.",
            "hi": "🚖 Accept के बाद:\n1. Home → Upcoming → Unassigned → booking पर 'Assign Driver & Cab' दबाएँ। पहले driver, फिर car चुनें। Card की countdown खत्म होने से पहले करें। खुद चला रहे हैं तो अपना नाम चुनें।\n2. Driver को Duty tab में booking मिलती है। Customer को एक बार call कर लें।\n3. Pickup पर driver Start Ride दबाकर odometer photo लेता है, start km और customer का 4 अंकों का Start OTP डालता है।\n4. Drop पर: toll / parking, extra km भरें, फिर End OTP। Trip बंद होकर आपका भुगतान जारी होता है।",
            "te": "🚖 Accept చేసిన తర్వాత:\n1. Home → Upcoming → Unassigned → booking పై 'Assign Driver & Cab' నొక్కండి. ముందు driver, తర్వాత car ఎంచుకోండి. Card లోని countdown ముగిసేలోపు చేయండి. మీరే నడిపితే మీ పేరు ఎంచుకోండి.\n2. Driver కి Duty tab లో booking వస్తుంది. Customer కి ఒకసారి call చేయండి.\n3. Pickup వద్ద driver Start Ride నొక్కి, odometer photo తీసి, start km మరియు customer యొక్క 4 అంకెల Start OTP ఇవ్వాలి.\n4. Drop వద్ద: toll / parking, extra km నమోదు చేసి End OTP ఇవ్వండి. Trip ముగిసి మీ చెల్లింపు విడుదలవుతుంది.",
            "kn": "🚖 Accept ಮಾಡಿದ ನಂತರ:\n1. Home → Upcoming → Unassigned → booking ಮೇಲೆ 'Assign Driver & Cab' ಒತ್ತಿ. ಮೊದಲು driver, ನಂತರ car ಆರಿಸಿ. Card ನ countdown ಮುಗಿಯುವ ಮೊದಲು ಮಾಡಿ. ನೀವೇ ಓಡಿಸಿದರೆ ನಿಮ್ಮ ಹೆಸರು ಆರಿಸಿ.\n2. Driver ಗೆ Duty tab ನಲ್ಲಿ booking ಬರುತ್ತದೆ. Customer ಗೆ ಒಮ್ಮೆ call ಮಾಡಿ.\n3. Pickup ನಲ್ಲಿ driver Start Ride ಒತ್ತಿ, odometer photo ತೆಗೆದು, start km ಮತ್ತು customer ನ 4 ಅಂಕಿಯ Start OTP ನೀಡಬೇಕು.\n4. Drop ನಲ್ಲಿ: toll / parking, extra km ತುಂಬಿ End OTP ನೀಡಿ. Trip ಮುಗಿದು ನಿಮ್ಮ ಪಾವತಿ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ."},
    },
    "otp": {
        "title": {"en": "Start / End OTP - where do I get it?", "ta": "Start / End OTP எங்கே கிடைக்கும்?", "hi": "Start / End OTP कहाँ मिलेगा?", "te": "Start / End OTP ఎక్కడ దొరుకుతుంది?", "kn": "Start / End OTP ಎಲ್ಲಿ ಸಿಗುತ್ತದೆ?"},
        "kw": ["otp", "start otp", "end otp", "otp not coming", "otp varala", "otp illa", "code", "ஓடிபி", "ஓ.டி.பி", "ओटीपी", "ఓటీపీ", "ಒಟಿಪಿ"],
        "a": {
            "en": "🔑 The customer sees a 4-digit Start OTP in their booking and gets it by SMS. Ask for it when you meet at the pickup and enter it in Duty → Start Ride. At the destination the customer gives the End OTP. If it did not reach them, tap 'Resend OTP'. If there is no signal, contact the Dispatch Desk from the chat - they can verify it for you.",
            "ta": "🔑 Customer-ன் booking-ல் 4 இலக்க Start OTP தெரியும், SMS-உம் வரும். Pickup-ல் சந்திக்கும்போது அதைக் கேட்டு Duty → Start Ride-ல் உள்ளிடுங்கள். Destination-ல் customer End OTP தருவார். வரவில்லை என்றால் 'Resend OTP' தட்டுங்கள். Signal இல்லையென்றால் chat-ல் Dispatch Desk-ஐத் தொடர்புகொள்ளுங்கள், அவர்கள் சரிபார்ப்பார்கள்.",
            "hi": "🔑 Customer को अपनी booking में 4 अंकों का Start OTP दिखता है और SMS भी आता है। Pickup पर मिलकर उनसे मांगें और Duty → Start Ride में डालें। Destination पर customer End OTP देगा। न आए तो 'Resend OTP' दबाएँ। Signal न हो तो chat से Dispatch Desk को बताएँ, वे verify कर देंगे।",
            "te": "🔑 Customer కి వారి booking లో 4 అంకెల Start OTP కనిపిస్తుంది, SMS కూడా వస్తుంది. Pickup వద్ద కలిసినప్పుడు అడిగి Duty → Start Ride లో ఇవ్వండి. Destination వద్ద customer End OTP ఇస్తారు. రాకపోతే 'Resend OTP' నొక్కండి. Signal లేకపోతే chat లో Dispatch Desk ని సంప్రదించండి, వారు verify చేస్తారు.",
            "kn": "🔑 Customer ಗೆ ಅವರ booking ನಲ್ಲಿ 4 ಅಂಕಿಯ Start OTP ಕಾಣುತ್ತದೆ, SMS ಕೂಡ ಬರುತ್ತದೆ. Pickup ನಲ್ಲಿ ಭೇಟಿಯಾದಾಗ ಕೇಳಿ Duty → Start Ride ನಲ್ಲಿ ನೀಡಿ. Destination ನಲ್ಲಿ customer End OTP ನೀಡುತ್ತಾರೆ. ಬರದಿದ್ದರೆ 'Resend OTP' ಒತ್ತಿ. Signal ಇಲ್ಲದಿದ್ದರೆ chat ನಲ್ಲಿ Dispatch Desk ಅನ್ನು ಸಂಪರ್ಕಿಸಿ, ಅವರು verify ಮಾಡುತ್ತಾರೆ."},
    },
    "cancel_penalty": {
        "title": {"en": "Cancellation - is there a penalty?", "ta": "Cancel செய்தால் அபராதம் உண்டா?", "hi": "Cancel करने पर जुर्माना है?", "te": "Cancel చేస్తే జరిమానా ఉందా?", "kn": "Cancel ಮಾಡಿದರೆ ದಂಡ ಇದೆಯೇ?"},
        "kw": ["cancel", "cancellation", "cancelled", "cancel penalty", "fine", "no show", "booking cancel", "cancel panna", "cancel pannina", "ரத்து", "கேன்சல்", "அபராதம்", "रद्द", "कैंसिल", "जुर्माना", "రద్దు", "క్యాన్సిల్", "జరిమానా", "ರದ್ದು", "ಕ್ಯಾನ್ಸಲ್", "ದಂಡ"],
        "a": {
            "en": "⚠️ If YOU cancel after accepting, a cancellation penalty is taken from your hold - more if it is close to pickup time or after the trip started. If the customer or Drop Cars cancels, the full hold comes back and there is no penalty. Before cancelling, chat with the Dispatch Desk: if there is a genuine problem (vehicle breakdown, customer unreachable) they can help without a penalty.",
            "ta": "⚠️ Accept செய்த பிறகு நீங்களே cancel செய்தால் உங்கள் hold-ல் இருந்து cancellation அபராதம் எடுக்கப்படும் - pickup நேரம் நெருங்கினால் அல்லது trip தொடங்கிய பிறகு அதிகம். Customer / Drop Cars cancel செய்தால் முழு hold திரும்பும், அபராதம் இல்லை. Cancel செய்வதற்கு முன் Dispatch Desk-உடன் chat செய்யுங்கள்: உண்மையான பிரச்சனை (வண்டி பழுது, customer தொடர்பில் இல்லை) என்றால் அபராதம் இல்லாமல் உதவுவார்கள்.",
            "hi": "⚠️ Accept के बाद आप खुद cancel करें तो आपके hold से cancellation जुर्माना कटता है - pickup समय के पास या trip शुरू होने के बाद ज़्यादा। Customer / Drop Cars cancel करे तो पूरा hold लौटता है, कोई जुर्माना नहीं। Cancel से पहले Dispatch Desk से chat करें: असली समस्या (गाड़ी खराब, customer नहीं मिल रहा) हो तो बिना जुर्माने मदद करेंगे।",
            "te": "⚠️ Accept చేసిన తర్వాత మీరే cancel చేస్తే మీ hold నుండి cancellation జరిమానా తీస్తారు - pickup సమయం దగ్గరైతే లేదా trip మొదలైన తర్వాత ఎక్కువ. Customer / Drop Cars cancel చేస్తే మొత్తం hold తిరిగి వస్తుంది, జరిమానా లేదు. Cancel చేసే ముందు Dispatch Desk తో chat చేయండి: నిజమైన సమస్య (వాహనం చెడిపోవడం, customer దొరకకపోవడం) అయితే జరిమానా లేకుండా సహాయం చేస్తారు.",
            "kn": "⚠️ Accept ಮಾಡಿದ ನಂತರ ನೀವೇ cancel ಮಾಡಿದರೆ ನಿಮ್ಮ hold ನಿಂದ cancellation ದಂಡ ಕಡಿತವಾಗುತ್ತದೆ - pickup ಸಮಯ ಹತ್ತಿರವಾದರೆ ಅಥವಾ trip ಶುರುವಾದ ನಂತರ ಹೆಚ್ಚು. Customer / Drop Cars cancel ಮಾಡಿದರೆ ಪೂರ್ಣ hold ಮರಳುತ್ತದೆ, ದಂಡ ಇಲ್ಲ. Cancel ಮಾಡುವ ಮೊದಲು Dispatch Desk ಜೊತೆ chat ಮಾಡಿ: ನಿಜವಾದ ಸಮಸ್ಯೆ (ವಾಹನ ಕೆಟ್ಟಿದೆ, customer ಸಿಗುತ್ತಿಲ್ಲ) ಆದರೆ ದಂಡವಿಲ್ಲದೆ ಸಹಾಯ ಮಾಡುತ್ತಾರೆ."},
    },
    "documents": {
        "title": {"en": "Documents - upload, verify, expiry", "ta": "Documents - upload, verify, expiry", "hi": "Documents - upload, verify, expiry", "te": "Documents - upload, verify, expiry", "kn": "Documents - upload, verify, expiry"},
        "kw": ["document", "documents", "licence", "license", "rc", "insurance", "permit", "fc", "aadhaar", "aadhar", "pan", "police", "expiry", "expired", "verify", "verification", "verified", "not verified", "rejected", "invalid", "upload", "ஆவணம்", "லைசென்ஸ்", "இன்சூரன்ஸ்", "दस्तावेज़", "लाइसेंस", "बीमा", "డాక్యుమెంట్", "లైసెన్స్", "ಡಾಕ್ಯುಮೆಂಟ್", "ಲೈಸೆನ್ಸ್"],
        "a": {
            "en": "📄 Open My Cars / My Drivers and tap a document to upload or renew it.\n• A car or driver works as long as every document is valid - 'Not verified yet' does NOT block you. 'Verified' is a badge checked by Drop Cars.\n• A document STOPS working ON its expiry date (not the day after): renew it a few days early - the app reminds you 15 days before.\n• 'Invalid' = wrong or unclear photo: the reason is shown; upload the ORIGINAL again, flat, in good light, whole document visible.\n• Typed date must match the date printed on the document.",
            "ta": "📄 My Cars / My Drivers திறந்து document-ஐத் தட்டி upload / renew செய்யுங்கள்.\n• எல்லா documents-உம் செல்லுபடியாகும் வரை car / driver வேலை செய்யும் - 'Not verified yet' தடை அல்ல. 'Verified' என்பது Drop Cars சரிபார்த்த badge.\n• Document காலாவதி தேதியிலேயே (அடுத்த நாள் அல்ல) நிற்கும்: சில நாட்கள் முன்பே renew செய்யுங்கள் - app 15 நாள் முன்பு நினைவூட்டும்.\n• 'Invalid' = தவறான / தெளிவில்லாத படம்: காரணம் காட்டப்படும்; ORIGINAL-ஐ தட்டையாக, நல்ல வெளிச்சத்தில், முழு document தெரியும்படி மீண்டும் upload செய்யுங்கள்.\n• நீங்கள் உள்ளிட்ட தேதி document-ல் உள்ள தேதியோடு பொருந்த வேண்டும்.",
            "hi": "📄 My Cars / My Drivers खोलकर document पर दबाएँ और upload / renew करें।\n• जब तक सारे documents वैध हैं car / driver काम करता है - 'Not verified yet' रोक नहीं है। 'Verified' Drop Cars की जाँच का badge है।\n• Document expiry की तारीख पर ही बंद हो जाता है (अगले दिन नहीं): कुछ दिन पहले renew करें - app 15 दिन पहले याद दिलाता है।\n• 'Invalid' = गलत / अस्पष्ट फोटो: कारण दिखता है; ORIGINAL को सीधा रखकर, अच्छी रोशनी में, पूरा document दिखे ऐसे फिर upload करें।\n• आपकी डाली तारीख document पर छपी तारीख से मिलनी चाहिए।",
            "te": "📄 My Cars / My Drivers తెరిచి document పై నొక్కి upload / renew చేయండి.\n• అన్ని documents చెల్లుబాటులో ఉన్నంతవరకు car / driver పని చేస్తుంది - 'Not verified yet' అడ్డు కాదు. 'Verified' అనేది Drop Cars తనిఖీ చేసిన badge.\n• Document గడువు తేదీ రోజే ఆగిపోతుంది (మరుసటి రోజు కాదు): కొన్ని రోజులు ముందే renew చేయండి - app 15 రోజుల ముందు గుర్తు చేస్తుంది.\n• 'Invalid' = తప్పు / స్పష్టంగా లేని ఫోటో: కారణం కనిపిస్తుంది; ORIGINAL ని నేరుగా, మంచి వెలుతురులో, మొత్తం document కనిపించేలా మళ్ళీ upload చేయండి.\n• మీరు టైప్ చేసిన తేదీ document పై ఉన్న తేదీతో సరిపోవాలి.",
            "kn": "📄 My Cars / My Drivers ತೆರೆದು document ಮೇಲೆ ಒತ್ತಿ upload / renew ಮಾಡಿ.\n• ಎಲ್ಲಾ documents ಮಾನ್ಯವಾಗಿರುವವರೆಗೂ car / driver ಕೆಲಸ ಮಾಡುತ್ತದೆ - 'Not verified yet' ತಡೆ ಅಲ್ಲ. 'Verified' ಎಂಬುದು Drop Cars ಪರಿಶೀಲಿಸಿದ badge.\n• Document ಅವಧಿ ಮುಗಿಯುವ ದಿನದಂದೇ ನಿಲ್ಲುತ್ತದೆ (ಮರುದಿನ ಅಲ್ಲ): ಕೆಲವು ದಿನ ಮೊದಲೇ renew ಮಾಡಿ - app 15 ದಿನ ಮೊದಲು ನೆನಪಿಸುತ್ತದೆ.\n• 'Invalid' = ತಪ್ಪು / ಅಸ್ಪಷ್ಟ ಫೋಟೋ: ಕಾರಣ ಕಾಣುತ್ತದೆ; ORIGINAL ಅನ್ನು ಸಮತಟ್ಟಾಗಿ, ಉತ್ತಮ ಬೆಳಕಿನಲ್ಲಿ, ಪೂರ್ಣ document ಕಾಣುವಂತೆ ಮತ್ತೆ upload ಮಾಡಿ.\n• ನೀವು ಟೈಪ್ ಮಾಡಿದ ದಿನಾಂಕ document ನಲ್ಲಿರುವ ದಿನಾಂಕಕ್ಕೆ ಹೊಂದಬೇಕು."},
    },
    "add_remove_car_driver": {
        "title": {"en": "Add / remove a car or driver", "ta": "Car / driver சேர்ப்பது, நீக்குவது", "hi": "Car / driver जोड़ना और हटाना", "te": "Car / driver జోడించడం, తొలగించడం", "kn": "Car / driver ಸೇರಿಸುವುದು, ತೆಗೆಯುವುದು"},
        "kw": ["add car", "add driver", "remove car", "remove driver", "delete car", "delete driver", "swap", "transfer driver", "car add panna", "driver add panna", "car remove", "driver remove", "car list la illa", "added but not showing", "கார் சேர்", "டிரைவர் சேர்", "நீக்க", "कार जोड़", "ड्राइवर जोड़", "हटाना", "కారు జోడ", "డ్రైవర్ జోడ", "తొలగ", "ಕಾರು ಸೇರಿಸ", "ಡ್ರೈವರ್ ಸೇರಿಸ", "ತೆಗೆ"],
        "a": {
            "en": "🚗 Add: Menu → My Cars (or My Drivers) → Add. The new car / driver appears in the list when you come back (pull down to refresh if not).\n• Remove: open My Cars / My Drivers → 'Remove this car / driver' - no approval needed. Drop Cars keeps the record and old bookings still show it. A car or driver on an unfinished booking cannot be removed.\n• A car or driver belongs to ONE account only. To move a driver to another fleet use the OTP swap (the driver's own OTP is needed).",
            "ta": "🚗 சேர்க்க: Menu → My Cars (அல்லது My Drivers) → Add. திரும்பி வந்ததும் புதிய car / driver list-ல் தெரியும் (தெரியாவிட்டால் கீழே இழுத்து refresh செய்யுங்கள்).\n• நீக்க: My Cars / My Drivers → 'Remove this car / driver' - அனுமதி தேவையில்லை. Drop Cars பதிவை வைத்திருக்கும், பழைய bookings-லும் தெரியும். முடியாத booking-ல் உள்ள car / driver-ஐ நீக்க முடியாது.\n• ஒரு car / driver ஒரே ஒரு account-ல் மட்டுமே இருக்க முடியும். Driver-ஐ வேறு fleet-க்கு மாற்ற OTP swap பயன்படுத்துங்கள் (driver-ன் சொந்த OTP தேவை).",
            "hi": "🚗 जोड़ना: Menu → My Cars (या My Drivers) → Add। लौटने पर नई car / driver list में दिखती है (न दिखे तो नीचे खींचकर refresh करें)।\n• हटाना: My Cars / My Drivers → 'Remove this car / driver' - अनुमति नहीं चाहिए। Drop Cars record रखता है, पुरानी bookings में भी दिखता है। अधूरी booking वाली car / driver नहीं हटती।\n• एक car / driver सिर्फ एक account में रह सकता है। Driver को दूसरे fleet में ले जाने के लिए OTP swap करें (driver का अपना OTP चाहिए)।",
            "te": "🚗 జోడించడం: Menu → My Cars (లేదా My Drivers) → Add. తిరిగి వచ్చాక కొత్త car / driver list లో కనిపిస్తుంది (కనిపించకపోతే కిందికి లాగి refresh చేయండి).\n• తొలగించడం: My Cars / My Drivers → 'Remove this car / driver' - అనుమతి అవసరం లేదు. Drop Cars రికార్డు ఉంచుతుంది, పాత bookings లో కూడా కనిపిస్తుంది. పూర్తికాని booking లో ఉన్న car / driver ని తొలగించలేరు.\n• ఒక car / driver ఒకే account లో ఉండగలరు. Driver ని మరో fleet కి మార్చడానికి OTP swap వాడండి (driver యొక్క సొంత OTP కావాలి).",
            "kn": "🚗 ಸೇರಿಸಲು: Menu → My Cars (ಅಥವಾ My Drivers) → Add. ಹಿಂತಿರುಗಿದಾಗ ಹೊಸ car / driver list ನಲ್ಲಿ ಕಾಣುತ್ತದೆ (ಕಾಣದಿದ್ದರೆ ಕೆಳಗೆ ಎಳೆದು refresh ಮಾಡಿ).\n• ತೆಗೆಯಲು: My Cars / My Drivers → 'Remove this car / driver' - ಅನುಮತಿ ಬೇಕಿಲ್ಲ. Drop Cars ದಾಖಲೆ ಇಟ್ಟುಕೊಳ್ಳುತ್ತದೆ, ಹಳೆಯ bookings ನಲ್ಲೂ ಕಾಣುತ್ತದೆ. ಮುಗಿಯದ booking ನಲ್ಲಿರುವ car / driver ಅನ್ನು ತೆಗೆಯಲಾಗದು.\n• ಒಂದು car / driver ಒಂದೇ account ನಲ್ಲಿ ಇರಬಹುದು. Driver ಅನ್ನು ಬೇರೆ fleet ಗೆ ಸರಿಸಲು OTP swap ಬಳಸಿ (driver ನ ಸ್ವಂತ OTP ಬೇಕು)."},
    },
    "trusted_plan": {
        "title": {"en": "Trusted Partner plan - benefits and how to buy", "ta": "Trusted Partner plan - பலன்கள், எப்படி வாங்குவது", "hi": "Trusted Partner plan - फायदे और कैसे लें", "te": "Trusted Partner plan - ప్రయోజనాలు, ఎలా కొనాలి", "kn": "Trusted Partner plan - ಪ್ರಯೋಜನ, ಹೇಗೆ ಖರೀದಿಸುವುದು"},
        "kw": ["trusted", "trusted partner", "subscription", "plan", "monthly plan", "yearly plan", "premium", "upgrade", "preferred", "trusted only", "plan vaanga", "subscription epdi", "நம்பகமான", "சந்தா", "ப்ளான்", "ट्रस्टेड", "सब्सक्रिप्शन", "ప్లాన్", "ట్రస్టెడ్", "ಪ್ಲಾನ್", "ಟ್ರಸ್ಟೆಡ್"],
        "a": {
            "en": "⭐ Trusted Partners get first access to some bookings (the 'Trusted Partners Only' ones) and priority visibility. Plans: Monthly ₹{monthly}, Yearly ₹{yearly}.\nHow: Menu → Subscription → pick a plan → pay (it is bought from your wallet; if the balance is short the app takes you to Add Money and then buys it).\nPaid but still 'Standard'? Chat 'paid but not added' for the steps.",
            "ta": "⭐ Trusted Partners-க்கு சில booking-கள் ('Trusted Partners Only') முதலில் கிடைக்கும், priority visibility உண்டு. Plans: Monthly ₹{monthly}, Yearly ₹{yearly}.\nஎப்படி: Menu → Subscription → plan தேர்ந்தெடுங்கள் → செலுத்துங்கள் (wallet-ல் இருந்து வாங்கப்படும்; balance குறைவாக இருந்தால் app Add Money-க்கு அழைத்துச் சென்று பிறகு வாங்கும்).\nசெலுத்தியும் 'Standard' ஆகவே இருக்கிறதா? 'paid but not added' என்று chat-ல் கேளுங்கள்.",
            "hi": "⭐ Trusted Partners को कुछ bookings ('Trusted Partners Only') पहले मिलती हैं और priority visibility। Plans: Monthly ₹{monthly}, Yearly ₹{yearly}।\nकैसे: Menu → Subscription → plan चुनें → भुगतान करें (wallet से खरीदा जाता है; balance कम हो तो app Add Money पर ले जाकर फिर खरीदता है)।\nभुगतान के बाद भी 'Standard' है? chat में 'paid but not added' लिखें।",
            "te": "⭐ Trusted Partners కి కొన్ని bookings ('Trusted Partners Only') ముందుగా దొరుకుతాయి, priority visibility ఉంటుంది. Plans: Monthly ₹{monthly}, Yearly ₹{yearly}.\nఎలా: Menu → Subscription → plan ఎంచుకోండి → చెల్లించండి (wallet నుండి కొంటారు; balance తక్కువైతే app Add Money కి తీసుకెళ్ళి తర్వాత కొంటుంది).\nచెల్లించినా 'Standard' గానే ఉందా? chat లో 'paid but not added' అని అడగండి.",
            "kn": "⭐ Trusted Partners ಗೆ ಕೆಲವು bookings ('Trusted Partners Only') ಮೊದಲು ಸಿಗುತ್ತವೆ, priority visibility ಇರುತ್ತದೆ. Plans: Monthly ₹{monthly}, Yearly ₹{yearly}.\nಹೇಗೆ: Menu → Subscription → plan ಆರಿಸಿ → ಪಾವತಿಸಿ (wallet ನಿಂದ ಖರೀದಿಯಾಗುತ್ತದೆ; balance ಕಡಿಮೆ ಇದ್ದರೆ app Add Money ಗೆ ಕರೆದೊಯ್ದು ನಂತರ ಖರೀದಿಸುತ್ತದೆ).\nಪಾವತಿಸಿದರೂ 'Standard' ಆಗಿಯೇ ಇದೆಯೇ? chat ನಲ್ಲಿ 'paid but not added' ಎಂದು ಕೇಳಿ."},
    },
    "toll_parking": {
        "title": {"en": "Toll, parking, waiting - who pays?", "ta": "Toll, parking, waiting - யார் செலுத்துவது?", "hi": "Toll, parking, waiting - कौन देता है?", "te": "Toll, parking, waiting - ఎవరు చెల్లిస్తారు?", "kn": "Toll, parking, waiting - ಯಾರು ಪಾವತಿಸುವರು?"},
        "kw": ["toll", "fastag", "parking", "waiting", "waiting charge", "night charge", "extra km", "permit", "border tax", "state tax", "toll evlo", "parking evlo", "டோல்", "பார்க்கிங்", "வெயிட்டிங்", "टोल", "पार्किंग", "वेटिंग", "టోల్", "పార్కింగ్", "ವೇಟಿಂಗ್", "ಟೋಲ್"],
        "a": {
            "en": "🅿️ Toll, parking and state permit / border tax are EXTRA - the customer pays them on actuals (unless the booking card says 'included'). Keep the receipts, and at the end of the trip enter the toll / parking amount and any extra km in the app before the End OTP. Waiting time and night charges are added by the rules shown on the booking.",
            "ta": "🅿️ Toll, parking, state permit / border tax எல்லாம் EXTRA - booking card-ல் 'included' என்று இல்லையென்றால் customer actual-படி செலுத்துவார். Receipts-ஐ வைத்துக்கொள்ளுங்கள்; trip முடிவில் End OTP-க்கு முன் toll / parking தொகையையும் extra km-ஐயும் app-ல் உள்ளிடுங்கள். Waiting மற்றும் night கட்டணம் booking-ல் காட்டப்படும் விதிப்படி சேரும்.",
            "hi": "🅿️ Toll, parking और state permit / border tax EXTRA हैं - booking card पर 'included' न लिखा हो तो customer actual के हिसाब से देता है। रसीदें रखें, trip के अंत में End OTP से पहले toll / parking की रकम और extra km app में भरें। Waiting और night charge booking में दिखे नियम से जुड़ते हैं।",
            "te": "🅿️ Toll, parking మరియు state permit / border tax EXTRA - booking card లో 'included' అని లేకపోతే customer actual ప్రకారం చెల్లిస్తారు. రసీదులు ఉంచండి, trip చివర End OTP కి ముందు toll / parking మొత్తం, extra km app లో నమోదు చేయండి. Waiting మరియు night charges booking లో చూపిన నియమం ప్రకారం కలుస్తాయి.",
            "kn": "🅿️ Toll, parking ಮತ್ತು state permit / border tax EXTRA - booking card ನಲ್ಲಿ 'included' ಎಂದಿಲ್ಲದಿದ್ದರೆ customer actual ಪ್ರಕಾರ ಪಾವತಿಸುತ್ತಾರೆ. ರಸೀದಿ ಇಟ್ಟುಕೊಳ್ಳಿ, trip ಕೊನೆಯಲ್ಲಿ End OTP ಗೆ ಮೊದಲು toll / parking ಮೊತ್ತ, extra km app ನಲ್ಲಿ ತುಂಬಿ. Waiting ಮತ್ತು night ಶುಲ್ಕ booking ನಲ್ಲಿ ತೋರಿಸಿದ ನಿಯಮದಂತೆ ಸೇರುತ್ತದೆ."},
    },
    "local_drop": {
        "title": {"en": "What is a Local Drop booking?", "ta": "Local Drop booking என்றால் என்ன?", "hi": "Local Drop booking क्या है?", "te": "Local Drop booking అంటే ఏమిటి?", "kn": "Local Drop booking ಎಂದರೇನು?"},
        "kw": ["local", "local drop", "airport drop", "short trip", "city drop", "local booking", "லோக்கல்", "लोकल", "లోకల్", "ಲೋಕಲ್"],
        "a": {
            "en": "📍 Local Drop = a short trip inside a city or nearby (for example Jafferkhanpet → Chennai Airport, Chennai → Mahabalipuram). It is paid per km with your allowance already included, up to the km limit shown on the card; km beyond the limit are charged at the extra-km rate on the card. Toll and parking are extra. Commission for Local Drop is shown on the card ('You earn').",
            "ta": "📍 Local Drop = நகருக்குள் அல்லது அருகில் உள்ள குறுகிய trip (உதா: Jafferkhanpet → Chennai Airport, Chennai → Mahabalipuram). Km-க்கு கட்டணம், உங்கள் allowance ஏற்கெனவே சேர்ந்தது; card-ல் உள்ள km limit வரை. Limit-க்கு மேல் ஓடிய km-க்கு card-ல் உள்ள extra-km rate. Toll, parking extra. Local Drop commission card-ல் ('You earn') தெரியும்.",
            "hi": "📍 Local Drop = शहर के अंदर या पास की छोटी trip (जैसे Jafferkhanpet → Chennai Airport, Chennai → Mahabalipuram)। भुगतान per km, आपका allowance उसमें शामिल; card पर दी km limit तक। Limit से ऊपर की km का card पर दिया extra-km rate। Toll और parking अलग। Commission card पर ('You earn') दिखता है।",
            "te": "📍 Local Drop = నగరం లోపల లేదా దగ్గరి చిన్న trip (ఉదా: Jafferkhanpet → Chennai Airport, Chennai → Mahabalipuram). Km కి చెల్లింపు, మీ allowance ఇప్పటికే చేరింది; card లోని km limit వరకు. Limit దాటిన km కి card లోని extra-km rate. Toll, parking అదనం. Commission card లో ('You earn') కనిపిస్తుంది.",
            "kn": "📍 Local Drop = ನಗರದೊಳಗಿನ ಅಥವಾ ಹತ್ತಿರದ ಸಣ್ಣ trip (ಉದಾ: Jafferkhanpet → Chennai Airport, Chennai → Mahabalipuram). Km ಗೆ ಪಾವತಿ, ನಿಮ್ಮ allowance ಈಗಾಗಲೇ ಸೇರಿದೆ; card ನ km limit ವರೆಗೆ. Limit ಮೀರಿದ km ಗೆ card ನ extra-km rate. Toll, parking ಹೆಚ್ಚುವರಿ. Commission card ನಲ್ಲಿ ('You earn') ಕಾಣುತ್ತದೆ."},
    },
    "duty_notifications": {
        "title": {"en": "Not getting booking alerts / sound", "ta": "Booking alert / ஒலி வரவில்லை", "hi": "Booking alert / आवाज़ नहीं आ रही", "te": "Booking alerts / శబ్దం రావడం లేదు", "kn": "Booking alert / ಶಬ್ದ ಬರುತ್ತಿಲ್ಲ"},
        "kw": ["notification", "alert", "sound", "ringing", "not ringing", "no booking", "booking varala", "alert varala", "duty", "online", "offline", "battery", "background", "overlay", "நோட்டிபிகேஷன்", "ஒலி", "அலாரம்", "नोटिफिकेशन", "आवाज़", "అలర్ట్", "నోటిఫికేషన్", "ಅಲರ್ಟ್", "ನೋಟಿಫಿಕೇಶನ್"],
        "a": {
            "en": "🔔 If booking alerts do not come:\n1. Settings → Notifications: ON, and pick your cities (a booking for a city you did not pick is not sent to you).\n2. Phone Settings → Apps → Drop Cars Driver → Battery: 'Unrestricted' / no battery saving, and allow 'Display over other apps'.\n3. Keep the phone's sound ON and Do-Not-Disturb OFF.\n4. Duty tab: switch Duty ON when you want bookings.\nStill silent? Chat with Support - tell the phone model.",
            "ta": "🔔 Booking alert வராவிட்டால்:\n1. Settings → Notifications: ON, உங்கள் cities தேர்ந்தெடுங்கள் (தேர்ந்தெடுக்காத city-க்கு booking அனுப்பப்படாது).\n2. Phone Settings → Apps → Drop Cars Driver → Battery: 'Unrestricted' / battery saving வேண்டாம்; 'Display over other apps' அனுமதியுங்கள்.\n3. Phone sound ON, Do-Not-Disturb OFF.\n4. Duty tab: booking வேண்டும்போது Duty ON செய்யுங்கள்.\nஅப்படியும் சத்தம் இல்லையா? Support-உடன் chat செய்து phone model சொல்லுங்கள்.",
            "hi": "🔔 Booking alert न आए तो:\n1. Settings → Notifications: ON, और अपने cities चुनें (जो city नहीं चुनी उसकी booking नहीं आती)।\n2. Phone Settings → Apps → Drop Cars Driver → Battery: 'Unrestricted' / battery saving बंद, और 'Display over other apps' की अनुमति दें।\n3. Phone की आवाज़ ON, Do-Not-Disturb OFF।\n4. Duty tab: bookings चाहिए तो Duty ON करें।\nफिर भी आवाज़ नहीं? Support से chat करें, phone model बताएँ।",
            "te": "🔔 Booking alerts రాకపోతే:\n1. Settings → Notifications: ON, మీ cities ఎంచుకోండి (ఎంచుకోని city booking పంపరు).\n2. Phone Settings → Apps → Drop Cars Driver → Battery: 'Unrestricted' / battery saving వద్దు, 'Display over other apps' అనుమతించండి.\n3. Phone sound ON, Do-Not-Disturb OFF.\n4. Duty tab: bookings కావాలంటే Duty ON చేయండి.\nఇంకా శబ్దం లేదా? Support తో chat చేసి phone model చెప్పండి.",
            "kn": "🔔 Booking alert ಬರದಿದ್ದರೆ:\n1. Settings → Notifications: ON, ಮತ್ತು ನಿಮ್ಮ cities ಆರಿಸಿ (ಆರಿಸದ city ಯ booking ಕಳುಹಿಸುವುದಿಲ್ಲ).\n2. Phone Settings → Apps → Drop Cars Driver → Battery: 'Unrestricted' / battery saving ಬೇಡ, 'Display over other apps' ಅನುಮತಿಸಿ.\n3. Phone sound ON, Do-Not-Disturb OFF.\n4. Duty tab: bookings ಬೇಕಾದರೆ Duty ON ಮಾಡಿ.\nಇನ್ನೂ ಶಬ್ದವಿಲ್ಲವೇ? Support ಜೊತೆ chat ಮಾಡಿ, phone model ಹೇಳಿ."},
    },
    "rating_inactive": {
        "title": {"en": "My account / car is Inactive - why?", "ta": "என் account / car Inactive - ஏன்?", "hi": "मेरा account / car Inactive क्यों?", "te": "నా account / car Inactive - ఎందుకు?", "kn": "ನನ್ನ account / car Inactive - ಏಕೆ?"},
        "kw": ["inactive", "blocked", "suspended", "account blocked", "cannot accept", "can't accept", "not able to accept", "rating low", "low rating", "account off", "block aagiduchu", "inactive aagiduchu", "செயலற்ற", "ப்ளாக்", "निष्क्रिय", "ब्लॉक", "ఇన్‌యాక్టివ్", "బ్లాక్", "ಇನ್‌ಆಕ್ಟಿವ್", "ಬ್ಲಾಕ್"],
        "a": {
            "en": "🚫 A car or driver is Inactive when: a document has reached its expiry date, a document was marked Invalid, Drop Cars switched it off (the reason, who and when are shown), or the customer rating is below the limit. Open My Cars / My Drivers - the red 'INACTIVE' tag lists the exact reasons and what to do. Fix the document (or contact Support for the others) and it turns Active again.",
            "ta": "🚫 Car / driver Inactive ஆவது: document காலாவதி தேதியை அடைந்தால், document Invalid என்று குறிக்கப்பட்டால், Drop Cars off செய்தால் (காரணம், யார், எப்போது காட்டப்படும்), அல்லது customer rating வரம்புக்குக் கீழ் இருந்தால். My Cars / My Drivers திறங்கள் - சிவப்பு 'INACTIVE' tag-ல் சரியான காரணங்களும் செய்ய வேண்டியதும் இருக்கும். Document-ஐ சரிசெய்தால் (மற்றவைக்கு Support) மீண்டும் Active ஆகும்.",
            "hi": "🚫 Car / driver Inactive तब होता है जब: document की expiry तारीख आ गई, document Invalid चिह्नित हुआ, Drop Cars ने बंद किया (कारण, किसने, कब दिखता है), या customer rating सीमा से नीचे है। My Cars / My Drivers खोलें - लाल 'INACTIVE' tag में सही कारण और क्या करना है लिखा होता है। Document ठीक करें (बाकी के लिए Support) तो फिर Active हो जाता है।",
            "te": "🚫 Car / driver Inactive అయ్యేది: document గడువు తేదీ వచ్చినప్పుడు, document Invalid గా గుర్తించినప్పుడు, Drop Cars ఆపినప్పుడు (కారణం, ఎవరు, ఎప్పుడు కనిపిస్తాయి), లేదా customer rating పరిమితి కంటే తక్కువైనప్పుడు. My Cars / My Drivers తెరవండి - ఎరుపు 'INACTIVE' tag లో ఖచ్చితమైన కారణాలు, చేయాల్సినది ఉంటాయి. Document సరిచేస్తే (మిగతావాటికి Support) మళ్ళీ Active అవుతుంది.",
            "kn": "🚫 Car / driver Inactive ಆಗುವುದು: document ಅವಧಿ ದಿನಾಂಕ ತಲುಪಿದಾಗ, document Invalid ಎಂದು ಗುರುತಿಸಿದಾಗ, Drop Cars ಆಫ್ ಮಾಡಿದಾಗ (ಕಾರಣ, ಯಾರು, ಯಾವಾಗ ಕಾಣುತ್ತದೆ), ಅಥವಾ customer rating ಮಿತಿಗಿಂತ ಕಡಿಮೆ ಇದ್ದಾಗ. My Cars / My Drivers ತೆರೆಯಿರಿ - ಕೆಂಪು 'INACTIVE' tag ನಲ್ಲಿ ನಿಖರ ಕಾರಣ ಮತ್ತು ಮಾಡಬೇಕಾದದ್ದು ಇರುತ್ತದೆ. Document ಸರಿಪಡಿಸಿದರೆ (ಉಳಿದವಕ್ಕೆ Support) ಮತ್ತೆ Active ಆಗುತ್ತದೆ."},
    },
    "language": {
        "title": {"en": "Change the app language", "ta": "App மொழியை மாற்ற", "hi": "App की भाषा बदलें", "te": "App భాష మార్చండి", "kn": "App ಭಾಷೆ ಬದಲಿಸಿ"},
        "kw": ["language", "change language", "tamil", "english", "hindi", "telugu", "kannada", "mozhi", "mozhi maatha", "மொழி", "भाषा", "భాష", "ಭಾಷೆ"],
        "a": {
            "en": "🌐 Menu / Settings → Language → choose English, தமிழ், हिन्दी, తెలుగు or ಕನ್ನಡ. The whole app and this help chat switch to it.",
            "ta": "🌐 Menu / Settings → Language → English, தமிழ், हिन्दी, తెలుగు அல்லது ಕನ್ನಡ தேர்ந்தெடுங்கள். முழு app-உம் இந்த help chat-உம் மாறும்.",
            "hi": "🌐 Menu / Settings → Language → English, தமிழ், हिन्दी, తెలుగు या ಕನ್ನಡ चुनें। पूरा app और यह help chat उसी भाषा में बदल जाते हैं।",
            "te": "🌐 Menu / Settings → Language → English, தமிழ், हिन्दी, తెలుగు లేదా ಕನ್ನಡ ఎంచుకోండి. మొత్తం app మరియు ఈ help chat మారుతాయి.",
            "kn": "🌐 Menu / Settings → Language → English, தமிழ், हिन्दी, తెలుగు ಅಥವಾ ಕನ್ನಡ ಆರಿಸಿ. ಇಡೀ app ಮತ್ತು ಈ help chat ಬದಲಾಗುತ್ತದೆ."},
    },
    "support": {
        "title": {"en": "Talk to a person", "ta": "ஒருவரிடம் பேச", "hi": "किसी व्यक्ति से बात करें", "te": "ఒక వ్యక్తితో మాట్లాడండి", "kn": "ಒಬ್ಬ ವ್ಯಕ್ತಿಯೊಂದಿಗೆ ಮಾತನಾಡಿ"},
        "kw": ["support", "help", "contact", "call", "phone number", "helpline", "customer care", "talk to", "speak", "agent", "human", "complaint", "problem", "issue", "udhavi", "help venum", "kooptu", "ஆதரவு", "உதவி", "புகார்", "सहायता", "मदद", "शिकायत", "సహాయం", "ఫిర్యాదు", "ಸಹಾಯ", "ದೂರು"],
        "a": {
            "en": "🎧 Open the Chat tab → 'Talk to a person now' to reach the Dispatch / Support desk; they reply in the chat. Helpline: {phone}. For a faster answer, tell them the booking number and what happened.",
            "ta": "🎧 Chat tab → 'Talk to a person now' தட்டினால் Dispatch / Support desk-ஐ அடையலாம்; அவர்கள் chat-லேயே பதில் சொல்வார்கள். Helpline: {phone}. விரைவான பதிலுக்கு booking எண்ணையும் என்ன நடந்தது என்பதையும் சொல்லுங்கள்.",
            "hi": "🎧 Chat tab → 'Talk to a person now' दबाकर Dispatch / Support desk तक पहुँचें; वे chat में ही जवाब देते हैं। Helpline: {phone}। जल्दी जवाब के लिए booking नंबर और क्या हुआ बताएँ।",
            "te": "🎧 Chat tab → 'Talk to a person now' నొక్కి Dispatch / Support desk ని చేరండి; వారు chat లోనే జవాబిస్తారు. Helpline: {phone}. త్వరిత జవాబు కోసం booking నంబర్, ఏమి జరిగిందో చెప్పండి.",
            "kn": "🎧 Chat tab → 'Talk to a person now' ಒತ್ತಿ Dispatch / Support desk ತಲುಪಿ; ಅವರು chat ನಲ್ಲೇ ಉತ್ತರಿಸುತ್ತಾರೆ. Helpline: {phone}. ತ್ವರಿತ ಉತ್ತರಕ್ಕೆ booking ಸಂಖ್ಯೆ ಮತ್ತು ಏನಾಯಿತು ಎಂದು ತಿಳಿಸಿ."},
    },
}

MENU_ORDER = ["wallet_deduction", "wallet_hold", "add_money", "accept_assign", "commission", "documents", "add_remove_car_driver", "trusted_plan", "support"]

_INTRO = {
    "en": "👋 I'm the Drop Cars Help Center. Ask me anything about the app - wallet, bookings, documents, payments - in any language. Tap a topic or type your question:",
    "ta": "👋 நான் Drop Cars Help Center. Wallet, booking, documents, payments என எதைப் பற்றியும் எந்த மொழியிலும் கேளுங்கள். ஒரு தலைப்பைத் தட்டுங்கள் அல்லது கேள்வியை டைப் செய்யுங்கள்:",
    "hi": "👋 मैं Drop Cars Help Center हूँ। Wallet, booking, documents, payments - app के बारे में किसी भी भाषा में पूछें। कोई विषय दबाएँ या सवाल लिखें:",
    "te": "👋 నేను Drop Cars Help Center. Wallet, booking, documents, payments - app గురించి ఏ భాషలోనైనా అడగండి. ఒక అంశం నొక్కండి లేదా ప్రశ్న టైప్ చేయండి:",
    "kn": "👋 ನಾನು Drop Cars Help Center. Wallet, booking, documents, payments - app ಬಗ್ಗೆ ಯಾವುದೇ ಭಾಷೆಯಲ್ಲಿ ಕೇಳಿ. ಒಂದು ವಿಷಯ ಒತ್ತಿ ಅಥವಾ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ:"}
_DID_YOU_MEAN = {
    "en": "🤔 I am not fully sure what you mean. Did you mean one of these? Tap one:",
    "ta": "🤔 நீங்கள் என்ன கேட்கிறீர்கள் என்று எனக்கு முழுமையாகப் புரியவில்லை. இவற்றில் ஒன்றா? ஒன்றைத் தட்டுங்கள்:",
    "hi": "🤔 मुझे पूरी तरह समझ नहीं आया। क्या आपका मतलब इनमें से कोई है? एक दबाएँ:",
    "te": "🤔 మీరు ఏమి అడుగుతున్నారో నాకు పూర్తిగా అర్థం కాలేదు. వీటిలో ఒకటా? ఒకటి నొక్కండి:",
    "kn": "🤔 ನೀವು ಏನು ಕೇಳುತ್ತಿದ್ದೀರಿ ಎಂದು ನನಗೆ ಪೂರ್ಣವಾಗಿ ಅರ್ಥವಾಗಲಿಲ್ಲ. ಇವುಗಳಲ್ಲಿ ಒಂದೇ? ಒಂದನ್ನು ಒತ್ತಿ:"}
_SHOWING = {
    "en": "(Showing help for “{t}” - I fixed the spelling.)", "ta": "(“{t}” பற்றிய உதவி - எழுத்துப்பிழையைச் சரிசெய்து காட்டுகிறேன்.)",
    "hi": "(“{t}” की मदद - वर्तनी ठीक करके दिखा रहा हूँ।)", "te": "(“{t}” గురించి సహాయం - స్పెల్లింగ్ సరిచేసి చూపిస్తున్నాను.)", "kn": "(“{t}” ಬಗ್ಗೆ ಸಹಾಯ - ಕಾಗುಣಿತ ಸರಿಪಡಿಸಿ ತೋರಿಸುತ್ತಿದ್ದೇನೆ.)"}
_NO_LEDGER = {
    "en": "I could not see any wallet entries yet.", "ta": "இன்னும் wallet பதிவுகள் எதுவும் இல்லை.", "hi": "अभी कोई wallet entry नहीं मिली।",
    "te": "ఇంకా wallet నమోదులు ఏవీ లేవు.", "kn": "ಇನ್ನೂ ಯಾವುದೇ wallet ನಮೂದುಗಳು ಇಲ್ಲ."}
_LEDGER_TAIL = {
    "en": "\nIf any line looks wrong, tap 'Talk to a person' and quote the date and amount.", "ta": "\nஏதேனும் ஒரு வரி தவறாகத் தெரிந்தால் 'Talk to a person' தட்டி தேதி, தொகையைச் சொல்லுங்கள்.",
    "hi": "\nकोई पंक्ति गलत लगे तो 'Talk to a person' दबाकर तारीख और रकम बताएँ।", "te": "\nఏదైనా వరుస తప్పుగా అనిపిస్తే 'Talk to a person' నొక్కి తేదీ, మొత్తం చెప్పండి.",
    "kn": "\nಯಾವುದಾದರೂ ಸಾಲು ತಪ್ಪಾಗಿ ಕಂಡರೆ 'Talk to a person' ಒತ್ತಿ ದಿನಾಂಕ, ಮೊತ್ತ ತಿಳಿಸಿ."}

# one plain-words line for each kind of wallet entry (CREDIT = money in, DEBIT = money out)
_LEDGER_WORDS: Dict[str, Dict[str, str]] = {
    "TRIP_HOLD": {"en": "kept on hold when you accepted booking {ref} (not a charge)", "ta": "Booking {ref}-ஐ accept செய்தபோது hold செய்யப்பட்டது (கட்டணம் அல்ல)", "hi": "Booking {ref} accept करने पर hold हुआ (कटौती नहीं)", "te": "Booking {ref} accept చేసినప్పుడు hold అయింది (ఛార్జ్ కాదు)", "kn": "Booking {ref} accept ಮಾಡಿದಾಗ hold ಆಯಿತು (ಶುಲ್ಕ ಅಲ್ಲ)"},
    "TRIP_HOLD_REFUND": {"en": "hold returned for booking {ref}", "ta": "Booking {ref}-ன் hold திரும்பியது", "hi": "Booking {ref} का hold वापस आया", "te": "Booking {ref} hold తిరిగి వచ్చింది", "kn": "Booking {ref} ನ hold ಮರಳಿತು"},
    "TRIP_COMPLETION": {"en": "trip completed - your share of booking {ref}", "ta": "Trip முடிந்தது - booking {ref}-ல் உங்கள் பங்கு", "hi": "Trip पूरी - booking {ref} में आपका हिस्सा", "te": "Trip పూర్తైంది - booking {ref} లో మీ వాటా", "kn": "Trip ಮುಗಿದಿದೆ - booking {ref} ನಲ್ಲಿ ನಿಮ್ಮ ಪಾಲು"},
    "TRIP_SETTLEMENT": {"en": "trip settlement for booking {ref}", "ta": "Booking {ref} trip settlement", "hi": "Booking {ref} का trip settlement", "te": "Booking {ref} trip settlement", "kn": "Booking {ref} trip settlement"},
    "TRIP_SETTLEMENT_BALANCE": {"en": "balance settled after booking {ref}", "ta": "Booking {ref}-க்குப் பிறகு மீதம் settle ஆனது", "hi": "Booking {ref} के बाद बाकी settle हुआ", "te": "Booking {ref} తర్వాత మిగిలినది settle అయింది", "kn": "Booking {ref} ನಂತರ ಉಳಿದದ್ದು settle ಆಯಿತು"},
    "TRIP_CANCEL_PENALTY": {"en": "cancellation penalty for booking {ref}", "ta": "Booking {ref} cancel அபராதம்", "hi": "Booking {ref} cancel जुर्माना", "te": "Booking {ref} cancel జరిమానా", "kn": "Booking {ref} cancel ದಂಡ"},
    "ASSIGNMENT_CANCEL_PENALTY": {"en": "penalty for cancelling the assignment of booking {ref}", "ta": "Booking {ref} assignment cancel அபராதம்", "hi": "Booking {ref} assignment cancel जुर्माना", "te": "Booking {ref} assignment cancel జరిమానా", "kn": "Booking {ref} assignment cancel ದಂಡ"},
    "DRIVING_CANCELLATION_PENALTY": {"en": "penalty for cancelling after the trip started (booking {ref})", "ta": "Trip தொடங்கிய பிறகு cancel அபராதம் (booking {ref})", "hi": "Trip शुरू होने के बाद cancel जुर्माना (booking {ref})", "te": "Trip మొదలైన తర్వాత cancel జరిమానా (booking {ref})", "kn": "Trip ಶುರುವಾದ ನಂತರ cancel ದಂಡ (booking {ref})"},
    "AUTO_CANCELLATION_PENALTY": {"en": "penalty - booking {ref} was auto-cancelled because no driver / car was assigned in time", "ta": "அபராதம் - நேரத்துக்குள் driver / car assign செய்யாததால் booking {ref} தானாக cancel ஆனது", "hi": "जुर्माना - समय पर driver / car assign न होने से booking {ref} अपने आप cancel हुई", "te": "జరిమానా - సమయానికి driver / car assign చేయకపోవడంతో booking {ref} ఆటో-cancel అయింది", "kn": "ದಂಡ - ಸಮಯಕ್ಕೆ driver / car assign ಮಾಡದ ಕಾರಣ booking {ref} ತಾನಾಗಿ cancel ಆಯಿತು"},
    "PENALTY_UNALLOCATION": {"en": "penalty for accepting booking {ref} and not assigning a driver / car in time", "ta": "Booking {ref}-ஐ accept செய்து நேரத்துக்குள் driver / car assign செய்யாத அபராதம்", "hi": "Booking {ref} accept करके समय पर driver / car assign न करने का जुर्माना", "te": "Booking {ref} accept చేసి సమయానికి driver / car assign చేయని జరిమానా", "kn": "Booking {ref} accept ಮಾಡಿ ಸಮಯಕ್ಕೆ driver / car assign ಮಾಡದ ದಂಡ"},
    "LOW_RATING_PENALTY": {"en": "penalty for a low customer rating", "ta": "குறைந்த customer rating அபராதம்", "hi": "कम customer rating का जुर्माना", "te": "తక్కువ customer rating జరిమానా", "kn": "ಕಡಿಮೆ customer rating ದಂಡ"},
    "LOW_RATING_PENALTY_WAIVED": {"en": "low-rating penalty cancelled (returned)", "ta": "குறைந்த rating அபராதம் ரத்து (திரும்பியது)", "hi": "कम rating जुर्माना रद्द (वापस)", "te": "తక్కువ rating జరిమానా రద్దు (తిరిగి)", "kn": "ಕಡಿಮೆ rating ದಂಡ ರದ್ದು (ಮರಳಿತು)"},
    "RAZORPAY_PAYMENT": {"en": "money you added with Razorpay", "ta": "Razorpay மூலம் நீங்கள் சேர்த்த பணம்", "hi": "Razorpay से जोड़ा गया पैसा", "te": "Razorpay ద్వారా మీరు జోడించిన డబ్బు", "kn": "Razorpay ಮೂಲಕ ನೀವು ಸೇರಿಸಿದ ಹಣ"},
    "MANUAL_UPI_PAYMENT": {"en": "money you paid by UPI / bank, confirmed by Drop Cars", "ta": "UPI / bank மூலம் நீங்கள் செலுத்தியது, Drop Cars உறுதி செய்தது", "hi": "UPI / bank से आपका भुगतान, Drop Cars ने पुष्टि की", "te": "UPI / bank ద్వారా మీరు చెల్లించినది, Drop Cars నిర్ధారించింది", "kn": "UPI / bank ಮೂಲಕ ನೀವು ಪಾವತಿಸಿದ್ದು, Drop Cars ದೃಢಪಡಿಸಿತು"},
    "ADMIN_MANUAL_ADJUST": {"en": "adjustment made by Drop Cars staff", "ta": "Drop Cars ஊழியர் செய்த சரிசெய்தல்", "hi": "Drop Cars स्टाफ द्वारा समायोजन", "te": "Drop Cars సిబ్బంది చేసిన సర్దుబాటు", "kn": "Drop Cars ಸಿಬ್ಬಂದಿ ಮಾಡಿದ ಹೊಂದಾಣಿಕೆ"},
    "ADMIN_ADD_MONEY": {"en": "money added by Drop Cars", "ta": "Drop Cars சேர்த்த பணம்", "hi": "Drop Cars द्वारा जोड़ा गया पैसा", "te": "Drop Cars జోడించిన డబ్బు", "kn": "Drop Cars ಸೇರಿಸಿದ ಹಣ"},
    "MONTHLY_SUBSCRIPTION_FEE": {"en": "Trusted Partner monthly plan", "ta": "Trusted Partner மாதாந்திர plan", "hi": "Trusted Partner मासिक plan", "te": "Trusted Partner నెలవారీ plan", "kn": "Trusted Partner ಮಾಸಿಕ plan"},
    "YEARLY_UPGRADE_FEE": {"en": "Trusted Partner yearly plan", "ta": "Trusted Partner ஆண்டு plan", "hi": "Trusted Partner वार्षिक plan", "te": "Trusted Partner వార్షిక plan", "kn": "Trusted Partner ವಾರ್ಷಿಕ plan"},
    "SUBSCRIPTION_FEE_WALLET": {"en": "Trusted Partner plan paid from the wallet", "ta": "Wallet-ல் இருந்து செலுத்திய Trusted Partner plan", "hi": "Wallet से चुकाया Trusted Partner plan", "te": "Wallet నుండి చెల్లించిన Trusted Partner plan", "kn": "Wallet ನಿಂದ ಪಾವತಿಸಿದ Trusted Partner plan"},
    "BILLING_MONTHLY_FEE": {"en": "monthly plan renewed from the wallet", "ta": "மாதாந்திர plan wallet-ல் இருந்து புதுப்பிக்கப்பட்டது", "hi": "मासिक plan wallet से renew हुआ", "te": "నెలవారీ plan wallet నుండి renew అయింది", "kn": "ಮಾಸಿಕ plan wallet ನಿಂದ renew ಆಯಿತು"},
    "BILLING_YEARLY_FEE": {"en": "yearly plan renewed from the wallet", "ta": "ஆண்டு plan wallet-ல் இருந்து புதுப்பிக்கப்பட்டது", "hi": "वार्षिक plan wallet से renew हुआ", "te": "వార్షిక plan wallet నుండి renew అయింది", "kn": "ವಾರ್ಷಿಕ plan wallet ನಿಂದ renew ಆಯಿತು"},
    "REVIEW_BONUS": {"en": "bonus for a good customer review", "ta": "நல்ல customer review bonus", "hi": "अच्छे customer review का bonus", "te": "మంచి customer review bonus", "kn": "ಉತ್ತಮ customer review bonus"},
    "REFERRAL_BONUS": {"en": "referral bonus", "ta": "Referral bonus", "hi": "Referral bonus", "te": "Referral bonus", "kn": "Referral bonus"},
    "CUSTOMER_REFERRAL_BONUS": {"en": "customer referral bonus", "ta": "Customer referral bonus", "hi": "Customer referral bonus", "te": "Customer referral bonus", "kn": "Customer referral bonus"},
    "PAYOUT_PAID": {"en": "withdrawal paid to you", "ta": "உங்களுக்குச் செலுத்தப்பட்ட withdrawal", "hi": "आपको भुगतान किया गया withdrawal", "te": "మీకు చెల్లించిన withdrawal", "kn": "ನಿಮಗೆ ಪಾವತಿಸಿದ withdrawal"},
    "DRIVER_PAYOUT_HOLD": {"en": "amount held for a driver payout", "ta": "Driver payout-க்காக hold செய்த தொகை", "hi": "Driver payout के लिए रोकी रकम", "te": "Driver payout కోసం hold చేసిన మొత్తం", "kn": "Driver payout ಗಾಗಿ hold ಮಾಡಿದ ಮೊತ್ತ"},
    "POSTER_ADVANCE_HOLD": {"en": "advance of a booking you posted, held until the trip ends", "ta": "நீங்கள் post செய்த booking-ன் advance, trip முடியும் வரை hold", "hi": "आपकी post की booking का advance, trip खत्म होने तक hold", "te": "మీరు post చేసిన booking advance, trip ముగిసేవరకు hold", "kn": "ನೀವು post ಮಾಡಿದ booking ನ advance, trip ಮುಗಿಯುವವರೆಗೆ hold"},
    "POSTER_SHARE": {"en": "your share of a booking you posted", "ta": "நீங்கள் post செய்த booking-ல் உங்கள் பங்கு", "hi": "आपकी post की booking में आपका हिस्सा", "te": "మీరు post చేసిన booking లో మీ వాటా", "kn": "ನೀವು post ಮಾಡಿದ booking ನಲ್ಲಿ ನಿಮ್ಮ ಪಾಲು"},
    "ADVANCE_SETTLEMENT": {"en": "advance settled for booking {ref}", "ta": "Booking {ref} advance settle ஆனது", "hi": "Booking {ref} का advance settle", "te": "Booking {ref} advance settle", "kn": "Booking {ref} advance settle"},
}

# --------------------------------------------------------------------------------------------------------------------
_TAMIL = re.compile(r"[஀-௿]")
_DEVA = re.compile(r"[ऀ-ॿ]")
_TELUGU = re.compile(r"[ఀ-౿]")
_KANNADA = re.compile(r"[ಀ-೿]")


def detect_language(text: str, hint: Optional[str] = None) -> str:
    """The language the person typed in (script), else the language chosen in the app, else English."""
    if _TAMIL.search(text or ""):
        return "ta"
    if _DEVA.search(text or ""):
        return "hi"
    if _TELUGU.search(text or ""):
        return "te"
    if _KANNADA.search(text or ""):
        return "kn"
    h = (hint or "").lower()[:2]
    return h if h in LANGS else "en"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\wऀ-෿ ]+", " ", (s or "").lower())).strip()


def _edit(a: str, b: str, cap: int) -> int:
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _tol(n: int) -> int:
    return 0 if n <= 3 else 1 if n <= 6 else 2


def score(message: str, topic: Dict[str, Any]) -> Tuple[float, bool]:
    """(score, used_fuzzy). Whole-keyword hits count most; a keyword whose words are each within a typo of the typed words counts less."""
    msg = _norm(message)
    toks = msg.split(" ")
    total, fuzzy = 0.0, False
    for kw in topic["kw"]:
        k = _norm(kw)
        if not k:
            continue
        if re.search(r"(?<![\w])" + re.escape(k) + r"(?![\w])", msg) or (not k.isascii() and k in msg):
            total += 1.0 + 0.5 * len(k.split(" "))
            continue
        if not k.isascii():
            continue
        words = k.split(" ")
        ok = True
        for w in words:
            if len(w) < 4:
                ok = ok and w in toks
            else:
                ok = ok and any(_edit(w, t, _tol(len(w))) <= _tol(len(w)) for t in toks if len(t) >= 3)
        if ok:
            total += 0.8 + 0.4 * len(words)
            fuzzy = True
    return total, fuzzy


def rank(message: str) -> List[Tuple[str, float, bool]]:
    out = []
    for tid, t in TOPICS.items():
        s, f = score(message, t)
        if s > 0:
            out.append((tid, s, f))
    out.sort(key=lambda x: -x[1])
    return out


# --------------------------------------------------------------------------------------------------------------------
def _live_values(db) -> Dict[str, Any]:
    v: Dict[str, Any] = {"hold": 500, "comm_min": 200, "conv": 30, "pct": 10, "monthly": 199, "yearly": 1000, "phone": "the number shown in Settings"}
    try:
        from app.utils.commission import get_fee_settings
        f = get_fee_settings(db)
        v.update(hold=int(f.get("min_driver_hold", v["hold"])), comm_min=int(f.get("commission_min", v["comm_min"])), conv=int(f.get("convenience_fee", v["conv"])))
    except Exception:  # noqa: BLE001
        pass
    try:
        from app.utils.bot_facts import commission_pct
        v["pct"] = commission_pct(db)
    except Exception:  # noqa: BLE001
        pass
    try:
        from app.crud.billing import get_billing_settings
        b = get_billing_settings(db)
        v.update(monthly=int(b.get("monthly_fee") or v["monthly"]), yearly=int(b.get("yearly_fee") or v["yearly"]))
    except Exception:  # noqa: BLE001
        pass
    try:
        from app.api.routes.ai_whatsapp_assistant import _helpline_number
        v["phone"] = _helpline_number(db) or v["phone"]
    except Exception:  # noqa: BLE001
        pass
    return v


class _Safe(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def _fill(text: str, vals: Dict[str, Any]) -> str:
    return text.format_map(_Safe(vals))


def _ledger_lines(db, owner_id, lang: str, limit: int = 8) -> str:
    """The caller's OWN last wallet entries, one plain line each (+ the live balance)."""
    from app.models.wallet_ledger import WalletEntryTypeEnum, WalletLedger
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    rows = db.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == owner_id).order_by(WalletLedger.created_at.desc()).limit(limit).all()
    if not rows:
        return _NO_LEDGER[lang]
    out = []
    for r in rows:
        et = getattr(r.entry_type, "value", r.entry_type)
        sign = "+" if str(et).upper() == "CREDIT" else "-"
        words = _LEDGER_WORDS.get(str(r.reference_type or ""), {})
        ref = ("#" + str(r.reference_id)) if (r.reference_id and str(r.reference_id).isdigit()) else ""
        why = words.get(lang) or words.get("en") or (r.notes or str(r.reference_type or "wallet entry"))
        why = why.replace("{ref}", ref).replace("  ", " ").strip()
        try:
            from datetime import timedelta
            when = (r.created_at + timedelta(hours=5, minutes=30)).strftime("%d %b, %I:%M %p")
        except Exception:  # noqa: BLE001
            when = ""
        out.append(f"{sign}₹{r.amount}  ·  {when}  ·  {why}")
    try:
        bal = db.query(VehicleOwnerDetails.wallet_balance).filter(VehicleOwnerDetails.vehicle_owner_id == owner_id).scalar()
        head = {"en": "Balance now", "ta": "இப்போதைய balance", "hi": "अभी balance", "te": "ఇప్పుడు balance", "kn": "ಈಗ balance"}[lang]
        out.insert(0, f"{head}: ₹{int(bal or 0)}")
    except Exception:  # noqa: BLE001
        pass
    return "\n".join(out) + _LEDGER_TAIL[lang]


def _chips(ids: List[str], lang: str) -> List[str]:
    return [TOPICS[i]["title"][lang] for i in ids if i in TOPICS]


def title_to_topic(text: str) -> Optional[str]:
    """A tapped chip sends the topic's own title: map it straight back."""
    t = _norm(text)
    for tid, tp in TOPICS.items():
        if any(_norm(x) == t for x in tp["title"].values()):
            return tid
    return None


def answer(db, role: Optional[str], caller, message: str, language_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """{reply, suggestions, topic, confident} for a driver / partner question, or None when this is not a help question."""
    msg = (message or "").strip()
    if not msg:
        return None
    lang = detect_language(msg, language_hint)
    vals = _live_values(db)
    direct = title_to_topic(msg)
    ranked = [(direct, 99.0, False)] if direct else rank(msg)
    greeting = _norm(msg) in {"hi", "hello", "hey", "help", "menu", "start", "வணக்கம்", "உதவி", "नमस्ते", "हेल्प", "మెనూ", "సహాయం", "ಮೆನು", "ಸಹಾಯ"}
    if greeting:
        return {"reply": _INTRO[lang], "suggestions": _chips(MENU_ORDER, lang), "topic": "menu", "confident": True, "language": lang}
    if not ranked:
        return {"reply": _DID_YOU_MEAN[lang], "suggestions": _chips(MENU_ORDER[:6] + ["support"], lang), "topic": None, "confident": False, "language": lang}
    tid, sc, fuzzy = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0
    strong = sc >= 1.5 and (sc >= second * 1.3 or sc >= 4.0)
    if not strong:
        ids = [r[0] for r in ranked[:3]]
        return {"reply": _DID_YOU_MEAN[lang], "suggestions": _chips(ids, lang) + _chips(["support"], lang), "topic": None, "confident": False, "language": lang}
    topic = TOPICS[tid]
    body = _fill(topic["a"][lang], vals)
    if topic.get("dynamic") == "ledger" and caller is not None and role in ("OWNER", "DRIVER"):
        try:
            body = body + "\n" + _ledger_lines(db, getattr(caller, "vehicle_owner_id", None), lang)
        except Exception:  # noqa: BLE001
            pass
    if fuzzy and not direct:
        body = _SHOWING[lang].format(t=topic["title"][lang]) + "\n" + body
    related = [i for i in ("wallet_deduction", "wallet_hold", "add_money", "accept_assign", "commission", "documents", "support") if i != tid][:4]
    return {"reply": body, "suggestions": _chips(related, lang), "topic": tid, "confident": True, "language": lang}
