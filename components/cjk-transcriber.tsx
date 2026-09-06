"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { KeyDef, Phrase } from "@/lib/arabic-mapping"
import type { ReferenceItem } from "@/lib/korean-mapping"
import { Copy, Check, Trash2, Keyboard, Languages, Loader2, Bookmark, BookmarkCheck, X } from "lucide-react"

interface CjkTranscriberProps {
  /** Display name of the script, e.g. "Korean" or "Japanese" */
  scriptName: string
  /** Google Translate language code, e.g. "ko" or "ja" */
  langCode: string
  /** script -> Latin transcription */
  toLatin: (text: string) => string
  /** Optional async script -> Latin transcription. When provided it is used
   * instead of `toLatin` for converting script into Latin (e.g. Japanese needs
   * to resolve kanji readings via an async analyzer). `toLatin` is still used
   * as the synchronous fallback/initial value. */
  toLatinAsync?: (text: string) => Promise<string>
  /** Latin -> script transcription (composes syllables/kana) */
  toScript: (text: string) => string
  /** Virtual keyboard layout */
  keyboardRows: KeyDef[][]
  /** Quick-access phrases */
  phrases: Phrase[]
  /** Letter reference entries */
  reference: ReferenceItem[]
  /** Placeholder for the script textarea */
  scriptPlaceholder: string
  /** Title for the letter reference card */
  referenceTitle: string
  /** Optional row-based reference layout (e.g. the Japanese gojūon table). When
   * provided, each row renders as a 5-column grid aligned to the a-i-u-e-o
   * vowels; `null` cells mark empty columns. Takes precedence over `reference`. */
  referenceRows?: { description: string; rows: (ReferenceItem | null)[][] }[]
  /** script -> IPA phonetic transcription, shown as accessible pronunciation notes */
  toIpa?: (text: string) => string
  /** Optional async normalization of the script before IPA/pronunciation is
   * computed. Japanese uses this to resolve kanji into their kana reading so
   * the IPA reflects the actual pronunciation instead of the kanji glyphs. */
  toPhoneticScriptAsync?: (text: string) => Promise<string>
  /** script char -> IPA symbol, shown in the letter reference */
  ipaMap?: Record<string, string>
  /** When set, the keyboard renders each row as a fixed N-column grid on all
   * screen sizes (e.g. 5 for the Japanese gojūon a-i-u-e-o layout). Defaults to
   * a responsive wrapping layout. */
  keyboardColumns?: number
  /** Enables a Caps toggle that splits `keyboardRows` into a lowercase set
   * (shown by default) and an uppercase set. Used by Japanese to switch between
   * hiragana (lowercase) and katakana (uppercase) without showing every key. */
  keyboardCase?: {
    /** Number of leading rows that make up the lowercase set; the rest are uppercase */
    lowerCount: number
    /** Label for the lowercase set, e.g. "Hiragana" */
    lowerLabel: string
    /** Label for the uppercase set, e.g. "Katakana" */
    upperLabel: string
    /** Short helper note shown below the keyboard */
    note?: string
  }
}

type Source = "latin" | "script" | "english" | "chinese" | null

