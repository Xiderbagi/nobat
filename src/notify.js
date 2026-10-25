// Sends patient messages. Which channel is used depends on the environment:
//   WhatsApp Cloud API  when WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_TEMPLATE are set
//   SMS gateway         when SMS_URL is set (also always used for login codes, if set)
//   Console             otherwise: the message is only logged and saved, nothing is sent
// Every attempt is saved in the messages table so the clinic can see what went out.

const env = process.env;

const hasWhatsApp = () => Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID && env.WHATSAPP_TEMPLATE);
const hasSms = () => Boolean(env.SMS_URL);

// Channels to try, in order. Login codes always prefer SMS; other messages follow the patient's choice
// and fall back to the other channel when the chosen one isn't set up or fails.
function channelsFor(kind, preferred) {
  const order = kind === 'code' || preferred === 'sms' ? ['sms', 'whatsapp'] : ['whatsapp', 'sms'];
  const ready = order.filter((c) => (c === 'sms' ? hasSms() : hasWhatsApp()));
  return ready.length ? ready : ['console'];
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

export async function send(db, { clinicId = null, bookingId = null, to, kind, body, channel: preferred = 'whatsapp' }) {
  let channel = 'console';
  let status = 'logged';
  let error = null;
  for (const c of channelsFor(kind, preferred)) {
    channel = c;
    if (c === 'console') {
      if (env.NODE_ENV !== 'test') console.log(`[message → ${to}] ${body}`);
      break;
    }
    try {
      if (c === 'whatsapp') await sendWhatsApp(to, body);
      else await sendSms(to, body);
      status = 'sent';
      error = null;
      break;
    } catch (err) {
      status = 'failed';
      error = (error ? error + ' | ' : '') + String(err.message || err);
      console.error(`[message failed via ${c} → ${to}] ${err.message || err}`);
    }
  }
  db.prepare('INSERT INTO messages (clinic_id, booking_id, to_phone, channel, kind, body, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(clinicId, bookingId, to, channel, kind, kind === 'code' ? body.replace(/\d{4}/, '••••') : body, status, error);
  return { channel, status };
}

export const isLiveMessaging = () => hasWhatsApp() || hasSms();
// Patients can only choose when both channels are set up.
export const canChooseChannel = () => hasWhatsApp() && hasSms();
