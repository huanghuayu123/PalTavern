/**
 * 大注释：图片显示地址缓存。
 * 头像、表情包和聊天背景以 data:image 文本存在状态里，一张头像就有几十到上百 KB。
 * 界面每次重画都会把它们原样拼进 HTML，几百条消息时一次重画要拼十几 MB 文本。
 * 这里把同一张图只转换一次成 blob: 短地址，之后每次渲染只拼一个几十字节的地址。
 */

const MAX_CACHED_IMAGE_URLS = 400;
const objectUrlByDataUrl = new Map<string, string>();

function dataUrlToBlob(value: string): Blob | undefined {
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return undefined;
  const header = value.slice(5, commaIndex);
  if (!/;base64$/i.test(header)) return undefined;
  const mimeType = header.slice(0, header.length - ';base64'.length) || 'application/octet-stream';
  const binary = atob(value.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function displayImageUrl(value: string | undefined): string {
  if (!value) return '';
  if (!/^data:image\//i.test(value)) return value;
  const cached = objectUrlByDataUrl.get(value);
  if (cached) {
    // 小注释：最近用过的放到队尾，淘汰时先淘汰最久没用的。
    objectUrlByDataUrl.delete(value);
    objectUrlByDataUrl.set(value, cached);
    return cached;
  }
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return value;
  let objectUrl: string;
  try {
    const blob = dataUrlToBlob(value);
    if (!blob) return value;
    objectUrl = URL.createObjectURL(blob);
  } catch {
    return value;
  }
  objectUrlByDataUrl.set(value, objectUrl);
  if (objectUrlByDataUrl.size > MAX_CACHED_IMAGE_URLS) {
    const oldest = objectUrlByDataUrl.entries().next().value;
    if (oldest) {
      objectUrlByDataUrl.delete(oldest[0]);
      URL.revokeObjectURL(oldest[1]);
    }
  }
  return objectUrl;
}
