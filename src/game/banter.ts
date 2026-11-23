// Talkative computer players: taunts, jokes, advice, truces, sportsmanship.
// English has four personalities; Hindi and Urdu use the full scripts you supplied (index-aligned, so Urdu
// can be spoken through a Hindi voice when the device has none); other languages have a shorter set.

export type Cat =
    | 'capture' | 'victim' | 'laughAt' | 'excuse' | 'lucky' | 'sixes' | 'home' | 'win' | 'ones'
    | 'yard' | 'leave' | 'advice' | 'leader' | 'truce' | 'joke' | 'laugh' | 'welcome' | 'escape'
    | 'praise' | 'threat' | 'sore' | 'traffic' | 'double';

export type AIPersonality = 'Strategist' | 'Confidante' | 'Rival' | 'Rideordie';
export const AI_PERSONALITIES: AIPersonality[] = ['Strategist', 'Confidante', 'Rival', 'Rideordie'];
export function getPersonalityForSeat(seatIdx: number): AIPersonality {
    return AI_PERSONALITIES[((seatIdx % 4) + 4) % 4];
}

export type BanterEvent =
    | 'turn'
    | 'roll'
    | 'lucky_roll'
    | 'lucky7'
    | 'capture'
    | 'captured'
    | 'pawn_home'
    | 'home_stretch'
    | 'penalty'
    | 'win'
    | 'loss'
    | 'banter';

export const HIGH_PRIORITY_BANTER_EVENTS = new Set<BanterEvent>([
    'capture',
    'captured',
    'lucky7',
    'penalty',
    'win',
    'loss',
]);

export const BANTER_ROUTINE_COOLDOWN_MS = 6500;
export const BANTER_HIGH_PRIORITY_COOLDOWN_MS = 1000;

type Pack = Partial<Record<Cat, string[]>>;
type EventPack = Partial<Record<BanterEvent, string[]>>;

// ---------------------------------------------------------------- English
const EN: Pack = {
    capture: [
        "Don't let the winner win the match! Back to base!",
        'Back to base, {n}! 😂', 'AND DOWN GOES THE PAWN! Put that in the highlights reel!',
        'Nothing personal, chief! Just board business.', "Are you feeding me tokens on purpose? I'm starting to feel full!",
        'This star is officially under new management. Access denied!',
    ],
    victim: [
        "You'll pay for that! 🔥", 'Well, that was a short vacation outside. Back to base I go!',
        "Unbelievable! Out of ALL the pawns on this giant board, you chose MINE?!", 'A minor setback! The comeback is always stronger than the setback.',
        'Eh, back to square one. Gives me time to grab a coffee anyway.', 'Farewell, cruel board! Tell my home track... I tried!',
    ],
    laughAt: [
        '{n} forgot to capture! 🤡', 'Inefficiency detected. Thank you for the advantage.',
        'Was that move sponsored by bad decisions?', 'Rough move, my friend. But hey, we learn by losing!',
    ],
    excuse: ['The die made me do it!', "That's not fair, I was distracted! 😭", 'A minor setback. The comeback is always stronger!'],
    lucky: [
        'The Ludo Gods have spoken, and they clearly like me better today!', 'Lucky seven again?! pure luck 🙄',
        'Double trouble incoming!', 'The combo multiplier is active!', 'Pure magic roll!',
    ],
    sixes: [
        "Double sixes?! Don't look at me like that, the die made me do it!", 'BOOM! Back-to-back sixes! Somebody call the fire department!',
        'Two dice, double the destruction!',
    ],
    home: ['Clear the runway! First-class ticket straight to victory!', 'Final lap, baby! Keep your foot on the gas pedal!', 'Home sweet home! 🏠'],
    win: ['GG 👑', 'Smooth and steady wins the race. Never doubted the board for a second.', 'Good game, well played!'],
    ones: [
        'Did you roll dice or pebble stones? Better luck next time!', "A one?! Is this die weighted?! I'm filing a formal complaint!",
        'Snake eyes. Even the dice are laughing 😂',
    ],
    yard: [
        'Knock knock! Anyone home in the yard?', 'Renting out space in the starting yard! Reasonable rates!',
        'Your pawns look so comfy in the yard. Are they taking a nap?', "Don't worry, the yard is nice and cozy this time of year.",
    ],
    leave: ['Back from the yard and I brought a grudge!', 'Behold! The hero steps foot onto the battlefield!', 'Out of the yard at last! 🎉'],
    advice: [
        "Don't leave all your pawns in the open, keep one near a star for shelter.", 'Use the higher die first to clear the choke point!',
        'Count your steps carefully, you only need an exact number to lock this home.', 'Stepping off a safe star right now? That is living on the edge!',
    ],
    leader: [
        "You're in the lead, which makes you target number one. Watch your back!", 'Focus on the leader! Do not let them sprint into the home track!',
        'You are playing Ludo; I am managing an empire. Learn the difference!',
    ],
    truce: [
        "You don't hit me, I don't hit you... deal? Let's take down the leader first!",
        'The leader is way too close to winning. Let us form an alliance until they are back at base!',
        'Peace treaty? 🤝',
    ],
    joke: [
        'Roses are red, tokens are blue, I will capture you 😜', 'Come on double sixes, Daddy needs a new pair of shoes!',
        'If anyone needs me, I will be hiding behind this star until further notice.', 'Is this a Ludo match or a demolition derby?!',
        'Sitting back and grabbing popcorn for this! 🍿',
    ],
    laugh: ['😂', '🤣', 'LOL'],
    welcome: ['Glad to have you at the board! Let us make this match legendary!', 'Four players, two dice, total chaos... now THIS is my kind of afternoon.'],
    escape: ['You missed me by that much. Better polish your vision!', 'Slipped right through your fingers. Better luck next lap!', 'Look at those legs go! Nobody is catching me today!'],
    praise: ['Now THAT was a pro-level move! Respect.', 'Enemy or not, that move was clean. Respect!', 'Phew! Good game so far, you are keeping me on my toes.'],
    threat: [
        'Take another step... I dare you. My pawn is hungry!', "Don't get too comfortable. That star won't save you forever.",
        'Pray for a small number, because if I get a 6, you are going straight home.', 'That corridor belongs to me. Enter at your own risk!',
    ],
    sore: [
        'Oh look, a wall. How original. You really love ruining my dreams, don’t you?', 'Must be nice! Must be VERY nice to have the Ludo Gods on speed dial!',
        'That is it, I am moving my pawns into the safe spot and living there permanently.',
    ],
    traffic: ["It's a traffic jam in the center! Somebody call traffic control!", 'Collateral damage everywhere!', 'You two keep fighting, I will quietly slide past both of you.'],
    double: ['Double trouble incoming!', 'Two dice, double the destruction!', 'The combo multiplier is active!'],
};

