// Korean (Hangul) transliteration mapping.
//
// Korean syllables are composed from jamo: an initial consonant (choseong),
// a medial vowel (jungseong), and an optional final consonant (jongseong).
// We map Latin codes to jamo and compose them into precomposed Hangul syllable
// blocks using the Unicode algorithm:
//   code = 0xAC00 + (L * 21 + V) * 28 + T
// where L = choseong index (0-18), V = jungseong index (0-20),
// T = jongseong index (0 = none, 1-27).
//
// Unlike a positional IME, every jamo role has a UNIQUE Latin code: finals use
// their own codes (q / v / z / r prefixed) that never collide with initial or
// vowel codes. That makes both directions fully deterministic and reversible.

import type { KeyDef, Phrase } from "./arabic-mapping"

export type { KeyDef, Phrase }

const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3

// The silent ㅇ initial (choseong index 11). It has no typed code: a bare vowel
// automatically gets ㅇ as its initial (so "a" -> 아).
const SILENT_LEAD = 11

// Normalize native Korean punctuation to the ASCII punctuation used in the
// Latin transliteration, without adding bracket markers.
const KOREAN_PUNCTUATION: Record<string, string> = {
  "，": ",",
  "。": ".",
  "、": ",",
  "！": "!",
  "？": "?",
  "；": ";",
  "：": ":",
  "（": "(",
  "）": ")",
  "［": "[",
  "］": "]",
  "｛": "{",
  "｝": "}",
  "「": '"',
  "」": '"',
  "『": '"',
  "』": '"',
  "‘": "'",
  "’": "'",
  "＂": '"',
  "％": "%",
  "＆": "&",
  "～": "~",
}

// --- Initial consonants (choseong), index 0-18 -----------------------------
// [latin code, compatibility jamo for display]. The ㅇ initial is silent ("").
const LEAD: [string, string][] = [
  ["g", "ㄱ"],
  ["gg", "ㄲ"],
  ["n", "ㄴ"],
  ["d", "ㄷ"],
  ["dd", "ㄸ"],
  ["l", "ㄹ"],
  ["m", "ㅁ"],
  ["b", "ㅂ"],
  ["bb", "ㅃ"],
  ["s", "ㅅ"],
  ["ss", "ㅆ"],
  ["v", "ㅇ"], // initial ㅇ uses v; bare vowels still auto-insert ㅇ silently
  ["j", "ㅈ"],
  ["jj", "ㅉ"],
  ["c", "ㅊ"],
  ["k", "ㅋ"],
  ["t", "ㅌ"],
  ["p", "ㅍ"],
  ["h", "ㅎ"],
]

// --- Vowels (jungseong), index 0-20 ----------------------------------------
// "y"-prefixed / doubled-stroke vowels carry a [y] glide. Compound vowels
// (diphthongs) combine two vowel qualities.
const VOWEL: [string, string][] = [
  ["a", "ㅏ"],
  ["ae", "ㅐ"],
  ["ia", "ㅑ"],
  ["ie", "ㅒ"],
  ["eo", "ㅓ"],
  ["e", "ㅔ"],
  ["ao", "ㅕ"],
  ["ei", "ㅖ"],
  ["o", "ㅗ"],
  ["wa", "ㅘ"],
  ["ue", "ㅙ"],
  ["oe", "ㅚ"],
  ["io", "ㅛ"],
  ["u", "ㅜ"],
  ["wo", "ㅝ"],
  ["we", "ㅞ"],
  ["wi", "ㅟ"],
  ["iu", "ㅠ"],
  ["eu", "ㅡ"],
  ["ui", "ㅢ"],
  ["i", "ㅣ"],
]

