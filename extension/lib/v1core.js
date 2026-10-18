export function buildMessages({ system, user }) {
  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: user });
  return messages;
}

export function buildPayload({ model, messages, stream = false }) {
  return {
    model,
    messages,
    stream,
  };
}

export function parseCompletion(input) {
  let parsed;
  if (typeof input === 'string') {
    parsed = JSON.parse(input);
  } else {
    parsed = input;
  }
  if (!parsed || !parsed.choices || !parsed.choices[0] || !parsed.choices[0].message || !parsed.choices[0].message.content) {
    throw new Error('Invalid completion: missing choices[0].message.content');
  }
  return parsed.choices[0].message.content;
}