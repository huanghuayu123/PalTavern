import { startIndependentChatServer } from './independent-chat-server.mjs';

startIndependentChatServer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
