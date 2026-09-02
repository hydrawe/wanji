import { gateway, generateText, Output } from "ai"
import { z } from "zod"

const nounSchema = z.object({
  nouns: z.array(z.object({
    text: z.string(),
    normalized: z.string(),
    note: z.string(),
  })),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!text) return Response.json({ nouns: [] })
    if (text.length > 2000) return Response.json({ error: "Text is too long." }, { status: 400 })

    const { output } = await generateText({
      model: gateway("openai/gpt-4.1"),
      output: Output.object({ schema: nounSchema }),
      system: "You are an Arabic grammar analyst. Identify only nouns in the supplied Arabic text. Preserve each noun span exactly as written, normalize it without diacritics when useful, and give a short English grammatical note. Do not identify pronouns, particles, verbs, adjectives, or punctuation as nouns. Return an empty list when there are no nouns.",
      prompt: text,
    })

    return Response.json(output ?? { nouns: [] })
  } catch {
    return Response.json({ error: "Unable to analyze Arabic nouns." }, { status: 500 })
  }
}

export const maxDuration = 30