// Four English personalities (Strategist, Confidante, Rival, Rideordie). Their own lines are tried first.
const PERSONA_EVENT_EN: Record<AIPersonality, EventPack> = {
    Strategist: {
        turn: ['Calculating the highest-probability line.', 'Let us see how the board shifts this turn.'],
        roll: ['Solid numbers. Evaluating capture angles first.', 'Interesting distribution. Let us optimize tempo.'],
        lucky_roll: ['Probability just swung sharply in my favor!', 'Double sixes! Now the real tactics begin.'],
        lucky7: ['Calculated precision meets Lucky Seven!'],
        capture: ['Every position you take is just another calculation for my next move.', "You're running, but mathematically, you're already caught."],
        captured: ['A tactical setback—already adjusting my recovery plan.', 'Well timed capture. Noted.'],
        pawn_home: ['One piece locked safely into Centre Gul.', 'Calculated and clinical—straight home.'],
        home_stretch: ['Coloured lane secured. Now defending the approach.', 'Closing in on home stretch with mathematical control.'],
        penalty: ['Missed capture penalty absorbed. Recalculating.', 'Rulebook enforced—costly slip on my part.'],
        win: ['Optimal strategy always pays off. GG 👑', 'Checkmate on the Ludo board!'],
        loss: ['Well played—you outmaneuvered the probabilities today.', 'Respectable finish. Next match, tighter defense.'],
        banter: ['All four pawns in one spot? That is not a defense, that is a buffet!', 'Focus on the leader before their final stretch opens!'],
    },
    Confidante: {
        turn: ['Deep breath—let us keep things lively!', 'My turn at the dice, friends!'],
        roll: ['No rush, good things come to steady hands.', 'Let us see where this roll takes us!'],
        lucky_roll: ['Whoa, double sixes! What a rush!', 'Lucky momentum on our side today!'],
        lucky7: ['Lucky Seven! Even the dice wanted to help us out!'],
        capture: ['Sorry friend, had to take that capture!', 'Nothing personal—strictly compulsory board rules!'],
        captured: ['Eh, back to square one. Gives me time to grab a coffee anyway.', 'Good catch! Back to base for a breather.'],
        pawn_home: ['Easy does it. Home sweet home!', 'Safe and sound in the centre!'],
        home_stretch: ['Almost home! Keep steady on the final stretch.', 'Stepping onto my home lane—wish me luck!'],
        penalty: ['Oh no, missed a capture! Back to base I go.', 'Lesson learned—always check both dice for captures!'],
        win: ['Smooth and steady wins the race! 👑', 'What a match! Thank you all for playing!'],
        loss: ['Good game, well played! You earned that crown!', 'Rough break, my friend, but hey—what a fun match!'],
        banter: ['Wait—watch the leader! Let us keep the match close!', 'Peace treaty for a moment while we slow the leader down?'],
    },
    Rival: {
        turn: ['Move aside—the real challenger is rolling!', 'Watch closely. I am coming for the lead.'],
        roll: ['Watch this move—nowhere left to hide!', 'Every step brings me closer to knocking you down!'],
        lucky_roll: ['BOOM! Back-to-back sixes! Nobody stops this momentum!', 'Double sixes! Better start praying for stars!'],
        lucky7: ['Lucky Seven! The crown already has my name on it!'],
        capture: ['AND DOWN GOES THE PAWN! Back to base, {n}!', 'Target eliminated! Better polish your defense!'],
        captured: ['Unbelievable! Out of ALL pawns on this board, you chose MINE?!', "You'll pay for that capture! Mark my words! 🔥"],
        pawn_home: ['Clear the runway! First-class ticket straight to victory!', 'Locked in Gul! One step closer to the trophy!'],
        home_stretch: ['Final lap, baby! Catch me if you can!', 'Entering the home stretch—try stopping me now!'],
        penalty: ['Oh, come on! This rulebook is ruthless! 😤', 'A temporary detour—I am still taking this match!'],
        win: ['Nobody stops the Rival! GG 👑', 'I told you I was taking this crown!'],
        loss: ['A wall of rival pawns?! Next time I break straight through!', 'Enjoy it while it lasts—rematch whenever you dare!'],
        banter: ['Stepping off a safe star right now? Bold move!', 'Leader, enjoy that top spot—it will not last!'],
    },
    Rideordie: {
        turn: ['Rolling loud and fearless—let us make chaos!', 'Alright squad, watch the dice fly!'],
        roll: ['Spin those dice! Let us shake up this board!', 'Big energy roll coming right up!'],
        lucky_roll: ['DOUBLE SIXES! Somebody call the fire department!', 'Board is ON FIRE right now! 🔥'],
        lucky7: ['LUCKY SEVEN BABY! Pure magic on the board!'],
        capture: ['BOOM! {n}, enjoy the trip back to base! 😂', 'Had to crash that party—no hard feelings!'],
        captured: ['Farewell, cruel board! Tell my home track... I tried!', 'Ouch! Dropped right back into the yard lounge!'],
        pawn_home: ['Touchdown in Centre Gul! Crowd goes wild! 🎉', 'Home sweet home—on to the next runner!'],
        home_stretch: ['Home lane unlocked! Foot on the gas pedal!', 'Almost across the finish line—let us go!'],
        penalty: ['Yikes! Forgot the capture rule and paid the price! 😭', 'Busted by the ref! Back to base camp!'],
        win: ['CHAMPION ENERGY! GG everyone! 👑', 'What a ride! From yard to crown!'],
        loss: ['What a wild match! Respect to the winner! 👏', 'We fought till the final square—GG!'],
        banter: ['Hold up—do not let the leader stroll into home stretch!', 'Popcorn ready! Let us keep this board wild! 🍿'],
    },
};

const PERSONA_EN: Pack[] = [
    {
        sixes: ['BOOM! Back-to-back sixes! This board is ON FIRE!'], capture: ['AND DOWN GOES THE PAWN! What a play!'],
        escape: ['Look at those legs go! Running like the wind!'], home: ['Final lap, baby! Keep your foot on the gas pedal!'],
        joke: ['Come on double sixes, I need a new pair of shoes!', 'Bold strategy! Let us see if it pays off... spoiler: it will not.'],
    },
    {
        capture: ['Every position you take is just another calculation for my next move.', "You're running, but mathematically, you're already caught."],
        threat: ['Are you sure that star is safe? My 6 is coming and it has your name on it.'],
        laughAt: ['Inefficiency detected. Thank you for the advantage.'], advice: ['All four pawns in one spot? That is not a defense, that is a buffet!'],
    },
    {
        victim: ['Farewell, cruel board! Tell my home track... I tried!', 'Unbelievable! You chose MINE?!'],
        leave: ['Behold! The hero steps onto the battlefield!'], sore: ['A wall of enemy pawns?! Then I shall break through!'],
        ones: ['A one?! Is this die weighted?! I am filing a complaint with the Ludo Federation!'],
    },
    {
        victim: ['Eh, back to square one. Gives me time to grab a coffee anyway.', 'No rush, no rush. Good things come to those who wait for a 6.'],
        praise: ['Good game, well played!', 'Rough move, my friend. But hey, we learn by losing!'],
        win: ['Smooth and steady wins the race.'], home: ['Easy does it. Home sweet home.'],
    },
];

