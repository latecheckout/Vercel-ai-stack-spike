import { NextResponse } from 'next/server'

export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY is not configured' },
      { status: 500 },
    )
  }

  const response = await fetch(
    'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
    },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return NextResponse.json(
      { error: `ElevenLabs token request failed: ${response.status} ${text}` },
      { status: 502 },
    )
  }

  const data = (await response.json()) as { token: string }
  return NextResponse.json({ token: data.token })
}