// --- Final consonants (jongseong), index 1-27 (0 = none) -------------------
// Each final has a unique code that never overlaps with initial/vowel codes.
const TAIL: [string, string][] = [
  ["g", "ㄱ"],
  ["gg", "ㄲ"],
  ["gs", "ㄳ"],
  ["n", "ㄴ"],
  ["nj", "ㄵ"],
  ["nh", "ㄶ"],
  ["d", "ㄷ"],
  ["r", "ㄹ"],
  ["rg", "ㄺ"],
  ["rm", "ㄻ"],
  ["rb", "ㄼ"],
  ["rs", "ㄽ"],
  ["rt", "ㄾ"],
  ["rp", "ㄿ"],
  ["rh", "ㅀ"],
  ["m", "ㅁ"],
  ["b", "ㅂ"],
  ["bs", "ㅄ"],
  ["s", "ㅅ"],
  ["ss", "ㅆ"],
  ["v", "ㅇ"],
  ["j", "ㅈ"],
  ["c", "ㅊ"],
  ["k", "ㅋ"],
  ["t", "ㅌ"],
  ["p", "ㅍ"],
  ["h", "ㅎ"],
]

// --- Code lookup ------------------------------------------------------------
type Token = { type: "L" | "V" | "T"; index: number }
const CODE_MAP = new Map<string, Token>()
const LEAD_CODE_INDEX = new Map<string, number>()
LEAD.forEach(([code], i) => {
  if (code) {
    LEAD_CODE_INDEX.set(code, i)
    CODE_MAP.set(code, { type: "L", index: i })
  }
})
VOWEL.forEach(([code], i) => CODE_MAP.set(code, { type: "V", index: i }))
TAIL.forEach(([code], i) => CODE_MAP.set(code, { type: "T", index: i + 1 })) // 1-based

const MAX_CODE_LEN = Math.max(
  ...[...CODE_MAP.keys()].map((c) => c.length),
)

// index -> latin (reverse direction)
const LEAD_LATIN = LEAD.map(([code]) => code)
const VOWEL_LATIN = VOWEL.map(([code]) => code)
const TAIL_LATIN = ["", ...TAIL.map(([code]) => code)] // 1-based

// compatibility jamo for display of lone/incomplete jamo
const LEAD_JAMO = LEAD.map(([, jamo]) => jamo)
const VOWEL_JAMO = VOWEL.map(([, jamo]) => jamo)
const TAIL_JAMO = ["", ...TAIL.map(([, jamo]) => jamo)]

function compose(L: number | null, V: number | null, T: number | null): string {
  if (L !== null && V !== null) {
    return String.fromCharCode(HANGUL_BASE + (L * 21 + V) * 28 + (T ?? 0))
  }
  if (L !== null) return LEAD_JAMO[L]
  if (V !== null) return VOWEL_JAMO[V]
  if (T !== null) return TAIL_JAMO[T]
  return ""
}

// Latin -> Hangul, composing jamo into syllable blocks. Because codes are
// unique per role, tokenizing greedily (longest match) and dispatching on the
// token type is unambiguous.
export function transcribeKoreanLatin(text: string): string {
  let output = ""
  let L: number | null = null
  let V: number | null = null
  let T: number | null = null

  const flush = () => {
    output += compose(L, V, T)
    L = V = T = null
  }

  let i = 0
  while (i < text.length) {
    let token: Token | null = null
    let matchLen = 0
    for (let len = MAX_CODE_LEN; len >= 1; len--) {
      const entry = CODE_MAP.get(text.slice(i, i + len))
      if (entry) {
        token = entry
        matchLen = len
        break
      }
    }

    if (!token) {
      // A lone "y" right after a vowel-ending syllable is the separator inserted
      // by transcribeKorean to disambiguate a syllable boundary — consume it and
      // close the current syllable rather than treating it as a literal. No jamo
      // or vowel code begins with "y", so this is never a real token.
      if (text[i] === "y" && V !== null && T === null) {
        flush()
        i++
        continue
      }
      // Literal character (space, punctuation, digits, etc.)
      flush()
      output += text[i]
      i++
      continue
    }

    i += matchLen

    // Several requested final codes intentionally overlap initial codes (g, n,
    // r, etc.). Interpret a shared code by syllable position: before a vowel it
    // is the initial; after a vowel it is the final. This preserves both maps.
    const matchedCode = text.slice(i - matchLen, i)
    const sharedInitial = LEAD_CODE_INDEX.get(matchedCode)
    if (token.type === "T" && V === null && sharedInitial !== undefined) {
      token = { type: "L", index: sharedInitial }
    }

    if (token.type === "L") {
      // Initial consonant always begins a new syllable.
      flush()
      L = token.index
    } else if (token.type === "V") {
      if (V !== null || T !== null) {
        // Current syllable already has a vowel (and maybe a final): start a new
        // one. Finals are never "stolen" since they have distinct codes.
        flush()
        L = SILENT_LEAD
        V = token.index
      } else {
        if (L === null) L = SILENT_LEAD
        V = token.index
      }
    } else {
      // Final consonant: attach to the current syllable if it has a vowel and
      // no final yet; otherwise emit it as a standalone jamo.
      if (V !== null && T === null) {
        T = token.index
      } else {
        flush()
        output += TAIL_JAMO[token.index]
      }
    }
  }

  flush()
  return output
}

