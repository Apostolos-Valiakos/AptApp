import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "./auth"; // Import auth store to access user info

interface User {
  id: string;
  username: string;
  staff_name?: string;
}

interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  message_type: string;
  content: string;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  created_at: string;
  user: User;
  read_by: Array<{ user_id: string; read_at: string }>;
}

interface Channel {
  id: string;
  shop_id: string;
  name: string;
  description?: string;
  member_count: number;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

interface TypingUser {
  channelId: string;
  userId: string;
  username: string;
}

export const useChatStore = defineStore("chat", () => {
  const authStore = useAuthStore(); // Initialize Auth Store

  const socket = ref<Socket | null>(null);
  const channels = ref<Channel[]>([]);
  const messages = ref<Map<string, Message[]>>(new Map());
  const activeChannelId = ref<string | null>(null);
  const isConnected = ref(false);
  const onlineUsers = ref<Set<string>>(new Set());
  const typingUsers = ref<Map<string, Set<string>>>(new Map());
  const isMinimized = ref(true);
  const notificationSound = ref<HTMLAudioElement | null>(null);

  const totalUnreadCount = computed(() => {
    if (!channels.value || !Array.isArray(channels.value)) {
      return 0;
    }
    return channels.value.reduce(
      (sum, ch) => sum + Math.max(0, Math.floor(Number(ch.unread_count) || 0)),
      0
    );
  });

  const activeChannel = computed(() => {
    if (!channels.value || !Array.isArray(channels.value)) {
      return null;
    }
    return channels.value.find((ch) => ch.id === activeChannelId.value);
  });

  const activeMessages = computed(() => {
    if (!activeChannelId.value) return [];
    return messages.value.get(activeChannelId.value) || [];
  });

  const typingInActiveChannel = computed(() => {
    if (!activeChannelId.value) return [];
    const typingSet = typingUsers.value.get(activeChannelId.value);
    return typingSet ? Array.from(typingSet) : [];
  });

  // Initialize Socket.IO
  const connect = (token: string) => {
    if (socket.value?.connected) return;

    // const socketUrl = window.location.origin;

    // socket.value = io(socketUrl, {
    //   auth: { token },
    //   transports: ["websocket", "polling"],
    // });
    socket.value = io({
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.value.on("connect", () => {
      console.log("Socket connected");
      isConnected.value = true;
    });

    socket.value.on("disconnect", () => {
      console.log("Socket disconnected");
      isConnected.value = false;
    });

    socket.value.on("users:online", (userIds: string[]) => {
      onlineUsers.value = new Set(userIds);
    });

    socket.value.on("user:online", ({ userId }: { userId: string }) => {
      onlineUsers.value.add(userId);
    });

    socket.value.on("user:offline", ({ userId }: { userId: string }) => {
      onlineUsers.value.delete(userId);
    });

    socket.value.on("chat:message", (message: Message) => {
      const channelMessages = messages.value.get(message.channel_id) || [];
      const optimisticIndex = channelMessages.findIndex((m) =>
        m.id.startsWith("temp-")
      );

      if (optimisticIndex !== -1) {
        // Replace optimistic message with real one
        channelMessages[optimisticIndex] = message;
        messages.value.set(message.channel_id, [...channelMessages]);
      } else {
        // Check if message already exists (prevents duplicates from socket broadcast)
        const isDuplicate = channelMessages.some((m) => m.id === message.id);
        if (!isDuplicate) {
          messages.value.set(message.channel_id, [...channelMessages, message]);
        }
      }

      // Update the channel list summary
      const channel = channels.value.find((ch) => ch.id === message.channel_id);
      if (channel) {
        // Update the timestamp so this channel moves to the top of the list
        channel.updated_at = message.created_at;

        // Handle Unread Counts
        const currentUserId = authStore.user?.id; // Use authStore.user here
        const isFromMe = message.user_id === currentUserId;
        const isChatOpen = message.channel_id === activeChannelId.value;

        // Increment unread count only if the message is from someone else
        // AND I don't have that specific chat window open
        if (!isFromMe && !isChatOpen) {
          channel.unread_count = (channel.unread_count || 0) + 1;
          playNotificationSound();
        }
      }

      // Auto-scroll to bottom if the user is looking at this channel
      if (message.channel_id === activeChannelId.value) {
        setTimeout(() => scrollToBottom(), 100);
      }
    });

    socket.value.on("typing:update", ({ channelId, userId, isTyping }: any) => {
      if (!typingUsers.value.has(channelId)) {
        typingUsers.value.set(channelId, new Set());
      }

      const channelTyping = typingUsers.value.get(channelId)!;
      if (isTyping) {
        channelTyping.add(userId);
      } else {
        channelTyping.delete(userId);
      }
    });

    socket.value.on("message:read:update", ({ messageId, userId }: any) => {
      // Update read receipts for the message
      for (const [channelId, msgs] of messages.value.entries()) {
        const msg = msgs.find((m) => m.id === messageId);
        if (msg) {
          if (!msg.read_by) msg.read_by = [];
          if (!msg.read_by.find((r) => r.user_id === userId)) {
            msg.read_by.push({
              user_id: userId,
              read_at: new Date().toISOString(),
            });
          }
        }
      }
    });

    // Handle Bulk Read Receipts
    socket.value.on(
      "messages:read:bulk:update",
      ({ channelId, messageIds, userId }) => {
        // If I am the one who read the messages, ensure my local badge for this channel is 0
        if (userId === authStore.user?.id) {
          const channel = channels.value.find((c) => c.id === channelId);
          if (channel) channel.unread_count = 0;
        }

        // Update the read_by array for each message locally so sender sees blue checks
        const channelMessages = messages.value.get(channelId);
        if (channelMessages) {
          channelMessages.forEach((msg) => {
            if (messageIds.includes(msg.id)) {
              if (!msg.read_by) msg.read_by = [];
              if (!msg.read_by.some((r) => r.user_id === userId)) {
                msg.read_by.push({
                  user_id: userId,
                  read_at: new Date().toISOString(),
                });
              }
            }
          });
        }
      }
    );

    // Initialize notification sound
    notificationSound.value = new Audio("/notification.mp3");
  };

  const disconnect = () => {
    socket.value?.disconnect();
    socket.value = null;
    isConnected.value = false;
  };

  const fetchChannels = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/chat/channels", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      channels.value = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("Error fetching channels:", err);
      channels.value = [];
    }
  };

  // Fetch messages for a channel
  const fetchMessages = async (channelId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/v1/chat/channels/${channelId}/messages?limit=50`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // SAFETY CHECK 1: If server errors, stop here.
      if (!res.ok) {
        console.error("Failed to fetch messages:", res.statusText);
        return;
      }

      const data = await res.json();

      // SAFETY CHECK 2: Ensure data is actually an array before filtering
      if (Array.isArray(data)) {
        messages.value.set(channelId, data);

        // Update read status if window is focused
        if (!isMinimized.value && activeChannelId.value === channelId) {
          const unreadIds = data
            .filter((m: any) => {
              const hasRead = m.read_by?.some(
                (r: any) => r.user_id === authStore.user?.id
              );
              return !hasRead && m.user_id !== authStore.user?.id;
            })
            .map((m: any) => m.id);

          if (unreadIds.length > 0) {
            socket.value?.emit("chat:read:bulk", {
              channelId,
              messageIds: unreadIds,
            });
          }
        }
      } else {
        console.warn("API returned unexpected data format", data);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  };

  // Set active channel
  const setActiveChannel = async (channelId: string | null) => {
    activeChannelId.value = channelId;

    if (channelId) {
      // Fetch messages if not loaded
      if (!messages.value.has(channelId)) {
        await fetchMessages(channelId);
      }

      // Mark messages as read
      const channelMessages = messages.value.get(channelId) || [];
      const unreadMessageIds = channelMessages
        .filter((m) => {
          const currentUserId = authStore.user?.id;
          return (
            m.user_id !== currentUserId &&
            !m.read_by?.find((r) => r.user_id === currentUserId)
          );
        })
        .map((m) => m.id);

      if (unreadMessageIds.length > 0) {
        socket.value?.emit("chat:read:bulk", {
          channelId,
          messageIds: unreadMessageIds,
        });
      }

      // Reset unread count
      const channel = channels.value.find((ch) => ch.id === channelId);
      if (channel) {
        channel.unread_count = 0;
      }

      // Join channel room
      socket.value?.emit("channel:join", { channelId });

      // Scroll to bottom
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  const sendMessage = async (
    content: string,
    messageType = "text",
    fileData?: any
  ) => {
    if (!activeChannelId.value || (!content.trim() && !fileData)) return;

    const messageData = {
      channelId: activeChannelId.value,
      content: content.trim(),
      messageType: messageType,
      fileName: fileData?.name || null,
      fileSize: fileData?.size || null,
      fileType: fileData?.type || null,
      fileBase64: fileData?.base64 || null,
    };

    socket.value?.emit("chat:message", messageData);
  };

  // Send typing indicator
  let typingTimeout: NodeJS.Timeout | null = null;
  const sendTyping = (isTyping: boolean) => {
    if (!activeChannelId.value) return;

    if (isTyping) {
      socket.value?.emit("typing:start", { channelId: activeChannelId.value });

      // Auto-stop after 3 seconds
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.value?.emit("typing:stop", { channelId: activeChannelId.value });
      }, 3000);
    } else {
      socket.value?.emit("typing:stop", { channelId: activeChannelId.value });
      if (typingTimeout) clearTimeout(typingTimeout);
    }
  };

  const addMessageLocally = (channelId: string, message: Message) => {
    const existing = messages.value.get(channelId) || [];
    messages.value.set(channelId, [...existing, message]);
  };

  // Upload file
  const uploadFile = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/chat/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Upload failed");
      }

      return await res.json();
    } catch (err) {
      console.error("Error uploading file:", err);
      throw err;
    }
  };

  const createChannel = async (
    name: string,
    description: string,
    memberIds: string[]
  ) => {
    try {
      const token = localStorage.getItem("token");

      // Safety check: Ensure all IDs are strings and not numbers/objects
      const cleanMemberIds = memberIds.map((id) => String(id));

      const res = await fetch("/api/v1/chat/channels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          description,
          memberIds: cleanMemberIds,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create channel");
      }

      const newChannel = await res.json();
      channels.value.unshift(newChannel);
      return newChannel;
    } catch (err) {
      console.error("Store Error:", err);
      throw err;
    }
  };

  // Helper functions
  const scrollToBottom = () => {
    const messagesContainer = document.querySelector(
      ".chat-messages-container"
    );
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  const playNotificationSound = () => {
    if (!isMinimized.value) return;

    try {
      notificationSound.value?.play().catch((err) => {
        console.log("Could not play notification sound:", err);
      });
    } catch (err) {
      console.log("Notification sound error:", err);
    }
  };

  const toggleMinimized = () => {
    isMinimized.value = !isMinimized.value;
  };

  return {
    socket,
    channels,
    messages,
    activeChannelId,
    activeChannel,
    activeMessages,
    isConnected,
    onlineUsers,
    typingInActiveChannel,
    isMinimized,
    totalUnreadCount,
    connect,
    disconnect,
    fetchChannels,
    fetchMessages,
    setActiveChannel,
    sendMessage,
    sendTyping,
    uploadFile,
    createChannel,
    toggleMinimized,
    addMessageLocally,
  };
});
