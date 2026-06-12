/**
 * 大注释：设置页复用的小 UI 组件。
 * 这里的函数只把传入数据渲染成 HTML 片段，不直接读取应用状态，
 * 方便设置页、预设页和自动消息页共用同一套简洁控件。
 */
import type { PromptPreset } from '../core/types';
import { escapeHtml } from '../core/utils';

export function renderParameterSummary(preset: PromptPreset): string {
  const entries = Object.entries(preset.parameterSummary);
  if (entries.length === 0) return '未发现可保留的模型参数。';
  return entries
    .slice(0, 10)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

export function renderSwitchControl(attrs: string, checked: boolean, label: string): string {
  return `
    <span class="switch-control">
      <input type="checkbox" ${attrs} ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" />
      <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
    </span>
  `;
}

export function renderSettingsFold(title: string, summary: string, content: string, open = false): string {
  return `
    <details class="settings-fold" ${open ? 'open' : ''}>
      <summary>
        <span>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(summary)}</small>
        </span>
      </summary>
      <div class="settings-fold-body">${content}</div>
    </details>
  `;
}

export function renderPromptRoleOptions(activeRole: string): string {
  return ['system', 'user', 'assistant']
    .map(role => `<option value="${role}" ${role === activeRole ? 'selected' : ''}>${role}</option>`)
    .join('');
}
