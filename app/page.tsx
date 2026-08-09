"use client"

import { ArabicTranscriber } from "@/components/arabic-transcriber"
import { CjkTranscriber } from "@/components/cjk-transcriber"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  transcribeKorean,
  transcribeKoreanLatin,
  transcribeKoreanIpa,
  koreanKeyboardRows,
  koreanReference,
  koreanPhrases,
} from "@/lib/korean-mapping"
import {
  transcribeJapanese,
  transcribeJapaneseLatin,
  transcribeJapaneseIpa,
  japaneseIpa,
  japaneseKeyboardRows,
  japanesePhrases,
  japaneseReference,
  japaneseReferenceRows,
} from "@/lib/japanese-mapping"
import { transcribeJapaneseWithKanji, toKanaReading } from "@/lib/japanese-kanji"

export default function Home() {
  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Wei Transliteration</h1>
        </div>

        <Tabs defaultValue="arabic" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 h-auto">
            <TabsTrigger value="arabic">Arabic</TabsTrigger>
            <TabsTrigger value="korean">Korean</TabsTrigger>
            <TabsTrigger value="japanese">Japanese</TabsTrigger>
          </TabsList>

          <TabsContent value="arabic">
            <ArabicTranscriber />
          </TabsContent>

          <TabsContent value="korean">
            <CjkTranscriber
              scriptName="Korean"
              langCode="ko"
              toLatin={transcribeKorean}
              toScript={transcribeKoreanLatin}
              toIpa={transcribeKoreanIpa}
              keyboardRows={koreanKeyboardRows}
              phrases={koreanPhrases}
              reference={koreanReference}
              referenceTitle="Korean Jamo Reference"
              scriptPlaceholder="여기에 한국어를 입력하세요..."
            />
          </TabsContent>

          <TabsContent value="japanese">
            <CjkTranscriber
              scriptName="Japanese"
              langCode="ja"
              toLatin={transcribeJapanese}
              toLatinAsync={transcribeJapaneseWithKanji}
              toScript={transcribeJapaneseLatin}
              toIpa={transcribeJapaneseIpa}
              toPhoneticScriptAsync={toKanaReading}
              ipaMap={japaneseIpa}
              keyboardRows={japaneseKeyboardRows}
              keyboardColumns={5}
              keyboardCase={{
                lowerCount: 6,
                lowerLabel: "Hiragana (lowercase)",
                upperLabel: "Katakana (uppercase)",
                note: "The keyboard shows hiragana by default. Tap Caps to switch to katakana — uppercase codes produce katakana, lowercase codes produce hiragana.",
              }}
              phrases={japanesePhrases}
              reference={japaneseReference}
              referenceRows={japaneseReferenceRows}
              referenceTitle="Japanese Kana Reference"
              scriptPlaceholder="ここに日本語を入力してください..."
            />
          </TabsContent>

        </Tabs>
      </div>
    </main>
  )
}
