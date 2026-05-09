// src/store/conversationStore.js
// Conversation history — stores the full dialogue between user and ARIA.
// Each message has: id, role, text, timestamp, isVoice.

import { create } from 'zustand';

let _msgId = 0;

const useConversationStore = create((set) => ({
  /** @type {Array<{id:number, role:'user'|'aria', text:string, timestamp:Date, isVoice:boolean}>} */
  messages: [],

  /** @param {string} text  @param {boolean} isVoice */
  addUserMessage: (text, isVoice = false) =>
    set((s) => ({
      messages: [...s.messages, {
        id: ++_msgId,
        role: 'user',
        text,
        timestamp: new Date(),
        isVoice,
      }],
    })),

  /** @param {string} text */
  addAriaMessage: (text) =>
    set((s) => ({
      messages: [...s.messages, {
        id: ++_msgId,
        role: 'aria',
        text,
        timestamp: new Date(),
        isVoice: false,
      }],
    })),

  clearHistory: () => set({ messages: [] }),
}));

export default useConversationStore;
