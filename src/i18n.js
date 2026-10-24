// Text for the patient-facing pages and messages. Staff screens are English in this version.
// The Kurdish and Arabic text needs a review by a native speaker before launch.
export const LANGS = ['ckb', 'ar', 'en'];
export const RTL = new Set(['ckb', 'ar']);

const T = {
  en: {
    langName: 'English', bookWith: 'Book a visit', chooseDoctor: 'Choose a doctor', fee: 'Visit fee', iqd: 'IQD',
    byTime: 'Choose a time', byQueue: 'Take a queue number', today: 'Today', closed: 'Closed', noSlots: 'No free times on this day.',
    full: 'The queue for this day is full.', nextNumber: 'Your number will be', expected: 'Expected time', name: 'Your name', phone: 'Mobile number',
    phoneHint: 'Example: 0750 123 4567', sendCode: 'Send code by SMS', codeSent: 'We sent a 4-digit code to', code: 'Code', confirm: 'Confirm booking',
    badPhone: 'Enter a valid Iraqi mobile number, for example 0750 123 4567.', badCode: 'The code is wrong or expired. Request a new one.',
    tooMany: 'Too many codes requested. Try again in 10 minutes.', needName: 'Enter your name.', slotTaken: 'That time was just taken. Choose another one.',
    error: 'Something went wrong. Please try again.', yourNumber: 'Your number', nowServing: 'Now in the room', ahead: 'patients before you',
    aboutMin: 'About {m} minutes', yourTurn: 'It is your turn. Please go in.', finished: 'Your visit is finished. Thank you.', cancelled: 'This booking was cancelled.',
    missed: 'You missed your turn. Please talk to the reception.', notStarted: 'The doctor has not started yet.', cancel: 'Cancel booking', cancelDone: 'Booking cancelled.',
    keepOpen: 'Keep this page open or save the link. It updates by itself.', time: 'Time', date: 'Date', poweredBy: 'Booking by Nobat', pickDate: 'Choose a day',
    sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
    msgConfirmed: '{clinic}: your visit with {doctor} is booked for {when}. Your number is {no}. Follow your turn here: {link}',
    msgReminder: '{clinic}: reminder, you have a visit tomorrow with {doctor} ({when}). Your number is {no}. {link}',
    msgNear: '{clinic}: {n} patients before you. Please come now. {link}',
    msgTurn: '{clinic}: it is your turn with {doctor}. Please go in.',
    msgCode: 'Your Nobat code is {code}. It expires in 10 minutes.'
  },
  ckb: {
    langName: 'کوردی', bookWith: 'نۆرە بگرە', chooseDoctor: 'دکتۆرێک هەڵبژێرە', fee: 'نرخی سەردان', iqd: 'دینار',
    byTime: 'کاتێک هەڵبژێرە', byQueue: 'ژمارەی نۆرە وەربگرە', today: 'ئەمڕۆ', closed: 'داخراوە', noSlots: 'لەم ڕۆژەدا هیچ کاتێکی بەتاڵ نییە.',
    full: 'نۆرەی ئەم ڕۆژە پڕ بووە.', nextNumber: 'ژمارەکەت دەبێتە', expected: 'کاتی پێشبینیکراو', name: 'ناوت', phone: 'ژمارەی مۆبایل',
    phoneHint: 'نموونە: 0750 123 4567', sendCode: 'کۆد بە SMS بنێرە', codeSent: 'کۆدێکی 4 ژمارەییمان نارد بۆ', code: 'کۆد', confirm: 'نۆرەکە پشتڕاست بکەرەوە',
    badPhone: 'ژمارەیەکی مۆبایلی دروستی عێراق بنووسە، بۆ نموونە 0750 123 4567.', badCode: 'کۆدەکە هەڵەیە یان بەسەرچووە. کۆدێکی نوێ داوا بکە.',
    tooMany: 'کۆدی زۆر داواکراوە. 10 خولەکی تر هەوڵ بدەرەوە.', needName: 'ناوت بنووسە.', slotTaken: 'ئەو کاتە ئێستا گیرا. کاتێکی تر هەڵبژێرە.',
    error: 'هەڵەیەک ڕوویدا. تکایە دووبارە هەوڵ بدەرەوە.', yourNumber: 'ژمارەکەت', nowServing: 'ئێستا لە ژوورەوە', ahead: 'نەخۆش پێش تۆن',
    aboutMin: 'نزیکەی {m} خولەک', yourTurn: 'نۆرەی تۆیە. تکایە بچۆ ژوورەوە.', finished: 'سەردانەکەت تەواو بوو. سوپاس.', cancelled: 'ئەم نۆرەیە هەڵوەشێندرایەوە.',
    missed: 'نۆرەکەت لەدەستچوو. تکایە قسە لەگەڵ پێشوازی بکە.', notStarted: 'دکتۆر هێشتا دەستی پێنەکردووە.', cancel: 'هەڵوەشاندنەوەی نۆرە', cancelDone: 'نۆرەکە هەڵوەشێندرایەوە.',
    keepOpen: 'ئەم پەڕەیە کراوە بهێڵەوە یان بەستەرەکە هەڵبگرە. خۆی نوێ دەبێتەوە.', time: 'کات', date: 'ڕێکەوت', poweredBy: 'نۆرەگرتن لە ڕێگەی Nobat', pickDate: 'ڕۆژێک هەڵبژێرە',
    sun: 'یەکشەممە', mon: 'دووشەممە', tue: 'سێشەممە', wed: 'چوارشەممە', thu: 'پێنجشەممە', fri: 'هەینی', sat: 'شەممە',
    msgConfirmed: '{clinic}: سەردانەکەت لای {doctor} گیرا بۆ {when}. ژمارەکەت {no}یە. نۆرەکەت لێرە ببینە: {link}',
    msgReminder: '{clinic}: بیرخستنەوە، سبەی سەردانت هەیە لای {doctor} ({when}). ژمارەکەت {no}یە. {link}',
    msgNear: '{clinic}: {n} نەخۆش پێش تۆن. تکایە ئێستا وەرە. {link}',
    msgTurn: '{clinic}: نۆرەی تۆیە لای {doctor}. تکایە بچۆ ژوورەوە.',
    msgCode: 'کۆدی Nobat ـەکەت {code}ـە. دوای 10 خولەک بەسەردەچێت.'
  },
  ar: {
    langName: 'العربية', bookWith: 'احجز موعداً', chooseDoctor: 'اختر طبيباً', fee: 'الكشفية', iqd: 'دينار',
    byTime: 'اختر وقتاً', byQueue: 'خذ رقم دور', today: 'اليوم', closed: 'مغلق', noSlots: 'لا توجد أوقات متاحة في هذا اليوم.',
    full: 'دور هذا اليوم ممتلئ.', nextNumber: 'رقمك سيكون', expected: 'الوقت المتوقع', name: 'اسمك', phone: 'رقم الموبايل',
    phoneHint: 'مثال: 0750 123 4567', sendCode: 'أرسل الرمز برسالة', codeSent: 'أرسلنا رمزاً من 4 أرقام إلى', code: 'الرمز', confirm: 'تأكيد الحجز',
    badPhone: 'أدخل رقم موبايل عراقي صحيح، مثل 0750 123 4567.', badCode: 'الرمز خاطئ أو منتهي. اطلب رمزاً جديداً.',
    tooMany: 'طلبت رموزاً كثيرة. حاول بعد 10 دقائق.', needName: 'أدخل اسمك.', slotTaken: 'تم حجز هذا الوقت للتو. اختر وقتاً آخر.',
    error: 'حدث خطأ. يرجى المحاولة مرة أخرى.', yourNumber: 'رقمك', nowServing: 'الآن في الغرفة', ahead: 'مرضى قبلك',
    aboutMin: 'حوالي {m} دقيقة', yourTurn: 'حان دورك. تفضل بالدخول.', finished: 'انتهت زيارتك. شكراً لك.', cancelled: 'تم إلغاء هذا الحجز.',
    missed: 'فاتك دورك. يرجى مراجعة الاستقبال.', notStarted: 'لم يبدأ الطبيب بعد.', cancel: 'إلغاء الحجز', cancelDone: 'تم إلغاء الحجز.',
    keepOpen: 'أبقِ هذه الصفحة مفتوحة أو احفظ الرابط. تتحدث تلقائياً.', time: 'الوقت', date: 'التاريخ', poweredBy: 'الحجز عبر Nobat', pickDate: 'اختر يوماً',
    sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة', sat: 'السبت',
    msgConfirmed: '{clinic}: تم حجز موعدك مع {doctor} في {when}. رقمك {no}. تابع دورك هنا: {link}',
    msgReminder: '{clinic}: تذكير، لديك موعد غداً مع {doctor} ({when}). رقمك {no}. {link}',
    msgNear: '{clinic}: {n} مرضى قبلك. يرجى الحضور الآن. {link}',
    msgTurn: '{clinic}: حان دورك مع {doctor}. تفضل بالدخول.',
    msgCode: 'رمز Nobat الخاص بك هو {code}. ينتهي بعد 10 دقائق.'
  }
};

export function pickLang(value) {
  return LANGS.includes(value) ? value : 'ckb';
}

export function t(lang, key, vars) {
  let s = (T[lang] && T[lang][key]) ?? T.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

export function dictFor(lang) {
  return { ...T.en, ...T[lang] };
}
