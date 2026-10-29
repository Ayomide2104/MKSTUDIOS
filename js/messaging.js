import { io } from 'socket.io-client';

export function createMessaging({ api, getCurrentUser, toast }) {
  let socket = null;
  let activeUsername = null;
  let activeFriend = null;
  let conversations = [];
  let initialized = false;
  let loading = false;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  };

  const button = (label, className, action) => {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };

  const overlay = element('div', 'arc-chat-overlay');
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');

  const windowNode = element('section', 'arc-chat-window');
  windowNode.setAttribute('role', 'dialog');
  windowNode.setAttribute('aria-modal', 'true');
  windowNode.setAttribute('aria-label', 'Messages');

  const header = element('header', 'arc-chat-header');
  const backButton = button('', 'arc-chat-back', closeChat);


backButton.innerHTML = `
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M15 18L9 12L15 6"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

backButton.setAttribute('aria-label', 'Back to conversations');
backButton.title = 'Back to conversations';

  const headerInfo = element('div', 'arc-chat-header-info');
  const heading = element('h2', 'arc-chat-heading', 'Messages');
  const subtitle = element('p', 'arc-chat-subtitle', 'Your squad, one conversation away.');
  const closeButton = button('×', 'arc-chat-close', closeChat);
  closeButton.setAttribute('aria-label', 'Close messages');

  headerInfo.append(heading, subtitle);
  header.append(backButton, headerInfo, closeButton);
  const content = element('div', 'arc-chat-content');
  const sidebar = element('aside', 'arc-chat-sidebar');
  const sidebarHeading = element('h3', 'arc-chat-section-title', 'Conversations');
  const conversationList = element('div', 'arc-chat-conversations');

  sidebar.append(sidebarHeading, conversationList);

  const panel = element('section', 'arc-chat-panel');
  const emptyState = element('div', 'arc-chat-empty');
  emptyState.append(
    element('div', 'arc-chat-empty-icon', '✦'),
    element('h3', '', 'Your next conversation starts here'),
    element('p', '', 'Choose a friend to start chatting.')
  );

  const chatHeading = element('div', 'arc-chat-person');
  const chatAvatar = element('div', 'arc-chat-avatar', '?');
  const chatName = element('div', 'arc-chat-person-name', 'Choose a friend');
  const chatStatus = element('div', 'arc-chat-person-status', 'Private messages');
  const personText = element('div', 'arc-chat-person-text');

  personText.append(chatName, chatStatus);
  chatHeading.append(chatAvatar, personText);

  const messages = element('div', 'arc-chat-messages');
  messages.setAttribute('role', 'log');
  messages.setAttribute('aria-live', 'polite');
  messages.setAttribute('aria-label', 'Conversation messages');

  const loadingState = element('div', 'arc-chat-loading', 'Loading conversation…');
  loadingState.hidden = true;

  const composer = element('form', 'arc-chat-composer');
  const input = element('textarea', 'arc-chat-input');
  input.name = 'content';
  input.rows = 1;
  input.maxLength = 2000;
  input.placeholder = 'Write a message…';
  input.setAttribute('aria-label', 'Message');
  input.required = true;

  const sendButton = button('', 'arc-chat-send', () => {});
sendButton.innerHTML = `
  <svg
    viewBox="0 0 24 24"
    width="21"
    height="21"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M22 2L11 13"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M22 2L15 22L11 13L2 9L22 2Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;
sendButton.type = 'submit';
sendButton.setAttribute('aria-label', 'Send message');
sendButton.title = 'Send message';
  sendButton.type = 'submit';

  


const inputWrapper = element('div', 'arc-chat-input-wrapper');

