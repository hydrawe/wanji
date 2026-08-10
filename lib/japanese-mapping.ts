// Japanese (Kana) transliteration mapping.
//
// Romaji codes map directly to hiragana (lowercase codes) and katakana
// (uppercase codes). Conversion is a longest-match lookup in each direction,
// so it is fully reversible for the canonical codes below.

import type { KeyDef, Phrase } from "./arabic-mapping"
import type { ReferenceItem } from "./korean-mapping"

export type { KeyDef, Phrase, ReferenceItem }

// [latin code, kana] pairs. Hiragana uses lowercase codes, katakana uppercase.
const HIRAGANA: [string, string][] = [
  ["a", "あ"], ["i", "い"], ["u", "う"], ["e", "え"], ["o", "お"],
  ["ka", "か"], ["ki", "き"], ["ku", "く"], ["ke", "け"], ["ko", "こ"],
  ["ga", "が"], ["gi", "ぎ"], ["gu", "ぐ"], ["ge", "げ"], ["go", "ご"],
  ["sa", "さ"], ["si", "し"], ["su", "す"], ["se", "せ"], ["so", "そ"],
  ["za", "ざ"], ["zi", "じ"], ["zu", "ず"], ["ze", "ぜ"], ["zo", "ぞ"],
  ["ta", "た"], ["ti", "ち"], ["tu", "つ"], ["te", "て"], ["to", "と"],
  ["da", "だ"], ["di", "ぢ"], ["du", "づ"], ["de", "で"], ["do", "ど"],
  ["ha", "は"], ["hi", "ひ"], ["hu", "ふ"], ["he", "へ"], ["ho", "ほ"],
  ["ba", "ば"], ["bi", "び"], ["bu", "ぶ"], ["be", "べ"], ["bo", "ぼ"],
  ["pa", "ぱ"], ["pi", "ぴ"], ["pu", "ぷ"], ["pe", "ぺ"], ["po", "ぽ"],
  ["ma", "ま"], ["mi", "み"], ["mu", "む"], ["me", "め"], ["mo", "も"],
  ["na", "な"], ["ni", "に"], ["nu", "ぬ"], ["ne", "ね"], ["no", "の"],
  ["ra", "ら"], ["ri", "り"], ["ru", "る"], ["re", "れ"], ["ro", "ろ"],
  ["ya", "や"], ["yu", "ゆ"], ["yo", "よ"],
  ["wa", "わ"], ["wo", "を"], ["n", "ん"],
  ["ac", "ぁ"], ["ic", "ぃ"], ["uc", "ぅ"], ["ec", "ぇ"], ["oc", "ぉ"], ["q", "っ"],
  ["ia", "ゃ"], ["iu", "ゅ"], ["io", "ょ"],
]

const KATAKANA: [string, string][] = [
  ["A", "ア"], ["I", "イ"], ["U", "ウ"], ["E", "エ"], ["O", "オ"],
  ["KA", "カ"], ["KI", "キ"], ["KU", "ク"], ["KE", "ケ"], ["KO", "コ"],
  ["GA", "ガ"], ["GI", "ギ"], ["GU", "グ"], ["GE", "ゲ"], ["GO", "ゴ"],
  ["SA", "サ"], ["SI", "シ"], ["SU", "ス"], ["SE", "セ"], ["SO", "ソ"],
  ["ZA", "ザ"], ["ZI", "ジ"], ["ZU", "ズ"], ["ZE", "ゼ"], ["ZO", "ゾ"],
  ["TA", "タ"], ["TI", "チ"], ["TU", "ツ"], ["TE", "テ"], ["TO", "ト"],
  ["DA", "ダ"], ["DI", "ヂ"], ["DU", "ヅ"], ["DE", "デ"], ["DO", "ド"],
  ["HA", "ハ"], ["HI", "ヒ"], ["HU", "フ"], ["HE", "ヘ"], ["HO", "ホ"],
  ["BA", "バ"], ["BI", "ビ"], ["BU", "ブ"], ["BE", "ベ"], ["BO", "ボ"],
  ["PA", "パ"], ["PI", "ピ"], ["PU", "プ"], ["PE", "ペ"], ["PO", "ポ"],
  ["MA", "マ"], ["MI", "ミ"], ["MU", "ム"], ["ME", "メ"], ["MO", "モ"],
  ["NA", "ナ"], ["NI", "ニ"], ["NU", "ヌ"], ["NE", "ネ"], ["NO", "ノ"],
  ["RA", "ラ"], ["RI", "リ"], ["RU", "ル"], ["RE", "レ"], ["RO", "ロ"],
  ["YA", "ヤ"], ["YU", "ユ"], ["YO", "ヨ"],
  ["WA", "ワ"], ["WO", "ヲ"], ["N", "ン"],
  ["AC", "ァ"], ["IC", "ィ"], ["UC", "ゥ"], ["EC", "ェ"], ["OC", "ォ"], ["Q", "ッ"],
  ["IA", "ャ"], ["IU", "ュ"], ["IO", "ョ"],
  ["x", "ー"], ["X", "ー"], // prolonged sound mark
]

