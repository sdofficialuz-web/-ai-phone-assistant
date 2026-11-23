# AI Phone Assistant

A server-side voice bridge for an AI assistant that answers calls forwarded to a supported telephony provider.

## Current MVP

- Express health endpoint: `GET /health`
- Twilio-compatible incoming-call webhook: `POST /voice`
- WebSocket media bridge: `/media`
- OpenAI Realtime speech-to-speech connection
- Assistant identity: “Davlatning virtual yordamchisi”
- Uzbek, Russian, and English instructions
- API keys stay on the server and are read from environment variables

## Important limitations

This repository is the application bridge, not a complete phone service. It does not make an iPhone answer ordinary cellular calls by itself. A telephony provider must supply a compatible number or SIP/Twilio-compatible media stream, and Ucell conditional call forwarding must be configured separately.

The current adapter is Twilio Media Streams compatible. A provider-specific SIP/media adapter may be required for a local Uzbekistan provider. Do not activate call forwarding until provider compatibility, tariffs, and test routing have been confirmed.

Call summaries are not yet sent to the owner. Persistent call storage, notification delivery, consent/recording policy, production monitoring, and provider-specific integration are follow-up tasks.

## Requirements

- Node.js 20+
- OpenAI API key with Realtime API access
- Public HTTPS/WSS deployment URL
- A compatible telephony provider configured to send incoming calls to `POST /voice` and media to `wss://YOUR_HOST/media`

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` and `PUBLIC_BASE_URL`.
3. Set `TWILIO_AUTH_TOKEN` when using Twilio signature validation.
4. Install dependencies: `npm install`.
5. Start: `npm run dev`.
6. Check: `GET /health`.

Never commit `.env` or paste API keys into source code, chat, or GitHub files.

## Next milestones

1. Confirm the telephony provider and its media-stream protocol.
2. Add robust call transcript capture and owner notifications.
3. Add persistent call records, retention controls, and caller disclosure.
4. Test Uzbek/Russian/English speech and audio quality end to end.
5. Only then test conditional forwarding on the Ucell number.
