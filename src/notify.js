// Sends patient messages. Which channel is used depends on the environment:
//   WhatsApp Cloud API  when WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_TEMPLATE are set
//   SMS gateway         when SMS_URL is set (also always used for login codes, if set)
//   Console             otherwise: the message is only logged and saved, nothing is sent
// Every attempt is saved in the messages table so the clinic can see what went out.

const env = process.env;

function channelFor(kind) {
  if (kind === 'code' && env.SMS_URL) return 'sms';
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID && env.WHATSAPP_TEMPLATE) return 'whatsapp';
  if (env.SMS_URL) return 'sms';
  return 'console';
}

// Business-started WhatsApp messages must use a template approved by Meta.
// Create one template with a single body variable, for example: "{{1}}".
async function sendWhatsApp(to, body) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace('+', ''),
      type: 'template',
      template: {
        name: env.WHATSAPP_TEMPLATE,
        language: { code: env.WHATSAPP_TEMPLATE_LANG || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: body.slice(0, 1000) }] }]
      }
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// Generic JSON SMS gateway. Adjust the body to match your provider's API.
async function sendSms(to, body) {
  const res = await fetch(env.SMS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SMS_TOKEN || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, text: body, sender: env.SMS_SENDER || 'Nobat' }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`SMS ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function send(db, { clinicId = null, bookingId = null, to, kind, body }) {
  const channel = channelFor(kind);
  let status = 'sent';
  let error = null;
  try {
    if (channel === 'whatsapp') await sendWhatsApp(to, body);
    else if (channel === 'sms') await sendSms(to, body);
    else {
      status = 'logged';
      if (env.NODE_ENV !== 'test') console.log(`[message → ${to}] ${body}`);
    }
  } catch (err) {
    status = 'failed';
    error = String(err.message || err);
    console.error(`[message failed → ${to}] ${error}`);
  }
  db.prepare('INSERT INTO messages (clinic_id, booking_id, to_phone, channel, kind, body, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(clinicId, bookingId, to, channel, kind, kind === 'code' ? body.replace(/\d{4}/, '••••') : body, status, error);
  return { channel, status };
}

export const isLiveMessaging = () => channelFor('update') !== 'console';