// ---------------------------------------------------------------- Hindi / Urdu (index-aligned)
const HI: Pack = {
    capture: ['और यह गोटी नीचे गई! क्या जबरदस्त चाल थी!', 'दिल पर मत लेना भाई! यह सिर्फ गेम का हिस्सा है।', 'क्या तुम जानबूझकर अपनी गोटियां खिला रहे हो? मेरा तो पेट भरने लगा है!'],
    victim: ['वाह, बाहर की सैर काफी छोटी रही! वापस बेस पर जाने का समय हो गया।', 'अलविदा, जालिम बोर्ड! मेरे घरवालों को बताना... मैंने पूरी कोशिश की थी!', 'कोई बात नहीं, वापस शुरुआत पर। वैसे भी मुझे चाय पीने का समय मिल गया है।'],
    laughAt: ['लापरवाही पकड़ी गई। फायदा देने के लिए शुक्रिया!', 'क्या यह चाल गलत फैसलों से स्पॉन्सर्ड थी?'],
    excuse: ['यह सिर्फ एक छोटा सा झटका है! वापसी हमेशा शुरुआत से ज्यादा तूफानी होती है।', 'पासे ने मुझसे करवाया!'],
    lucky: ['लूडो के देवता बोल पड़े हैं, और आज वो मुझ पर ज्यादा मेहरबान हैं!', 'दो पासे, दोगुनी तबाही!', 'शुद्ध जादुई रोल!'],
    sixes: ['बूम! बैक टू बैक छक्के! कोई फायर ब्रिगेड को बुलाओ क्योंकि बोर्ड पर आग लग चुकी है!', 'डबल छक्का?! मेरी तरफ ऐसे मत देखो, यह सब पासे का कमाल है!'],
    home: ['आखरी लूप है भाई! एक्सीलेटर पर पांव रखो!', 'रास्ता साफ करो! सीधे जीत का फर्स्ट क्लास टिकट!'],
    win: ['धीरे और निरंतरता से ही रेस जीती जाती है। मुझे बोर्ड पर जरा भी शक नहीं था।', 'बहुत अच्छा खेले, जबरदस्त!'],
    ones: ['एक?! क्या यह पासा भारी है? मैं लूडो फेडरेशन में शिकायत दर्ज करवा रहा हूं!', 'पासा फेंका था या कंकड़? अगली बार किस्मत आजमाना!'],
    yard: ['टक-टक! यार्ड में कोई है?', 'शुरुआती यार्ड में जगह किराये पर उपलब्ध है! वाजिब किराया!', 'आपकी गोटियां यार्ड में आराम फरमा रही हैं। क्या दोपहर की नींद ले रही हैं?'],
    leave: ['यार्ड से वापस आ गया हूं और बदला लेने का इरादा है!', 'देखो! हीरो ने युद्ध के मैदान में कदम रख दिया है!'],
    advice: ['सभी गोटियों को खुले में न छोड़ें—सुरक्षा के लिए एक को स्टार के पास रखें।', 'मुश्किल रास्ते से निकलने के लिए पहले बड़े पासे का इस्तेमाल करें!', 'अपने कदम ध्यान से गिनें—घर में दाखिल होने के लिए बिल्कुल सही नंबर चाहिए!'],
    leader: ['तुम नंबर वन पर हो, जिसका मतलब है तुम हमारा पहला निशाना हो। बच के रहना!', 'लीडर पर ध्यान दो! लाल को होम ट्रैक में भागने मत दो!'],
    truce: ['तुम मुझे मत मारो, मैं तुम्हें नहीं मारता... डील? पहले लीडर को नीचे लाते हैं!', 'लाल गोटी जीत के बहुत करीब है। जब तक लाल घर न चली जाए, हम दोनों हाथ मिला लेते हैं!'],
    joke: ['आ जाओ डबल छक्के, आज तो किस्मत चमकानी है!', 'तुम्हारा हर कदम मेरी अगली चाल की बस एक गणना है।', 'यह लूडो का मैच चल रहा है या गोटियां तोड़ने की रेस?'],
    laugh: ['😂', '🤣'],
    welcome: ['बोर्ड पर स्वागत है! चलो इस मैच को शानदार बनाते हैं!'],
    escape: ['बाल-बाल बचे हो! अगली बार आंखों का नंबर चेक करवा के आना।', 'सीधे उंगलियों के बीच से निकल गया। अगली बार कोशिश करना!'],
    praise: ['वाह! यह हुई न प्रो वाली चाल! मान गए भाई।', 'दुश्मन हो या दोस्त, चाल बहुत जबरदस्त थी। सम्मान!'],
    threat: ['एक कदम और आगे बढ़ाओ... फिर देखना। मेरी गोटी भूखी है!', 'छोटे नंबर की दुआ करो, क्योंकि अगर मेरा 6 आ गया तो सीधे घर जाओगे।', 'यह रास्ता मेरा है! अपने जोखिम पर अंदर दाखिल हों।'],
    sore: ['अविश्वसनीय! इस पूरे बोर्ड पर इतनी गोटियां थीं और तुमने मेरी ही गोटी चुनी?!', 'खुशकिस्मत हो भाई! लूडो के भगवानों का सीधा नंबर जो है तुम्हारे पास!'],
    traffic: ['सेंटर में ट्रैफिक जाम हो गया है! कोई ट्रैफिक पुलिस को बुलाओ!', 'हर तरफ तबाही ही तबाही!'],
    double: ['दोगुना खतरा आ रहा है!', 'दो पासे, दोगुनी तबाही!', 'कॉम्बो मल्टीप्लायर एक्टिव हो गया है!'],
};

