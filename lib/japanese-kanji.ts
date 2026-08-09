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

type KanjiConverter = (text: string) => Promise<string>

let converterPromise: Promise<KanjiConverter> | null = null

// Detect whether the string contains any CJK ideographs (kanji). Pure kana or
// latin text needs no analyzer, so we can skip loading the heavy dictionary.
const KANJI_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export function hasKanji(text: string): boolean {
  return KANJI_RE.test(text)
}

async function buildConverter(): Promise<KanjiConverter> {
  // Import the browser dist bundles directly (the default entry targets Node).
  const KuroshiroModule = await import("kuroshiro/dist/kuroshiro.min.js")
  const AnalyzerModule = await import("kuroshiro-analyzer-kuromoji/dist/kuroshiro-analyzer-kuromoji.min.js")

  const Kuroshiro = (KuroshiroModule as any).default ?? KuroshiroModule
  const KuromojiAnalyzer = (AnalyzerModule as any).default ?? AnalyzerModule

  const kuroshiro = new Kuroshiro()
  await kuroshiro.init(new KuromojiAnalyzer({ dictPath: DICT_PATH }))

  return async (text: string) => {
    // "toHiragana" rewrites kanji into their reading while leaving existing
    // kana as-is; mode "normal" avoids furigana/okurigana markup.
    const result: string = await kuroshiro.convert(text, { to: "hiragana", mode: "normal" })
    return result
  }
}

function getConverter(): Promise<KanjiConverter> {
  if (!converterPromise) {
    converterPromise = buildConverter().catch((err) => {
      // Reset so a later attempt can retry after a transient load failure.
      converterPromise = null
      throw err
    })
  }
  return converterPromise
}

/**
 * Romanize Japanese text including kanji. Kanji are resolved to their reading
 * via kuromoji, then the whole (now all-kana) string is romanized with the
 * app's existing kana scheme. Text without kanji skips the analyzer entirely
 * and is romanized synchronously-equivalent.
 */
export async function transcribeJapaneseWithKanji(text: string): Promise<string> {
  if (!text || !hasKanji(text)) {
    return transcribeJapanese(text)
  }
  try {
    const convert = await getConverter()
    const kana = await convert(text)
    return transcribeJapanese(kana)
  } catch {
    // If the dictionary fails to load, fall back to kana-only romanization so
    // the field still updates (kanji simply pass through unchanged).
    return transcribeJapanese(text)
  }
}
