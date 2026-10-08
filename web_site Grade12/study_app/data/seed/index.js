// يجمع بنك الأسئلة الأولي ويولّد المعرّفات.
// صيغة السؤال المختصرة في ملفات المواد: [نص السؤال, [الخيارات], رقم الإجابة الصحيحة (يبدأ من 0), الشرح]
const subjects = [
  require('./math'),
  require('./physics'),
  require('./chemistry'),
  require('./arabic'),
  require('./english'),
  require('./islamic'),
  require('./watani'),
];

module.exports = subjects.map((s) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  color: s.color,
  icon: s.icon,
  description: s.description,
  ...(s.lang ? { lang: s.lang } : {}),
  units: s.units.map((u, ui) => ({
    id: `u${ui + 1}`,
    title: u.title,
    lessons: u.lessons.map((l, li) => ({
      id: `u${ui + 1}-l${li + 1}`,
      title: l.title,
      questions: l.questions.map(([q, options, answer, explanation], qi) => ({
        id: `q${qi + 1}`,
        q,
        options,
        answer,
        explanation,
      })),
    })),
  })),
}));