inputWrapper.append(input, sendButton);
composer.append(inputWrapper);

  panel.append(chatHeading, messages, loadingState, composer);
  panel.hidden = true;

  content.append(sidebar, panel, emptyState);
  windowNode.append(header, content);
  overlay.append(windowNode);
  const inboxHost = document.querySelector('#inbox-app');
    (inboxHost || document.body).append(overlay);

  function getUserIdentifier(user = getCurrentUser()) {
    return String(user?._id || user?.id || '');
  }

  function getUsername(user = getCurrentUser()) {
    return String(user?.username || '');
  }

  function normalizeMessage(message) {
    const sender = message.sender?._id
      || message.sender?.id
      || message.sender;

    const senderId = String(sender || '');
    const currentId = getUserIdentifier();

    return {
      ...message,
      id: String(message.id || message._id || ''),
      isMine: Boolean(currentId && senderId === currentId)
    };
  }

  function escapeDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function scrollToLatest() {
    messages.scrollTop = messages.scrollHeight;
  }

  function renderMessage(message) {
    const item = normalizeMessage(message);

    if (item.id && messages.querySelector(`[data-message-id="${CSS.escape(item.id)}"]`)) {
      return;
    }

    const row = element(
      'div',
      `arc-chat-message-row ${item.isMine ? 'is-mine' : 'is-theirs'}`
    );

    if (item.id) row.dataset.messageId = item.id;

    const bubble = element('div', 'arc-chat-bubble');
    const text = element('p', 'arc-chat-message-text', item.content || '');

    const footer = element('div', 'arc-chat-message-meta');
    const time = element('time', 'arc-chat-time', escapeDate(item.createdAt));

    if (item.createdAt) {
      time.dateTime = new Date(item.createdAt).toISOString();
    }

    footer.append(time);

    if (item.isMine) {
      const receipt = element(
        'span',
        `arc-chat-receipt ${item.readAt ? 'is-read' : ''}`,
        item.readAt ? '✓✓ Read' : '✓ Sent'
      );

      receipt.setAttribute(
        'aria-label',
        item.readAt ? 'Message read' : 'Message sent'
      );

      footer.append(receipt);
    }

    bubble.append(text, footer);
    row.append(bubble);
    messages.append(row);
  }

  function renderMessages(items = []) {
    messages.replaceChildren();

    for (const item of items) {
      renderMessage(item);
    }

    scrollToLatest();
  }

  function renderConversations() {
    conversationList.replaceChildren();

    if (!conversations.length) {
      conversationList.append(
        element(
          'p',
          'arc-chat-list-empty',
          'No conversations yet. Open a friend’s profile to say hello.'
        )
      );
      return;
    }

    for (const conversation of conversations) {
      const person = conversation.user;
      if (!person?.username) continue;

      const row = button(
        '',
        `arc-chat-conversation ${person.username === activeUsername ? 'is-active' : ''}`,
        () => void openChat(person)
      );

      const avatar = element(
        'span',
        'arc-chat-list-avatar',
        (person.displayName || person.username).slice(0, 1).toUpperCase()
      );

      const details = element('span', 'arc-chat-list-details');
      const name = element(
        'span',
        'arc-chat-list-name',
        person.displayName || person.username
      );

      const preview = element(
        'span',
        'arc-chat-list-preview',
        conversation.lastMessage?.content || 'Start a conversation'
      );

      details.append(name, preview);
      row.append(avatar, details);

      if (conversation.unreadCount > 0) {
        row.append(
          element(
            'span',
            'arc-chat-unread',
            String(conversation.unreadCount)
          )
        );
      }

      conversationList.append(row);
    }
  }

  async function refreshConversations() {
    if (!getCurrentUser()) return;

    try {
      const result = await api('/messages/conversations');
      conversations = result.items || [];
      renderConversations();
    } catch (error) {
      toast(error.message || 'Could not load conversations.');
    }
  }

  async function markConversationRead(username) {
    if (!username || username !== activeUsername) return;

    try {
      await api(`/messages/${encodeURIComponent(username)}/read`, {
        method: 'PATCH'
      });

      const conversation = conversations.find(
        item => item.user?.username === username
      );

      if (conversation) conversation.unreadCount = 0;

      renderConversations();
    } catch {
      // The next conversation refresh can retry.
    }
  }

 function showMessagePanel(friend) {
  activeFriend = friend;
  activeUsername = friend.username;

  heading.textContent = 'Chat';
  chatName.textContent = friend.displayName || friend.username;
  chatStatus.textContent = `@${friend.username}`;
  chatAvatar.textContent = (friend.displayName || friend.username)
    .slice(0, 1)
    .toUpperCase();

  panel.hidden = false;
  emptyState.hidden = true;
  backButton.hidden = false;

  renderConversations();
}

  async function openChat(friend) {
    if (!getCurrentUser()) {
      toast('Sign in to message your friends.');
      return;
    }

    if (!friend?.username) {
      toast('We could not identify this friend.');
      return;
    }

    showMessagePanel(friend);
    messages.replaceChildren();
    loadingState.hidden = false;
    input.disabled = true;
    sendButton.disabled = true;

    try {
      const result = await api(
        `/messages/${encodeURIComponent(friend.username)}`
      );

      // Ignore a late response if the user opened another conversation.
      if (activeUsername !== friend.username) return;

      activeFriend = result.friend || friend;

      chatName.textContent =
        activeFriend.displayName || activeFriend.username;

      chatAvatar.textContent = (
        activeFriend.displayName || activeFriend.username
      ).slice(0, 1).toUpperCase();

      renderMessages(result.items || []);
      await markConversationRead(friend.username);
      input.focus();
    } catch (error) {
      if (activeUsername === friend.username) {
        messages.replaceChildren(
          element(
            'p',
            'arc-chat-error',
            error.message || 'Could not open this conversation.'
          )
        );
      }
    } finally {
      loadingState.hidden = true;

      if (activeUsername === friend.username) {
        input.disabled = false;
        sendButton.disabled = false;
      }
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    const content = input.value.trim();

    if (!content || !activeUsername || loading) return;

    loading = true;
    sendButton.disabled = true;

    try {
      const username = activeUsername;

      const result = await api(
        `/messages/${encodeURIComponent(username)}`,
        {
          method: 'POST',
          body: JSON.stringify({ content })
        }
      );

      if (activeUsername !== username) return;

      if (result.message) {
        renderMessage(result.message);
      }

      input.value = '';
      input.style.height = 'auto';
      scrollToLatest();

      await refreshConversations();
    } catch (error) {
      toast(error.message || 'Message could not be sent.');
    } finally {
      loading = false;
      sendButton.disabled = false;
      input.focus();
    }
  }


  
  function handleIncomingMessage(rawMessage) {
    const message = normalizeMessage(rawMessage);
    const currentUserId = getUserIdentifier();

    if (!message.id || !message.content || !currentUserId) return;

    const sender = String(
      rawMessage.sender?._id
      || rawMessage.sender?.id
      || rawMessage.sender
      || ''
    );

    const recipient = String(
      rawMessage.recipient?._id
      || rawMessage.recipient?.id
      || rawMessage.recipient
      || ''
    );

    // Ignore events that do not involve the signed-in user.
    if (sender !== currentUserId && recipient !== currentUserId) {
      void refreshConversations();
      return;
    }

    // Identify the other participant by database ID.
    const otherUserId = sender === currentUserId ? recipient : sender;

    // The conversation list contains usernames, so resolve the ID
    // through the loaded conversation data when possible.
    const conversation = conversations.find((item) => {
      const last = item.lastMessage;
      const otherId = sender === currentUserId ? recipient : sender;

      return String(last?.sender || '') === otherId
        || String(last?.recipient || '') === otherId;
    });

    const otherUsername = conversation?.user?.username
      || (activeFriend?._id && String(activeFriend._id) === otherUserId
        ? activeFriend.username
        : activeFriend?.id && String(activeFriend.id) === otherUserId
          ? activeFriend.username
          : '');

    if (!otherUsername) {
      void refreshConversations();
      return;
    }

    if (activeUsername === otherUsername && !overlay.hidden) {
      renderMessage(message);

      if (!message.isMine) {
        void markConversationRead(otherUsername);
      }

      scrollToLatest();
    }

    void refreshConversations();
  }

  function handleReadReceipt(payload = {}) {
    if (!payload.username || payload.username !== activeUsername) return;

    const outgoing = messages.querySelectorAll('.arc-chat-message-row.is-mine');

    for (const row of outgoing) {
      const receipt = row.querySelector('.arc-chat-receipt');

      if (receipt) {
        receipt.textContent = '✓✓ Read';
        receipt.classList.add('is-read');
        receipt.setAttribute('aria-label', 'Message read');
      }
    }
  }

  function connect() {
    if (!getCurrentUser() || socket?.connected) return;

    if (!socket) {
      socket = io({
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000
        });

      socket.on('connect', () => {
        void refreshConversations();
      });

      socket.on('message:new', handleIncomingMessage);
      socket.on('message:read', handleReadReceipt);

      socket.on('connect_error', (error) => {
        console.error('[Messaging] Socket connection failed:', error.message);
        console.error('[Messaging] Connection details:', error);
        });
    }
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    activeUsername = null;
    activeFriend = null;
    conversations = [];
    closeChat();
  }

  function closeChat() {
  activeUsername = null;
  activeFriend = null;

  panel.hidden = true;
  emptyState.hidden = false;
  backButton.hidden = true;
}
function openInbox() {
  if (!getCurrentUser()) {
    toast('Sign in to view your chats.');
    return;
  }

  connect();

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  activeUsername = null;
  activeFriend = null;

  heading.textContent = 'Chat';
  panel.hidden = true;
  emptyState.hidden = false;
  backButton.hidden = true;

  void refreshConversations();
}
  overlay.addEventListener('click', event => {
  if (event.target === overlay) {
    panel.hidden = true;
    emptyState.hidden = false;
  }
});

  document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !overlay.hidden) {
    panel.hidden = true;
    emptyState.hidden = false;
  }
});

  composer.addEventListener('submit', sendMessage);

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  });

  function init() {
    if (initialized) return;
    initialized = true;
    connect();
  }

  return {
    init,
    connect,
    disconnect,
    openChat,
    openInbox,
    refreshConversations
  };
}