// Hangul -> Latin, decomposing precomposed syllable blocks. The silent ㅇ
// initial maps to "" and finals have unique codes, so no vowel-stealing guard
// is needed.
export function transcribeKorean(text: string): string {
  const chars = Array.from(text)
  let output = ""
  for (let idx = 0; idx < chars.length; idx++) {
    const ch = chars[idx]
    const code = ch.charCodeAt(0)
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      const s = code - HANGUL_BASE
      const T = s % 28
      const V = Math.floor(s / 28) % 21
      const L = Math.floor(s / 28 / 21)
      output += LEAD_LATIN[L] + VOWEL_LATIN[V] + (T > 0 ? TAIL_LATIN[T] : "")

      // When Hangul syllables are written without a source space, add a hyphen
      // between their Latin forms so each Korean syllable remains readable.
      // Vowel-ending syllables also keep the existing "y" disambiguator before
      // the hyphen (e.g. 이아 -> "iya-", not the ambiguous "ia").
      const next = chars[idx + 1]
      const nextCode = next?.charCodeAt(0)
      const nextIsHangul = nextCode !== undefined && nextCode >= HANGUL_BASE && nextCode <= HANGUL_LAST
      if (nextIsHangul) {
        if (T === 0) output += "y"
        output += "-"
      }
    } else {
      output += KOREAN_PUNCTUATION[ch] ?? ch
    }
  }
  return output
}

// --- IPA (phonetic) transcription -------------------------------------------
// Korean spelling is morphophonemic, so a naive jamo-by-jamo reading is wrong.
// We produce an accurate broad IPA transcription by decomposing syllables and
// applying the standard, deterministic surface rules:
//   - final-consonant neutralization (받침 → one of k̚ n t̚ l m p̚ ŋ)
//   - resyllabification onto a following silent ㅇ (연음)
//   - intervocalic voicing of the lax obstruents ㄱ ㄷ ㅂ ㅈ
//   - ㄹ realized as a tap [ɾ] between voiced sounds, [l] otherwise
//   - obstruent nasalization before a nasal (합니다 → [hamnida])
//   - lateralization of ㄴ+ㄹ / ㄹ+ㄴ → [ll]
//   - post-obstruent tensification (학교 → [hak̚k͈jo])
//   - ㅅ/ㅆ palatalization before i/j, ㄷ/ㅌ palatalization across 연음 (같이 → [katɕʰi])
//   - ㅎ aspiration of a following lax obstruent, and ㅎ deletion before a vowel

