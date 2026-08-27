// Arabic to transliteration mapping based on the provided table

export const arabicMapping: Record<string, string> = {
  // Hamza variants
  'آ': 'oe',
  'ء': 'oc',
  'أ': 'ec',
  'ئ': 'yc',
  'ؤ': 'wc',
  'إ': 'ic',
  'ٱ': 'o', // alif wasl
  'ة': 'ho', // ta marbuta - feminine ending

  // Alif variants
  'ا': 'e',
  'ى': 'yo',
  'ٰ': 'ao', // dagger alif (superscript alif)
  'اٰ': 'ao', // alif with dagger alif

  // Semi-vowels
  'ي': 'y',
  'و': 'w',

  // Consonants
  'ر': 'r',
  'ز': 'z',
  'د': 'd',
  'ذ': 'dv',
  'ت': 't',
  'ث': 'tv',
  'س': 's',
  'ل': 'l',
  'ن': 'n',
  'ش': 'sv',
  'ص': 'sc',
  'ض': 'dc',
  'ط': 'tc',
  'ظ': 'zc',
  'ب': 'b',
  'ف': 'f',
  'ك': 'k',
  'ق': 'q',
  'ع': 'g',
  'غ': 'gv',
  'ه': 'h',
  'ﻫ': 'h', // alternate form
  'ج': 'j',
  'ح': 'x',
  'خ': 'xv',
  'م': 'm',

  // Arabic punctuation -> familiar Latin punctuation (no bracket markers)
  '،': ',', // Arabic comma
  '؛': ';', // Arabic semicolon
  '؟': '?', // Arabic question mark
  '٪': '%', // Arabic percent sign
  '٫': '.', // Arabic decimal separator
  '٬': ',', // Arabic thousands separator
  'ـ': '-', // Tatweel / kashida
  '«': '"',
  '»': '"',

  // Diacritics (vowel marks)
  'ً': 'av', // tanwin fatha (accusative)
  'ٌ': 'uv', // tanwin damma (nominative)
  'ٍ': 'iv', // tanwin kasra (genitive)
  'ْ': '', // sukun (silent)
  'َ': 'a', // fatha
  'ِ': 'i', // kasra
  'ُ': 'u', // damma
  'ّ': '', // shadda (handled specially - doubles the consonant)

  // Common ligatures
  'لا': 'le',
  'لأ': 'lec',
  'لإ': 'lic',
  'لآ': 'loe',
}

// Letters that can be doubled with shadda
export const consonants = new Set([
  'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش',
  'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'ي', 'و'
])

// Generic script -> Latin transcription. Works for any Arabic-based script
// (Arabic, Persian, ...) given its mapping and the set of doublable consonants.
export function scriptToLatin(
  text: string,
  mapping: Record<string, string>,
  consonantSet: Set<string>
): string {
  let result = ''
  // Track the full Latin transliteration of the previous consonant so that a
  // following shadda can repeat the entire sequence (e.g. "sv" -> "svsv").
  let lastConsonantLatin = ''
  // Vowel marks emitted since that consonant. A shadda can appear either before
  // OR after the vowel (e.g. "يَّ" vs "يّ"), so we must double the consonant
  // while keeping the vowel in place: "يَّة" -> "yya", not "ya".
  let vowelAfterConsonant = ''
  // Combining vowel/diacritic marks that attach to the preceding consonant.
  const vowelMarks = new Set(['ً', 'ٌ', 'ٍ', 'ْ', 'َ', 'ِ', 'ُ', 'ّ', 'ٰ'])
  const chars = [...text] // Handle multi-byte characters properly

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    const nextChar = chars[i + 1]

    // Check for ligatures first (two-character combinations)
    if (nextChar) {
      const ligature = char + nextChar
      if (mapping[ligature] !== undefined) {
        result += mapping[ligature]
        lastConsonantLatin = '' // ligatures are not single consonants
        vowelAfterConsonant = ''
        i++ // Skip next character
        continue
      }
    }

    // Handle shadda (doubles the previous consonant by repeating its Latin form)
    if (char === 'ّ') {
      if (lastConsonantLatin) {
        if (vowelAfterConsonant) {
          // Insert the doubled consonant BEFORE the already-emitted vowel so
          // that "يَّ" becomes "yya" instead of "yay".
          result = result.slice(0, result.length - vowelAfterConsonant.length) +
            lastConsonantLatin + vowelAfterConsonant
        } else {
          result += lastConsonantLatin
        }
      }
      continue
    }

    // Regular character mapping
    if (mapping[char] !== undefined) {
      result += mapping[char]
      if (consonantSet.has(char)) {
        // Remember consonants so a following shadda can repeat them
        lastConsonantLatin = mapping[char]
        vowelAfterConsonant = ''
      } else if (vowelMarks.has(char)) {
        // Vowel mark: keep the consonant reference for a trailing shadda
        vowelAfterConsonant += mapping[char]
      } else {
        // Non-consonant letter (alif, hamza, etc.) breaks the shadda chain
        lastConsonantLatin = ''
        vowelAfterConsonant = ''
      }
    } else if (char === ' ' || char === '\n' || char === '\t') {
      result += char // Preserve whitespace
      lastConsonantLatin = ''
      vowelAfterConsonant = ''
    } else if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char)) {
      // Unknown Arabic-script character - keep as is with marker
      result += `[${char}]`
      lastConsonantLatin = ''
      vowelAfterConsonant = ''
    } else {
      // Non-Arabic character (punctuation, numbers, etc.)
      result += char
      lastConsonantLatin = ''
      vowelAfterConsonant = ''
    }
  }

  return result
}

