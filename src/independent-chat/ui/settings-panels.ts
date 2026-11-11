// 大注释：设置页里的各个面板：陪伴时间、关系、主动消息、提示词预设、表情包库、世界包导入。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import type { CharacterCardCandidate } from '../characters/cards';
import { findCharacterRelationship, pendingRelationshipSuggestionsForPair, relationshipSideFor } from '../characters/relationships';
import { createAutoMessagePacingStrategy } from '../chat/auto-message-strategy';
import { activeWorld, normalizeChatFontScale, state } from '../core/state';
import { clampVirtualTimeMinutes, formatClockMinutes } from '../core/time';
import type { CharacterProfile, CompanionTimeMode, PromptPreset, RelationshipStage } from '../core/types';
import { compactText, escapeHtml } from '../core/utils';
import type { WorldBundlePreview, WorldBundleSection } from '../data/world-bundle';
import { renderAffinityMeter } from './character-pages';
import { pacingStateLabel, relationshipStageLabel } from './display-labels';
import { icon } from './icons';
import { displayImageUrl } from './image-urls';
import { renderPromptRoleOptions, renderSettingsFold, renderSwitchControl } from './settings-ui';
import type { CardImportFollowupAction, StickerLibraryScope } from './ui-types';

export function fieldValue<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector: string): string {
  return document.querySelector<T>(selector)?.value.trim() ?? '';
}

export function checked(selector: string): boolean {
  return Boolean(document.querySelector<HTMLInputElement>(selector)?.checked);
}

export function finiteNumber(value: string, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function companionTimeModeValue(value: string | undefined): CompanionTimeMode {
  return value === 'virtual' ? 'virtual' : 'system';
}

export function selectedCompanionTimeMode(prefix: 'settings' | 'onboarding'): CompanionTimeMode {
  return companionTimeModeValue(
    document.querySelector<HTMLInputElement>(`input[name="${prefix}-companion-time-mode"]:checked`)?.value,
  );
}

export function companionTimeMinutesFromFields(prefix: 'settings' | 'onboarding'): number {
  const hour = Math.max(0, Math.min(23, Math.round(finiteNumber(fieldValue(`#${prefix}-virtual-time-hour`), 0))));
  const minute = Math.max(0, Math.min(59, Math.round(finiteNumber(fieldValue(`#${prefix}-virtual-time-minute`), 0))));
  return clampVirtualTimeMinutes(hour * 60 + minute);
}

export function syncVirtualClockFields(prefix: 'settings' | 'onboarding', source?: 'range' | 'parts'): void {
  const range = document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-range`);
  const hourInput = document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-hour`);
  const minuteInput = document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-minute`);
  const readout = document.querySelector<HTMLElement>(`#${prefix}-virtual-clock-readout`);
  const clock = document.querySelector<HTMLElement>(`[data-virtual-clock="${prefix}"]`);
  const mode = selectedCompanionTimeMode(prefix);
  const enabled = mode === 'virtual';
  document.querySelectorAll<HTMLInputElement>(`input[name="${prefix}-companion-time-mode"]`).forEach(input => {
    input.closest('.time-mode-option')?.classList.toggle('is-active', input.checked);
  });
  const nextMinutes = source === 'range'
    ? clampVirtualTimeMinutes(Number(range?.value ?? state.virtualTimeMinutes))
    : companionTimeMinutesFromFields(prefix);
  const hour = Math.floor(nextMinutes / 60);
  const minute = nextMinutes % 60;
  if (hourInput) {
    hourInput.disabled = !enabled;
    hourInput.value = String(hour);
  }
  if (minuteInput) {
    minuteInput.disabled = !enabled;
    minuteInput.value = String(minute);
  }
  if (range) {
    range.disabled = !enabled;
    range.value = String(nextMinutes);
  }
  if (readout) readout.textContent = formatClockMinutes(nextMinutes);
  clock?.classList.toggle('is-disabled', !enabled);
}

