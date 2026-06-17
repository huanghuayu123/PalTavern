/**
 * 大注释：App entry module.
 * Keeps the original boot order: styles, first render, opening message, then background scheduling.
 */
import './polyfills/old-android';
import './styles.css';
import { generateOpeningMessage } from './chat/private-chat';
import { startAutoMessageScheduler } from './automation/scheduler';
import { activeCharacter } from './core/state';
import { render, renderWhenChatInputIdle } from './ui/app';

// 小注释：启动顺序保持旧版行为，避免整理目录后影响首次渲染和开场白补齐。
render();
const initialCharacter = activeCharacter();
if (initialCharacter) void generateOpeningMessage(initialCharacter, render);
startAutoMessageScheduler(renderWhenChatInputIdle);
