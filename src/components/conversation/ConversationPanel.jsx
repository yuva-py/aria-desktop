// src/components/conversation/ConversationPanel.jsx
// Chat history panel — shows the full dialogue between user and ARIA.
// User messages on the right, ARIA messages on the left.
// Voice-input messages get a mic badge. Auto-scrolls to latest message.

import React, { useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useConversationStore from '../../store/conversationStore';
import './ConversationPanel.css';

// ── Mic SVG icon ─────────────────────────────────────────────────────────────
function MicBadge() {
  return (
    <span className="conv-msg__voice-badge" title="Voice input">
      <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden="true">
        <rect x="2" y="0.5" width="5" height="6.5" rx="2.5"
          fill="currentColor" opacity="0.9" />
        <path d="M0.5 5.5a4 4 0 0 0 8 0"
          stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="4.5" y1="9.5" x2="4.5" y2="11"
          stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="3" y1="11" x2="6" y2="11"
          stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// ── ARIA logo mark ────────────────────────────────────────────────────────────
function AriaIcon() {
  return (
    <span className="conv-msg__aria-icon" aria-hidden="true">
      ◈
    </span>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const hhmm   = msg.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return (
    <motion.div
      className={`conv-msg conv-msg--${isUser ? 'user' : 'aria'}`}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: -6              }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {!isUser && <AriaIcon />}

      <div className="conv-msg__bubble">
        {isUser && msg.isVoice && <MicBadge />}
        <p className="conv-msg__text">{msg.text}</p>
        <span className="conv-msg__time">{hhmm}</span>
      </div>
    </motion.div>
  );
});

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <motion.div
      className="conv-empty"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      <span className="conv-empty__icon">◈</span>
      <p className="conv-empty__text">
        No conversation yet.<br />
        Start typing or speak to ARIA.
      </p>
    </motion.div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function ConversationPanel() {
  const messages    = useConversationStore((s) => s.messages);
  const clearHistory = useConversationStore((s) => s.clearHistory);
  const bottomRef   = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  return (
    <div className="conv-panel">
      {/* ── Header ── */}
      <div className="conv-panel__header">
        <span className="conv-panel__title">Conversation</span>
        {messages.length > 0 && (
          <button
            className="conv-panel__clear"
            onClick={clearHistory}
            title="Clear history"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Message list ── */}
      <div className="conv-panel__messages">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