export function bindCompanionTimeControls(prefix: 'settings' | 'onboarding'): void {
  document.querySelectorAll<HTMLInputElement>(`input[name="${prefix}-companion-time-mode"]`).forEach(radio => {
    radio.addEventListener('change', () => syncVirtualClockFields(prefix));
  });
  document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-range`)?.addEventListener('input', () => {
    syncVirtualClockFields(prefix, 'range');
  });
  document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-hour`)?.addEventListener('input', () => {
    syncVirtualClockFields(prefix, 'parts');
  });
  document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-minute`)?.addEventListener('input', () => {
    syncVirtualClockFields(prefix, 'parts');
  });
}

export function fontScaleLabel(scale: number): string {
  const normalized = normalizeChatFontScale(scale);
  if (normalized < 0.96) return '小';
  if (normalized > 1.14) return '大';
  if (normalized > 1.04) return '稍大';
  return '标准';
}

export function renderStickerLibrary(
  scope: StickerLibraryScope,
  stickers: import('../core/types').StickerAsset[],
  character?: CharacterProfile,
): string {
  const config = {
    character: {
      title: '角色专属表情包',
      description: `仅供 ${character?.name ?? '当前角色'} 的模型使用，用户聊天面板不会显示。`,
      importId: 'character-sticker-import',
      empty: '导入后，当前角色会在合适的时候使用它们。',
    },
    common: {
      title: '通用表情包',
      description: '所有角色模型都可使用，用户也能从聊天面板直接发送。',
      importId: 'common-sticker-import',
      empty: '适合放所有人都能使用的常用表情。',
    },
    user: {
      title: '用户表情包',
      description: '只在你的聊天面板中显示，不会提供给角色模型。',
      importId: 'user-sticker-import',
      empty: '适合放只由你发送的个人表情。',
    },
  }[scope];
  return `
    <div class="sticker-library" data-sticker-library="${scope}">
      <div class="sticker-library-heading"><strong>${config.title}</strong><span>${stickers.length}/48</span></div>
      <p class="muted">${config.description} 导入后可以改名称并写备注，备注会帮助没有识图能力的模型理解图片。</p>
      <label class="file-button sticker-import-button">${icon('import')}<span>批量导入</span>
        <input id="${config.importId}" type="file" multiple accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" />
      </label>
      ${stickers.length > 0 ? `<div class="sticker-library-grid">${stickers.map(sticker => `
        <figure>
          <img src="${escapeHtml(displayImageUrl(sticker.dataUrl))}" alt="${escapeHtml(sticker.name)}" />
          <figcaption title="${escapeHtml(sticker.name)}">${escapeHtml(sticker.name)}</figcaption>
          ${sticker.note?.trim() ? `<small>${escapeHtml(compactText(sticker.note, 42))}</small>` : ''}
          <button type="button" data-delete-sticker="${escapeHtml(sticker.id)}" data-sticker-scope="${scope}" aria-label="删除 ${escapeHtml(sticker.name)}">×</button>
        </figure>
      `).join('')}</div>` : `<div class="sticker-empty">${config.empty}</div>`}
    </div>
  `;
}

export function renderRelationship(character?: CharacterProfile): string {
  if (!character) {
    return '<p class="muted">导入角色后可设置关系状态。</p>';
  }
  const relationship = character.relationship;
  return `
    <label class="field">
      <span>关系阶段</span>
      <select id="relationship-stage">
        ${[
          ['stranger', '陌生'],
          ['familiar', '熟悉'],
          ['close', '亲近'],
          ['intimate', '亲密'],
          ['strained', '紧张'],
        ].map(([value, label]) => `<option value="${value}" ${relationship.stage === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    ${renderAffinityMeter(character)}
    <label class="field"><span>好感度（没有上限）</span><input id="relationship-affinity" type="number" min="0" step="1" value="${Math.max(0, Math.round(relationship.affinity))}" /></label>
    <p class="muted">进度条只显示 0 到 100；实际好感度可以继续增加。</p>
    <label class="field"><span>关系摘要</span><textarea id="relationship-summary" placeholder="例如：刚刚和好，但彼此仍有些试探。">${escapeHtml(relationship.summary)}</textarea></label>
    <button id="save-relationship" class="secondary">保存关系状态</button>
  `;
}

export function renderRelationshipStageOptions(active: RelationshipStage): string {
  return [
    ['stranger', '陌生'],
    ['familiar', '熟悉'],
    ['close', '亲近'],
    ['intimate', '亲密'],
    ['strained', '紧张'],
  ].map(([value, label]) => `<option value="${value}" ${active === value ? 'selected' : ''}>${label}</option>`).join('');
}

export function renderCharacterRelationshipEditor(
  first?: CharacterProfile,
  second?: CharacterProfile,
): string {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  if (characters.length < 2 || !first || !second) {
    return '<p class="muted">当前世界至少需要两个角色，才能设置角色之间的关系。</p>';
  }
  const relationship = findCharacterRelationship(first.worldId, first.id, second.id);
  const firstSide = relationship
    ? relationshipSideFor(relationship, first.id)
    : { stage: 'stranger' as RelationshipStage, summary: '', updatedAt: 0 };
  const secondSide = relationship
    ? relationshipSideFor(relationship, second.id)
    : { stage: 'stranger' as RelationshipStage, summary: '', updatedAt: 0 };
  const firstOptions = characters
    .map(character => `<option value="${escapeHtml(character.id)}" ${character.id === first.id ? 'selected' : ''}>${escapeHtml(character.name)}</option>`)
    .join('');
  const secondOptions = characters
    .map(character => `<option value="${escapeHtml(character.id)}" ${character.id === second.id ? 'selected' : ''} ${character.id === first.id ? 'disabled' : ''}>${escapeHtml(character.name)}</option>`)
    .join('');
  const suggestions = pendingRelationshipSuggestionsForPair(first.worldId, first.id, second.id);
  const suggestionList = suggestions.length > 0 ? `
    <div class="relationship-suggestions">
      <strong>待确认阶段建议</strong>
      ${suggestions.map(suggestion => {
        const from = state.characters.find(character => character.id === suggestion.fromCharacterId);
        const to = state.characters.find(character => character.id === suggestion.toCharacterId);
        return `
          <div class="relationship-suggestion-row">
            <span>${escapeHtml(from?.name ?? '角色')} → ${escapeHtml(to?.name ?? '角色')}：${escapeHtml(relationshipStageLabel(suggestion.suggestedStage))}</span>
            <small>${escapeHtml(suggestion.reason || '事件结算建议')}</small>
            <button class="secondary" type="button" data-apply-relationship-suggestion="${escapeHtml(suggestion.id)}">应用</button>
            <button class="secondary" type="button" data-ignore-relationship-suggestion="${escapeHtml(suggestion.id)}">忽略</button>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';
  return `
    <div class="relationship-pair-selector">
      <label class="field">
        <span>角色 A</span>
        <select id="relationship-pair-a-select">${firstOptions}</select>
      </label>
      <label class="field">
        <span>角色 B</span>
        <select id="relationship-pair-b-select">${secondOptions}</select>
      </label>
    </div>
    <div class="character-relationship-grid">
      <section class="character-relationship-side">
        <h2>${escapeHtml(first.name)} 怎么看 ${escapeHtml(second.name)}</h2>
        <label class="field">
          <span>关系阶段</span>
          <select id="relationship-pair-a-stage">${renderRelationshipStageOptions(firstSide.stage)}</select>
        </label>
        <label class="field">
          <span>视角摘要</span>
          <textarea id="relationship-pair-a-summary" placeholder="只写这个角色怎么看对方，不写数值好感度。">${escapeHtml(firstSide.summary)}</textarea>
        </label>
      </section>
      <section class="character-relationship-side">
        <h2>${escapeHtml(second.name)} 怎么看 ${escapeHtml(first.name)}</h2>
        <label class="field">
          <span>关系阶段</span>
          <select id="relationship-pair-b-stage">${renderRelationshipStageOptions(secondSide.stage)}</select>
        </label>
        <label class="field">
          <span>视角摘要</span>
          <textarea id="relationship-pair-b-summary" placeholder="另一边可以完全不同，关系不是自动对称的。">${escapeHtml(secondSide.summary)}</textarea>
        </label>
      </section>
    </div>
    ${suggestionList}
    <button id="save-character-relationship" class="secondary" type="button">保存角色之间的关系</button>
  `;
}

export function renderAutoMessage(character?: CharacterProfile): string {
  if (!character) {
    return '<p class="muted">导入角色后可设置主动消息。</p>';
  }
  const schedule = character.autoMessage;
  const momentSchedule = character.autoMoment;
  const eventSchedule = character.autoEvent;
  const nextAttempt = schedule.nextAttemptAt ? new Date(schedule.nextAttemptAt).toLocaleString() : '未安排';
  const nextMoment = momentSchedule.nextAttemptAt ? new Date(momentSchedule.nextAttemptAt).toLocaleString() : '未安排';
  const nextEvent = eventSchedule.nextAttemptAt ? new Date(eventSchedule.nextAttemptAt).toLocaleString() : '未安排';
  const autoMessageSettings = `
    <label class="field field-inline"><span>启用主动消息</span><input id="auto-enabled" type="checkbox" ${schedule.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>最小间隔（小时）</span><input id="auto-min-hours" type="number" min="0.05" step="0.05" value="${schedule.baseIntervalMin / 3600000}" /></label>
      <label class="field"><span>最大间隔（小时）</span><input id="auto-max-hours" type="number" min="0.05" step="0.05" value="${schedule.baseIntervalMax / 3600000}" /></label>
    </div>
    <div class="two-columns">
      <label class="field"><span>每日上限</span><input id="auto-daily-limit" type="number" min="1" value="${schedule.dailyLimit}" /></label>
      <label class="field"><span>硬性最大间隔（小时）</span><input id="auto-max-interval" type="number" min="1" value="${schedule.maxInterval / 3600000}" /></label>
    </div>
    <label class="field field-inline"><span>启用安静时段</span><input id="auto-quiet-enabled" type="checkbox" ${schedule.quietHours.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>安静开始</span><input id="auto-quiet-start" value="${escapeHtml(schedule.quietHours.start)}" /></label>
      <label class="field"><span>安静结束</span><input id="auto-quiet-end" value="${escapeHtml(schedule.quietHours.end)}" /></label>
    </div>
    <label class="field field-inline"><span>允许后台通知</span><input id="auto-background-notify" type="checkbox" ${schedule.backgroundNotificationsEnabled ? 'checked' : ''} /></label>
    <label class="field">
      <span>通知隐私</span>
      <select id="auto-notification-privacy">
        <option value="generic" ${schedule.notificationPrivacy === 'generic' ? 'selected' : ''}>显示角色名，只提示有新消息</option>
        <option value="full" ${schedule.notificationPrivacy === 'full' ? 'selected' : ''}>显示完整消息</option>
        <option value="hide_character" ${schedule.notificationPrivacy === 'hide_character' ? 'selected' : ''}>隐藏角色名和内容</option>
      </select>
    </label>
    <label class="field">
      <span>主动消息节奏策略</span>
      <textarea id="auto-pacing-strategy" rows="7" placeholder="写下这个角色在用户未回复时应该怎么试探、等待、降频或沉默。">${escapeHtml(schedule.pacingStrategy || createAutoMessagePacingStrategy(character))}</textarea>
    </label>
    <button id="regenerate-auto-pacing-strategy" class="secondary" type="button">按人设重建策略</button>
    <button id="save-auto-message" class="secondary">保存主动消息设置</button>
    <button id="run-auto-check" class="secondary secondary-gap">立即检查一次</button>
    ${schedule.pendingResetDecision ? `
      <div class="reset-decision">
        <strong>联系节奏已经变化</strong>
        <p class="muted">你回复了此前未回应的主动消息。请选择是否恢复频率。</p>
        <button id="restore-auto-pacing" class="secondary">恢复正常频率</button>
        <button id="keep-auto-pacing" class="secondary secondary-gap">保持当前降频</button>
      </div>
    ` : ''}
    <p class="muted">状态：${schedule.enabled ? '已启用' : '未启用'} · ${escapeHtml(pacingStateLabel(schedule.currentPacingState))}</p>
    <p class="muted">下次尝试：${escapeHtml(nextAttempt)}</p>
    <p class="muted">未回复次数：${schedule.unansweredCount}</p>
    <p class="muted">节奏说明：${escapeHtml(schedule.pacingReason)}</p>
  `;
  const worldActivitySettings = `
    <h2>世界活跃度</h2>
    <p class="muted">高模拟会让自动动态带动角色评论、楼主自由回复，并让生活线索更倾向多角色参与。会明显增加 token 消耗，默认关闭。</p>
    <label class="field field-inline"><span>高模拟世界互动</span><input id="world-high-simulation" type="checkbox" ${state.worldInteractionHighSimulation ? 'checked' : ''} /></label>
    <p class="muted">当前：${state.worldInteractionHighSimulation ? '高模拟已开启，世界会更主动运转。' : '轻量模式，自动互动保持克制。'}</p>
  `;
  const autoMomentSettings = `
    <h2>自动动态</h2>
    <p class="muted">角色会按自己的生活节奏在手机上发布动态。应用未运行期间错过的动态不会补发。</p>
    <label class="field field-inline"><span>启用自动动态</span><input id="auto-moment-enabled" type="checkbox" ${momentSchedule.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>最小间隔（小时）</span><input id="auto-moment-min-hours" type="number" min="0.25" step="0.25" value="${momentSchedule.baseIntervalMin / 3600000}" /></label>
      <label class="field"><span>最大间隔（小时）</span><input id="auto-moment-max-hours" type="number" min="0.25" step="0.25" value="${momentSchedule.baseIntervalMax / 3600000}" /></label>
    </div>
    <label class="field"><span>每日动态上限</span><input id="auto-moment-daily-limit" type="number" min="1" value="${momentSchedule.dailyLimit}" /></label>
    <div class="two-columns">
      <label class="field"><span>安静开始</span><input id="auto-moment-quiet-start" value="${escapeHtml(momentSchedule.quietHours.start)}" /></label>
      <label class="field"><span>安静结束</span><input id="auto-moment-quiet-end" value="${escapeHtml(momentSchedule.quietHours.end)}" /></label>
    </div>
    <p class="muted">下次自动动态：${escapeHtml(nextMoment)}</p>
    <p class="muted">状态：${escapeHtml(momentSchedule.statusReason)}</p>
  `;
  const autoEventSettings = `
    <h2>自动岛上事件</h2>
    <p class="muted">每个角色都会按自己的节奏冒出生活事件。事件需要你选择分支后才会结算关系。</p>
    <label class="field field-inline"><span>启用自动事件</span><input id="auto-event-enabled" type="checkbox" ${eventSchedule.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>最小间隔（小时）</span><input id="auto-event-min-hours" type="number" min="0.25" step="0.25" value="${eventSchedule.baseIntervalMin / 3600000}" /></label>
      <label class="field"><span>最大间隔（小时）</span><input id="auto-event-max-hours" type="number" min="0.25" step="0.25" value="${eventSchedule.baseIntervalMax / 3600000}" /></label>
    </div>
    <label class="field"><span>每日事件上限</span><input id="auto-event-daily-limit" type="number" min="1" value="${eventSchedule.dailyLimit}" /></label>
    <div class="two-columns">
      <label class="field"><span>安静开始</span><input id="auto-event-quiet-start" value="${escapeHtml(eventSchedule.quietHours.start)}" /></label>
      <label class="field"><span>安静结束</span><input id="auto-event-quiet-end" value="${escapeHtml(eventSchedule.quietHours.end)}" /></label>
    </div>
    <p class="muted">下次自动事件：${escapeHtml(nextEvent)}</p>
    <p class="muted">状态：${escapeHtml(eventSchedule.statusReason)}</p>
  `;
  return `
    <div class="settings-fold-list">
      ${renderSettingsFold('主动私信', `${schedule.enabled ? '已启用' : '未启用'}，${pacingStateLabel(schedule.currentPacingState)}`, autoMessageSettings, true)}
      ${renderSettingsFold('世界活跃度', state.worldInteractionHighSimulation ? '高模拟已开启' : '轻量模式', worldActivitySettings)}
      ${renderSettingsFold('自动动态', `${momentSchedule.enabled ? '已启用' : '未启用'}，下次 ${nextMoment}`, autoMomentSettings)}
      ${renderSettingsFold('自动事件', `${eventSchedule.enabled ? '已启用' : '未启用'}，下次 ${nextEvent}`, autoEventSettings)}
    </div>
  `;
}

export function promptPresetById(id: string): PromptPreset | undefined {
  return state.promptPresets.find(preset => preset.id === id);
}

export function renderPromptPresetOptions(activeId?: string): string {
  return state.promptPresets.map(preset =>
    `<option value="${escapeHtml(preset.id)}" ${preset.id === activeId ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`,
  ).join('');
}

export function renderPromptPresetRows(preset: PromptPreset): string {
  return preset.prompts.map(prompt => {
    const identifier = escapeHtml(prompt.identifier);
    const preview = prompt.marker
      ? '由本应用动态填充'
      : compactText(prompt.content || '空提示词', 120);
    return `
      <details class="prompt-preset-row ${prompt.enabled ? 'is-enabled' : ''}">
        <summary class="prompt-preset-row-summary">
          ${renderSwitchControl(`data-preset-prompt="${identifier}"`, prompt.enabled, `启用 ${prompt.name}`)}
          <span>
            <strong>${escapeHtml(prompt.name)}</strong>
            <small>${escapeHtml(preview)}</small>
          </span>
          <em>${escapeHtml(prompt.role)}</em>
        </summary>
        <div class="prompt-preset-main">
          <div class="prompt-preset-line">
            <label class="prompt-preset-field prompt-title-field">
              <span>名称</span>
              <input data-preset-prompt-name="${identifier}" value="${escapeHtml(prompt.name)}" />
            </label>
            <label class="prompt-preset-field prompt-role-field">
              <span>角色</span>
              <select data-preset-prompt-role="${identifier}">${renderPromptRoleOptions(prompt.role)}</select>
            </label>
          </div>
          ${prompt.marker ? `
            <p class="prompt-preset-marker">${escapeHtml(preview)}</p>
          ` : `
            <label class="prompt-preset-field prompt-content-field">
              <span>内容</span>
              <textarea rows="3" data-preset-prompt-content="${identifier}">${escapeHtml(prompt.content)}</textarea>
            </label>
          `}
        </div>
        <span class="prompt-preset-meta">
          <em>${escapeHtml(prompt.role)}</em>
          ${prompt.marker ? '<b>动态槽位</b>' : ''}
        </span>
      </details>
    `;
  }).join('');
}

export function renderPromptRegexRows(preset: PromptPreset): string {
  if (preset.regexScripts.length === 0) {
    return `
      <div class="empty-panel prompt-regex-empty">
        <strong>还没有正则脚本</strong>
        <p>可以手动新增，或导入带 regex_scripts 的 SillyTavern 预设。正则会在私聊模型输出后执行。</p>
      </div>
    `;
  }
  return preset.regexScripts.map(script => {
    const id = escapeHtml(script.id);
    const tags = [
      script.promptOnly ? 'Prompt only' : '',
      script.markdownOnly ? 'Markdown only' : '',
    ].filter(Boolean).join(' · ');
    return `
      <article class="prompt-regex-row ${script.enabled ? 'is-enabled' : ''}">
        ${renderSwitchControl(`data-preset-regex="${id}"`, script.enabled, `启用 ${script.name}`)}
        <div class="prompt-regex-main">
          <div class="prompt-regex-line">
            <label class="prompt-preset-field prompt-regex-name">
              <span>名称</span>
              <input data-preset-regex-name="${id}" value="${escapeHtml(script.name)}" />
            </label>
            <button class="plain-button danger-text" type="button" data-delete-preset-regex="${id}">删除</button>
          </div>
          <div class="prompt-regex-fields">
            <label class="prompt-preset-field">
              <span>查找正则</span>
              <textarea rows="2" data-preset-regex-find="${id}" placeholder="/pattern/g">${escapeHtml(script.findRegex)}</textarea>
            </label>
            <label class="prompt-preset-field">
              <span>替换为</span>
              <textarea rows="2" data-preset-regex-replace="${id}" placeholder="留空表示删除匹配内容">${escapeHtml(script.replaceString)}</textarea>
            </label>
          </div>
          ${tags ? `<small>${escapeHtml(tags)} 已保留；当前统一按私聊输出正则执行。</small>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

export function renderCompanionTimeFields(prefix: 'settings' | 'onboarding'): string {
  const minutes = clampVirtualTimeMinutes(state.virtualTimeMinutes);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const mode = state.companionTimeMode;
  const radioName = `${prefix}-companion-time-mode`;
  return `
    <div class="time-mode-settings" role="radiogroup" aria-label="陪伴时间模式">
      <label class="time-mode-option ${mode === 'system' ? 'is-active' : ''}">
        <input type="radio" name="${radioName}" value="system" ${mode === 'system' ? 'checked' : ''} />
        <span><strong>读取系统时间</strong><small>角色按这台设备的真实日期和时间理解早晚、作息和动态。</small></span>
      </label>
      <label class="time-mode-option ${mode === 'virtual' ? 'is-active' : ''}">
        <input type="radio" name="${radioName}" value="virtual" ${mode === 'virtual' ? 'checked' : ''} />
        <span><strong>使用虚拟时间</strong><small>你手动拨一个角色世界里的手机时间，聊天和动态都会按它来写。</small></span>
      </label>
    </div>
    <div class="virtual-clock-control ${mode === 'virtual' ? '' : 'is-disabled'}" data-virtual-clock="${prefix}">
      <div class="virtual-clock-readout">
        <strong id="${prefix}-virtual-clock-readout">${formatClockMinutes(minutes)}</strong>
        <span>${mode === 'virtual' ? '当前虚拟时间' : '选择虚拟时间后启用'}</span>
      </div>
      <div class="virtual-clock-fields">
        <label class="field">
          <span>小时</span>
          <input id="${prefix}-virtual-time-hour" type="number" min="0" max="23" step="1" value="${hour}" ${mode === 'virtual' ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span>分钟</span>
          <input id="${prefix}-virtual-time-minute" type="number" min="0" max="59" step="1" value="${minute}" ${mode === 'virtual' ? '' : 'disabled'} />
        </label>
      </div>
      <input class="virtual-clock-range" id="${prefix}-virtual-time-range" type="range" min="0" max="1439" step="5" value="${minutes}" aria-label="调整虚拟时间" ${mode === 'virtual' ? '' : 'disabled'} />
    </div>
  `;
}

export function cardCandidateSourceLabel(source: CharacterCardCandidate['source']): string {
  const labels: Record<CharacterCardCandidate['source'], string> = {
    card_name: '卡名',
    description: '正文',
    world_book: '世界书',
    structured: '结构字段',
  };
  return labels[source];
}

export function cardImportFollowupLabel(action: CardImportFollowupAction): string {
  return action === 'worldbook' ? '角色世界书'
    : action === 'opening' ? '角色开场白'
      : '角色资料';
}

export function isCardImportFollowupAction(value: string): value is CardImportFollowupAction {
  return value === 'profile' || value === 'opening' || value === 'worldbook';
}

export function worldBundleExportedAtLabel(value: string): string {
  if (!value) return '未知时间';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知时间' : date.toLocaleString();
}

export function worldBundleImportRows(preview: WorldBundlePreview): Array<{
  section: WorldBundleSection;
  title: string;
  detail: string;
  disabled?: boolean;
}> {
  return [
    {
      section: 'world',
      title: '世界资料',
      detail: '世界观、用户设定、地点、氛围、场景和天气',
      disabled: true,
    },
    {
      section: 'characters',
      title: '角色',
      detail: `${preview.characterCount} 个角色及角色设定`,
    },
    {
      section: 'relationships',
      title: '角色关系',
      detail: `${preview.relationshipCount} 条关系，${preview.relationshipSuggestionCount} 条关系建议`,
    },
    {
      section: 'chats',
      title: '聊天记录',
      detail: `${preview.privateChatCount} 段私聊、${preview.privateMessageCount} 条私聊消息、${preview.groupChatCount} 个群聊、${preview.groupMessageCount} 条群聊消息、${preview.directThreadCount} 段角色私聊、${preview.directMessageCount} 条角色私聊消息`,
    },
    {
      section: 'moments',
      title: '动态',
      detail: `${preview.momentCount} 条动态及评论`,
    },
    {
      section: 'events',
      title: '世界事件',
      detail: `${preview.eventCount} 个事件，${preview.privateEventSuggestionCount} 条事件建议`,
    },
    {
      section: 'timeline',
      title: '世界记录',
      detail: `${preview.timelineCount} 条时间线，${preview.impactCount} 条影响记录，${preview.interactionCount} 条角色互动`,
    },
    {
      section: 'summaries',
      title: '记忆与状态',
      detail: `${preview.summaryCount} 条记忆小结，${preview.statusCount} 条角色状态，${preview.dailyBriefCount} 份每日简报`,
    },
    {
      section: 'drafts',
      title: '写卡草稿',
      detail: `${preview.draftCount} 份草稿`,
    },
  ];
}

export function stickerScopeLabel(scope: StickerLibraryScope): string {
  return scope === 'character' ? '角色专属'
    : scope === 'common' ? '通用'
      : '用户';
}
