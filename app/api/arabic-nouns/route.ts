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
// unavailable. It is intentionally additive: the AI result remains primary.
function heuristicNouns(text: string) {
  const tokens = text.split(/\s+/).filter(Boolean)
  const likelyNoun = /^(?:ال|و?ال|ب?ال|ك?ال|ل?ال)?[^\s،؛.!؟,:]+(?:ة|ات|اء|ان|ين|ون|ية|ال|مناعة|جهاز|خطر|آثار|أمراض|أجسام|عدوى|سرطان)/u
  const commonNouns = new Set(["الأجسام", "المضادّة", "المُضادَّة", "النسيلة", "الجهاز", "المناعي", "آثار", "خطر", "العدوى", "السرطان", "أمراض", "المناعة", "الذاتية"])
  return tokens
    .map((token) => token.replace(/^[و、،؛]+|[،؛.!؟,:]+$/gu, ""))
    .filter((token) => token && (likelyNoun.test(token) || commonNouns.has(token)))
    .filter((token, index, list) => list.indexOf(token) === index)
    .map((token) => ({ text: token, normalized: token.replace(/[ًٌٍَُِّْـ]/gu, ""), note: "Likely noun (local fallback)" }))
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