export function transcribeArabic(text: string): string {
  return scriptToLatin(text, arabicMapping, consonants)
}

// Reverse mapping: Latin transliteration -> Arabic character
export const latinToArabicMap: Record<string, string> = {
  // Multi-character mappings (digraphs) - must be checked first (longest match)
  'oe': 'آ',
  'yc': 'ئ',
  'wc': 'ؤ',
  'ic': 'إ',
  'loe': 'لآ',
  'lic': 'لإ',
  'lec': 'لأ',
  'ec': 'أ',
  'le': 'لا',
  'dv': 'ذ',
  'tv': 'ث',
  'sv': 'ش',
  'gv': 'غ',
  'av': 'ً',
  'iv': 'ٍ',
  'uv': 'ٌ',
  'ho': 'ة',
  'ao': 'ٰ',
  'yo': 'ى',
  'o': 'ٱ',
  // Single character mappings
  'oc': 'ء',
  'e': 'ا',
  'y': 'ي',
  'w': 'و',
  'r': 'ر',
  'z': 'ز',
  'd': 'د',
  't': 'ت',
  's': 'س',
  'l': 'ل',
  'n': 'ن',
  'sc': 'ص',
  'dc': 'ض',
  'tc': 'ط',
  'zc': 'ظ',
  'b': 'ب',
  'f': 'ف',
  'k': 'ك',
  'q': 'ق',
  'g': 'ع',
  'h': 'ه',
  'j': 'ج',
  'x': 'ح',
  'xv': 'خ',
  'm': 'م',
  'i': 'ِ',
  'u': 'ُ',
  'a': 'َ',
}

// Generic Latin -> script transcription. Works for any Arabic-based script
// given its reverse mapping and the set of doublable consonants.
export function latinToScript(
  text: string,
  latinToScriptMap: Record<string, string>,
  consonantSet: Set<string>
): string {
  // Sort keys by length (longest first) for greedy matching
  const sortedKeys = Object.keys(latinToScriptMap).sort((a, b) => b.length - a.length)
  let result = ''
  let i = 0
  // Match case-insensitively so uppercase and lowercase Latin convert the same way
  const lowerText = text.toLowerCase()

  while (i < text.length) {
    let matched = false

    // Try to match the longest possible sequence first
    for (const key of sortedKeys) {
      if (lowerText.slice(i, i + key.length) === key) {
        const scriptChar = latinToScriptMap[key]

        if (consonantSet.has(scriptChar)) {
          // Count how many times this same consonant code repeats in a row.
          let runLength = 0
          while (lowerText.slice(i + runLength * key.length, i + (runLength + 1) * key.length) === key) {
            runLength++
          }

          // Each pair of identical consonants becomes one shadda. For an odd
          // run (e.g. "lll"), the FIRST letter stays single and the trailing
          // letters pair up, so "elll" -> ل + لّ (only the last two doubled).
          let remaining = runLength
          if (remaining % 2 === 1) {
            result += scriptChar
            remaining--
          }
          for (let pair = 0; pair < remaining / 2; pair++) {
            result += scriptChar + 'ّ'
          }

          i += key.length * runLength
        } else {
          result += scriptChar
          i += key.length
        }

        matched = true
        break
      }
    }

    if (!matched) {
      // Keep non-mapped characters as-is (spaces, punctuation, etc.)
      result += text[i]
      i++
    }
  }

  return result
}

export function transcribeLatin(text: string): string {
  return latinToScript(text, latinToArabicMap, consonants)
}

