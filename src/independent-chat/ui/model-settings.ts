/**
 * 大注释：模型设置 UI 的纯工具函数。
 * 这些函数只负责把“模型厂商”和 API 地址整理成界面需要的值，
 * 不读取 DOM、不保存状态，也不触碰聊天输入框或页面滚动。
 */
import type { ModelProvider } from '../core/types';
import { DEEPSEEK_API_URL } from '../core/state';

export function modelProviderValue(value: string | undefined): ModelProvider {
  return value === 'custom' ? 'custom' : 'deepseek';
}

export function modelProviderFor(apiUrl: string, provider?: ModelProvider): ModelProvider {
  if (provider === 'custom') return 'custom';
  const normalized = apiUrl.trim().replace(/\/+$/, '').toLowerCase();
  if (normalized && normalized !== DEEPSEEK_API_URL.toLowerCase()) return 'custom';
  return 'deepseek';
}

export function apiUrlForProvider(provider: ModelProvider, currentUrl: string): string {
  if (provider === 'deepseek') return DEEPSEEK_API_URL;
  return currentUrl.trim().replace(/\/+$/, '').toLowerCase() === DEEPSEEK_API_URL.toLowerCase()
    ? ''
    : currentUrl;
}

export function modelProviderOptions(provider: ModelProvider): string {
  return `
    <option value="deepseek" ${provider === 'deepseek' ? 'selected' : ''}>DeepSeek（默认）</option>
    <option value="custom" ${provider === 'custom' ? 'selected' : ''}>其他兼容 OpenAI</option>
  `;
}
