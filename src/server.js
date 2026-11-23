import "dotenv/config";
import express from "express";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import crypto from "node:crypto";

const {
  PORT = "3000",
  PUBLIC_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL = "gpt-realtime-2.1",
  ASSISTANT_NAME = "Davlatning virtual yordamchisi",
  OWNER_NAME = "Davlat",
  TWILIO_AUTH_TOKEN
} = process.env;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);
const mediaServer = new WebSocketServer({ noServer: true });

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-phone-assistant",
    openaiConfigured: Boolean(OPENAI_API_KEY),
    publicUrlConfigured: Boolean(PUBLIC_BASE_URL)
  });
});

function validTwilioRequest(req) {
  if (!TWILIO_AUTH_TOKEN) return process.env.NODE_ENV !== "production";
  const signature = req.header("x-twilio-signature");
  if (!signature || !PUBLIC_BASE_URL) return false;

  const fullUrl = new URL(req.originalUrl, PUBLIC_BASE_URL).toString();
  const params = Object.keys(req.body || {}).sort();
  let data = fullUrl;
  for (const key of params) data += key + String(req.body[key]);
  const expected = crypto
    .createHmac("sha1", TWILIO_AUTH_TOKEN)
    .update(data)
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post("/voice", (req, res) => {
  if (!validTwilioRequest(req)) {
    return res.status(403).send("Invalid telephony signature");
  }
  if (!PUBLIC_BASE_URL) {
    return res.status(503).send("PUBLIC_BASE_URL is not configured");
  }

  const streamUrl = PUBLIC_BASE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:") + "/media";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="caller" value="${String(req.body.From || "").replace(/[&<>"']/g, "")}" />
    </Stream>
  </Connect>
</Response>`;
  res.type("text/xml").send(twiml);
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname !== "/media") {
    socket.destroy();
    return;
  }
  mediaServer.handleUpgrade(request, socket, head, (ws) => {
    mediaServer.emit("connection", ws, request);
  });
});

mediaServer.on("connection", (telephonySocket) => {
  if (!OPENAI_API_KEY) {
    telephonySocket.close(1011, "OpenAI API key is not configured");
    return;
  }

  let streamSid;
  let openAiSocket;
  let started = false;

  const closeBoth = () => {
    if (openAiSocket && openAiSocket.readyState === WebSocket.OPEN) openAiSocket.close();
    if (telephonySocket.readyState === WebSocket.OPEN) telephonySocket.close();
  };

  telephonySocket.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (event.event === "start") {
      streamSid = event.start?.streamSid;
      openAiSocket = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`,
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
      );

      openAiSocket.on("open", () => {
        openAiSocket.send(JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions:
              `Siz ${ASSISTANT_NAME}siz. ${OWNER_NAME} hozir qo‘ng‘iroqqa javob bera olmayapti. ` +
              "Qo‘ng‘iroq qiluvchini xushmuomala kutib oling. O‘zbek, rus yoki ingliz tilida gapirsa, " +
              "o‘sha tilda javob bering. Avval qaysi masalada qo‘ng‘iroq qilganini, ismini va qayta aloqa " +
              "raqamini so‘rang. Faqat aniq bilgan ma’lumotni ayting; narx, va’da yoki majburiyatni o‘zingiz " +
              "to‘qimang. Zarur bo‘lsa, Davlat keyinroq aloqaga chiqishini ayting. Suhbatni qisqa va tabiiy olib boring.`,
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                turn_detection: { type: "server_vad" }
              },
              output: {
                format: { type: "audio/pcmu" },
                voice: "cedar"
              }
            }
          }
        }));
        started = true;
      });

      openAiSocket.on("message", (message) => {
        let response;
        try {
          response = JSON.parse(message.toString());
        } catch {
          return;
        }

        if (response.type === "response.output_audio.delta" && streamSid && telephonySocket.readyState === WebSocket.OPEN) {
          telephonySocket.send(JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: response.delta }
          }));
        }

        if (response.type === "error") {
          console.error("OpenAI Realtime error:", response.error?.message || "Unknown error");
        }
      });

      openAiSocket.on("error", (error) => console.error("OpenAI WebSocket error:", error.message));
      openAiSocket.on("close", () => {
        if (telephonySocket.readyState === WebSocket.OPEN) telephonySocket.close();
      });
      return;
    }

    if (event.event === "media" && started && openAiSocket?.readyState === WebSocket.OPEN) {
      openAiSocket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: event.media.payload
      }));
    }

    if (event.event === "stop") closeBoth();
  });

  telephonySocket.on("close", () => {
    if (openAiSocket && openAiSocket.readyState === WebSocket.OPEN) openAiSocket.close();
  });
  telephonySocket.on("error", (error) => console.error("Telephony WebSocket error:", error.message));
});

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`AI Phone Assistant listening on port ${PORT}`);
});
