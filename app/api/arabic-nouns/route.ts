import { gateway, generateText } from "ai"
import { z } from "zod"

const nounSchema = z.object({
  nouns: z.array(z.object({
    text: z.string(),
    normalized: z.string(),
    note: z.string(),
  })),
})

// Conservative local fallback for when the model/gateway is temporarily
// unavailable. Arabic morphology alone cannot reliably distinguish nouns from
// adjectives, so use a curated vocabulary and explicit exclusions rather than
// treating endings such as ة or ية as proof of nounhood.
function heuristicNouns(text: string) {
  const tokens = text.split(/\s+/).filter(Boolean)
  const normalize = (value: string) => value
    .replace(/^[ووفبكلس]+(?=ال)/u, "")
    .replace(/[ًٌٍَُِّْـ]/gu, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/^[،؛.!؟,:«»]+|[،؛.!؟,:«»]+$/gu, "")

  const nounVocabulary = new Set([
    "جسم", "اجسام", "الاجسام", "نسيلة", "النسيلة", "جهاز", "الجهاز",
    "اثر", "اثار", "اثر", "زيادة", "خطر", "العدوى", "عدوى", "السرطان",
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
      normalized,
      note: "Arabic noun (local fallback)",
    }))

  return results
}

export async function POST(request: Request) {
  let text = ""
  try {
    const body = await request.json()
    text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!text) return Response.json({ nouns: [] })
    if (text.length > 2000) return Response.json({ error: "Text is too long." }, { status: 400 })

    const { text: generatedText } = await generateText({
      model: gateway("openai/gpt-4.1-mini"),
      maxRetries: 1,
      maxOutputTokens: 1200,
      system: 'You are an Arabic grammar analyst. Return ONLY valid JSON in this exact shape: {"nouns":[{"text":"...","normalized":"...","note":"..."}]}. Identify only Arabic nouns. Preserve noun spans exactly as written, normalize without diacritics when useful, and give a short English grammatical note. Do not include pronouns, particles, verbs, adjectives, or punctuation.',
      prompt: text,
    })
    const json = generatedText.match(/\{[\s\S]*\}/)?.[0]
    const parsed = json ? nounSchema.safeParse(JSON.parse(json)) : null
    if (!parsed?.success) throw new Error("Model returned invalid noun JSON")
    return Response.json(parsed.data)
  } catch (error) {
    console.error("[v0] Arabic noun analysis failed; using local fallback", error)
    // Keep the feature useful during transient gateway/model failures instead
    // of turning the whole analysis section into an error state.
    return Response.json({ nouns: heuristicNouns(text), source: "fallback" })
  }
}

export const maxDuration = 30
