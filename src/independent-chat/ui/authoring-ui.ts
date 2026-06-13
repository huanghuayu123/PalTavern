import {
  STEP_LABELS,
  askAuthoringTutor,
  characterProfileFromDraft,
  cleanGeneratedOpeningMessage,
  createCharacterCardDraft,
  createCharacterFromDraft,
  deleteCharacterCardDraft,
  duplicateCharacterCardDraft,
  stepsFor,
  touchDraft,
} from '../characters/authoring';
import { state } from '../core/state';
import { downloadSillyTavernCard } from '../characters/tavern-export';
import type { CharacterCardDraft, CharacterCardDraftStep } from '../core/types';
import { compactText, escapeHtml, nowId } from '../core/utils';
import { openAppAlert, openAppConfirm } from './app-dialogs';

let authoringOpen = false;
let activeDraftId = '';
let requestBusy = false;
let authoringStatus = '';
let pendingAuthoringScrollTop: number | null = null;

function authoringScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.authoring-body');
}

function preserveAuthoringScrollForNextRender(): void {
  pendingAuthoringScrollTop = authoringScrollContainer()?.scrollTop ?? pendingAuthoringScrollTop;
}

function restoreAuthoringScrollIfNeeded(): void {
  const top = pendingAuthoringScrollTop;
  pendingAuthoringScrollTop = null;
  if (top === null) return;
  window.requestAnimationFrame(() => {
    authoringScrollContainer()?.scrollTo({ top, behavior: 'auto' });
  });
}

function rerenderAuthoringInPlace(rerender: () => void): void {
  // Big comment: authoring replaces the whole app root before the shared app scroll
  // restorer runs, so it keeps its own lightweight scroll snapshot for tab-like edits.
  preserveAuthoringScrollForNextRender();
  rerender();
  restoreAuthoringScrollIfNeeded();
}

export function isAuthoringOpen(): boolean {
  return authoringOpen;
}

export function openAuthoringChooser(): void {
  authoringOpen = true;
  activeDraftId = createCharacterCardDraft().id;
  authoringStatus = '';
}

export function resumeAuthoringDraft(id: string): void {
  if (!state.characterCardDrafts.some(draft => draft.id === id)) return;
  authoringOpen = true;
  activeDraftId = id;
  authoringStatus = '';
}

export function closeAuthoring(): void {
  authoringOpen = false;
  activeDraftId = '';
  requestBusy = false;
  authoringStatus = '';
}

function activeDraft(): CharacterCardDraft | undefined {
  return state.characterCardDrafts.find(draft => draft.id === activeDraftId);
}

function fieldForStep(step: CharacterCardDraftStep): keyof CharacterCardDraft | undefined {
  if (step === 'appearance' || step === 'personality' || step === 'hobbies'
    || step === 'palette' || step === 'reinterpretation') {
    return step;
  }
  return undefined;
}

function stepDescription(step: CharacterCardDraftStep): string {
  const descriptions: Record<CharacterCardDraftStep, string> = {
    identity: '先确定这个角色是谁，以及最核心的一句话构想。',
    appearance: '写出一眼能认出来的体态、面部、发型、穿着和标志性细节。',
    personality: '不要只列标签，也写清楚这些性格在具体情境中会怎样表现。',
    hobbies: '写角色愿意长期投入的事情、偏好和厌恶，以及背后的原因。',
    palette: '补充性格细节、具体场景、行为表现和容易被误读的部分。',
    reinterpretation: '说明哪些设定容易被误读，以及正确理解和例外条件。',
    preview: '检查完整内容，选择创建角色或继续把它保留为草稿。',
  };
  return descriptions[step];
}

function renderTranscript(draft: CharacterCardDraft, step: CharacterCardDraftStep): string {
  const exchanges = draft.conversations[step] ?? [];
  if (exchanges.length === 0) {
    return '<div class="authoring-transcript-empty">导师还没有发言。写一点素材，或者直接请导师开始提问。</div>';
  }
  return exchanges.map(exchange => `
    <div class="authoring-exchange ${exchange.role}">
      <strong>${exchange.role === 'assistant' ? '写卡导师' : '你'}</strong>
      <p>${escapeHtml(exchange.content)}</p>
    </div>
  `).join('');
}

