import React, { useState, useRef, useEffect } from 'react';

export default function App({ apiKey, apiBase }) {
  // apiBase is the origin that served this widget script (see main.jsx); fall
  // back to the page origin. Never bake in a build-time URL — the widget is
  // embedded on arbitrary hosts and must resolve its backend purely at runtime.
  const API_URL = `${apiBase || window.location.origin}/api/chat`;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, message: text, conversationId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'daily_limit_reached') {
          setError('Daily message limit reached. Please try again tomorrow.');
        } else {
          setError(data.error || 'Something went wrong.');
        }
        return;
      }

      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply },
      ]);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="trinode-root" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 2147483647 }}>
      {open && (
        <div className="trinode-window" role="dialog" aria-label="Chat">
          <div className="trinode-header">
            <span>Chat</span>
            <button
              className="trinode-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div className="trinode-messages">
            {messages.length === 0 && (
              <p className="trinode-empty">How can I help you today?</p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`trinode-bubble trinode-bubble--${msg.role}`}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="trinode-bubble trinode-bubble--assistant trinode-typing">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && <p className="trinode-error">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <form className="trinode-form" onSubmit={sendMessage}>
            <input
              className="trinode-input"
              type="text"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button
              className="trinode-send"
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              ➤
            </button>
          </form>
        </div>
      )}

      <button
        className="trinode-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
}