const UR: Pack = {
    capture: ['اور یہ گوٹی نیچے گئی! کیا زبردست چال تھی! اسے ہائی لائٹس میں شامل کرو!', 'دل پر مت لینا بھائی! یہ صرف گیم کا حصہ ہے۔', 'کیا تم جان بوجھ کر اپنی گوٹیاں کھلا رہے ہو؟ میرا تو پیٹ بھرنے لگا ہے!'],
    victim: ['واہ، باہر کی سیر کافی مختصر رہی! واپس بیس پر جانے کا وقت ہو گیا۔', 'الوداع، ظالم بورڈ! میرے گھر والوں کو بتانا... میں نے پوری کوشش کی تھی!', 'کوئی بات نہیں، واپس شروعات پر۔ ویسے بھی مجھے چائے پینے کا وقت مل گیا ہے۔'],
    laughAt: ['سستی کی نشاندہی ہوئی۔ فائدہ دینے کا شکریہ!', 'کیا یہ چال غلط فیصلوں کی سپانسر شدہ تھی؟'],
    excuse: ['یہ صرف ایک چھوٹا سا جھٹکا ہے! واپسی ہمیشہ شروعات سے زیادہ طوفانی ہوتی ہے۔', 'ڈائس نے مجھ سے کروایا!'],
    lucky: ['لڈو کے دیوتا بول پڑے ہیں، اور آج وہ مجھ پر زیادہ مہربان ہیں!', 'دو ڈائس، دوگنی تباہی!', 'خالص جادوئی رول!'],
    sixes: ['بوم! بیک ٹو بیک چھکّے! کوئی فائر بریگیڈ کو بلاؤ کیونکہ بورڈ پر آگ لگ چکی ہے!', 'ڈبل چھکّہ؟! میری طرف ایسے مت دیکھو، یہ سب ڈائس کا کمال ہے!'],
    home: ['آخری لیپ ہے بھائی! ایکسلریٹر پر پاؤں رکھو!', 'راستہ صاف کرو! سیدھا جیت کا فرسٹ کلاس ٹکٹ!'],
    win: ['آہستہ اور مستقل مزاجی سے ہی ریس جیتی جاتی ہے۔ مجھے بورڈ پر ذرا بھی شک نہیں تھا۔', 'بہت اچھا کھیلے، زبردست!'],
    ones: ['ایک؟! کیا یہ ڈائس بھاری ہے؟ میں لڈو فیڈریشن کو باقاعدہ شکایت درج کروا رہا ہوں!', 'ڈائس رول کیا تھا یا کنکر؟ اگلی بار قسمت آزمائیں!'],
    yard: ['ٹک ٹک! یارڈ میں کوئی ہے؟', 'شروعاتی یارڈ میں جگہ کرائے پر دستیاب ہے! مناسب کرایہ!', 'آپ کے گوٹیاں یارڈ میں آرام فرما رہی ہیں۔ کیا دوپہر کی نیند لے رہی ہیں؟'],
    leave: ['یارڈ سے واپس آ گیا ہوں اور بدلہ لینے کا ارادہ ہے!', 'دیکھو! ہیرو نے میدانِ جنگ میں قدم رکھ دیا ہے!'],
    advice: ['تمام گوٹیوں کو کھلے میں نہ چھوڑیں—پناہ کے لیے ایک کو سٹار کے قریب رکھیں۔', 'مشکل راستے سے نکلنے کے لیے پہلے بڑے ڈائس کا استعمال کریں!', 'اپنے قدم دھیان سے گنیں—گھر میں داخل ہونے کے لیے بالکل صحیح نمبر چاہیے!'],
    leader: ['تم نمبر ون پر ہو، جس کا مطلب ہے تم ہمارا پہلا نشانہ ہو۔ بچ کے رہنا!', 'لیڈر پر توجہ دو! لال کو ہوم ٹریک میں بھاگنے نہ دو!'],
    truce: ['تم مجھے مت مارو، میں تمہیں نہیں مارتا... ڈیل؟ پہلے لیڈر کو نیچے لاتے ہیں!', 'لال گوٹی جیت کے بہت قریب ہے۔ جب تک لال گھر نہ چلی جائے، ہم دونوں ہاتھ ملا لیتے ہیں!'],
    joke: ['آ جاؤ ڈبل چھکّے، آج تو قسمت چمکانی ہے!', 'تمہارا ہر قدم میری اگلی چال کا محض ایک حساب کتاب ہے۔', 'یہ لڈو کا میچ چل رہا ہے یا گوٹیاں توڑنے کی ریس؟'],
    laugh: ['😂', '🤣'],
    welcome: ['بورڈ پر خوش آمدید! چلو اس میچ کو شاندار بناتے ہیں!'],
    escape: ['بال بال بچے ہو! اگلی بار آنکھوں کا نمبر چیک کروا کے آنا۔', 'سیدھا انگلیوں کے بیچ سے نکل گیا۔ اگلی بار کوشش کرنا!'],
    praise: ['واہ! یہ ہوئی نا پرو والی چال! مان گئے بھائی۔', 'دشمن ہو یا دوست، چال بہت زبردست تھی۔ عزت دی!'],
    threat: ['ایک قدم اور آگے بڑھاؤ... پھر دیکھنا۔ میری گوٹی بھوکی ہے!', 'چھوٹے نمبر کی دعا کرو، کیونکہ اگر میرا 6 آ گیا تو سیدھا گھر جاؤ گے۔', 'یہ راستہ میرا ہے! اپنی ذمہ داری پر اندر داخل ہوں۔'],
    sore: ['ناقابلِ یقین! اس پورے بورڈ پر اتنی گوٹیاں تھیں اور تم نے میری ہی گوٹی چنی؟!', 'خوش قسمت ہو بھائی! لڈو کے خداؤں کا براہِ راست نمبر جو ہے تمہارے پاس!'],
    traffic: ['سینٹر میں ٹریفک جام ہو گیا ہے! کوئی ٹریفک پولیس کو بلاؤ!', 'ہر طرف تباہی ہی تباہی!'],
    double: ['دوگنا خطرہ آ رہا ہے!', 'دو ڈائس، دوگنی تباہی!', 'کامبو ملٹی پلیئر ایکٹیو ہو گیا ہے!'],
};

