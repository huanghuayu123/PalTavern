/**
 * Big comment: Lightweight long-RP chapter and scene helpers.
 * These functions keep chapter state independent from world-event generation so the UI can expose a simple v1 workflow.
 */
import { activeWorld, saveState, state } from '../core/state';
import type { WorldChapter, WorldChapterScene } from '../core/types';
import { nowId } from '../core/utils';

export interface CreateWorldChapterInput {
  title: string;
  summary?: string;
  worldId?: string;
}

export interface CreateWorldSceneInput {
  title: string;
  summary?: string;
  sourceEventId?: string;
}

function cleanTitle(value: string, fallback: string): string {
  return value.trim() || fallback;
}

export function chaptersForWorld(worldId = activeWorld().id): WorldChapter[] {
  return state.worldChapters
    .filter(chapter => chapter.worldId === worldId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function activeWorldChapter(worldId = activeWorld().id): WorldChapter | undefined {
  const activeId = state.activeWorldChapterIdByWorldId[worldId];
  return state.worldChapters.find(chapter =>
    chapter.id === activeId && chapter.worldId === worldId && chapter.status === 'active',
  ) ?? chaptersForWorld(worldId).find(chapter => chapter.status === 'active');
}

export function createWorldChapter(input: CreateWorldChapterInput): WorldChapter {
  const worldId = input.worldId ?? activeWorld().id;
  const now = Date.now();
  const chapter: WorldChapter = {
    id: nowId('chapter'),
    worldId,
    title: cleanTitle(input.title, '新章节'),
    summary: input.summary?.trim() ?? '',
    activeSceneId: '',
    status: 'active',
    scenes: [],
    createdAt: now,
    updatedAt: now,
  };
  state.worldChapters.unshift(chapter);
  state.activeWorldChapterIdByWorldId[worldId] = chapter.id;
  saveState();
  return chapter;
}

export function setActiveWorldChapter(chapterId: string): WorldChapter | undefined {
  const chapter = state.worldChapters.find(item => item.id === chapterId && item.status === 'active');
  if (!chapter) return undefined;
  state.activeWorldChapterIdByWorldId[chapter.worldId] = chapter.id;
  chapter.updatedAt = Date.now();
  saveState();
  return chapter;
}

export function createWorldScene(chapterId: string, input: CreateWorldSceneInput): WorldChapterScene {
  const chapter = state.worldChapters.find(item => item.id === chapterId);
  if (!chapter) throw new Error('找不到这个章节。');
  if (chapter.status === 'ended') throw new Error('已结束的章节不能新增场景。');
  const now = Date.now();
  const scene: WorldChapterScene = {
    id: nowId('scene'),
    chapterId: chapter.id,
    worldId: chapter.worldId,
    title: cleanTitle(input.title, '新场景'),
    summary: input.summary?.trim() ?? '',
    sourceEventId: input.sourceEventId?.trim() || undefined,
    status: 'active',
    startedAt: now,
  };
  chapter.scenes.push(scene);
  chapter.activeSceneId = scene.id;
  chapter.updatedAt = now;
  state.activeWorldChapterIdByWorldId[chapter.worldId] = chapter.id;
  saveState();
  return scene;
}

export function setActiveWorldScene(chapterId: string, sceneId: string): WorldChapterScene | undefined {
  const chapter = state.worldChapters.find(item => item.id === chapterId && item.status === 'active');
  const scene = chapter?.scenes.find(item => item.id === sceneId && item.status === 'active');
  if (!chapter || !scene) return undefined;
  chapter.activeSceneId = scene.id;
  chapter.updatedAt = Date.now();
  state.activeWorldChapterIdByWorldId[chapter.worldId] = chapter.id;
  saveState();
  return scene;
}

export function endWorldScene(chapterId: string, sceneId: string, summary?: string): WorldChapterScene | undefined {
  const chapter = state.worldChapters.find(item => item.id === chapterId);
  const scene = chapter?.scenes.find(item => item.id === sceneId);
  if (!chapter || !scene || scene.status === 'ended') return scene;
  const now = Date.now();
  scene.status = 'ended';
  scene.endedAt = now;
  if (summary?.trim()) scene.summary = summary.trim();
  if (chapter.activeSceneId === scene.id) {
    chapter.activeSceneId = chapter.scenes.find(item => item.status === 'active')?.id ?? '';
  }
  chapter.updatedAt = now;
  saveState();
  return scene;
}

export function endWorldChapter(chapterId: string, summary?: string): WorldChapter | undefined {
  const chapter = state.worldChapters.find(item => item.id === chapterId);
  if (!chapter || chapter.status === 'ended') return chapter;
  const now = Date.now();
  chapter.status = 'ended';
  chapter.endedAt = now;
  chapter.activeSceneId = '';
  chapter.updatedAt = now;
  if (summary?.trim()) chapter.summary = summary.trim();
  for (const scene of chapter.scenes) {
    if (scene.status !== 'ended') {
      scene.status = 'ended';
      scene.endedAt = now;
    }
  }
  if (state.activeWorldChapterIdByWorldId[chapter.worldId] === chapter.id) {
    state.activeWorldChapterIdByWorldId[chapter.worldId] = '';
  }
  saveState();
  return chapter;
}
