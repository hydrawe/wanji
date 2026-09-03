"use client"

import { useState, useEffect, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  transcribeArabic,
  transcribeLatin,
  arabicMapping,
  arabicDescriptions,
  arabicKeyboardRows,
  arabicPhrases,
  type KeyDef,
  type Phrase,
} from "@/lib/arabic-mapping"
import { transcribeArabicIpa, arabicIpa } from "@/lib/ipa-mapping"
import { Copy, Check, Trash2, Keyboard, Languages, Loader2, Bookmark, BookmarkCheck, X } from "lucide-react"

interface ArabicTranscriberProps {
  /** Display name of the script, e.g. "Arabic" or "Persian" */
  scriptName?: string
  /** MyMemory language code for translation, e.g. "ar" or "fa" */
  langCode?: string
  /** script -> Latin transcription */
  toLatin?: (text: string) => string
  /** Latin -> script transcription */
  toScript?: (text: string) => string
  /** script -> IPA phonetic transcription, shown as accessible pronunciation notes */
  toIpa?: (text: string) => string
  /** script char -> Latin code, used by the letter reference */
  mapping?: Record<string, string>
  /** script char -> description, used by the letter reference */
  descriptions?: Record<string, string>
  /** script char -> IPA symbol, used by the letter reference */
  ipaMap?: Record<string, string>
  /** Virtual keyboard layout */
  keyboardRows?: KeyDef[][]
  /** Quick-access phrases */
  phrases?: Phrase[]
  /** Placeholder for the script textarea */
  scriptPlaceholder?: string
  /** Writing direction of the script textarea. Defaults to "rtl" (Arabic/Persian);
   * set to "ltr" for left-to-right scripts like Cyrillic. */
  scriptDir?: "rtl" | "ltr"
  /** Show the Arabic diacritic/tanwin keys (a, i, u, av, iv, uv) on the keyboard.
   * Defaults to true; set to false for scripts without them (e.g. Russian). */
  showDiacritics?: boolean
  /**
   * Route script<->Chinese translations through English. MyMemory has almost
   * no direct corpus for some pairs (e.g. Persian<->Chinese), so pivoting via
   * English (which has rich corpora) yields far better results.
   */
  pivotChineseThroughEnglish?: boolean
  /** "Key Features" bullet points in the About section */
  keyFeatures?: { term: string; description: string }[]
  /** "Pronunciation Tips" bullet points in the About section */
  pronunciationTips?: { code: string; char: string; description: string }[]
}

// Arabic (default) About-section content.
const arabicKeyFeatures: { term: string; description: string }[] = [
  { term: "Capital letters", description: "represent emphatic/heavy consonants pronounced further back in the mouth" },
  {
    term: "Digraphs",
    description: 'like "tv", "dv", "sv", "gv", "sc", "dc", "tc", "zc" represent specific sounds',
  },
  { term: "Tanwin", description: '(nunation) is represented as "av", "iv", "uv"' },
  { term: "Shadda", description: "(consonant doubling) doubles the previous consonant" },
]

const arabicPronunciationTips: { code: string; char: string; description: string }[] = [
  { code: "g", char: "ع", description: 'like a surprised "a"' },
  { code: "gv", char: "غ", description: "gargling sound" },
  { code: "x", char: "ح", description: "like fogging up a window" },
  { code: "xv", char: "خ", description: "whispered gargle" },
  { code: "q", char: "ق", description: "deep in the throat" },
  { code: "r", char: "ر", description: 'like the "t" in American "water"' },
]

