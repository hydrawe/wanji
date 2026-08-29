"use client"

import { transcribeJapanese } from "./japanese-mapping"

// Kanji-aware Japanese romanization.
//
// The app's own kana romanizer (transcribeJapanese) uses a custom Latin code
// scheme. Kuroshiro/kuromoji can't produce that scheme directly, so we use it
// only to resolve kanji readings: it rewrites the text so every kanji becomes
// its hiragana reading (kana already present is left untouched), and then the
// existing transcribeJapanese converts the all-kana string into the app's
// romaji codes. This keeps kana romanization identical to before while adding
// context-aware kanji readings.

// kuromoji requires the dictionary to be fetched at runtime. The .dat.gz files
// are served from /public so the browser can load them.
const DICT_PATH = "/kuromoji-dict"

type KuromojiToken = {
  surface_form: string
  pos: string
  pos_detail_1?: string
  reading?: string
}

type Kuroshiro = {
  convert: (text: string, opts: { to: string; mode: string }) => Promise<string>
  _analyzer: { parse: (text: string) => Promise<KuromojiToken[]> }
}

let kuroshiroPromise: Promise<Kuroshiro> | null = null

// Detect whether the string contains any CJK ideographs (kanji). Pure kana or
// latin text needs no analyzer, so we can skip loading the heavy dictionary.
const KANJI_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export function hasKanji(text: string): boolean {
  return KANJI_RE.test(text)
}

async function buildKuroshiro(): Promise<Kuroshiro> {
  // Import the browser dist bundles directly (the default entry targets Node).
  const KuroshiroModule = await import("kuroshiro/dist/kuroshiro.min.js")
  const AnalyzerModule = await import("kuroshiro-analyzer-kuromoji/dist/kuroshiro-analyzer-kuromoji.min.js")

  const KuroshiroCtor = (KuroshiroModule as any).default ?? KuroshiroModule
  const KuromojiAnalyzer = (AnalyzerModule as any).default ?? AnalyzerModule

  const kuroshiro = new KuroshiroCtor()
  await kuroshiro.init(new KuromojiAnalyzer({ dictPath: DICT_PATH }))
  return kuroshiro as Kuroshiro
}

function getKuroshiro(): Promise<Kuroshiro> {
  if (!kuroshiroPromise) {
    kuroshiroPromise = buildKuroshiro().catch((err) => {
      // Reset so a later attempt can retry after a transient load failure.
      kuroshiroPromise = null
      throw err
    })
  }
  return kuroshiroPromise
}

// Convert a katakana string (kuromoji readings are katakana) into hiragana so
// it can be fed to the app's kana romanizer. The prolonged-sound mark ー and
// any non-katakana characters are left untouched.
function katakanaToHiragana(text: string): string {
  return text.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}

// A token written in katakana is a loanword (e.g. シアトル "Seattle",
// バンクーバー "Vancouver"). Its reading should stay katakana so it romanizes
// with the app's uppercase codes; kanji and hiragana tokens use the hiragana
// reading (lowercase codes). The prolonged mark ー is ignored for detection.
const KATAKANA_RE = /[\u30a1-\u30f6]/
const HIRAGANA_OR_KANJI_RE = /[\u3040-\u309f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
function isKatakanaWord(surface: string): boolean {
  return KATAKANA_RE.test(surface) && !HIRAGANA_OR_KANJI_RE.test(surface)
}

// Kuromoji can occasionally select an incorrect reading for established
// compounds. Keep a small lexical override table for verified readings; these
// overrides are shared by romanization and IPA normalization.
const JAPANESE_READING_OVERRIDES: Record<string, string> = {
  全身性: "ぜんしんせい",
}

function applyReadingOverrides(text: string): string {
  return Object.entries(JAPANESE_READING_OVERRIDES).reduce(
    (result, [surface, reading]) => result.replaceAll(surface, reading),
    text,
  )
}

/**
 * Split Japanese text into phrase units (bunsetsu) and return each unit as an
 * all-hiragana reading. A new unit begins at each content word (noun, verb,
 * adjective, …); particles, auxiliaries and suffixes stick to the current unit.
 * A preceding prefix (接頭詞) also attaches to the following content word.
 * These units line up with sentence roles — subject, object, predicate, etc.
 */
async function readingUnits(text: string): Promise<string[]> {
  const directReading = JAPANESE_READING_OVERRIDES[text]
  if (directReading) return [directReading]

  const normalizedText = applyReadingOverrides(text)
  const kuroshiro = await getKuroshiro()
  const tokens = await kuroshiro._analyzer.parse(normalizedText)

  const units: string[] = []
  let current = ""

  for (const token of tokens) {
    const raw = token.reading && token.reading !== "*" ? token.reading : token.surface_form
    // Keep katakana loanwords as katakana (uppercase romaji); convert kanji /
    // hiragana readings to hiragana (lowercase romaji).
    const kana = isKatakanaWord(token.surface_form) ? raw : katakanaToHiragana(raw)

    if (token.pos === "記号") {
      // Keep punctuation beside the preceding word rather than creating a
      // dangling space before commas or sentence-ending marks.
      if (current) current += kana
      else if (units.length) units[units.length - 1] += kana
      else units.push(kana)
      continue
    }

    // Emit every lexical token as its own unit. This deliberately separates
    // particles (助詞), verbs (動詞), nouns/kanji (名詞), and other words with
    // independent meaning: 私は学生です -> watasi ha gakusei desu.
    if (current) units.push(current)
    current = kana
  }

  if (current) units.push(current)
  return units
}

/**
 * Romanize Japanese text including kanji, inserting spaces between phrase units
 * (bunsetsu) so the result reads as separated sentence parts — subject,
 * object, predicate, etc. Kanji are resolved to their reading via kuromoji and
 * each phrase unit is romanized with the app's existing kana scheme. Falls back
 * to spaceless kana romanization if the analyzer can't load.
 */
export async function transcribeJapaneseWithKanji(text: string): Promise<string> {
  if (!text) return ""
  try {
    const units = await readingUnits(text)
    return units.map((u) => transcribeJapanese(u)).join(" ")
  } catch {
    // If the dictionary fails to load, fall back to kana-only romanization so
    // the field still updates (kanji simply pass through unchanged).
    return transcribeJapanese(text)
  }
}

/**
 * Resolve Japanese text into an all-hiragana string, spaced at the same phrase
 * (bunsetsu) boundaries as the romaji so downstream IPA/pronunciation is broken
 * into sentence parts instead of one mashed-together string. Text without kanji
 * is still tokenized so pure-kana sentences get the same spacing. Falls back to
 * the raw text if the analyzer can't load.
 */
export async function toKanaReading(text: string): Promise<string> {
  if (!text) return ""
  try {
    const units = await readingUnits(text)
    return units.join(" ")
  } catch {
    return text
  }
}
