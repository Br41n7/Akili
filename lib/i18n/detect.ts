/**
 * Which language is a piece of study material written in? Small, dependency-free guess: other scripts by character range,
 * Latin-script languages by how many of their very common words appear. It answers null when unsure (short or mixed text),
 * and callers then fall back to "match the material's language" without naming one.
 */
export interface Detected { code: string; name: string }

const WORDS: Record<string, string> = {
  en: 'the of and to in is that it for as with was on are by this be or from at an which have has not but they you can will their these its more also when what were been than into other such if one all',
  fr: 'le la les des du un une et est que qui dans pour pas sur au aux avec ce cette ces sont par plus ne se il elle nous vous ils mais ou où comme être avoir fait aussi entre leur leurs peut donc ainsi très sans sous',
  es: 'el los las del un una y es que en por con para como más pero su sus al se lo este esta estos son fue ser han hay también entre sobre puede cuando muy sin ya nos todo cada donde porque',
  pt: 'o os as do da dos das um uma e é que em por com para como mais mas seu sua seus suas ao se este esta estes são foi ser têm há também entre sobre pode quando muito sem já nos não você cada onde porque',
  de: 'der die das den dem des und ist ein eine einen von zu mit für auf nicht auch sich es sind wird werden bei als oder wie nach aus dass kann einem einer im am zum zur noch nur über',
  it: 'il lo gli le dei delle un una e è che di in per con non più come ma suo sua sono stato essere hanno anche tra sopra può quando molto senza già ogni dove perché nel nella alla',
  sw: 'na ya wa kwa ni za katika la kuwa cha hii huu hiyo kama au pia sana lakini kutoka yake wake zake vya kila mimi wewe sisi wao hiyo ambayo',
  ha: 'da a na ta ne ce cikin ya su ba wani wata kuma don daga shi ita mai wanda wadda amma kamar sosai ko duk wannan waɗannan',
  yo: 'ni ti o a ń kan fún sí àti pé tí wọ́n jẹ́ bí ọ̀kan nínú lórí náà yìí wọ̀nyí ṣùgbọ́n gbogbo',
};
const NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese', de: 'German', it: 'Italian', sw: 'Swahili', ha: 'Hausa', yo: 'Yoruba',
  ar: 'Arabic', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
};
const SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(' '))]));
const SCRIPTS: Array<[string, RegExp]> = [
  ['ar', /[؀-ۿ]/g], ['ru', /[Ѐ-ӿ]/g], ['hi', /[ऀ-ॿ]/g],
  ['ja', /[぀-ヿ]/g], ['ko', /[가-힯]/g], ['zh', /[一-鿿]/g],
];
const det = (code: string): Detected => ({ code, name: NAMES[code] });

export function detectLanguage(text: string | null | undefined): Detected | null {
  const sample = (text || '').slice(0, 6000);
  const letters = sample.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (letters.length < 40) return null;
  // Other scripts first: a clear majority of letters in one script decides it. Japanese uses kanji too, so kana wins over han.
  const counts = SCRIPTS.map(([c, re]) => [c, (sample.match(re) || []).length] as const);
  const ja = counts.find(([c]) => c === 'ja')![1];
  const top = counts.filter(([c]) => !(c === 'zh' && ja > 0)).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] / letters.length > 0.4) return det(top[0] === 'zh' && ja > 0 ? 'ja' : top[0]);
  if (ja / letters.length > 0.1) return det('ja');
  const words = sample.toLowerCase().match(/[\p{L}'’]+/gu) || [];
  if (words.length < 25) return null;
  const scores = Object.entries(SETS).map(([code, set]) => [code, words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0) / words.length] as const).sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  return best[1] >= 0.12 && best[1] >= second[1] * 1.3 ? det(best[0]) : null;
}

/** The system-prompt line for a project's material. `ui` is the interface language, used only when there is no material. */
export function materialLanguageInstruction(d: Detected | null, hasMaterial: boolean): string {
  if (d) return `The learner's study material is written in ${d.name}. Write every explanation, question, answer and hint in ${d.name}, even though these instructions are in English. Keep JSON keys, code and maths notation exactly as the format requires.`;
  if (hasMaterial) return "Write in the same language as the learner's study material, not in the language of these instructions. Keep JSON keys, code and maths notation exactly as the format requires.";
  return '';
}