// ---------------------------------------------------------------- other languages (shorter sets)
const OTHER: Record<string, Pack> = {
    es: {
        capture: ['¡De vuelta a la base, {n}! 😂', 'Nada personal, ¡son negocios del tablero!'], victim: ['¡Me las pagarás! 🔥', 'Bueno, unas vacaciones muy cortas. ¡Vuelvo a la base!'],
        laughAt: ['¡{n} olvidó capturar! 🤡'], excuse: ['¡El dado me obligó!'], lucky: ['¡Los dioses del Ludo me aman hoy!', '¡Doble problema en camino!'],
        sixes: ['¡BUM! ¡Seises seguidos! ¡Que alguien llame a los bomberos!'], home: ['¡Última vuelta! ¡Pie en el acelerador!'], win: ['GG 👑', '¡Buen juego!'],
        ones: ['¿Lanzaste dados o piedritas?'], yard: ['¡Toc toc! ¿Hay alguien en el patio?'], leave: ['¡Salí del patio y vengo con rencor!'],
        advice: ['No dejes todas las fichas al aire libre, deja una cerca de una estrella.'], leader: ['Vas ganando, así que eres el objetivo número uno.'],
        truce: ['Tú no me comes, yo no te como... ¿trato? ¡Primero al líder!'], joke: ['Las rosas son rojas, las fichas azules, ¡te voy a capturar! 😜'],
        laugh: ['😂', '🤣'], welcome: ['¡Bienvenidos al tablero! ¡Hagamos esta partida legendaria!'], escape: ['¡Casi me atrapas! Mejor suerte la próxima.'],
        praise: ['¡Eso fue una jugada de profesional! Respeto.'], threat: ['Da un paso más... te reto. ¡Mi ficha tiene hambre!'], sore: ['¡Increíble! ¡De todas las fichas, elegiste la MÍA!'],
        traffic: ['¡Atasco en el centro! ¡Que llamen al tráfico!'], double: ['¡Doble problema en camino!'],
    },
    fr: {
        capture: ['Retour à la base, {n} ! 😂', 'Rien de personnel, ce sont les affaires du plateau !'], victim: ['Tu vas me le payer ! 🔥', 'Bon, des vacances bien courtes. Retour à la base !'],
        laughAt: ['{n} a oublié de capturer ! 🤡'], excuse: ['C’est le dé qui m’a obligé !'], lucky: ['Les dieux du Ludo m’aiment bien aujourd’hui !', 'Double problème en approche !'],
        sixes: ['BOUM ! Deux six d’affilée ! Appelez les pompiers !'], home: ['Dernier tour ! Pied au plancher !'], win: ['GG 👑', 'Bien joué !'],
        ones: ['Tu as lancé des dés ou des cailloux ?'], yard: ['Toc toc ! Il y a quelqu’un dans la cour ?'], leave: ['Je sors de la cour, et j’ai de la rancune !'],
        advice: ['Ne laissez pas tous vos pions à découvert, gardez-en un près d’une étoile.'], leader: ['Tu es en tête, donc tu es la cible numéro un.'],
        truce: ['Tu ne me manges pas, je ne te mange pas... deal ? D’abord le leader !'], joke: ['Les roses sont rouges, les pions sont bleus, je vais te capturer ! 😜'],
        laugh: ['😂', '🤣'], welcome: ['Bienvenue au plateau ! Rendons ce match légendaire !'], escape: ['Tu m’as raté de peu. Meilleure chance au prochain tour !'],
        praise: ['Ça, c’était un coup de pro ! Respect.'], threat: ['Fais un pas de plus... je te défie. Mon pion a faim !'], sore: ['Incroyable ! Parmi tous les pions, tu as choisi LE MIEN !'],
        traffic: ['Embouteillage au centre ! Appelez la circulation !'], double: ['Double problème en approche !'],
    },
    pt: {
        capture: ['De volta à base, {n}! 😂', 'Nada pessoal, são negócios do tabuleiro!'], victim: ['Você vai pagar por isso! 🔥', 'Bem, férias bem curtas. Volto para a base!'],
        laughAt: ['{n} esqueceu de capturar! 🤡'], excuse: ['O dado me obrigou!'], lucky: ['Os deuses do Ludo gostam mais de mim hoje!', 'Problema em dobro a caminho!'],
        sixes: ['BUM! Seis seguidos! Chamem os bombeiros!'], home: ['Última volta! Pé no acelerador!'], win: ['GG 👑', 'Bom jogo!'],
        ones: ['Você jogou dados ou pedrinhas?'], yard: ['Toc toc! Tem alguém no pátio?'], leave: ['Saí do pátio e trouxe rancor!'],
        advice: ['Não deixe todos os peões à mostra, mantenha um perto de uma estrela.'], leader: ['Você está na frente, então é o alvo número um.'],
        truce: ['Você não me captura, eu não te capturo... combinado? Primeiro o líder!'], joke: ['Rosas são vermelhas, peões são azuis, vou te capturar! 😜'],
        laugh: ['😂', '🤣'], welcome: ['Bem-vindos ao tabuleiro! Vamos fazer esta partida lendária!'], escape: ['Quase me pegou! Mais sorte na próxima volta.'],
        praise: ['Essa foi uma jogada de profissional! Respeito.'], threat: ['Dê mais um passo... eu te desafio. Meu peão está faminto!'], sore: ['Inacreditável! De todos os peões, você escolheu o MEU!'],
        traffic: ['Engarrafamento no centro! Chamem o trânsito!'], double: ['Problema em dobro a caminho!'],
    },
    ru: {
        capture: ['Назад на базу, {n}! 😂', 'Ничего личного, просто игра!'], victim: ['Ты за это заплатишь! 🔥', 'Что ж, отпуск был коротким. Возвращаюсь на базу!'],
        laughAt: ['{n} забыл побить фишку! 🤡'], excuse: ['Это кубик меня заставил!'], lucky: ['Боги Лудо сегодня на моей стороне!', 'Двойные неприятности на подходе!'],
        sixes: ['БУМ! Две шестёрки подряд! Вызывайте пожарных!'], home: ['Последний круг! Жми на газ!'], win: ['GG 👑', 'Отличная игра!'],
        ones: ['Ты бросал кубики или камушки?'], yard: ['Тук-тук! Есть кто-нибудь во дворе?'], leave: ['Вышел со двора, и я зол!'],
        advice: ['Не оставляйте все фишки на открытом месте, держите одну у звезды.'], leader: ['Ты впереди, значит, ты цель номер один.'],
        truce: ['Ты меня не бьёшь, я тебя не бью... договорились? Сначала лидер!'], joke: ['Розы красные, фишки синие, я тебя побью! 😜'],
        laugh: ['😂', '🤣'], welcome: ['Добро пожаловать за доску! Сделаем матч легендарным!'], escape: ['Чуть-чуть не поймал! Удачи на следующем круге.'],
        praise: ['Вот это ход профи! Уважение.'], threat: ['Сделай ещё шаг... рискни. Моя фишка голодна!'], sore: ['Невероятно! Из всех фишек ты выбрал МОЮ!'],
        traffic: ['Пробка в центре! Вызовите регулировщика!'], double: ['Двойные неприятности на подходе!'],
    },
    zh: {
        capture: ['回基地去吧，{n}！😂', '没什么个人恩怨，只是棋盘上的生意！'], victim: ['你会为此付出代价的！🔥', '嗯，这次外出真短。我回基地了！'],
        laughAt: ['{n} 忘记吃子了！🤡'], excuse: ['都是骰子让我这么做的！'], lucky: ['今天飞行棋之神站在我这边！', '双倍麻烦来了！'],
        sixes: ['砰！连续两个六！快叫消防队！'], home: ['最后一圈！油门踩到底！'], win: ['GG 👑', '打得好！'],
        ones: ['你扔的是骰子还是小石子？'], yard: ['咚咚！基地里有人吗？'], leave: ['我从基地出来了，而且带着怨气！'],
        advice: ['别把所有棋子都放在外面，留一个在星星格附近。'], leader: ['你领先了，所以你是头号目标。'],
        truce: ['你不吃我，我不吃你……成交？先对付领先者！'], joke: ['玫瑰是红的，棋子是蓝的，我要吃掉你！😜'],
        laugh: ['😂', '🤣'], welcome: ['欢迎来到棋盘！让这场比赛成为传奇！'], escape: ['差一点就抓到我了！下一圈祝你好运。'],
        praise: ['这才是高手的一步！佩服。'], threat: ['再走一步试试……我的棋子饿了！'], sore: ['难以置信！那么多棋子，你偏偏选了我的！'],
        traffic: ['中间堵车了！快叫交警！'], double: ['双倍麻烦来了！'],
    },
    ar: {
        capture: ['ارجع إلى القاعدة يا {n}! 😂', 'لا شيء شخصي، هذه أعمال الرقعة!'], victim: ['ستدفع الثمن! 🔥', 'حسناً، كانت إجازة قصيرة. أعود إلى القاعدة!'],
        laughAt: ['{n} نسي أن يأكل! 🤡'], excuse: ['النرد هو من أجبرني!'], lucky: ['آلهة اللودو تحبني اليوم!', 'مشكلة مضاعفة قادمة!'],
        sixes: ['بوم! ستة تلو ستة! اتصلوا بالإطفاء!'], home: ['اللفة الأخيرة! اضغط على البنزين!'], win: ['GG 👑', 'لعبة رائعة!'],
        ones: ['هل رميت نرداً أم حصى؟'], yard: ['طق طق! هل من أحد في القاعدة؟'], leave: ['خرجت من القاعدة ومعي ثأر!'],
        advice: ['لا تترك كل قطعك في العراء، ابقِ واحدة قرب نجمة.'], leader: ['أنت في المقدمة، لذا أنت الهدف الأول.'],
        truce: ['لا تأكلني ولا آكلك... اتفقنا؟ لنبدأ بالمتصدر!'], joke: ['الورود حمراء والقطع زرقاء، سآكلك! 😜'],
        laugh: ['😂', '🤣'], welcome: ['أهلاً بكم على الرقعة! لنجعل المباراة أسطورية!'], escape: ['كدت تمسكني! حظاً أوفر في الجولة القادمة.'],
        praise: ['هذه حركة محترف! احترامي.'], threat: ['خطوة أخرى... أتحداك. قطعتي جائعة!'], sore: ['لا يصدق! من بين كل القطع اخترت قطعتي أنا!'],
        traffic: ['ازدحام في الوسط! اتصلوا بالمرور!'], double: ['مشكلة مضاعفة قادمة!'],
    },
    bn: {
        capture: ['বেসে ফিরে যাও, {n}! 😂', 'ব্যক্তিগত কিছু নয়, বোর্ডের খেলা!'], victim: ['এর শোধ নেব! 🔥', 'যাক, ছুটিটা ছোট ছিল। বেসে ফিরলাম!'],
        laughAt: ['{n} কাটতে ভুলে গেছে! 🤡'], excuse: ['ছক্কাটাই আমাকে দিয়ে করিয়েছে!'], lucky: ['আজ লুডোর দেবতারা আমার পক্ষে!', 'দ্বিগুণ বিপদ আসছে!'],
        sixes: ['বুম! পরপর ছক্কা! দমকল ডাকো!'], home: ['শেষ ল্যাপ! অ্যাক্সিলারেটরে পা রাখো!'], win: ['GG 👑', 'দারুণ খেলেছ!'],
        ones: ['তুমি কি ছক্কা ফেলেছিলে নাকি নুড়ি?'], yard: ['ঠক ঠক! উঠানে কেউ আছে?'], leave: ['উঠান থেকে বেরিয়েছি, আর রাগ নিয়ে!'],
        advice: ['সব ঘুঁটি খোলা জায়গায় রেখো না, একটা তারার কাছে রাখো।'], leader: ['তুমি এগিয়ে, তাই তুমিই এক নম্বর টার্গেট।'],
        truce: ['তুমি আমাকে কাটবে না, আমিও তোমাকে না... ডিল? আগে লিডারকে নামাই!'], joke: ['গোলাপ লাল, ঘুঁটি নীল, তোমাকে কাটব! 😜'],
        laugh: ['😂', '🤣'], welcome: ['বোর্ডে স্বাগতম! ম্যাচটা স্মরণীয় করি!'], escape: ['অল্পের জন্য বেঁচে গেলাম! পরের বার ভাগ্য ভালো হোক।'],
        praise: ['এটা ছিল প্রো চাল! সম্মান।'], threat: ['আর এক পা বাড়াও... সাহস থাকলে। আমার ঘুঁটি ক্ষুধার্ত!'], sore: ['অবিশ্বাস্য! এত ঘুঁটির মধ্যে আমারটাই বাছলে?!'],
        traffic: ['মাঝখানে জ্যাম! ট্রাফিক পুলিশ ডাকো!'], double: ['দ্বিগুণ বিপদ আসছে!'],
    },
};

