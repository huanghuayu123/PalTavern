/**
 * 大注释：App entry module.
 * Keeps the original boot order: styles, first render, opening message, then background scheduling.
 */
import './styles.css';
// 小注释：外观层（主题色、动效图层）和手机/平板新界面层，放在旧样式之后。
import './styles-appearance.css';
import './styles-mobile.css';
import { generateOpeningMessage } from './chat/private-chat';
import { startAutoMessageScheduler } from './automation/scheduler';
import { activeCharacter } from './core/state';
import { render, renderWhenChatInputIdle } from './ui/app';

// 小注释：启动顺序保持旧版行为，避免整理目录后影响首次渲染和开场白补齐。
render();
const initialCharacter = activeCharacter();
if (initialCharacter) void generateOpeningMessage(initialCharacter, render);
startAutoMessageScheduler(renderWhenChatInputIdle);
