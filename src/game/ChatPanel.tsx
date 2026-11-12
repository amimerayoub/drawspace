import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, Check, SendHorizonal } from 'lucide-react';
import type { ChatMessage } from '@/types';
import type { GuessResult } from './useGameEngine';
import { useI18n } from '@/i18n/I18nContext';
import { IconButton } from '@/components/ui';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => GuessResult;
  disabled: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  active?: boolean;
  onUnreadChange?: (count: number) => void;
}

export function ChatPanel({ messages, onSend, disabled, inputRef, active = true, onUnreadChange }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [closeNote, setCloseNote] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localInputRef;
  const closeTimer = useRef<number | undefined>(undefined);
  const nearBottomRef = useRef(true);
  const seenIdRef = useRef(-1);
  const forceBottomRef = useRef(false);
  const unreadRef = useRef(0);

  const lastId = messages.length ? messages[messages.length - 1].id : -1;

  // Only touch state when the count actually changes; a setState per message
  // during a rapid flood defeats React's bailout and trips the update-depth limit.
  const applyUnread = (n: number) => {
    if (unreadRef.current === n) return;
    unreadRef.current = n;
    setUnread(n);
  };

  const toBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    seenIdRef.current = lastId;
    nearBottomRef.current = true;
    applyUnread(0);
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    nearBottomRef.current = near;
    if (near) {
      seenIdRef.current = lastId;
      applyUnread(0);
    }
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!active) {
      // Chat tab hidden: don't scroll, accumulate unread for the tab badge.
      applyUnread(messages.filter((m) => m.id > seenIdRef.current).length);
      return;
    }
    if (forceBottomRef.current || nearBottomRef.current) {
      forceBottomRef.current = false;
      el.scrollTop = el.scrollHeight;
      seenIdRef.current = lastId;
      applyUnread(0);
    } else {
      applyUnread(messages.filter((m) => m.id > seenIdRef.current).length);
    }
  }, [messages, lastId, active]);

  useEffect(() => {
    if (active) toBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    onUnreadChange?.(unread);
  }, [unread, onUnreadChange]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    forceBottomRef.current = true;
    const result = onSend(value);
    setText('');
    if (result === 'close') {
      setCloseNote(true);
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => setCloseNote(false), 1800);
    }
    ref.current?.focus();
  };

  return (
    <div className="chat-panel">
      <div className="chat-head">{t('game.chat')}</div>
      <div className="chat-body">
        <div className="chat-list" ref={listRef} onScroll={onScroll} aria-live="polite">
          {messages.map((m) => {
            if (m.kind === 'system') {
              return <p key={m.id} className="chat-system">{m.text}</p>;
            }
            if (m.kind === 'correct') {
              return (
                <p key={m.id} className="chat-correct">
                  <Check size={13} aria-hidden /> {m.text}
                </p>
              );
            }
            return (
              <p key={m.id} className="chat-msg">
                <span className="chat-name">{m.username}</span>
                <span className="chat-text">{m.text}</span>
              </p>
            );
          })}
        </div>
        {unread > 0 && (
          <button type="button" className="chat-new-pill" onClick={() => toBottom('smooth')}>
            <ArrowDown size={13} aria-hidden />
            {t('game.newMessages')}
            <span className="mono">{unread > 99 ? '99+' : unread}</span>
          </button>
        )}
      </div>
      {closeNote && <p className="chat-close-note" role="status">Close. Keep trying.</p>}
      <form className="chat-form" onSubmit={submit}>
        <input
          ref={ref}
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('game.guessPlaceholder')}
          aria-label={t('game.guessPlaceholder')}
          disabled={disabled}
          maxLength={80}
          autoComplete="off"
        />
        <IconButton label={t('game.send')} type="submit" disabled={disabled || !text.trim()} className="chat-send">
          <SendHorizonal size={16} />
        </IconButton>
      </form>
    </div>
  );
}