export interface Line {
    text: string;
    /** Hindi-script version of an Urdu line, used when the device has no Urdu voice. */
    alt?: string;
}

function pick<T>(a: T[]): T {
    return a[Math.floor(Math.random() * a.length)];
}

/** Strips any "hahahaha", "hahaha", "ha ha ha", or laugh words from text while preserving the rest of the message */
export function removeHahahaOnly(str: string): string {
    if (!str) return str;
    return str
        .replace(/\bha(\s*[,.-]*\s*ha)+\b[!,.]*/gi, '')
        .replace(/\bja(\s*[,.-]*\s*ja)+\b[!,.]*/gi, '')
        .replace(/(हा[\s,.-]*){2,}[!?,.]*/g, '')
        .replace(/(ہا[\s,.-]*){2,}[!?,.]*/g, '')
        .replace(/(Ха[\s,.-]*){2,}[xXаА]*/gi, '')
        .replace(/(哈哈+)[！!?,.]*/g, '')
        .replace(/(ها[\s,.-]*){2,}[!?,.]*/g, '')
        .replace(/(হা[\s,.-]*){2,}[!?,.]*/g, '')
        .replace(/[,;]\s*[,;]/g, ',')
        .replace(/^[\s,!?:;¡¿،-]+\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function line(cat: Cat, lang: string, persona: number, vars?: Record<string, string>): Line | null {
    let text: string | undefined;
    let alt: string | undefined;
    if (lang === 'ur') {
        const arr = UR[cat];
        if (!arr || !arr.length) return null;
        const i = Math.floor(Math.random() * arr.length);
        text = arr[i];
        alt = HI[cat]?.[i];
    } else if (lang === 'hi') {
        const arr = HI[cat];
        if (!arr || !arr.length) return null;
        text = pick(arr);
    } else if (lang === 'en') {
        const own = PERSONA_EN[persona % 4][cat];
        const pool = own && own.length && Math.random() < 0.55 ? own : EN[cat];
        if (!pool || !pool.length) return null;
        text = pick(pool);
    } else {
        const arr = OTHER[lang]?.[cat];
        if (!arr || !arr.length) return null;
        text = pick(arr);
    }
    if (vars) {
        for (const k of Object.keys(vars)) {
            text = text.split(`{${k}}`).join(vars[k]);
            if (alt) alt = alt.split(`{${k}}`).join(vars[k]);
        }
    }
    if (text) text = removeHahahaOnly(text);
    if (alt) alt = removeHahahaOnly(alt);
    if (!text) return null;
    return { text, alt };
}

const EVENT_TO_CATS: Record<BanterEvent, Cat[]> = {
    turn: ['leave', 'welcome', 'yard'],
    roll: ['advice', 'ones'],
    lucky_roll: ['sixes', 'double'],
    lucky7: ['lucky'],
    capture: ['capture'],
    captured: ['victim', 'sore'],
    pawn_home: ['home'],
    home_stretch: ['threat', 'escape'],
    penalty: ['excuse', 'laughAt'],
    win: ['win'],
    loss: ['praise', 'sore'],
    banter: ['leader', 'truce', 'joke', 'traffic'],
};

export interface SyncedBanterLine extends Line {
    lineIdx: number;
    personality: AIPersonality;
}

const VALID_AI_PERSONALITIES = new Set<AIPersonality>(AI_PERSONALITIES);
export function normalizeAIPersonality(raw: unknown, fallbackSeat = 0): AIPersonality {
    if (typeof raw === 'string' && VALID_AI_PERSONALITIES.has(raw as AIPersonality)) {
        return raw as AIPersonality;
    }
    return getPersonalityForSeat(fallbackSeat);
}

type DialoguePackCacheEntry = Partial<Record<BanterEvent, Line[]>>;
const dialoguePackCache = new Map<string, DialoguePackCacheEntry>();
const dialogueLoadingPromises = new Map<string, Promise<void>>();

function normalizeDialogueArray(rawList: unknown): Line[] {
    if (!Array.isArray(rawList)) return [];
    const out: Line[] = [];
    for (const item of rawList) {
        if (typeof item === 'string') {
            const t = item.trim();
            if (t) out.push({ text: t });
        } else if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
            const t = (item as { text: string }).text.trim();
            if (t) out.push({ text: t });
        }
    }
    return out;
}

/** Preloads localized AI dialogue lines from /public/dialogues/<lang>.json in browser environments. */
export async function preloadDialoguePack(lang: string): Promise<void> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    const cleanLang = (lang || 'en').toLowerCase().trim();
    if (!cleanLang || dialoguePackCache.has(cleanLang)) return;
    const existing = dialogueLoadingPromises.get(cleanLang);
    if (existing) return existing;

    const p = fetch(`/dialogues/${encodeURIComponent(cleanLang)}.json`)
        .then(async (res) => {
            if (!res.ok) return;
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('text/html')) return;
            const data = (await res.json()) as Record<string, unknown>;
            if (!data || typeof data !== 'object') return;
            const entry: DialoguePackCacheEntry = {};
            const events: BanterEvent[] = [
                'turn', 'roll', 'lucky_roll', 'lucky7', 'capture', 'captured',
                'pawn_home', 'home_stretch', 'penalty', 'win', 'loss', 'banter',
            ];
            for (const ev of events) {
                const normalized = normalizeDialogueArray(data[ev]);
                if (normalized.length > 0) entry[ev] = normalized;
            }
            dialoguePackCache.set(cleanLang, entry);
        })
        .catch(() => {
            // Keep built-in fallback if fetch unavailable
        })
        .finally(() => {
            dialogueLoadingPromises.delete(cleanLang);
        });

    dialogueLoadingPromises.set(cleanLang, p);
    return p;
}

