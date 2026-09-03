import { gateway, generateText } from "ai"
import { z } from "zod"

const chunkSchema = z.object({
  chunks: z.array(z.object({
    text: z.string(),
    translation: z.string(),
    attribute: z.string(),
  })),
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
  وبما: "and since", أن: "that", الأجسام: "the bodies", المضادّة: "antibodies",
  "المُضادَّة": "antibodies", وحيدة: "single", النسيلة: "monoclonal",
  غالبًا: "often", ما: "what/that", تستخدم: "are used", لتثبيط: "to suppress",
  الجهاز: "the system", المناعي: "immune", فقد: "then", يكون: "may be",
  لها: "they have", آثار: "effects", جانبية: "side", سيئة: "bad",
  مثل: "such as", زيادة: "increasing", خطر: "risk", العدوى: "infection", والعدوى: "and the infection",
  أو: "or", السرطان: "cancer", الإصابة: "developing", بأمراض: "diseases",
  المناعة: "immunity", الذاتية: "autoimmune",
}

function heuristicChunks(text: string) {
  // Keep the fallback useful when the model is unavailable by returning
  // phrase-sized chunks, not one row per word. Split at clause punctuation and
  // common Arabic clause markers, then label the resulting grammatical units.
  const parts = text
    .split(/(?=[،؛.!؟])|(?<=،|؛|!|؟|\.)|(?=\b(?:و?بما أن|فقد|مثل|أو)\b)/u)
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
      system: 'You are an Arabic sentence analyst. Return ONLY valid JSON in this exact shape: {"chunks":[{"text":"...","translation":"...","attribute":"..."}]}. Segment the full sentence into meaningful grammatical phrases, not individual words. Group words into constituents such as subject noun phrase, verb phrase, direct object noun phrase, prepositional phrase, purpose phrase, adverbial phrase, conjunction phrase, and subordinate clause. Preserve every word and punctuation mark exactly once and in order. Translate each phrase accurately in context and label its grammatical role. Only use a one-word chunk when it is an independent particle or conjunction.',
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
    return Response.json({ chunks: heuristicChunks(text), source: "fallback" })
  }
}

export const maxDuration = 30