// Get description for an Arabic character
export const arabicDescriptions: Record<string, string> = {
  'آ': 'Alif with madda - oe',
  'ء': 'Hamza - glottal stop (oc)',
  'أ': 'Alif with hamza above - ec',
  'ئ': 'Ya with hamza - yc',
  'ؤ': 'Waw with hamza - wc',
  'إ': 'Alif with hamza below - ic',
  'ٱ': 'Alif wasl - o',
  'ة': 'Ta marbuta - feminine ending (ho)',
  'ا': 'Alif - e',
  'ى': 'Alif maqsura - yo (at end)',
  'ٰ': 'Dagger alif - ao (superscript alif)',
  'ي': 'Ya - y',
  'و': 'Waw - w',
  'ر': 'Ra - r (like "t" in American "water")',
  'ز': 'Zayn - z',
  'د': 'Dal - d',
  'ذ': 'Dhal - dv (heavier than tv)',
  'ت': 'Ta - t',
  'ث': 'Tha - tv',
  'س': 'Sin - s (air through tongue tip and upper teeth)',
  'ل': 'Lam - l (tongue on upper mouth)',
  'ن': 'Nun - n',
  'ش': 'Shin - sv',
  'ص': 'Sad - sc (stressed s, thicker)',
  'ض': 'Dad - dc',
  'ط': 'Ta (emphatic) - tc (back of mouth)',
  'ظ': 'Za (emphatic) - zc (further back)',
  'ب': 'Ba - b',
  'ف': 'Fa - f',
  'ك': 'Kaf - k',
  'ق': 'Qaf - q (deep in throat)',
  'ع': 'Ayn - g (surprised "a")',
  'غ': 'Ghayn - gv (gargling sound)',
  'ه': 'Ha - h',
  'ج': 'Jim - j',
  'ح': 'Ha (emphatic) - x (fogging up window)',
  'خ': 'Kha - xv (whispered gargle)',
  'م': 'Mim - m',
}

// Shared types for the transcriber UI
export interface KeyDef {
  latin: string
  // The script character produced (kept named "arabic" for backward compat)
  arabic: string
  label: string
}

export interface Phrase {
  english: string
  // The script phrase (kept named "arabic" for backward compat)
  arabic: string
  latin: string
}

// Arabic virtual keyboard layout (3 rows of letters; diacritics/space/del are
// rendered separately by the component).
export const arabicKeyboardRows: KeyDef[][] = [
  // Row 1: Vowels and vowel-related letters grouped together
  [
    { latin: 'oc', arabic: 'ء', label: 'oc' },
    { latin: 'e', arabic: 'ا', label: 'e' },
    { latin: 'o', arabic: 'ٱ', label: 'o' },
    { latin: 'oe', arabic: 'آ', label: 'oe' },
    { latin: 'ec', arabic: 'أ', label: 'ec' },
    { latin: 'ic', arabic: 'إ', label: 'ic' },
    { latin: 'yo', arabic: 'ى', label: 'yo' },
    { latin: 'ao', arabic: 'ٰ', label: 'ao' },
    { latin: 'yc', arabic: 'ئ', label: 'yc' },
    { latin: 'wc', arabic: 'ؤ', label: 'wc' },
    { latin: 'y', arabic: 'ي', label: 'y' },
    { latin: 'w', arabic: 'و', label: 'w' },
  ],
  // Row 2: Consonants
  [
    { latin: 'b', arabic: 'ب', label: 'b' },
    { latin: 'f', arabic: 'ف', label: 'f' },
    { latin: 'j', arabic: 'ج', label: 'j' },
    { latin: 'k', arabic: 'ك', label: 'k' },
    { latin: 'l', arabic: 'ل', label: 'l' },
    { latin: 'm', arabic: 'م', label: 'm' },
    { latin: 'n', arabic: 'ن', label: 'n' },
    { latin: 'q', arabic: 'ق', label: 'q' },
    { latin: 'r', arabic: 'ر', label: 'r' },
    { latin: 'z', arabic: 'ز', label: 'z' },
    { latin: 'sc', arabic: 'ص', label: 'sc' },
    { latin: 'dc', arabic: 'ض', label: 'dc' },
    { latin: 'tc', arabic: 'ط', label: 'tc' },
    { latin: 'zc', arabic: 'ظ', label: 'zc' },
  ],
  // Row 3: Letters with "v" suffix paired (base, v-variant), h and ho at far right
  [
    { latin: 't', arabic: 'ت', label: 't' },
    { latin: 'tv', arabic: 'ث', label: 'tv' },
    { latin: 's', arabic: 'س', label: 's' },
    { latin: 'sv', arabic: 'ش', label: 'sv' },
    { latin: 'd', arabic: 'د', label: 'd' },
    { latin: 'dv', arabic: 'ذ', label: 'dv' },
    { latin: 'g', arabic: 'ع', label: 'g' },
    { latin: 'gv', arabic: 'غ', label: 'gv' },
    { latin: 'x', arabic: 'ح', label: 'x' },
    { latin: 'xv', arabic: 'خ', label: 'xv' },
    { latin: 'h', arabic: 'ه', label: 'h' },
    { latin: 'ho', arabic: 'ة', label: 'ho' },
  ],
]

// Common phrases for quick access
export const arabicPhrases: Phrase[] = [
  // Latin is derived from the mapping so it always aligns with the keyboard keys
  { english: "Good morning", arabic: "صَبَاحُ الخَيْر", latin: transcribeArabic("صَبَاحُ الخَيْر") },
  { english: "How are you?", arabic: "كَيْفَ حَالُكَ", latin: transcribeArabic("كَيْفَ حَالُكَ") },
  { english: "Arabic", arabic: "العَرَبِيَّة", latin: transcribeArabic("العَرَبِيَّة") },
]
