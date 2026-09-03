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
  // Fallback still dissects the entire sentence: every word and punctuation
  // mark gets a row, with an actual English gloss when it is known.
  const tokens = text.match(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}\s]/gu) ?? []
  return tokens.map((token) => ({
    text: token,
    translation: fallbackTranslations[token] ?? (token === "،" ? "," : token === "." ? "." : "translation unavailable"),
    attribute: /^[\p{L}\p{M}\p{N}]+$/u.test(token) ? "word" : "punctuation",
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
      system: 'You are an Arabic sentence analyst. Return ONLY valid JSON in this exact shape: {"chunks":[{"text":"...","translation":"...","attribute":"..."}]}. Segment the full sentence into meaningful grammatical chunks, preserving every word and punctuation mark exactly once and in order. Translate each chunk accurately in context and label its grammatical attribute concisely, such as noun phrase, verb phrase, prepositional phrase, conjunction, particle, adjective phrase, or punctuation. Do not omit or invent text.',
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
