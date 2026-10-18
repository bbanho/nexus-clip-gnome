import { buildPayload, parseCompletion } from './v1core.js';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';

export async function chat({ endpoint, model, apiKey, messages }) {
  const session = new Soup.Session();
  const message = Soup.Message.new('POST', endpoint);
  message.request_headers.append('Authorization', 'Bearer ' + apiKey);
  const payload = buildPayload({ model, messages, stream: false });
  const body = new TextEncoder().encode(JSON.stringify(payload));
  message.set_request_body_from_bytes('application/json', body);
  const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
  if (message.get_status() !== 200) {
    throw new Error('HTTP ' + message.get_status() + ' ' + message.get_reason_phrase());
  }
  const decoded = new TextDecoder().decode(bytes.get_data());
  return parseCompletion(decoded);
}