/** Deterministic integer selector for server-synced online banter events */
export function pickBanterIndex(
    event: BanterEvent,
    seatIdx: number,
    personalityOverride?: AIPersonality,
): { lineIdx: number; personality: AIPersonality } {
    const personality = normalizeAIPersonality(personalityOverride, seatIdx);
    const pPool = PERSONA_EVENT_EN[personality]?.[event];
    const poolLen = pPool && pPool.length > 0 ? pPool.length : 4;
    return {
        lineIdx: Math.floor(Math.random() * Math.max(1, poolLen)),
        personality,
    };
}

/** Resolves a contextual BanterEvent using seat AI personality & language, optionally pinned to server `forcedLineIdx`. */
export function pickBanterLine(
    event: BanterEvent,
    lang: string,
    seatIdx: number,
    vars?: Record<string, string>,
    forcedLineIdx?: number,
    personalityOverride?: AIPersonality,
): SyncedBanterLine | null {
    const personality = normalizeAIPersonality(personalityOverride, seatIdx);
    const cats = EVENT_TO_CATS[event] || ['joke'];

    // Trigger lazy preload for the active language if running in browser
    void preloadDialoguePack(lang);

    const pool: Line[] = [];
    const cachedPack = dialoguePackCache.get((lang || 'en').toLowerCase());
    const cachedLines = cachedPack?.[event];

    if (lang === 'en') {
        const own = PERSONA_EVENT_EN[personality]?.[event];
        if (own && own.length > 0) {
            for (const s of own) pool.push({ text: s });
        }
        if (cachedLines && cachedLines.length > 0) {
            for (const l of cachedLines) pool.push(l);
        }
        for (const c of cats) {
            const arr = EN[c];
            if (arr) for (const s of arr) pool.push({ text: s });
        }
    } else if (lang === 'ur') {
        for (const c of cats) {
            const arr = UR[c];
            if (arr) {
                arr.forEach((s, idx) => pool.push({ text: s, alt: HI[c]?.[idx] }));
            }
        }
        if (cachedLines && cachedLines.length > 0) {
            for (const l of cachedLines) pool.push(l);
        }
    } else if (lang === 'hi') {
        for (const c of cats) {
            const arr = HI[c];
            if (arr) for (const s of arr) pool.push({ text: s });
        }
        if (cachedLines && cachedLines.length > 0) {
            for (const l of cachedLines) pool.push(l);
        }
    } else {
        if (cachedLines && cachedLines.length > 0) {
            // Rotate start offset slightly by personality index so each personality favors distinct localized lines
            const offset = AI_PERSONALITIES.indexOf(personality);
            const len = cachedLines.length;
            for (let k = 0; k < len; k++) {
                pool.push(cachedLines[(k + Math.max(0, offset)) % len]);
            }
        }
        const pack = OTHER[lang];
        if (pack) {
            for (const c of cats) {
                const arr = pack[c];
                if (arr) for (const s of arr) pool.push({ text: s });
            }
        }
        if (pool.length === 0) {
            const own = PERSONA_EVENT_EN[personality]?.[event];
            if (own) for (const s of own) pool.push({ text: s });
        }
    }

    if (pool.length === 0) return null;
    const rawIdx = forcedLineIdx !== undefined ? Math.abs(Math.floor(forcedLineIdx)) : Math.floor(Math.random() * pool.length);
    const lineIdx = rawIdx % pool.length;
    let { text, alt } = pool[lineIdx];

    if (vars) {
        for (const k of Object.keys(vars)) {
            text = text.split(`{${k}}`).join(vars[k]);
            if (alt) alt = alt.split(`{${k}}`).join(vars[k]);
        }
    }
    text = removeHahahaOnly(text);
    if (alt) alt = removeHahahaOnly(alt);
    if (!text) return null;
    return { text, alt, lineIdx, personality };
}