const ALL: [string, string][] = [...HIRAGANA, ...KATAKANA]

// latin code -> kana
const CODE_TO_KANA = new Map<string, string>(ALL)
// kana -> latin code (first definition wins; kana are unique across the set)
const KANA_TO_CODE = new Map<string, string>()
for (const [code, kana] of ALL) {
  if (!KANA_TO_CODE.has(kana)) KANA_TO_CODE.set(kana, code)
}
// The prolonged-sound mark is a katakana mark, so romanize it with the
// uppercase code to keep katakana loanwords fully uppercase
// (e.g. バンクーバー -> BANKUXBAX). Both "x" and "X" still map back to ー.
KANA_TO_CODE.set("ー", "X")

const MAX_CODE_LEN = 2

// Latin (romaji) -> Kana, longest-match from left.
export function transcribeJapaneseLatin(text: string): string {
  let output = ""
  let i = 0
  while (i < text.length) {
    let matched = false
    for (let len = MAX_CODE_LEN; len >= 1; len--) {
      const sub = text.slice(i, i + len)
      const kana = CODE_TO_KANA.get(sub)
      if (kana) {
        output += kana
        i += len
        matched = true
        break
      }
    }
    if (!matched) {
      output += text[i]
      i++
    }
  }
  return output
}

// Kana -> Latin (romaji).
export function transcribeJapanese(text: string): string {
  let output = ""
  for (const ch of text) {
    output += KANA_TO_CODE.get(ch) ?? ch
  }
  return output
}

// --- Virtual keyboard -------------------------------------------------------
function keys(pairs: [string, string][]): KeyDef[] {
  return pairs.map(([code, kana]) => ({ latin: code, arabic: kana, label: code }))
}

export const japaneseKeyboardRows: KeyDef[][] = [
  // Hiragana
  keys(HIRAGANA.slice(0, 5)), // vowels
  keys(HIRAGANA.slice(5, 20)), // k / g / s rows
  keys(HIRAGANA.slice(20, 35)), // z / t / d rows
  keys(HIRAGANA.slice(35, 50)), // h / b / p rows
  keys(HIRAGANA.slice(50, 65)), // m / n / r rows
  // y, w, small kana (excluding ん), ん (n), then prolonged mark (ー, shared with katakana) as the last key
  keys([...HIRAGANA.slice(65, 70), ...HIRAGANA.slice(71), HIRAGANA[70], KATAKANA[80]]),
  // Katakana
  keys(KATAKANA.slice(0, 5)), // vowels
  keys(KATAKANA.slice(5, 20)), // k / g / s rows
  keys(KATAKANA.slice(20, 35)), // z / t / d rows
  keys(KATAKANA.slice(35, 50)), // h / b / p rows
  keys(KATAKANA.slice(50, 65)), // m / n / r rows
  // y, w, small kana (excluding ン), ン (n), then prolonged mark (ー, uppercase "X") as the last key
  keys([...KATAKANA.slice(65, 70), ...KATAKANA.slice(71, 80), KATAKANA[70], KATAKANA[81]]),
]

