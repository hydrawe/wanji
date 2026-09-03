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
function heuristicChunks(text: string) {
  const tokens = text.split(/\s+/).filter(Boolean)
  const normalize = (value: string) => value
    .replace(/^[ووفبكلس]+(?=ال)/u, "")
    .replace(/[ًٌٍَُِّْـ]/gu, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/^[،؛.!؟,:«»]+|[،؛.!؟,:«»]+$/gu, "")

  const nounVocabulary = new Set([
    "جسم", "اجسام", "الاجسام", "نسيلة", "النسيلة", "جهاز", "الجهاز",
    "اثر", "اثار", "اثر", "زيادة", "خطر", "العدوى", "العدوي", "عدوى", "عدوي", "السرطان",
    "سرطان", "الإصابة", "الاصابة", "اصابة", "امراض", "أمراض", "المناعة",
    "مناعة", "السرطان", "سرطان",
  ])
  const nonNounVocabulary = new Set([
    "المضادة", "مضادة", "وحيدة", "حيدة", "غالبا", "يكون", "تستخدم",
    "لتثبيط", "المناعي", "مناعي", "جانبية", "سيئة", "الذاتية", "ذاتية",
    "مثل", "فقد", "قد", "لها", "أو", "و", "أن",
  ])

  const results = tokens
    .map((original) => ({ original, token: original.replace(/^[و、،؛]+/u, "").replace(/[،؛.!؟,:«»]+$/gu, "") }))
    .map(({ original, token }) => ({ original, token, normalized: normalize(token) }))
    .filter(({ normalized }) => normalized && !nonNounVocabulary.has(normalized))
    .filter(({ normalized }) => nounVocabulary.has(normalized))
    .filter(({ token }, index, list) => list.findIndex((item) => item.token === token) === index)
    .map(({ token, normalized }) => ({
      text: token,
      translation: nounTranslations[normalized] ?? token,
      attribute: "word chunk",
    }))

  return results
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