function renderTutor(draft: CharacterCardDraft, step: CharacterCardDraftStep): string {
  const note = draft.notes[step] ?? '';
  const candidate = draft.candidates[step] ?? '';
  return `
    <aside class="authoring-tutor">
      <div class="authoring-panel-heading">
        <div><span>AI 导师</span><h2>一起把想法问清楚</h2></div>
        <small>${state.modelConfig.model.trim() ? escapeHtml(state.modelConfig.model) : '未配置模型，可手写继续'}</small>
      </div>
      <div class="authoring-transcript">${renderTranscript(draft, step)}</div>
      <label class="field authoring-note">
        <span>回答、关键词或补充素材</span>
        <textarea id="authoring-note" placeholder="不必写得完整，先把想到的内容放在这里。">${escapeHtml(note)}</textarea>
      </label>
      <div class="authoring-tutor-actions">
        <button class="secondary" id="ask-authoring-tutor" ${requestBusy ? 'disabled' : ''}>${requestBusy ? '导师正在思考…' : '让导师继续提问'}</button>
        ${step === 'identity' ? '' : `<button class="secondary" id="organize-authoring" ${requestBusy ? 'disabled' : ''}>整理成候选稿</button>`}
      </div>
      ${candidate ? `
        <div class="authoring-candidate">
          <div><strong>候选稿</strong><span>不会自动覆盖你的正文</span></div>
          <p>${escapeHtml(candidate)}</p>
          <button class="primary" id="apply-authoring-candidate">采用这版</button>
        </div>
      ` : ''}
    </aside>
  `;
}

function renderEditor(draft: CharacterCardDraft, step: CharacterCardDraftStep): string {
  if (step === 'identity') {
    return `
      <section class="authoring-editor">
        <div class="authoring-panel-heading"><div><span>基础信息</span><h2>这个角色是谁？</h2></div></div>
        <label class="field"><span>角色名称（必填）</span><input id="draft-name" value="${escapeHtml(draft.name)}" placeholder="例如：沈灵" /></label>
        <label class="field"><span>年龄</span><input id="draft-age" value="${escapeHtml(draft.age)}" placeholder="例如：17岁、大学二年级、未知" /></label>
        <label class="field"><span>一句话构想</span><textarea id="draft-concept" placeholder="例如：总在替别人收拾残局，却不肯承认自己也需要被照顾。">${escapeHtml(draft.concept)}</textarea></label>
        <label class="field"><span>背景故事</span><textarea id="draft-background-story" placeholder="写出生长环境、过去经历，或她为什么会来到当前世界。">${escapeHtml(draft.backgroundStory)}</textarea></label>
        <label class="field"><span>备注</span><textarea id="draft-profile-note" placeholder="给自己看的补充信息，比如关系前情、禁忌、容易忘的细节。">${escapeHtml(draft.profileNote)}</textarea></label>
      </section>
    `;
  }
  const field = fieldForStep(step);
  if (!field) return '';
  const placeholders: Partial<Record<CharacterCardDraftStep, string>> = {
    appearance: '从整体轮廓写到最有辨识度的细节。',
    personality: '性格标签之外，补充触发条件、行为和矛盾。',
    hobbies: '她喜欢什么、怎样投入、为什么喜欢？',
    palette: '底色：\n主色：\n点缀色：\n衍生表现：',
    reinterpretation: '这项设定不意味着什么？正确理解是什么？什么时候会例外？',
  };
  return `
    <section class="authoring-editor">
      <div class="authoring-panel-heading">
        <div><span>角色卡正文</span><h2>${STEP_LABELS[step]}</h2></div>
        <small>自动保存</small>
      </div>
      <label class="field authoring-main-field">
        <span>最终内容</span>
        <textarea id="draft-main-content" placeholder="${escapeHtml(placeholders[step] ?? '')}">${escapeHtml(String(draft[field] ?? ''))}</textarea>
      </label>
    </section>
  `;
}

