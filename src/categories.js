// What patients can search for. Doctors get one category each; salons tick the ones that fit them.
// "words" are extra search words (English, Kurdish, Arabic) that should find the category.
export const CATEGORIES = [
  { key: 'gp', kind: 'clinic', en: 'General doctor', ckb: 'دکتۆری گشتی', ar: 'طبيب عام', words: 'family general gp عام گشتی' },
  { key: 'dentist', kind: 'clinic', en: 'Dentist', ckb: 'دکتۆری ددان', ar: 'طبيب أسنان', words: 'teeth tooth dental ددان دان أسنان سن' },
  { key: 'children', kind: 'clinic', en: "Children's doctor", ckb: 'دکتۆری منداڵان', ar: 'طبيب أطفال', words: 'kids child baby pediatric paediatric منداڵ مندال أطفال طفل' },
  { key: 'women', kind: 'clinic', en: "Women's health and pregnancy", ckb: 'ئافرەتان و منداڵبوون', ar: 'نسائية وتوليد', words: 'gyn gynecology obgyn pregnancy ئافرەت ژنان نسائية حمل' },
  { key: 'heart', kind: 'clinic', en: 'Heart', ckb: 'دڵ', ar: 'قلب', words: 'cardio cardiology heart دڵ قلب' },
  { key: 'skin', kind: 'clinic', en: 'Skin and hair', ckb: 'پێست', ar: 'جلدية', words: 'derma dermatology skin acne پێست جلد' },
  { key: 'eyes', kind: 'clinic', en: 'Eyes', ckb: 'چاو', ar: 'عيون', words: 'eye ophthalmology vision چاو عين عيون' },
  { key: 'ent', kind: 'clinic', en: 'Ear, nose and throat', ckb: 'گوێ و لووت و قوڕگ', ar: 'أنف وأذن وحنجرة', words: 'ear nose throat ent گوێ لووت قوڕگ أذن أنف' },
  { key: 'bones', kind: 'clinic', en: 'Bones and joints', ckb: 'ئێسک و جومگە', ar: 'عظام ومفاصل', words: 'ortho orthopedic bone joint back ئێسک جومگە عظام مفاصل' },
  { key: 'internal', kind: 'clinic', en: 'Internal medicine', ckb: 'نەخۆشییە ناوەکییەکان', ar: 'باطنية', words: 'internal stomach diabetes ناوەکی باطنية سكري' },
  { key: 'nerves', kind: 'clinic', en: 'Brain and nerves', ckb: 'مێشک و دەمار', ar: 'أعصاب', words: 'neuro neurology headache مێشک دەمار أعصاب' },
  { key: 'urology', kind: 'clinic', en: 'Kidney and urology', ckb: 'گورچیلە و میزەڕۆ', ar: 'مسالك بولية', words: 'kidney urology گورچیلە كلى مسالك' },
  { key: 'mental', kind: 'clinic', en: 'Mental health', ckb: 'تەندروستی دەروونی', ar: 'طب نفسي', words: 'psychiatry psychology mental دەروونی نفسي' },
  { key: 'physio', kind: 'clinic', en: 'Physiotherapy', ckb: 'فیزیۆتێراپی', ar: 'علاج طبيعي', words: 'physio physiotherapy فیزیۆ طبيعي' },
  { key: 'barber_men', kind: 'salon', en: "Men's barber", ckb: 'سەرتاشخانەی پیاوان', ar: 'حلاق رجالي', words: 'barber men beard haircut سەرتاش پیاو حلاق رجال' },
  { key: 'salon_women', kind: 'salon', en: "Women's salon", ckb: 'ساڵۆنی ئافرەتان', ar: 'صالون نسائي', words: 'salon women hair ladies ساڵۆن ئافرەت صالون نساء' },
  { key: 'nails', kind: 'salon', en: 'Nails and spa', ckb: 'نینۆک و سپا', ar: 'أظافر وسبا', words: 'nails manicure pedicure spa نینۆک أظافر' },
  { key: 'makeup', kind: 'salon', en: 'Makeup and bridal', ckb: 'مەیکئەپ و بووک', ar: 'مكياج وعرائس', words: 'makeup bridal bride wedding مەیکئەپ بووک مكياج عروس' },
  { key: 'kids_hair', kind: 'salon', en: "Children's haircut", ckb: 'قژبڕینی منداڵان', ar: 'قص شعر أطفال', words: 'kids children haircut منداڵ أطفال' }
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
export const isCategory = (key) => BY_KEY.has(key);
export const categoryName = (key, lang) => { const c = BY_KEY.get(key); return c ? c[lang] || c.en : ''; };

const fold = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[ً-ْـ]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').trim();
export { fold };

// Category keys a free-text search points to (e.g. "teeth" → dentist, "منداڵ" → children and kids_hair).
export function categoriesForText(q) {
  const words = fold(q).split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  return CATEGORIES.filter((c) => {
    const hay = fold(`${c.key} ${c.en} ${c.ckb} ${c.ar} ${c.words}`);
    return words.some((w) => hay.includes(w));
  }).map((c) => c.key);
}

// How visits are rated: four points for each kind of business, each 1–5 stars.
export const REVIEW_POINTS = {
  clinic: [
    { key: 'a1', en: 'Waiting time', ckb: 'کاتی چاوەڕوانی', ar: 'وقت الانتظار' },
    { key: 'a2', en: 'Cleanliness', ckb: 'پاکوخاوێنی', ar: 'النظافة' },
    { key: 'a3', en: 'The doctor', ckb: 'دکتۆرەکە', ar: 'الطبيب' },
    { key: 'a4', en: 'Value for money', ckb: 'نرخ بەرامبەر خزمەت', ar: 'القيمة مقابل السعر' }
  ],
  salon: [
    { key: 'a1', en: 'On time', ckb: 'لە کاتی خۆیدا', ar: 'الالتزام بالموعد' },
    { key: 'a2', en: 'Cleanliness', ckb: 'پاکوخاوێنی', ar: 'النظافة' },
    { key: 'a3', en: 'The result', ckb: 'ئەنجامەکە', ar: 'النتيجة' },
    { key: 'a4', en: 'Value for money', ckb: 'نرخ بەرامبەر خزمەت', ar: 'القيمة مقابل السعر' }
  ]
};
