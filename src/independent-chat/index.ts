import './styles.css';
import { generateOpeningMessage } from './chat';
import { startAutoMessageScheduler } from './scheduler';
import { activeCharacter } from './state';
import { render, renderWhenChatInputIdle } from './ui';

render();
const initialCharacter = activeCharacter();
if (initialCharacter) void generateOpeningMessage(initialCharacter, render);
startAutoMessageScheduler(renderWhenChatInputIdle);