export function ArabicTranscriber({
  scriptName = "Arabic",
  langCode = "ar",
  toLatin = transcribeArabic,
  toScript = transcribeLatin,
  toIpa = transcribeArabicIpa,
  mapping = arabicMapping,
  descriptions = arabicDescriptions,
  ipaMap = arabicIpa,
  keyboardRows = arabicKeyboardRows,
  phrases = arabicPhrases,
  scriptPlaceholder = "اكتب النص العربي هنا...",
  scriptDir = "rtl",
  showDiacritics = true,
  pivotChineseThroughEnglish = false,
  keyFeatures = arabicKeyFeatures,
  pronunciationTips = arabicPronunciationTips,
}: ArabicTranscriberProps) {
  const [arabicText, setArabicText] = useState("")
  const [latinText, setLatinText] = useState("")
  const [englishText, setEnglishText] = useState("")
  const [chineseText, setChineseText] = useState("")
  const [copiedLatin, setCopiedLatin] = useState(false)
  const [copiedArabic, setCopiedArabic] = useState(false)
  const [copiedEnglish, setCopiedEnglish] = useState(false)
  const [copiedChinese, setCopiedChinese] = useState(false)
  const [copiedIpa, setCopiedIpa] = useState(false)
  const [chunkResults, setChunkResults] = useState<{ text: string; translation: string; attribute: string }[]>([])
  const [isAnalyzingNouns, setIsAnalyzingNouns] = useState(false)
  const [nounAnalysisError, setNounAnalysisError] = useState("")
  const [showKeyboard, setShowKeyboard] = useState(true)
  const [isTranslating, setIsTranslating] = useState(false)
  // Tracks which field the user last edited so we know the translation direction
  const [source, setSource] = useState<"latin" | "arabic" | "english" | "chinese" | null>(null)
  const lastProcessedRef = useRef<string>("")

  // Saved Latin-text bookmarks, persisted per script so the user can build a
  // personal review list on this device (no account required).
  const bookmarksKey = `wei-bookmarks-${scriptName.toLowerCase()}`
  const [bookmarks, setBookmarks] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(bookmarksKey)
      setBookmarks(raw ? JSON.parse(raw) : [])
    } catch {
      setBookmarks([])
    }
  }, [bookmarksKey])

  const persistBookmarks = (next: string[]) => {
    setBookmarks(next)
    try {
      localStorage.setItem(bookmarksKey, JSON.stringify(next))
    } catch {
      // Ignore storage errors (e.g. private mode) — bookmarks stay in memory.
    }
  }

  const trimmedLatin = latinText.trim()
  const isBookmarked = trimmedLatin !== "" && bookmarks.includes(trimmedLatin)

  const handleToggleBookmark = () => {
    if (!trimmedLatin) return
    if (bookmarks.includes(trimmedLatin)) {
      persistBookmarks(bookmarks.filter((b) => b !== trimmedLatin))
    } else {
      persistBookmarks([trimmedLatin, ...bookmarks])
    }
  }

  const handleLoadBookmark = (text: string) => {
    setSource("latin")
    setLatinText(text)
    setArabicText(toScript(text))
  }

  const handleRemoveBookmark = (text: string) => {
    persistBookmarks(bookmarks.filter((b) => b !== text))
  }

  // IPA phonetic transcription of the current script text, shown as accessible
  // pronunciation notes so the pronunciation is readable (including by screen
  // readers) without relying on audio.
  const ipaText = arabicText.trim() ? toIpa(arabicText) : ""

  useEffect(() => {
    const text = arabicText.trim()
    if (!text) {
      setChunkResults([])
      setNounAnalysisError("")
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsAnalyzingNouns(true)
      setNounAnalysisError("")
      try {
        const response = await fetch("/api/arabic-nouns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || "Analysis failed")
        if (!cancelled) setChunkResults(Array.isArray(data?.chunks) ? data.chunks : [])
      } catch {
        if (!cancelled) {
          setChunkResults([])
          setNounAnalysisError("Noun analysis is unavailable right now.")
        }
      } finally {
        if (!cancelled) setIsAnalyzingNouns(false)
      }
    }, 800)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [arabicText])

  const fetchTranslation = async (text: string, pair: string): Promise<string> => {
    try {
      // MyMemory's free API returns very noisy community entries for some
      // languages (e.g. Persian -> "ENGLISH" for فارسی). Google's public
      // translate endpoint is far more accurate and needs no API key.
      const [sl, tl] = pair.split("|")
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`
      )
      if (!res.ok) return ""
      const data = await res.json()
      // Response shape: [[[ "translated", "source", ... ], ...], ...]
      if (!Array.isArray(data?.[0])) return ""
      return data[0].map((seg: unknown[]) => (typeof seg?.[0] === "string" ? seg[0] : "")).join("")
    } catch {
      return ""
    }
  }

  // Bidirectional translation: the edited field drives the other three
  useEffect(() => {
    if (source === null) return

    const sourceText =
      source === "english" ? englishText : source === "chinese" ? chineseText : arabicText
    const key = `${source}:${sourceText}`
    if (key === lastProcessedRef.current) return

    const run = async () => {
      lastProcessedRef.current = key

      // Clear everything if the source field is empty
      if (!sourceText.trim()) {
        if (source !== "arabic" && source !== "latin") {
          setArabicText("")
          setLatinText("")
        }
        if (source !== "english") setEnglishText("")
        if (source !== "chinese") setChineseText("")
        return
      }

      setIsTranslating(true)
      try {
        if (source === "latin" || source === "arabic") {
          const en = await fetchTranslation(arabicText, `${langCode}|en`)
          setEnglishText(en)
          // Pivot script->Chinese through English when the direct pair is poor.
          const zh = pivotChineseThroughEnglish
            ? await fetchTranslation(en, "en|zh-CN")
            : await fetchTranslation(arabicText, `${langCode}|zh-CN`)
          setChineseText(zh)
        } else if (source === "english") {
          const [ar, zh] = await Promise.all([
            fetchTranslation(englishText, `en|${langCode}`),
            fetchTranslation(englishText, "en|zh-CN"),
          ])
          setArabicText(ar)
          setLatinText(toLatin(ar))
          setChineseText(zh)
        } else if (source === "chinese") {
          const en = await fetchTranslation(chineseText, "zh|en")
          setEnglishText(en)
          // Pivot Chinese->script through English when the direct pair is poor.
          const ar = pivotChineseThroughEnglish
            ? await fetchTranslation(en, `en|${langCode}`)
            : await fetchTranslation(chineseText, `zh|${langCode}`)
          setArabicText(ar)
          setLatinText(toLatin(ar))
        }
      } finally {
        setIsTranslating(false)
      }
    }

    const debounceTimer = setTimeout(run, 600)
    return () => clearTimeout(debounceTimer)
  }, [source, arabicText, englishText, chineseText, langCode, toLatin, pivotChineseThroughEnglish])

  const handleLatinChange = (value: string) => {
    setSource("latin")
    setLatinText(value)
    setArabicText(toScript(value))
  }

  const handleArabicChange = (value: string) => {
    setSource("arabic")
    setArabicText(value)
    setLatinText(toLatin(value))
  }

  const handleEnglishChange = (value: string) => {
    setSource("english")
    setEnglishText(value)
  }

  const handleChineseChange = (value: string) => {
    setSource("chinese")
    setChineseText(value)
  }

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textArea = document.createElement("textarea")
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = () => {
    setArabicText("")
    setLatinText("")
    setEnglishText("")
    setChineseText("")
    setSource(null)
    lastProcessedRef.current = ""
  }

  const handleKeyPress = (arabic: string, latin: string) => {
    setSource("arabic")
    setArabicText((prev) => prev + arabic)
    setLatinText((prev) => prev + latin)
  }

  const handleBackspace = () => {
    setSource("arabic")
    setArabicText((prev) => [...prev].slice(0, -1).join(""))
    // For latin, we need to handle multi-char sequences
    setLatinText((prev) => {
      // Simple approach: remove last character
      return prev.slice(0, -1)
    })
  }

  const handleSpace = () => {
    setSource("arabic")
    setArabicText((prev) => prev + " ")
    setLatinText((prev) => prev + " ")
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Reversible conversion note */}
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">
            The conversion between Latin Text and {scriptName} Text is fully reversible. You can type in
            either Latin Text or {scriptName} Text, and the other updates automatically.
          </p>

          {/* Side by side: Latin on left, script on right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Latin Text Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="latin-input" className="text-sm font-medium">
                  Latin Text
                </label>
                {latinText && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleToggleBookmark}
                      title={isBookmarked ? "Remove from saved bookmarks" : "Save this Latin text"}
                      aria-pressed={isBookmarked}
                    >
                      {isBookmarked ? (
                        <>
                          <BookmarkCheck className="h-4 w-4 mr-1" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Bookmark className="h-4 w-4 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(latinText, setCopiedLatin)}>
                      {copiedLatin ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
              <Textarea
                id="latin-input"
                placeholder="Type Latin transliteration here..."
                className="min-h-32 !text-[20px] font-mono !leading-normal"
                value={latinText}
                onChange={(e) => handleLatinChange(e.target.value)}
              />
            </div>

            {/* Right: Script Text Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="arabic-input" className="text-sm font-medium">
                  {scriptName} Text
                </label>
                {arabicText && (
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(arabicText, setCopiedArabic)}>
                    {copiedArabic ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                )}
              </div>
              <Textarea
                id="arabic-input"
                placeholder={scriptPlaceholder}
                className={`min-h-32 !text-[30px] !leading-normal ${
                  scriptDir === "rtl" ? "text-right font-arabic" : "text-left"
                }`}
                dir={scriptDir}
                value={arabicText}
                onChange={(e) => handleArabicChange(e.target.value)}
              />
              {ipaText && (
                <div className="rounded-md border bg-muted/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Pronunciation (IPA)
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => copyToClipboard(`/${ipaText}/`, setCopiedIpa)}
                    >
                      {copiedIpa ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span className="sr-only">Copy IPA pronunciation</span>
                    </Button>
                  </div>
                  <p
                    lang="und-fonipa"
                    aria-label={`IPA pronunciation: ${ipaText}`}
                    className="mt-1 font-mono text-lg leading-relaxed text-foreground"
                    dir="ltr"
                  >
                    {`/${ipaText}/`}
                  </p>
                </div>
              )}
            </div>
          </div>

              {arabicText.trim() && (
                <section aria-labelledby="arabic-nouns-heading" className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 id="arabic-nouns-heading" className="text-sm font-semibold">Sentence chunk analysis</h2>
                      <p className="text-xs text-muted-foreground">AI-assisted Arabic grammar analysis</p>
                    </div>
                    {isAnalyzingNouns && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Analyzing nouns" />}
                  </div>
                  {nounAnalysisError ? (
                    <p className="text-sm text-muted-foreground">{nounAnalysisError}</p>
                  ) : chunkResults.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border bg-background">
                      <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr><th className="px-3 py-2 font-medium">Chunk</th><th className="px-3 py-2 font-medium">Translation</th><th className="px-3 py-2 font-medium">Attribute</th></tr>
                        </thead>
                        <tbody className="divide-y">
                          {chunkResults.map((chunk, index) => (
                            <tr key={`${chunk.text}-${index}`}>
                              <td lang="ar" dir="rtl" className="px-3 py-2 text-base">{chunk.text}</td>
                              <td className="px-3 py-2 text-foreground">{chunk.translation}</td>
                              <td className="px-3 py-2 text-muted-foreground">{chunk.attribute}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : isAnalyzingNouns ? (
                    <p className="text-sm text-muted-foreground">Analyzing sentence chunks…</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No nouns identified.</p>
                  )}
                </section>
              )}

              {/* Common Phrases Bookmarks */}
              <div className="flex gap-2 flex-wrap items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Bookmark className="h-3.5 w-3.5" />
              Try:
            </span>
            {phrases.map((phrase, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSource("arabic")
                  setArabicText(phrase.arabic)
                  setLatinText(phrase.latin)
                }}
                title={`${phrase.english}: ${phrase.arabic}`}
              >
                {phrase.english}
              </Button>
            ))}
            {(arabicText || latinText) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-muted-foreground ml-auto"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Saved bookmarks - user's personal review list */}
          {bookmarks.length > 0 && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <BookmarkCheck className="h-4 w-4" />
                Saved for review
                <span className="text-xs font-normal text-muted-foreground">({bookmarks.length})</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {bookmarks.map((b) => (
                  <div
                    key={b}
                    className="group inline-flex items-center rounded-md border bg-background overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadBookmark(b)}
                      className="px-2.5 py-1 font-mono text-xs hover:bg-muted transition-colors max-w-56 truncate"
                      title={`Load: ${b}`}
                    >
                      {b}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveBookmark(b)}
                      aria-label={`Remove bookmark ${b}`}
                      className="px-1.5 py-1 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors border-l"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Translation textboxes - editable and copiable */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Translations</span>
              {isTranslating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* English */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="english-input" className="text-sm font-medium">
                    English
                  </label>
                  {englishText && (
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(englishText, setCopiedEnglish)}>
                      {copiedEnglish ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="english-input"
                  placeholder="Type English here..."
                  className="min-h-24 !text-[18px] !leading-normal"
                  value={englishText}
                  onChange={(e) => handleEnglishChange(e.target.value)}
                />
              </div>

              {/* Chinese */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="chinese-input" className="text-sm font-medium">
                    Chinese
                  </label>
                  {chineseText && (
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(chineseText, setCopiedChinese)}>
                      {copiedChinese ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="chinese-input"
                  placeholder="在此输入中文..."
                  className="min-h-24 !text-[18px] !leading-normal"
                  value={chineseText}
                  onChange={(e) => handleChineseChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Virtual Keyboard */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                Latin Keyboard
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKeyboard(!showKeyboard)}
              >
                {showKeyboard ? "Hide" : "Show"}
              </Button>
            </div>
            {showKeyboard && (
              <div className="p-2 sm:p-4 border rounded-lg bg-muted/30 space-y-1.5 sm:space-y-2">
                {keyboardRows.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex flex-wrap gap-1 sm:gap-1.5 justify-center">
                    {row.map((key) => (
                      <Button
                        key={key.latin}
                        variant="outline"
                        size="sm"
                        className="min-w-10 sm:min-w-11 h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2.5"
                        onClick={() => handleKeyPress(key.arabic, key.latin)}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">{key.label}</span>
                        <span className="text-base sm:text-xl font-arabic">{key.arabic}</span>
                      </Button>
                    ))}
                  </div>
                ))}
                {/* Bottom row with diacritics, space, and delete */}
                <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center mt-2 sm:mt-2.5">
                  {showDiacritics && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-10 sm:min-w-11 h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2.5"
                        onClick={() => handleKeyPress('َ', 'a')}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">a</span>
                        <span className="text-base sm:text-xl font-arabic">َ</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-10 sm:min-w-11 h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2.5"
                        onClick={() => handleKeyPress('ِ', 'i')}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">i</span>
                        <span className="text-base sm:text-xl font-arabic">ِ</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-10 sm:min-w-11 h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2.5"
                        onClick={() => handleKeyPress('ُ', 'u')}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">u</span>
                        <span className="text-base sm:text-xl font-arabic">ُ</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-10 sm:min-w-11 h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2.5"
                        onClick={() => handleKeyPress('ً', 'av')}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">av</span>
                        <span className="text-base sm:text-xl font-arabic">ً</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-10 sm:min-w-11 h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2.5"
                        onClick={() => handleKeyPress('ٍ', 'iv')}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">iv</span>
                        <span className="text-base sm:text-xl font-arabic">ٍ</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-10 sm:min-w-11 h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2.5"
                        onClick={() => handleKeyPress('ٌ', 'uv')}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">uv</span>
                        <span className="text-base sm:text-xl font-arabic">ٌ</span>
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-12 sm:h-14 px-4 sm:px-8 text-xs sm:text-sm"
                    onClick={handleSpace}
                  >
                    Space
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-12 sm:h-14 px-3 sm:px-4 text-xs sm:text-sm"
                    onClick={handleBackspace}
                  >
                    Del
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* About This Tool */}
      <Card>
        <CardHeader>
          <CardTitle>About This Tool</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <p>
            This transcription tool converts {scriptName} script to Latin text using the
            <strong> Wei transliteration system</strong>. This system is designed to be
            readable for novice learners while preserving important phonetic distinctions.
          </p>
          <h4>Key Features:</h4>
          <ul>
            {keyFeatures.map((feature, i) => (
              <li key={i}>
                <strong>{feature.term} </strong> {feature.description}
              </li>
            ))}
          </ul>
          <h4>Pronunciation Tips:</h4>
          <ul>
            {pronunciationTips.map((tip, i) => (
              <li key={i}>
                <strong>{tip.code}</strong> ({tip.char}) - {tip.description}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            Learn more at{" "}
            <a
              href="https://www.hydrawe.org/pathways/Wei/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              hydrawe.org/pathways/Wei
            </a>
          </p>
        </CardContent>
      </Card>

      {/* Script Letter Reference */}
      <Card>
        <CardHeader>
          <CardTitle>{scriptName} Letter Reference</CardTitle>
          <CardDescription>
            Complete mapping of {scriptName} letters to their Latin transliteration and IPA pronunciation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(descriptions).map(([arabic, description]) => (
              <div
                key={arabic}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => setArabicText((prev) => prev + arabic)}
              >
                <span className="text-3xl font-arabic w-10 text-center">{arabic}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-primary">
                      {mapping[arabic] || "—"}
                    </span>
                    {ipaMap[arabic] ? (
                      <span
                        lang="und-fonipa"
                        aria-label={`IPA pronunciation: ${ipaMap[arabic]}`}
                        className="font-mono text-xs text-muted-foreground"
                      >
                        /{ipaMap[arabic]}/
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {description.split(" - ")[0]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