// Onset (choseong) IPA, aligned with LEAD. ㅇ is silent ("").
const LEAD_ONSET_IPA = [
  "k", "k͈", "n", "t", "t͈", "ɾ", "m", "p", "p͈", "s", "s͈", "", "tɕ", "t͈ɕ", "tɕʰ", "kʰ", "tʰ", "pʰ", "h",
]
// Voiced allophones of the lax obstruents between voiced sounds.
const VOICED_ONSET: Record<number, string> = { 0: "ɡ", 3: "d", 7: "b", 12: "dʑ" }
// Tense allophones after an obstruent coda (post-obstruent tensification).
const TENSE_ONSET: Record<number, string> = { 0: "k͈", 3: "t͈", 7: "p͈", 9: "s͈", 12: "t͈ɕ" }
// Aspirated choseong index produced when a lax obstruent meets ㅎ.
const ASPIRATE_LEAD: Record<number, number> = { 0: 15, 3: 16, 7: 17, 12: 14 }

// Vowel (jungseong) IPA, aligned with VOWEL.
const VOWEL_IPA = [
  "a", "ɛ", "ja", "jɛ", "ʌ", "e", "jʌ", "je", "o", "wa", "wɛ", "ø", "jo", "u", "wʌ", "we", "y", "ju", "ɯ", "ɰi", "i",
]

// Neutralized coda IPA per final (jongseong), aligned with TAIL (index 0 = final #1).
const TAIL_CODA_IPA = [
  "k̚", "k̚", "k̚", "n", "n", "n", "t̚", "l", "k̚", "m", "l", "l", "l", "p̚", "l",
  "m", "p̚", "p̚", "t̚", "t̚", "ŋ", "t̚", "t̚", "k̚", "t̚", "p̚", "t̚",
]
// Choseong indices that compose each final, for resyllabification (index 0 = final #1).
const TAIL_PARTS: number[][] = [
  [0], [1], [0, 9], [2], [2, 12], [2, 18], [3], [5], [5, 0], [5, 6], [5, 7], [5, 9], [5, 16], [5, 17], [5, 18],
  [6], [7], [7, 9], [9], [10], [11], [12], [14], [15], [16], [17], [18],
]
// Vowels that trigger palatalization (ㅣ and the j-glide vowels).
const PAL_TRIGGER = new Set([2, 3, 6, 7, 12, 17, 20])

// Neutralized coda IPA for a lone choseong index (used for cluster remnants).
function codaFromChoseong(idx: number): string {
  if (idx === 0 || idx === 1 || idx === 15) return "k̚"
  if (idx === 2) return "n"
  if (idx === 5) return "l"
  if (idx === 6) return "m"
  if (idx === 7 || idx === 8 || idx === 17) return "p̚"
  if (idx === 11) return "ŋ"
  return "t̚"
}

type IpaSyl = { kind: "syl"; L: number; V: number; T: number; codaOverride?: number; fromResyll?: boolean }
type IpaLit = { kind: "lit"; ch: string }

