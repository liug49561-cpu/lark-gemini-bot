import fetch from "node-fetch";

async function getTenantToken() {
  const res = await fetch(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET
      })
    }
  );

  const data = await res.json();
  return data.tenant_access_token;
}

async function askGemini(text) {
  // 备选路径列表，总有一个能撞对！
  const urls = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`
  ];

  for (let url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }] })
      });
      const data = await res.json();
      if (!data.error) return data.candidates?.[0]?.content?.parts?.[0]?.text || "Empty response";
      console.log(`路径 ${url} 失败: ${data.error.message}`);
    } catch (e) { continue; }
  }
  return "试遍了所有路径，Google 还是不理我。请确认 API Key 是否正确同步。";
}
async function sendMessage(chatId, text) {
  const token = await getTenantToken();

  await fetch(
    "https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text })
      })
    }
  );
}

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(200).send("ok");
  }

  const body = req.body;

  // webhook验证
  if (body.challenge) {
    return res.status(200).json({ challenge: body.challenge });
  }

  const message = body.event?.message;

  if (!message) {
    return res.status(200).send("no message");
  }

  const content = JSON.parse(message.content || "{}");
  const text = content.text;

  if (!text) {
    return res.status(200).send("no text");
  }

  const reply = await askGemini(text);

  await sendMessage(message.chat_id, reply);

  res.status(200).send("ok");
}