export function CjkTranscriber({
  scriptName,
  langCode,
  toLatin,
  toLatinAsync,
  toScript,
  keyboardRows,
  phrases,
  reference,
  scriptPlaceholder,
  referenceTitle,
  referenceRows,
  toIpa,
  toPhoneticScriptAsync,
  ipaMap,
  keyboardColumns,
  keyboardCase,
}: CjkTranscriberProps) {
  const [scriptText, setScriptText] = useState("")
  // The script normalized for pronunciation (kanji resolved to kana). Falls back
  // to the raw script until the async resolver returns.
  const [phoneticScript, setPhoneticScript] = useState("")
  const [latinText, setLatinText] = useState("")
  const [englishText, setEnglishText] = useState("")
  const [chineseText, setChineseText] = useState("")
  const [vocabularyRows, setVocabularyRows] = useState<{ source: string; latin: string; english: string }[]>([])
  const [copiedLatin, setCopiedLatin] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
  const [copiedEnglish, setCopiedEnglish] = useState(false)
  const [copiedChinese, setCopiedChinese] = useState(false)
  const [copiedIpa, setCopiedIpa] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(true)
  const [caps, setCaps] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [source, setSource] = useState<Source>(null)
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
    setScriptText(toScript(text))
  }

  const handleRemoveBookmark = (text: string) => {
    persistBookmarks(bookmarks.filter((b) => b !== text))
  }

  // When a case split is configured, only show one half of the keyboard at a
  // time: the lowercase set (e.g. hiragana) by default, or the uppercase set
  // (e.g. katakana) when Caps is on.
  const displayedRows = keyboardCase
    ? caps
      ? keyboardRows.slice(keyboardCase.lowerCount)
      : keyboardRows.slice(0, keyboardCase.lowerCount)
    : keyboardRows

  // IPA phonetic transcription, shown as accessible pronunciation notes so the
  // pronunciation is readable without audio. When an async phonetic resolver is
  // provided (Japanese kanji -> kana), IPA is computed from that resolved kana
  // so it reflects the actual sound rather than the kanji glyphs.
  const scriptForIpa = toPhoneticScriptAsync ? phoneticScript : scriptText
  const ipaText = toIpa && scriptForIpa.trim() ? toIpa(scriptForIpa) : ""

  // Group the flat reference list into subsections by their description
  // (e.g. Initial consonant / Vowel / Final consonant), preserving first-seen order.
  const referenceSections = useMemo(() => {
    const sections: { description: string; items: ReferenceItem[] }[] = []
    for (const item of reference) {
      let section = sections.find((s) => s.description === item.description)
      if (!section) {
        section = { description: item.description, items: [] }
        sections.push(section)
      }
      section.items.push(item)
    }
    return sections
  }, [reference])

  const renderReferenceCell = (item: ReferenceItem, index: number) => (
    <div
      key={`${item.char}-${item.latin}-${index}`}
      className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-3 p-1.5 sm:p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer text-center sm:text-left"
      onClick={() => appendLatin(item.latin)}
    >
      <span className="text-2xl sm:text-3xl sm:w-10 text-center shrink-0 leading-none">{item.char}</span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs sm:text-sm font-semibold text-primary truncate">{item.latin}</div>
        {(() => {
          const ipa = item.ipa ?? ipaMap?.[item.char]
          return ipa ? (
            <span
              lang="und-fonipa"
              aria-label={`IPA pronunciation: ${ipa}`}
              className="font-mono text-[10px] sm:text-xs text-muted-foreground truncate block"
            >
              /{ipa}/
            </span>
          ) : null
        })()}
      </div>
    </div>
  )

  const fetchTranslation = async (text: string, pair: string): Promise<string> => {
    try {
      const [sl, tl] = pair.split("|")
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`,
      )
      if (!res.ok) return ""
      const data = await res.json()
      if (!Array.isArray(data?.[0])) return ""
      return data[0].map((seg: unknown[]) => (typeof seg?.[0] === "string" ? seg[0] : "")).join("")
    } catch {
      return ""
    }
  }

  const sourceUnits = useMemo(() => {
    if (!scriptText.trim()) return []
    if (langCode === "ja" && typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const segmenter = new Intl.Segmenter("ja", { granularity: "word" })
      return Array.from(segmenter.segment(scriptText))
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment)
    }
    if (langCode === "ja") return scriptText.match(/[一-龯々〆ヵヶぁ-ゖァ-ヺー]+|[^\s]/gu) ?? []
    return scriptText.trim().split(/\s+/u).filter(Boolean)
  }, [scriptText, langCode])

  // Translate each source-language unit independently, preserving source order.
  useEffect(() => {
    let cancelled = false
    if (!scriptText.trim() || !englishText.trim() || sourceUnits.length === 0) {
      setVocabularyRows([])
      return () => { cancelled = true }
    }
    Promise.all(sourceUnits.map(async (unit) => ({
      source: unit,
      latin: toLatinAsync ? await toLatinAsync(unit) : toLatin(unit),
      english: await fetchTranslation(unit, `${langCode}|en`),
    }))).then((rows) => {
      if (!cancelled) setVocabularyRows(rows.filter((row) => row.english))
    })
    return () => { cancelled = true }
  }, [scriptText, englishText, langCode, sourceUnits, toLatin, toLatinAsync])

  // Bidirectional translation: the edited field drives the other three
  useEffect(() => {
    if (source === null) return

    const sourceText = source === "english" ? englishText : source === "chinese" ? chineseText : scriptText
    const key = `${source}:${sourceText}`
    if (key === lastProcessedRef.current) return

    const run = async () => {
      lastProcessedRef.current = key

      if (!sourceText.trim()) {
        if (source !== "script" && source !== "latin") {
          setScriptText("")
          setLatinText("")
        }
        if (source !== "english") setEnglishText("")
        if (source !== "chinese") setChineseText("")
        return
      }

      setIsTranslating(true)
      try {
        if (source === "latin" || source === "script") {
          const [en, zh] = await Promise.all([
            fetchTranslation(scriptText, `${langCode}|en`),
            fetchTranslation(scriptText, `${langCode}|zh-CN`),
          ])
          setEnglishText(en)
          setChineseText(zh)
        } else if (source === "english") {
          const [script, zh] = await Promise.all([
            fetchTranslation(englishText, `en|${langCode}`),
            fetchTranslation(englishText, "en|zh-CN"),
          ])
          setScriptText(script)
          setLatinText(toLatin(script))
          setChineseText(zh)
        } else if (source === "chinese") {
          const [en, script] = await Promise.all([
            fetchTranslation(chineseText, "zh|en"),
            fetchTranslation(chineseText, `zh|${langCode}`),
          ])
          setEnglishText(en)
          setScriptText(script)
          setLatinText(toLatin(script))
        }
      } finally {
        setIsTranslating(false)
      }
    }

    const debounceTimer = setTimeout(run, 600)
    return () => clearTimeout(debounceTimer)
  }, [source, scriptText, englishText, chineseText, langCode, toLatin])

  // When an async romanizer is provided (e.g. Japanese kanji readings), refine
  // the Latin field from the current script asynchronously. The sync toLatin
  // result is shown immediately elsewhere; this upgrades it once the analyzer
  // resolves. A cancel flag prevents an out-of-order result from overwriting a
  // newer edit.
  useEffect(() => {
    if (!toLatinAsync) return
    if (!scriptText.trim()) return
    let cancelled = false
    toLatinAsync(scriptText)
      .then((latin) => {
        if (!cancelled) {
          setLatinText((prev) => (prev === latin ? prev : latin))
        }
      })
      .catch(() => {
        // Ignore — the sync fallback value already populated the field.
      })
    return () => {
      cancelled = true
    }
  }, [scriptText, toLatinAsync])

  // Resolve the script into a phonetic (kana) form for IPA. Shows the raw script
  // immediately, then upgrades once the analyzer resolves kanji readings.
  useEffect(() => {
    if (!toPhoneticScriptAsync) return
    if (!scriptText.trim()) {
      setPhoneticScript("")
      return
    }
    let cancelled = false
    // Optimistic fallback so IPA isn't blank while the analyzer loads.
    setPhoneticScript(scriptText)
    toPhoneticScriptAsync(scriptText)
      .then((kana) => {
        if (!cancelled) setPhoneticScript((prev) => (prev === kana ? prev : kana))
      })
      .catch(() => {
        // Ignore — the raw script fallback is already set.
      })
    return () => {
      cancelled = true
    }
  }, [scriptText, toPhoneticScriptAsync])

  const handleLatinChange = (value: string) => {
    setSource("latin")
    setLatinText(value)
    setScriptText(toScript(value))
  }

  const handleScriptChange = (value: string) => {
    setSource("script")
    setScriptText(value)
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
    setScriptText("")
    setLatinText("")
    setEnglishText("")
  setChineseText("")
  setVocabularyRows([])
  setSource(null)
    lastProcessedRef.current = ""
  }

  // Keyboard, reference clicks and edits all drive the Latin string, then
  // recompute the script so syllable/kana composition always stays correct.
  const appendLatin = (code: string) => {
    setSource("latin")
    setLatinText((prev) => {
      const next = prev + code
      setScriptText(toScript(next))
      return next
    })
  }

  const handleBackspace = () => {
    setSource("latin")
    setLatinText((prev) => {
      const next = prev.slice(0, -1)
      setScriptText(toScript(next))
      return next
    })
  }

  const handleSpace = () => appendLatin(" ")

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">
            The conversion between Latin Text and {scriptName} Text is fully reversible. You can type in either Latin
            Text or {scriptName} Text, and the other updates automatically.
          </p>

          {/* Side by side: Latin on left, script on right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Latin Text Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="cjk-latin-input" className="text-sm font-medium">
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
                id="cjk-latin-input"
                placeholder="Type Latin transliteration here..."
                className="min-h-32 !text-[20px] font-mono !leading-normal"
                value={latinText}
                onChange={(e) => handleLatinChange(e.target.value)}
              />
            </div>

            {/* Script Text Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="cjk-script-input" className="text-sm font-medium">
                  {scriptName} Text
                </label>
                {scriptText && (
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(scriptText, setCopiedScript)}>
                    {copiedScript ? (
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
                id="cjk-script-input"
                placeholder={scriptPlaceholder}
                className="min-h-32 !text-[30px] !leading-normal"
                value={scriptText}
                onChange={(e) => handleScriptChange(e.target.value)}
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

          {/* Common Phrases */}
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
                  setSource("script")
                  setScriptText(phrase.arabic)
                  setLatinText(phrase.latin)
                }}
                title={`${phrase.english}: ${phrase.arabic}`}
              >
                {phrase.english}
              </Button>
            ))}
            {(scriptText || latinText) && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground ml-auto">
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

          {/* Translations */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Translations</span>
              {isTranslating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="cjk-english-input" className="text-sm font-medium">
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
                  id="cjk-english-input"
                  placeholder="Type English here..."
                  className="min-h-24 !text-[18px] !leading-normal"
                  value={englishText}
                  onChange={(e) => handleEnglishChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="cjk-chinese-input" className="text-sm font-medium">
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
                  id="cjk-chinese-input"
                  placeholder="在此输入中文..."
                  className="min-h-24 !text-[18px] !leading-normal"
                  value={chineseText}
                  onChange={(e) => handleChineseChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          {vocabularyRows.length > 0 && (
            <section aria-labelledby="cjk-vocabulary-heading" className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <h2 id="cjk-vocabulary-heading" className="text-sm font-semibold">Vocabulary mapping</h2>
                <p className="text-xs text-muted-foreground">Each {scriptName} unit mapped to Wei and English in source order</p>
              </div>
              <div className="overflow-x-auto rounded-md border bg-background">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2 font-medium">{scriptName}</th><th className="px-3 py-2 font-medium">Wei</th><th className="px-3 py-2 font-medium">English</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {vocabularyRows.map((row, index) => (
                      <tr key={`${row.source}-${index}`}>
                        <td lang={langCode} className="px-3 py-2 text-base">{row.source}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.latin}</td>
                        <td className="px-3 py-2">{row.english}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Virtual Keyboard */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                {scriptName} Keyboard
              </label>
              <Button variant="ghost" size="sm" onClick={() => setShowKeyboard(!showKeyboard)}>
                {showKeyboard ? "Hide" : "Show"}
              </Button>
            </div>
            {showKeyboard && (
              <div className="p-2 sm:p-4 border rounded-lg bg-muted/30 space-y-1.5 sm:space-y-2">
                {keyboardCase && (
                  <div className="flex items-center justify-center gap-2 pb-1">
                    <Button
                      variant={caps ? "default" : "outline"}
                      size="sm"
                      className="h-10 sm:h-11 px-3 sm:px-4 text-xs sm:text-sm"
                      aria-pressed={caps}
                      onClick={() => setCaps((c) => !c)}
                    >
                      ⇪ Caps
                    </Button>
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                      {caps ? keyboardCase.upperLabel : keyboardCase.lowerLabel}
                    </span>
                  </div>
                )}
                {displayedRows.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className={
                      keyboardColumns
                        ? "grid gap-1 sm:gap-1.5 mx-auto max-w-md"
                        : "flex flex-wrap gap-1 sm:gap-1.5 justify-center"
                    }
                    style={
                      keyboardColumns
                        ? { gridTemplateColumns: `repeat(${keyboardColumns}, minmax(0, 1fr))` }
                        : undefined
                    }
                  >
                    {row.map((key) => (
                      <Button
                        key={key.latin}
                        variant="outline"
                        size="sm"
                        className={`h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 px-1 sm:px-2.5 ${
                          keyboardColumns ? "min-w-0 w-full" : "min-w-10 sm:min-w-11"
                        }`}
                        onClick={() => appendLatin(key.latin)}
                      >
                        <span className="font-mono text-xs sm:text-sm font-semibold">{key.label}</span>
                        <span className="text-base sm:text-xl">{key.arabic}</span>
                      </Button>
                    ))}
                  </div>
                ))}
                <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center mt-2 sm:mt-2.5">
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
                {keyboardCase?.note && (
                  <p className="text-xs text-muted-foreground text-center pt-1 text-pretty">{keyboardCase.note}</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Letter Reference */}
      <Card>
        <CardHeader>
          <CardTitle>{referenceTitle}</CardTitle>
          <CardDescription>
            Complete mapping of {scriptName} characters to their Latin transliteration codes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {referenceRows
            ? // Row layout (e.g. Japanese gojūon): each row is a 5-column grid
              // aligned to the a-i-u-e-o vowels; `null` cells leave a column
              // empty so kana like ya/yu/yo sit under a/u/o.
              referenceRows.map((section) => (
                <div key={section.description}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.description}
                  </h3>
                  <div className="space-y-2">
                    {section.rows.map((row, rowIndex) => (
                      <div key={rowIndex} className="grid grid-cols-5 gap-2">
                        {row.map((cell, cellIndex) =>
                          cell ? renderReferenceCell(cell, cellIndex) : <div key={cellIndex} aria-hidden />,
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            : referenceSections.map((section) => (
                <div key={section.description}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.description}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {section.items.map(renderReferenceCell)}
                  </div>
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  )
}
