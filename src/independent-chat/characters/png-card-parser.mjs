/**
 * 大注释：PNG card parser module.
 * Extracts SillyTavern card metadata from PNG files.
 */
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function readUint32(bytes, offset) {
  return bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3];
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function readTextChunk(type, data) {
  const zero = data.indexOf(0);
  if (zero <= 0) {
    return null;
  }
  const decoder = new TextDecoder();
  const keyword = decoder.decode(data.slice(0, zero));
  if (type === 'tEXt') {
    return { keyword, text: decoder.decode(data.slice(zero + 1)) };
  }
  if (type !== 'iTXt') {
    return null;
  }

  let cursor = zero + 1;
  const compressionFlag = data[cursor];
  cursor += 2;
  if (compressionFlag !== 0) {
    return null;
  }
  const languageEnd = data.indexOf(0, cursor);
  if (languageEnd < 0) {
    return null;
  }
  cursor = languageEnd + 1;
  const translatedEnd = data.indexOf(0, cursor);
  if (translatedEnd < 0) {
    return null;
  }
  cursor = translatedEnd + 1;
  return { keyword, text: decoder.decode(data.slice(cursor)) };
}

export function extractPngCharacterJson(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error('文件不是有效的 PNG 图片。');
  }

  let offset = 8;
  let v2Payload = '';
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error('PNG 角色卡数据不完整。');
    }
    if (type === 'tEXt' || type === 'iTXt') {
      const chunk = readTextChunk(type, bytes.slice(dataStart, dataEnd));
      if (chunk && (chunk.keyword === 'chara' || chunk.keyword === 'ccv3')) {
        const text = chunk.text.trim();
        let decoded;
        try {
          decoded = text.startsWith('{') ? text : decodeBase64Utf8(text);
        } catch {
          throw new Error('PNG 角色卡中的元数据无法解码。');
        }
        if (chunk.keyword === 'ccv3') return decoded;
        v2Payload = decoded;
      }
    }
    offset = dataEnd + 4;
    if (type === 'IEND') {
      break;
    }
  }
  if (v2Payload) return v2Payload;
  throw new Error('PNG 中没有找到 SillyTavern 角色卡元数据。');
}