function renderPreview(draft: CharacterCardDraft): string {
  const personality = [
    draft.personality,
    draft.palette ? `【性格细节】\n${draft.palette}` : '',
    draft.reinterpretation ? `【补充解释】\n${draft.reinterpretation}` : '',
  ].filter(Boolean).join('\n\n');
  return `
    <div class="authoring-preview-grid">
      <section class="authoring-preview-card">
        <span>角色名称</span><h2>${escapeHtml(draft.name || '未命名角色')}</h2>
        ${draft.concept ? `<h3>角色构想</h3><p>${escapeHtml(draft.concept)}</p>` : ''}
        ${draft.age ? `<h3>年龄</h3><p>${escapeHtml(draft.age)}</p>` : ''}
        ${draft.backgroundStory ? `<h3>背景故事</h3><p>${escapeHtml(draft.backgroundStory)}</p>` : ''}
        ${draft.profileNote ? `<h3>备注</h3><p>${escapeHtml(draft.profileNote)}</p>` : ''}
        <h3>外貌</h3><p>${escapeHtml(draft.appearance || '尚未填写')}</p>
        <h3>性格</h3><p>${escapeHtml(personality || '尚未填写')}</p>
        <h3>爱好</h3><p>${escapeHtml(draft.hobbies || '尚未填写')}</p>
      </section>
      <section class="authoring-opening-card">
        <div class="authoring-panel-heading">
          <div><span>可选内容</span><h2>角色开场白</h2></div>
          <button class="secondary" id="generate-authoring-opening" ${requestBusy ? 'disabled' : ''}>${requestBusy ? '生成中…' : '让模型生成'}</button>
        </div>
        <label class="field authoring-main-field">
          <span>first_mes</span>
          <textarea id="draft-first-message" placeholder="可以手写，也可以让模型根据当前设定生成。">${escapeHtml(draft.firstMessage)}</textarea>
        </label>
        <p class="muted">开场白会写入导出的 SillyTavern 角色卡。创建为 PalTavern 联系人时，私聊会根据角色设定重新生成自然开场，不会直接复制这段 first_mes。</p>
      </section>
    </div>
  `;
}

function renderChooser(): string {
  return `
    <main class="authoring-screen authoring-chooser">
      <header class="authoring-topbar">
        <button class="secondary" id="close-authoring">返回</button>
        <div><span class="eyebrow">Character Studio</span><h1>写一张角色卡</h1></div>
        <span></span>
      </header>
      <section class="authoring-choice-content">
        <div class="authoring-choice-intro">
          <span class="settings-kicker">角色卡草稿</span>
          <h2>从一个想法，逐步写成可以聊天的角色</h2>
          <p>草稿会自动保存。模型负责提问和整理，你始终决定最终写进卡里的内容。</p>
        </div>
        <div class="authoring-mode-grid">
          <button class="authoring-mode-card" data-create-draft="simple">
            <span>开始</span><h3>建立角色</h3>
            <p>角色构想 → 外貌 → 性格 → 爱好 → 预览</p>
            <strong>创建草稿</strong>
          </button>
        </div>
      </section>
    </main>
  `;
}