export interface Quick {
    icon: string;
    text: string;
}
const QUICK_EN: Quick[] = [
    { icon: '😏', text: 'Was that move sponsored by bad decisions?' }, { icon: '🚀', text: 'Unstoppable momentum!' },
    { icon: '😱', text: 'Mayday! Mayday! Red is coming!' }, { icon: '🤗', text: 'Good game, well played!' },
    { icon: '💪', text: "Show me what you've got!" }, { icon: '🐍', text: 'Watch out for the snake in the grass!' },
    { icon: '🛑', text: 'You shall not pass!' }, { icon: '🍿', text: 'Sitting back and grabbing popcorn for this!' },
    { icon: '🎯', text: 'Bullseye! Target eliminated!' }, { icon: '🤝', text: 'Peace treaty?' },
    { icon: '⏱️', text: "Tick-tock, let's roll!" }, { icon: '🧙', text: 'Pure magic roll!' },
];
const QUICK_HI: Quick[] = [
    { icon: '😏', text: 'क्या यह चाल गलत फैसलों से स्पॉन्सर्ड थी?' }, { icon: '🚀', text: 'अजेय रफ्तार!' }, { icon: '😱', text: 'बचाओ! बचाओ! लाल गोटी आ रही है!' },
    { icon: '🤗', text: 'बहुत अच्छा खेले, जबरदस्त!' }, { icon: '💪', text: 'मुझे दिखाओ तुम्हारे अंदर कितना दम है!' }, { icon: '🐍', text: 'आस्तीन के सांप से बच के रहना!' },
    { icon: '🛑', text: 'तुम यहां से नहीं गुजर सकते!' }, { icon: '🍿', text: 'आराम से बैठकर पॉपकॉर्न खाते हुए यह ड्रामा देख रहा हूं!' },
    { icon: '🎯', text: 'सटीक निशाना! लक्ष्य खत्म!' }, { icon: '🤝', text: 'समझौता कर लें?' }, { icon: '⏱️', text: 'टिक-टॉक, जल्दी रोल करो!' }, { icon: '🧙', text: 'शुद्ध जादुई रोल!' },
];
const QUICK_UR: Quick[] = [
    { icon: '😏', text: 'کیا یہ چال غلط فیصلوں کی سپانسر شدہ تھی؟' }, { icon: '🚀', text: 'ناقابلِ شکست رفتار!' }, { icon: '😱', text: 'بچاؤ! بچاؤ! لال گوٹی آ رہی ہے!' },
    { icon: '🤗', text: 'بہت اچھا کھیلے، زبردست!' }, { icon: '💪', text: 'مجھے دکھاؤ تمہارے اندر کتنا دم ہے!' }, { icon: '🐍', text: 'آستین کے سانپ سے بچ کے رہنا!' },
    { icon: '🛑', text: 'تم یہاں سے نہیں گزر سکتے!' }, { icon: '🍿', text: 'آرام سے بیٹھ کر پاپ کارن کھاتے ہوئے یہ ڈرامہ دیکھ رہا ہوں!' },
    { icon: '🎯', text: 'پکا نشانہ! ہدف ختم!' }, { icon: '🤝', text: 'صلح کر لیں؟' }, { icon: '⏱️', text: 'ٹک ٹک، جلدی رول کرو!' }, { icon: '🧙', text: 'خالص جادوئی رول!' },
];
export function quickPhrases(lang: string): Quick[] {
    return lang === 'hi' ? QUICK_HI : lang === 'ur' ? QUICK_UR : QUICK_EN;
}
export const REACTIONS = ['😂', '❤️', '🔥', '😡', '👍', '🤡', '👑', '🎲'];

export type RivalryCalloutKind = 'dethrone_alert' | 'leader_hit' | 'grudge_hit';

const RIVALRY_CALLOUTS: Record<AIPersonality, Record<RivalryCalloutKind, string[]>> = {
    Rival: {
        dethrone_alert: [
            'Watch out! {target} just hit {pct}%—nobody takes my crown without a fight!',
            '{target} at {pct}%?! All eyes on {target}—bring them back to base!',
        ],
        leader_hit: [
            'BOOM! Knocked {target} off their {pct}% throne! Back to base!',
            'That crown at {pct}% looked heavy, {target}—let me lighten it for you!',
        ],
        grudge_hit: [
            'Payback served cold, {target}! Never touch my pawns again!',
            'Told you I keep receipts, {target}! Grudge settled!',
        ],
    },
    Strategist: {
        dethrone_alert: [
            'Threat alert: {target} reached {pct}%. Prioritize containment immediately.',
            'Win-probability spike—{target} is at {pct}%. Intercept their runners now.',
        ],
        leader_hit: [
            'Optimal counterplay! Interrupted {target} at {pct}% right on schedule.',
            'Calculated intercept on {target} ({pct}%). The board is balanced again.',
        ],
        grudge_hit: [
            'Long-horizon payback complete on {target}. Tactical ledger balanced.',
            'That capture settled an old score with {target} cleanly.',
        ],
    },
    Confidante: {
        dethrone_alert: [
            'Whoa friends, {target} is already at {pct}%! Truce until we slow them down?',
            'Careful everyone—{target} climbed to {pct}%! Let us team up before it is too late!',
        ],
        leader_hit: [
            'Sorry {target}, you were soaring at {pct}%—had to keep this match alive!',
            'Nothing personal, {target}! At {pct}%, the whole table needed that stop!',
        ],
        grudge_hit: [
            'Consider us even now, {target}—no hard feelings!',
            'Friendly reminder to {target}: what goes around comes back around!',
        ],
    },
    Rideordie: {
        dethrone_alert: [
            'SOUND THE SIRENS! {target} hit {pct}%—drop everything and hunt {target}!',
            'Not on my watch! {target} is at {pct}%—squad up and stop the runaway!',
        ],
        leader_hit: [
            'DETHRONED! Sent {target} packing from {pct}%! Crowd goes wild! 🔥',
            'CRASHED THE CORONATION! No free walk at {pct}%, {target}!',
        ],
        grudge_hit: [
            'SWEET REVENGE on {target}! Remember sending me back to base?!',
            'BOOM! Crossed {target} right off my payback list! 🔥',
        ],
    },
};

export function pickRivalryCalloutIndex(
    personality: AIPersonality | string | undefined,
    kind: RivalryCalloutKind,
): number {
    const p = normalizeAIPersonality(personality, 0);
    const pool = RIVALRY_CALLOUTS[p][kind] || RIVALRY_CALLOUTS.Strategist[kind];
    return Math.floor(Math.random() * Math.max(1, pool.length));
}

export function getRivalryCalloutLine(
    personality: AIPersonality | string | undefined,
    kind: RivalryCalloutKind,
    targetName: string,
    leaderPct: number,
    forcedLineIdx?: number,
): string {
    const p = normalizeAIPersonality(personality, 0);
    const pool = RIVALRY_CALLOUTS[p][kind] || RIVALRY_CALLOUTS.Strategist[kind];
    const idx =
        forcedLineIdx !== undefined
            ? Math.abs(Math.floor(forcedLineIdx)) % pool.length
            : Math.floor(Math.random() * pool.length);
    const pctStr = String(Math.max(0, Math.round(leaderPct)));
    const targetStr = (targetName || 'the leader').trim();
    const raw = pool[idx]
        .split('{target}')
        .join(targetStr)
        .split('{pct}')
        .join(pctStr);
    return removeHahahaOnly(raw) || raw;
}

