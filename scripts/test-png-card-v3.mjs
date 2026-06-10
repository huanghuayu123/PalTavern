import { extractPngCharacterJson } from '../src/independent-chat/png-card-parser.mjs';

const encoder = new TextEncoder();
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function uint32(value) {
  return Uint8Array.from([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

function chunk(type, data) {
  const typeBytes = encoder.encode(type);
  const output = new Uint8Array(12 + data.length);
  output.set(uint32(data.length), 0);
  output.set(typeBytes, 4);
  output.set(data, 8);
  return output;
}

function textChunk(keyword, payload) {
  const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return chunk('tEXt', encoder.encode(`${keyword}\0${base64}`));
}

function concat(...parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output.buffer;
}

const v2 = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Wrong V2' } };
const v3 = { spec: 'chara_card_v3', spec_version: '3.0', data: { name: 'Correct V3' } };
const png = concat(signature, textChunk('chara', v2), textChunk('ccv3', v3), chunk('IEND', new Uint8Array()));
const parsed = JSON.parse(extractPngCharacterJson(png));

if (parsed.spec !== 'chara_card_v3' || parsed.data.name !== 'Correct V3') {
  throw new Error('PNG parser did not prefer the ccv3 chunk over the chara chunk.');
}

console.log(JSON.stringify({ pngV3: true, ccv3Preferred: true }));
