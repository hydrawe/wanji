import { gateway, generateText } from "ai"
import { z } from "zod"

const chunkSchema = z.object({
  chunks: z.array(z.object({
    text: z.string(),
    translation: z.string(),
    attribute: z.string(),
  })),
  vocabulary: z.array(z.object({
    arabic: z.string(),
    translation: z.string(),
  })).default([]),
})

const nounTranslations: Record<string, string> = {
  جسم: "body", اجسام: "bodies", الاجسام: "bodies",
  نسيلة: "clone", النسيلة: "the clone", جهاز: "device/system", الجهاز: "the device/system",
  اثر: "effect", اثار: "effects", زيادة: "increase", خطر: "risk",
  عدوى: "infection", العدوى: "the infection", سرطان: "cancer", السرطان: "the cancer",
  اصابة: "injury", الاصابة: "the injury", امراض: "diseases", المناعة: "immunity", مناعة: "immunity",
}

// Conservative local fallback for when the model/gateway is temporarily
// unavailable. Arabic morphology alone cannot reliably distinguish nouns from
// adjectives, so use a curated vocabulary and explicit exclusions rather than
// treating endings such as ة or ية as proof of nounhood.
const fallbackTranslations: Record<string, string> = {
  وبما: "and since", بما: "since", أن: "that", و: "and", ب: "with/by", ل: "for/to",
  فقد: "then/so", قد: "may/already", يكون: "be/may be", لها: "for it/them",
  أو: "or", ما: "what/that", مثل: "such as", من: "from/of", في: "in",
  الأجسام: "the bodies", المضادّة: "antibodies",
  "المُضادَّة": "antibodies", وحيدة: "single", النسيلة: "monoclonal",
  غالبًا: "often", تستخدم: "are used", لتثبيط: "to suppress",
  الجهاز: "the system", المناعي: "immune", آثار: "effects", جانبية: "side", سيئة: "bad",
  زيادة: "increasing", خطر: "risk", العدوى: "infection", والعدوى: "and the infection",
  السرطان: "cancer", الإصابة: "developing", بأمراض: "diseases",
  المناعة: "immunity", الذاتية: "autoimmune",
}

function normalizeArabic(value: string) {
  return value
    .replace(/[ًٌٍَُِّْـ]/gu, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
}

function heuristicVocabulary(text: string) {
  const words = text.match(/[\u0600-\u06ff]+/gu) ?? []
  const normalizedTranslations = new Map(
    Object.entries(fallbackTranslations).map(([word, translation]) => [normalizeArabic(word), translation]),
  )
  return words.filter((word, index, list) => list.indexOf(word) === index).map((arabic) => ({
    arabic,
    translation: normalizedTranslations.get(normalizeArabic(arabic)) ?? "See sentence translation",
  }))
}

function heuristicChunks(text: string) {
  // Keep the fallback useful when the model is unavailable by returning
  // meaningful sentence components rather than one row per word or one row
  // for the whole clause.
  const parts = text
    .split(/(?=[،؛.!؟])|(?<=،|؛|!|؟|\.)|(?=\b(?:و?بما أن|فقد|مثل|أو|ل|ب|ك)\b)/u)
    .map((part) => part.trim())
    .filter(Boolean)

  const translate = (part: string) => part
    .replace(/[،؛.!؟]/gu, "")
    .split(/\s+/u)
    .map((token) => fallbackTranslations[token] ?? token)
    .join(" ")

  return parts.map((part) => ({
    text: part,
    translation: translate(part),
    attribute: /[،؛.!؟]$/u.test(part)
      ? "clause / sentence boundary"
      : /^(?:و?بما أن|فقد|مثل|أو)\b/u.test(part)
        ? "conjunction or discourse phrase"
        : /\b(?:تستخدم|يكون|تثبيط|الإصابة)\b/u.test(part)
          ? "verb phrase"
          : "noun phrase or modifier",
  }))
}

export async function POST(request: Request) {
  let text = ""
  try {
    const body = await request.json()
    text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!text) return Response.json({ chunks: [] })
    if (text.length > 2000) return Response.json({ error: "Text is too long." }, { status: 400 })

    const { text: generatedText } = await generateText({
      model: gateway("openai/gpt-4.1-mini"),
      maxRetries: 1,
      maxOutputTokens: 1200,
      system: 'You are an Arabic sentence analyst. Return ONLY valid JSON in this exact shape: {"chunks":[{"text":"...","translation":"...","attribute":"..."}],"vocabulary":[{"arabic":"...","translation":"..."}]}. The vocabulary array must contain each distinct Arabic word in its original left-to-right reading order, with its direct contextual English meaning. Never align vocabulary by English word position. Segment the full sentence into only meaningful, coherent grammatical constituents. Do not split merely to satisfy a word limit, and do not return an entire sentence or clause as one chunk when it contains multiple roles. Keep each chunk intact as the smallest natural unit that expresses one function: subject noun phrase, verb phrase, direct object noun phrase, prepositional phrase, purpose phrase, adverbial phrase, adjective phrase, conjunction, or subordinate clause component. Chunk length is flexible; coherence and grammatical function matter more than word count. Preserve every word and punctuation mark exactly once and in order. Translate each component accurately in context and label its grammatical role. Only use a one-word chunk for an independent particle, conjunction, or punctuation mark.',
      prompt: text,
    })
    const json = generatedText.match(/\{[\s\S]*\}/)?.[0]
    const parsed = json ? chunkSchema.safeParse(JSON.parse(json)) : null
    if (!parsed?.success) throw new Error("Model returned invalid chunk JSON")
    return Response.json(parsed.data)
  } catch (error) {
    console.error("[v0] Arabic noun analysis failed; using local fallback", error)
    // Keep the feature useful during transient gateway/model failures instead
    // of turning the whole analysis section into an error state.
    return Response.json({ chunks: heuristicChunks(text), vocabulary: heuristicVocabulary(text), source: "fallback" })
  }
}

export const maxDuration = 30