export function transcribeKoreanIpa(text: string): string {
  const items: (IpaSyl | IpaLit)[] = []
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      const s = code - HANGUL_BASE
      items.push({ kind: "syl", L: Math.floor(s / 28 / 21), V: Math.floor(s / 28) % 21, T: s % 28 })
    } else {
      items.push({ kind: "lit", ch })
    }
  }

  // ㅎ pre-pass: aspiration of a following lax obstruent / fortis-ㅅ (before neutralization).
  for (let i = 0; i < items.length - 1; i++) {
    const cur = items[i]
    const nxt = items[i + 1]
    if (cur.kind !== "syl" || nxt.kind !== "syl") continue
    const hasH = cur.T === 27 || cur.T === 6 || cur.T === 15 // ㅎ, ㄶ, ㅀ
    if (!hasH) continue
    if (ASPIRATE_LEAD[nxt.L] !== undefined) {
      nxt.L = ASPIRATE_LEAD[nxt.L]
      cur.T = cur.T === 6 ? 4 : cur.T === 15 ? 8 : 0 // keep ㄴ (ㄶ) / ㄹ (ㅀ) as coda, else drop
    } else if (nxt.L === 9) {
      nxt.L = 10 // ㅅ → ㅆ (s͈)
      cur.T = cur.T === 6 ? 4 : cur.T === 15 ? 8 : 0
    }
  }

  // Resyllabification (연음): move a coda onto a following silent ㅇ.
  for (let i = 0; i < items.length - 1; i++) {
    const cur = items[i]
    const nxt = items[i + 1]
    if (cur.kind !== "syl" || nxt.kind !== "syl") continue
    if (cur.T === 0 || cur.T === 21) continue // no coda, or ㅇ (ŋ stays put)
    if (nxt.L !== SILENT_LEAD) continue
    const parts = TAIL_PARTS[cur.T - 1]
    const moving = parts[parts.length - 1]
    if (parts.length === 1) {
      if (moving === 18) {
        cur.T = 0 // lone ㅎ deletes before a vowel
      } else {
        cur.T = 0
        nxt.L = moving
        nxt.fromResyll = true
      }
    } else if (moving === 18) {
      // ㄶ / ㅀ: ㅎ deletes, the first consonant becomes the onset (많아→[mana], 싫어→[siɾʌ])
      cur.T = 0
      nxt.L = parts[0]
      nxt.fromResyll = true
    } else {
      cur.codaOverride = parts[0] // first consonant stays as coda
      nxt.L = moving
      nxt.fromResyll = true
    }
  }

  // Coda phones (post-resyllabification).
  const codaPhone: (string | null)[] = items.map((it) => {
    if (it.kind !== "syl") return null
    if (it.codaOverride !== undefined) return codaFromChoseong(it.codaOverride)
    return it.T > 0 ? TAIL_CODA_IPA[it.T - 1] : ""
  })

  // Boundary assimilation: lateralization + obstruent nasalization.
  const onsetForce: (string | null)[] = items.map(() => null)
  for (let i = 0; i < items.length - 1; i++) {
    const cur = items[i]
    const nxt = items[i + 1]
    if (cur.kind !== "syl" || nxt.kind !== "syl") continue
    const coda = codaPhone[i]
    if (!coda) continue
    if (coda === "n" && nxt.L === 5) {
      codaPhone[i] = "l"
      onsetForce[i + 1] = "l"
      continue
    }
    if (coda === "l" && nxt.L === 2) {
      onsetForce[i + 1] = "l"
      continue
    }
    if (nxt.L === 2 || nxt.L === 6) {
      if (coda === "k̚") codaPhone[i] = "ŋ"
      else if (coda === "t̚") codaPhone[i] = "n"
      else if (coda === "p̚") codaPhone[i] = "m"
    }
  }

  // Assemble with context-sensitive onset realization.
  let out = ""
  let prevCoda: string | null = null // null resets context at literal boundaries
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.kind === "lit") {
      out += it.ch
      prevCoda = null
      continue
    }
    let onset: string
    if (onsetForce[i] !== null) {
      onset = onsetForce[i] as string
    } else if (it.L === SILENT_LEAD) {
      onset = ""
    } else {
      const L = it.L
      const obstruentCoda = prevCoda === "k̚" || prevCoda === "t̚" || prevCoda === "p̚"
      const voicedCtx =
        prevCoda !== null && (prevCoda === "" || prevCoda === "n" || prevCoda === "m" || prevCoda === "ŋ" || prevCoda === "l")
      if (L === 5) {
        onset = voicedCtx ? "ɾ" : "l"
      } else if (obstruentCoda && TENSE_ONSET[L] !== undefined) {
        onset = TENSE_ONSET[L]
      } else if ((L === 3 || L === 16) && it.fromResyll && it.V === 20) {
        onset = L === 3 ? "dʑ" : "tɕʰ" // ㄷ/ㅌ palatalization across 연음
      } else if ((L === 9 || L === 10) && PAL_TRIGGER.has(it.V)) {
        onset = L === 9 ? "ɕ" : "ɕ͈" // ㅅ/ㅆ palatalization before i/j
      } else if (voicedCtx && VOICED_ONSET[L] !== undefined) {
        onset = VOICED_ONSET[L]
      } else {
        onset = LEAD_ONSET_IPA[L]
      }
    }
    const coda = codaPhone[i] ?? ""
    out += onset + VOWEL_IPA[it.V] + coda
    prevCoda = coda
  }
  return out
}