// --- Letter reference -------------------------------------------------------
export const japaneseReference: ReferenceItem[] = [
  ...HIRAGANA.map(([code, kana]) => ({ char: kana, latin: code, description: "Hiragana" })),
  ...KATAKANA.filter(([, kana]) => kana !== "ー").map(([code, kana]) => ({
    char: kana,
    latin: code,
    description: "Katakana",
  })),
  { char: "ー", latin: "X", description: "Long vowel mark (katakana)" },
]

// Row-based reference for the gojūon table layout. Each row has 5 columns
// aligned to the a-i-u-e-o vowels; `null` marks an empty column so irregular
// rows sit under the correct vowel (e.g. ya/yu/yo in the a/u/o columns).
type RefCell = ReferenceItem | null
function kanaRows(pairs: [string, string][], description: string): RefCell[][] {
  const toItem = ([code, kana]: [string, string]): ReferenceItem => ({ char: kana, latin: code, description })
  const at = (index: number): RefCell => (pairs[index] ? toItem(pairs[index]) : null)
  const rows: RefCell[][] = []

  // 13 complete a-i-u-e-o rows (a … ro), indices 0-64.
  for (let i = 0; i < 65; i += 5) rows.push(pairs.slice(i, i + 5).map(toItem))

  // ya(65) yu(66) yo(67) -> a, u, o columns.
  rows.push([at(65), null, at(66), null, at(67)])
  // Small ya/yu/yo: ia(77) iu(78) io(79) -> a, u, o columns.
  rows.push([at(77), null, at(78), null, at(79)])
  // wa(68) wo(69) -> a, o columns.
  rows.push([at(68), null, null, null, at(69)])
  // Small vowels ac ic uc ec oc (71-75) fill the 5 columns. Kept last so that
  // "oc" sits directly before the n / sokuon subsection (oc -> n -> q).
  rows.push(pairs.slice(71, 76).map(toItem))

  return rows
}

// n(70) and q(76 = sokuon helper) grouped into their own subsection per script.
function specialRow(pairs: [string, string][], description: string): RefCell[][] {
  const toItem = ([code, kana]: [string, string]): ReferenceItem => ({ char: kana, latin: code, description })
  return [[toItem(pairs[70]), toItem(pairs[76])]]
}

export const japaneseReferenceRows: { description: string; rows: RefCell[][] }[] = [
  { description: "Hiragana", rows: kanaRows(HIRAGANA, "Hiragana") },
  { description: "Hiragana — n / sokuon", rows: specialRow(HIRAGANA, "Hiragana") },
  { description: "Katakana", rows: kanaRows(KATAKANA, "Katakana") },
  { description: "Katakana — n / sokuon", rows: specialRow(KATAKANA, "Katakana") },
  { description: "Long vowel mark", rows: [[{ char: "ー", latin: "X", description: "Long vowel mark (katakana)" }]] },
]

// --- Common phrases ---------------------------------------------------------
export const japanesePhrases: Phrase[] = [
  { english: "Hello", arabic: "こんにちは", latin: transcribeJapanese("こんにちは") },
  { english: "Thank you", arabic: "ありがとう", latin: transcribeJapanese("ありがとう") },
  { english: "Japanese", arabic: "にほんご", latin: transcribeJapanese("にほんご") },
]