export function renderAuthoringScreen(): string {
  if (!authoringOpen) return '';
  const draft = activeDraft();
  if (!draft) return renderChooser();
  const steps = stepsFor(draft);
  const index = Math.max(0, steps.indexOf(draft.currentStep));
  const step = steps[index];
  const preview = step === 'preview';
  return `
    <main class="authoring-screen">
      <header class="authoring-topbar">
        <button class="secondary" id="close-authoring">退出</button>
        <div class="authoring-title">
          <span>角色卡草稿 · ${draft.name ? escapeHtml(draft.name) : '未命名角色'}</span>
          <strong>${STEP_LABELS[step]}</strong>
        </div>
        <span class="authoring-save-state">已自动保存</span>
      </header>
      <div class="authoring-progress" aria-label="创作进度">
        ${steps.map((item, itemIndex) => `
          <button class="${itemIndex === index ? 'is-active' : ''} ${itemIndex < index ? 'is-done' : ''}" data-authoring-step="${item}" ${itemIndex > index ? 'disabled' : ''}>
            <span>${itemIndex + 1}</span><small>${STEP_LABELS[item]}</small>
          </button>
        `).join('')}
      </div>
      <section class="authoring-body">
        <div class="authoring-step-intro">
          <span class="settings-kicker">第 ${index + 1} / ${steps.length} 步</span>
          <h1>${STEP_LABELS[step]}</h1>
          <p>${stepDescription(step)}</p>
        </div>
        ${preview
          ? renderPreview(draft)
          : `<div class="authoring-workspace">${renderEditor(draft, step)}${renderTutor(draft, step)}</div>`}
        ${authoringStatus ? `<div class="authoring-status" aria-live="polite">${escapeHtml(authoringStatus)}</div>` : ''}
      </section>
      <footer class="authoring-footer">
        <button class="secondary" id="previous-authoring-step" ${index === 0 || requestBusy ? 'disabled' : ''}>上一步</button>
        <span>${escapeHtml(compactText(draft.name || draft.concept || '草稿会随输入自动保存', 42))}</span>
        ${preview ? `
          <div class="authoring-completion-actions">
            <button class="secondary" id="save-authoring-draft">仅保存草稿</button>
            <button class="secondary" id="export-authoring-card">导出酒馆卡</button>
            <button class="primary" id="create-authoring-character">创建角色</button>
          </div>
        ` : `<button class="primary" id="next-authoring-step" ${requestBusy ? 'disabled' : ''}>下一步</button>`}
      </footer>
    </main>
  `;
}

function updateTextField(draft: CharacterCardDraft, key: keyof CharacterCardDraft, value: string): void {
  (draft as unknown as Record<string, unknown>)[key] = value;
  touchDraft(draft);
}

async function runTutorAction(
  draft: CharacterCardDraft,
  step: CharacterCardDraftStep,
  action: 'guide' | 'organize' | 'opening',
  rerender: () => void,
): Promise<void> {
  if (requestBusy) return;
  requestBusy = true;
  authoringStatus = action === 'organize' ? '正在整理候选稿…' : action === 'opening' ? '正在生成开场白…' : '导师正在阅读你的想法…';
  const note = draft.notes[step] ?? '';
  if (action === 'guide' && note.trim()) {
    (draft.conversations[step] ??= []).push({
      id: nowId('exchange'),
      role: 'user',
      content: note.trim(),
      createdAt: Date.now(),
    });
    draft.notes[step] = '';
    touchDraft(draft);
  }
  rerender();
  try {
    const result = await askAuthoringTutor(draft, step, note, action);
    if (action === 'organize') {
      draft.candidates[step] = result;
    } else if (action === 'opening') {
      draft.firstMessage = cleanGeneratedOpeningMessage(result);
    } else {
      (draft.conversations[step] ??= []).push({
        id: nowId('exchange'),
        role: 'assistant',
        content: result,
        createdAt: Date.now(),
      });
    }
    touchDraft(draft);
    authoringStatus = action === 'organize' ? '候选稿已生成，确认采用前不会覆盖正文。' : '内容已生成并保存。';
  } catch (error) {
    authoringStatus = error instanceof Error ? error.message : String(error);
  } finally {
    requestBusy = false;
    rerender();
  }
}