// Citation IPA per jamo, keyed by role so the reference can distinguish an
// initial ㄱ /k/ from a final ㄱ /k̚/.
const LEAD_IPA_BY_INDEX = LEAD_ONSET_IPA
const VOWEL_IPA_BY_INDEX = VOWEL_IPA
const TAIL_IPA_BY_INDEX = TAIL_CODA_IPA

// --- Virtual keyboard -------------------------------------------------------
const keyOf = ([code, jamo]: [string, string]): KeyDef => ({ latin: code, arabic: jamo, label: code })

const SINGLE_LEAD_CODES = ["g", "n", "d", "l", "m", "b", "s", "j", "c", "h", "k", "t", "p"]
const DOUBLE_LEAD_CODES = ["gg", "dd", "bb", "ss", "jj"]
const leadByCode = (code: string) => LEAD.find(([c]) => c === code)!
const vowelByJamo = (jamo: string) => VOWEL.find(([, j]) => j === jamo)!

export const koreanKeyboardRows: KeyDef[][] = [
  // 14 single consonants (ㅇ is silent/automatic, so 13 typeable keys)
  SINGLE_LEAD_CODES.map((code) => keyOf(leadByCode(code))),
  // 5 double consonants
  DOUBLE_LEAD_CODES.map((code) => keyOf(leadByCode(code))),
  // 5 "next" vowels: 아 야 어 여 이
  ["ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅣ"].map((j) => keyOf(vowelByJamo(j))),
  // 5 "under" vowels: 오 요 우 유 으
  ["ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ"].map((j) => keyOf(vowelByJamo(j))),
  // 4 "next" compound vowels: 애 얘 에 예
  ["ㅐ", "ㅒ", "ㅔ", "ㅖ"].map((j) => keyOf(vowelByJamo(j))),
  // 7 "under" compound vowels: 외 와 왜 위 워 웨 의
  ["ㅚ", "ㅘ", "ㅙ", "ㅟ", "ㅝ", "ㅞ", "ㅢ"].map((j) => keyOf(vowelByJamo(j))),
  // 27 final consonants (first 14)
  TAIL.slice(0, 14).map(keyOf),
  // 27 final consonants (remaining 13)
  TAIL.slice(14).map(keyOf),
]

// --- Letter reference -------------------------------------------------------
export interface ReferenceItem {
  char: string
  latin: string
  description: string
  /** Citation IPA for this jamo (role-specific: initial vs final differ) */
  ipa?: string
}

export const koreanReference: ReferenceItem[] = [
  ...LEAD.map(([code, jamo], i) => ({ code, jamo, i }))
    .filter(({ code }) => code)
    .map(({ code, jamo, i }) => ({
      char: jamo,
      latin: code,
      description: "Initial consonant",
      ipa: LEAD_IPA_BY_INDEX[i],
    })),
  { char: "ㅇ", latin: "(none)", description: "Silent initial — just type the vowel" },
  ...VOWEL.map(([code, jamo], i) => ({ char: jamo, latin: code, description: "Vowel", ipa: VOWEL_IPA_BY_INDEX[i] })),
  ...TAIL.map(([code, jamo], i) => ({
    char: jamo,
    latin: code,
    description: "Final consonant",
    ipa: TAIL_IPA_BY_INDEX[i],
  })),
]

// --- Common phrases ---------------------------------------------------------
export const koreanPhrases: Phrase[] = [
  { english: "Hello", arabic: "안녕하세요", latin: transcribeKorean("안녕하세요") },
  { english: "Thank you", arabic: "감사합니다", latin: transcribeKorean("감사합니다") },
  { english: "Korean", arabic: "한국어", latin: transcribeKorean("한국어") },
]