// --- IPA phonetic transcription ---------------------------------------------
// Per-kana IPA using standard Tokyo-dialect values. Both hiragana and katakana
// share the same sounds, so the map is keyed by the kana character.
const KANA_IPA_PAIRS: [string, string][] = [
  ["あ", "a"], ["い", "i"], ["う", "ɯ"], ["え", "e"], ["お", "o"],
  ["か", "ka"], ["き", "ki"], ["く", "kɯ"], ["け", "ke"], ["こ", "ko"],
  ["が", "ɡa"], ["ぎ", "ɡi"], ["ぐ", "ɡɯ"], ["げ", "ɡe"], ["ご", "ɡo"],
  ["さ", "sa"], ["し", "ɕi"], ["す", "sɯ"], ["せ", "se"], ["そ", "so"],
  ["ざ", "dza"], ["じ", "dʑi"], ["ず", "dzɯ"], ["ぜ", "dze"], ["ぞ", "dzo"],
  ["た", "ta"], ["ち", "tɕi"], ["つ", "tsɯ"], ["て", "te"], ["と", "to"],
  ["だ", "da"], ["ぢ", "dʑi"], ["づ", "dzɯ"], ["で", "de"], ["ど", "do"],
  ["は", "ha"], ["ひ", "çi"], ["ふ", "ɸɯ"], ["へ", "he"], ["ほ", "ho"],
  ["ば", "ba"], ["び", "bi"], ["ぶ", "bɯ"], ["べ", "be"], ["ぼ", "bo"],
  ["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pɯ"], ["ぺ", "pe"], ["ぽ", "po"],
  ["ま", "ma"], ["み", "mi"], ["む", "mɯ"], ["め", "me"], ["も", "mo"],
  ["な", "na"], ["に", "ɲi"], ["ぬ", "nɯ"], ["ね", "ne"], ["の", "no"],
  ["ら", "ɾa"], ["り", "ɾi"], ["る", "ɾɯ"], ["れ", "ɾe"], ["ろ", "ɾo"],
  ["や", "ja"], ["ゆ", "jɯ"], ["よ", "jo"],
  ["わ", "wa"], ["を", "o"], ["ん", "ɴ"],
  ["ぁ", "a"], ["ぃ", "i"], ["ぅ", "ɯ"], ["ぇ", "e"], ["ぉ", "o"],
  ["ゃ", "ja"], ["ゅ", "jɯ"], ["ょ", "jo"],
]

// Katakana share sounds with hiragana: derive their IPA from the code pairing.
const HIRA_BY_CODE = new Map(HIRAGANA.map(([code, kana]) => [code.toLowerCase(), kana]))
export const japaneseIpa: Record<string, string> = {}
for (const [kana, ipa] of KANA_IPA_PAIRS) japaneseIpa[kana] = ipa
for (const [code, kana] of KATAKANA) {
  const hira = HIRA_BY_CODE.get(code.toLowerCase())
  if (hira && japaneseIpa[hira] !== undefined) japaneseIpa[kana] = japaneseIpa[hira]
}

// Small y-kana that palatalize the preceding consonant (きゃ -> kʲa).
const SMALL_Y: Record<string, string> = { "ゃ": "a", "ゅ": "ɯ", "ょ": "o", "ャ": "a", "ュ": "ɯ", "ョ": "o" }
const isSokuon = (ch: string) => ch === "っ" || ch === "ッ"
const isLongMark = (ch: string) => ch === "ー"

// Kana -> IPA. Handles palatalization, gemination (っ), long vowels (ー) and
// the syllabic nasal (ん), so the pronunciation reads naturally.
export function transcribeJapaneseIpa(text: string): string {
  let out = ""
  const chars = [...text]

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = chars[i + 1]

    if (isSokuon(ch)) {
      // Geminate: double the first consonant of the next syllable.
      const nextIpa = next ? japaneseIpa[next] : undefined
      const m = nextIpa?.match(/^[^aeiouɯ]+/)
      if (m) out += m[0]
      continue
    }

    if (isLongMark(ch)) {
      out += "ː"
      continue
    }

    const ipa = japaneseIpa[ch]
    if (ipa === undefined) {
      out += ch
      continue
    }

    // Palatalize when followed by a small y-kana (e.g. き + ゃ -> kʲa).
    if (next && SMALL_Y[next]) {
      const base = ipa.replace(/[aeiouɯ]$/, "")
      out += base + "ʲ" + SMALL_Y[next]
      i++
      continue
    }

    out += ipa
  }

  return out
}