export function bindAuthoringUi(rerender: () => void): void {
  document.querySelector<HTMLButtonElement>('#close-authoring')?.addEventListener('click', () => {
    closeAuthoring();
    rerender();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-create-draft]').forEach(button => {
    button.addEventListener('click', () => {
      const draft = createCharacterCardDraft();
      activeDraftId = draft.id;
      rerender();
    });
  });
  const draft = activeDraft();
  if (!draft) return;
  const steps = stepsFor(draft);
  const step = draft.currentStep;
  const index = steps.indexOf(step);
  document.querySelector<HTMLInputElement>('#draft-name')?.addEventListener('input', event => {
    updateTextField(draft, 'name', (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLInputElement>('#draft-age')?.addEventListener('input', event => {
    updateTextField(draft, 'age', (event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLTextAreaElement>('#draft-concept')?.addEventListener('input', event => {
    updateTextField(draft, 'concept', (event.currentTarget as HTMLTextAreaElement).value);
  });
  document.querySelector<HTMLTextAreaElement>('#draft-background-story')?.addEventListener('input', event => {
    updateTextField(draft, 'backgroundStory', (event.currentTarget as HTMLTextAreaElement).value);
  });
  document.querySelector<HTMLTextAreaElement>('#draft-profile-note')?.addEventListener('input', event => {
    updateTextField(draft, 'profileNote', (event.currentTarget as HTMLTextAreaElement).value);
  });
  document.querySelector<HTMLTextAreaElement>('#draft-main-content')?.addEventListener('input', event => {
    const field = fieldForStep(step);
    if (field) updateTextField(draft, field, (event.currentTarget as HTMLTextAreaElement).value);
  });
  document.querySelector<HTMLTextAreaElement>('#draft-first-message')?.addEventListener('input', event => {
    updateTextField(draft, 'firstMessage', (event.currentTarget as HTMLTextAreaElement).value);
  });
  document.querySelector<HTMLTextAreaElement>('#authoring-note')?.addEventListener('input', event => {
    draft.notes[step] = (event.currentTarget as HTMLTextAreaElement).value;
    touchDraft(draft);
  });
  document.querySelector<HTMLButtonElement>('#previous-authoring-step')?.addEventListener('click', () => {
    if (index <= 0) return;
    draft.currentStep = steps[index - 1];
    touchDraft(draft);
    authoringStatus = '';
    rerenderAuthoringInPlace(rerender);
  });
  document.querySelector<HTMLButtonElement>('#next-authoring-step')?.addEventListener('click', () => {
    if (step === 'identity' && !draft.name.trim()) {
      authoringStatus = '请先填写角色名称。';
      rerender();
      return;
    }
    draft.currentStep = steps[Math.min(index + 1, steps.length - 1)];
    touchDraft(draft);
    authoringStatus = '';
    rerenderAuthoringInPlace(rerender);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-authoring-step]').forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.authoringStep as CharacterCardDraftStep;
      if (steps.indexOf(target) > index) return;
      draft.currentStep = target;
      touchDraft(draft);
      authoringStatus = '';
      preserveAuthoringScrollForNextRender();
      rerender();
      restoreAuthoringScrollIfNeeded();
    });
  });
  document.querySelector<HTMLButtonElement>('#ask-authoring-tutor')?.addEventListener('click', () => {
    void runTutorAction(draft, step, 'guide', rerender);
  });
  document.querySelector<HTMLButtonElement>('#organize-authoring')?.addEventListener('click', () => {
    void runTutorAction(draft, step, 'organize', rerender);
  });
  document.querySelector<HTMLButtonElement>('#apply-authoring-candidate')?.addEventListener('click', () => {
    const field = fieldForStep(step);
    const candidate = draft.candidates[step];
    if (field && candidate) {
      updateTextField(draft, field, candidate);
      delete draft.candidates[step];
      touchDraft(draft);
      authoringStatus = '候选稿已采用，你仍可继续修改。';
      rerenderAuthoringInPlace(rerender);
    }
  });
  document.querySelector<HTMLButtonElement>('#generate-authoring-opening')?.addEventListener('click', () => {
    void runTutorAction(draft, 'preview', 'opening', rerender);
  });
  document.querySelector<HTMLButtonElement>('#save-authoring-draft')?.addEventListener('click', () => {
    touchDraft(draft);
    closeAuthoring();
    rerender();
  });
  document.querySelector<HTMLButtonElement>('#export-authoring-card')?.addEventListener('click', async () => {
    try {
      const character = characterProfileFromDraft(draft);
      touchDraft(draft);
      await downloadSillyTavernCard(character);
      authoringStatus = `已导出 ${character.name} 的标准 SillyTavern V3 角色卡。`;
      rerender();
    } catch (error) {
      authoringStatus = error instanceof DOMException && error.name === 'AbortError'
        ? '已取消导出。'
        : error instanceof Error ? error.message : String(error);
      rerender();
    }
  });
  document.querySelector<HTMLButtonElement>('#export-authoring-card')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void (async () => {
      try {
        const character = characterProfileFromDraft(draft);
        touchDraft(draft);
        const downloadInfo = await downloadSillyTavernCard(character);
        const message = `已导出 ${character.name} 的标准 SillyTavern V3 角色卡。\n文件名：${downloadInfo.fileName}\n保存位置：${downloadInfo.folderHint}`;
        openAppAlert({
          title: '角色卡已导出',
          message,
          confirmLabel: '知道了',
        }, rerender);
        authoringStatus = message.replace(/\n/g, ' ');
        rerender();
      } catch (error) {
        authoringStatus = error instanceof DOMException && error.name === 'AbortError'
          ? '已取消导出。'
          : error instanceof Error ? error.message : String(error);
        rerender();
      }
    })();
  }, { capture: true });
  document.querySelector<HTMLButtonElement>('#create-authoring-character')?.addEventListener('click', () => {
    try {
      createCharacterFromDraft(draft);
      closeAuthoring();
      rerender();
    } catch (error) {
      authoringStatus = error instanceof Error ? error.message : String(error);
      rerender();
    }
  });
}

export function renderDraftManager(): string {
  const drafts = [...state.characterCardDrafts].sort((left, right) => right.updatedAt - left.updatedAt);
  if (drafts.length === 0) {
    return '<div class="draft-empty"><p>还没有写卡草稿。</p><button class="primary" data-open-authoring>开始写角色卡</button></div>';
  }
  return `
    <div class="draft-manager">
      <button class="primary" data-open-authoring>新建角色卡</button>
      ${drafts.map(draft => `
        <article class="draft-row">
          <div>
            <span>角色卡草稿 · ${STEP_LABELS[draft.currentStep]}</span>
            <strong>${escapeHtml(draft.name || '未命名角色')}</strong>
            <p>${escapeHtml(compactText(draft.concept || draft.appearance || '尚未填写内容', 90))}</p>
            <small>更新于 ${new Date(draft.updatedAt).toLocaleString()}${draft.linkedCharacterId ? ' · 已创建角色' : ''}</small>
          </div>
          <div class="draft-row-actions">
            <button class="primary" data-resume-draft="${escapeHtml(draft.id)}">继续</button>
            <button class="secondary" data-duplicate-draft="${escapeHtml(draft.id)}">复制</button>
            <button class="danger" data-delete-draft="${escapeHtml(draft.id)}">删除</button>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

export function bindDraftManager(rerender: () => void): void {
  document.querySelectorAll<HTMLButtonElement>('[data-open-authoring]').forEach(button => {
    button.addEventListener('click', () => {
      openAuthoringChooser();
      rerender();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-resume-draft]').forEach(button => {
    button.addEventListener('click', () => {
      resumeAuthoringDraft(button.dataset.resumeDraft ?? '');
      rerender();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-duplicate-draft]').forEach(button => {
    button.addEventListener('click', () => {
      const draft = state.characterCardDrafts.find(item => item.id === button.dataset.duplicateDraft);
      if (draft) duplicateCharacterCardDraft(draft);
      rerenderAuthoringInPlace(rerender);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-draft]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.deleteDraft ?? '';
      const draft = state.characterCardDrafts.find(item => item.id === id);
      if (!draft) return;
      openAppConfirm({
        title: '删除角色卡草稿',
        message: `确定删除草稿“${draft.name || '未命名角色'}”吗？`,
        confirmLabel: '删除草稿',
        cancelLabel: '保留',
        tone: 'danger',
        onConfirm: () => {
          deleteCharacterCardDraft(id);
        },
      }, rerender);
    });
  });
}
