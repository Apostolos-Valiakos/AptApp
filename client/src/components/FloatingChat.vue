<template>
  <div class="floating-chat" :class="{ minimized: chatStore.isMinimized }">
    <!-- Minimized State -->
    <div
      v-if="chatStore.isMinimized"
      class="chat-minimized"
      @click="chatStore.toggleMinimized()"
    >
      <i class="pi pi-comments text-2xl"></i>
      <span v-if="chatStore.totalUnreadCount > 0" class="unread-badge">
        {{
          chatStore.totalUnreadCount > 99 ? "99+" : chatStore.totalUnreadCount
        }}
      </span>
    </div>

    <!-- Expanded State -->
    <div v-else class="chat-expanded">
      <!-- Header -->
      <div class="chat-header">
        <div class="flex items-center gap-2">
          <i class="pi pi-comments"></i>
          <span class="font-semibold">{{
            chatStore.activeChannel?.name || "Messages"
          }}</span>
          <span v-if="!chatStore.isConnected" class="text-xs text-red-500"
            >(Disconnected)</span
          >
        </div>
        <div class="flex gap-2">
          <Button
            icon="pi pi-minus"
            text
            rounded
            @click="chatStore.toggleMinimized()"
          />
        </div>
      </div>

      <!-- Channel List (when no active channel) -->
      <div v-if="!chatStore.activeChannelId" class="chat-body">
        <div class="p-3 border-b">
          <Button
            label="New Channel"
            icon="pi pi-plus"
            size="small"
            outlined
            class="w-full"
            @click="showCreateChannel = true"
          />
        </div>
        <div class="flex-1 overflow-hidden bg-gray-50">
          <ScrollPanel class="channel-list">
            <div
              v-for="channel in chatStore.channels"
              :key="channel.id"
              class="channel-item"
              @click="chatStore.setActiveChannel(channel.id)"
            >
              <div class="flex items-center gap-2 flex-1">
                <Avatar icon="pi pi-hashtag" shape="circle" size="normal" />
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm">{{ channel.name }}</div>
                  <div class="text-xs text-gray-500 truncate">
                    {{ channel.member_count }} members
                  </div>
                </div>
              </div>
              <Chip
                v-if="channel.unread_count > 0"
                :label="String(channel.unread_count)"
                class="bg-blue-500 text-white text-xs"
              />
            </div>

            <div
              v-if="chatStore.channels.length === 0"
              class="p-4 text-center text-gray-500"
            >
              No channels yet. Create one to start chatting!
            </div>
          </ScrollPanel>
        </div>
      </div>

      <!-- Active Channel Messages -->
      <div v-else class="chat-body flex flex-col h-full">
        <!-- Back button and channel info -->
        <div class="p-3 border-b flex items-center gap-2">
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            size="small"
            @click="chatStore.setActiveChannel(null)"
          />
          <div class="flex-1">
            <div class="font-semibold">{{ chatStore.activeChannel?.name }}</div>
            <div class="text-xs text-gray-500">
              {{ chatStore.activeChannel?.member_count }} members
            </div>
          </div>
        </div>

        <!-- Messages Container -->
        <div class="flex-1 overflow-hidden bg-gray-50 relative">
          <ScrollPanel class="chat-messages-container flex-1">
            <div class="p-3 space-y-3">
              <div
                v-for="message in chatStore.activeMessages"
                :key="message.id"
                class="message-item"
                :class="{ 'message-own': message.user_id === currentUserId }"
              >
                <div class="flex gap-2">
                  <Avatar
                    :label="
                      getInitials(
                        message.user.staff_name || message.user.username
                      )
                    "
                    shape="circle"
                    size="normal"
                    class="flex-shrink-0"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-semibold text-sm">
                        {{ message.user.staff_name || message.user.username }}
                      </span>
                      <span class="text-xs text-gray-500">
                        {{ formatTime(message.created_at) }}
                      </span>
                    </div>

                    <!-- Text Message -->
                    <div
                      v-if="message.message_type === 'text'"
                      class="message-content"
                    >
                      {{ message.content }}
                    </div>

                    <!-- Image Message -->
                    <div
                      v-else-if="message.message_type === 'image'"
                      class="message-content p-1"
                    >
                      <img
                        :src="resolveImageUrl(message)"
                        :alt="message.file_name"
                        class="max-w-[250px] rounded-lg border shadow-sm cursor-pointer hover:opacity-90 transition"
                        style="
                          display: block;
                          max-height: 250px;
                          object-fit: contain;
                        "
                        @click="openImage(resolveImageUrl(message))"
                        @load="scrollToBottom"
                      />
                      <div class="text-[10px] opacity-70 mt-1 px-1">
                        {{ message.file_name }}
                      </div>
                    </div>

                    <div
                      v-else-if="message.message_type === 'file'"
                      class="message-content"
                    >
                      <a
                        :href="resolveImageUrl(message)"
                        target="_blank"
                        class="flex items-center gap-2 p-2 bg-gray-100 rounded hover:bg-gray-200"
                      >
                        <i class="pi pi-file text-2xl"></i>
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium truncate">
                            {{ message.file_name }}
                          </div>
                          <div class="text-xs text-gray-500">
                            {{ formatFileSize(message.file_size) }}
                          </div>
                        </div>
                        <i class="pi pi-download"></i>
                      </a>
                    </div>

                    <!-- Read Receipts -->
                    <div
                      v-if="message.user_id === currentUserId"
                      class="text-right mt-1"
                    >
                      <span
                        class="text-[10px] flex items-center justify-end gap-1"
                      >
                        <template
                          v-if="message.read_by && message.read_by.length > 0"
                        >
                          <i
                            class="pi pi-check-circle text-blue-500"
                            title="Read"
                          ></i>
                          <span class="text-blue-500 font-medium">Read</span>
                        </template>

                        <template v-else-if="!message.id.startsWith('temp-')">
                          <i class="pi pi-check text-gray-400"></i>
                          <i class="pi pi-check text-gray-400 -ml-2"></i>
                          <span class="text-gray-400">Delivered</span>
                        </template>

                        <template v-else>
                          <i class="pi pi-check text-gray-300"></i>
                          <span class="text-gray-300">Sending...</span>
                        </template>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Typing Indicator -->
              <div
                v-if="typingUsers.length > 0"
                class="flex items-center gap-2 text-sm text-gray-500 px-3"
              >
                <div class="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span
                  >{{ typingUsers.join(", ") }}
                  {{ typingUsers.length > 1 ? "are" : "is" }} typing...</span
                >
              </div>
            </div>
          </ScrollPanel>
        </div>

        <!-- Message Input -->
        <div class="chat-input">
          <input
            type="file"
            ref="fileInput"
            class="hidden"
            @change="handleFileSelect"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          />

          <Button
            icon="pi pi-paperclip"
            text
            rounded
            @click="$refs.fileInput.click()"
          />

          <InputText
            v-model="messageText"
            placeholder="Type a message..."
            class="flex-1"
            @keydown.enter="sendMessage"
            @input="handleTyping"
          />

          <Button
            icon="pi pi-send"
            rounded
            :disabled="!messageText.trim() && !selectedFile"
            @click="sendMessage"
          />
        </div>

        <!-- File Preview -->
        <div
          v-if="selectedFile"
          class="p-2 bg-gray-50 border-t flex items-center gap-2"
        >
          <i class="pi pi-file"></i>
          <span class="text-sm flex-1 truncate">{{ selectedFile.name }}</span>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            @click="selectedFile = null"
          />
        </div>
      </div>
    </div>

    <!-- Create Channel Dialog -->
    <Dialog
      v-model:visible="showCreateChannel"
      header="Create New Channel"
      modal
      style="width: 400px"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Channel Name</label>
          <InputText
            v-model="newChannel.name"
            class="w-full"
            placeholder="e.g., Team Chat"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <Textarea v-model="newChannel.description" class="w-full" rows="3" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1 text-gray-700"
            >Add Members</label
          >
          <MultiSelect
            v-model="newChannel.memberIds"
            :options="shopUsers"
            optionLabel="staff_name"
            optionValue="id"
            placeholder="Select team members"
            class="w-full"
            :filter="true"
            display="chip"
          >
            <template #option="slotProps">
              <div class="flex items-center gap-2">
                <span>{{
                  slotProps.option.staff_name || slotProps.option.username
                }}</span>
              </div>
            </template>
          </MultiSelect>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showCreateChannel = false" />
        <Button
          label="Create"
          @click="createChannel"
          :disabled="!newChannel.name"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";

const chatStore = useChatStore();
const authStore = useAuthStore();

const messageText = ref("");
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const showCreateChannel = ref(false);
const shopUsers = ref<any[]>([]);

const newChannel = ref({
  name: "",
  description: "",
  memberIds: [] as string[],
});

const currentUserId = computed(
  () => authStore.user?.id || localStorage.getItem("userId")
);

const typingUsers = computed(() => {
  return chatStore.typingInActiveChannel
    .filter((userId: string) => userId !== currentUserId.value)
    .map((userId: string) => {
      // Find user name from online users or messages
      const user = shopUsers.value.find((u) => u.id === userId);
      return user?.staff_name || user?.username || "Someone";
    });
});

// Initialize chat
onMounted(async () => {
  const token = localStorage.getItem("token");
  if (token) {
    chatStore.connect(token);
    await chatStore.fetchChannels();
    await fetchShopUsers();
  }
});

onUnmounted(() => {
  chatStore.disconnect();
});

// Fetch shop users for creating channels
const fetchShopUsers = async () => {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/chat/shop-users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Ensure shopUsers is always an array
    shopUsers.value = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error fetching shop users:", err);
    shopUsers.value = [];
  }
};

const sendMessage = async () => {
  if (!chatStore.activeChannelId) return;

  const messageToSend = messageText.value.trim();
  const fileToUpload = selectedFile.value;
  if (fileToUpload) {
    const fileData = await chatStore.uploadFile(fileToUpload);
    const messageType = fileToUpload.type.startsWith("image/")
      ? "image"
      : "file";

    // Pass the full fileData object which now includes .base64
    await chatStore.sendMessage(messageToSend, messageType, fileData);
  }
  const currentUserId = authStore.user?.id || localStorage.getItem("userId");

  if (!messageToSend && !fileToUpload) return;

  // 1. Create a local preview URL
  let previewUrl = "";
  if (fileToUpload && fileToUpload.type.startsWith("image/")) {
    previewUrl = URL.createObjectURL(fileToUpload);
  }

  const optimisticMessage = {
    id: `temp-${Date.now()}`,
    channel_id: chatStore.activeChannelId,
    user_id: currentUserId,
    message_type: fileToUpload
      ? fileToUpload.type.startsWith("image/")
        ? "image"
        : "file"
      : "text",
    content: messageToSend || (fileToUpload ? fileToUpload.name : ""),
    file_url: previewUrl, // Local blob for immediate view
    file_name: fileToUpload?.name,
    created_at: new Date().toISOString(),
    user: {
      id: currentUserId,
      username: authStore.user?.username || "You",
      staff_name: authStore.user?.staff_name || null,
    },
    read_by: [],
  };

  chatStore.addMessageLocally(chatStore.activeChannelId, optimisticMessage);

  // Clear inputs
  messageText.value = "";
  selectedFile.value = null;
  if (fileInput.value) fileInput.value.value = "";

  try {
    if (fileToUpload) {
      // 2. Upload to get the base64 and sanitized name
      const fileData = await chatStore.uploadFile(fileToUpload);

      const messageType = fileToUpload.type.startsWith("image/")
        ? "image"
        : "file";

      // 3. Pass the data exactly as the Socket handler expects it
      await chatStore.sendMessage(messageToSend, messageType, {
        base64: fileData.base64, // The binary data for BYTEA
        name: fileData.name, // The UTF-8 sanitized name
        size: fileData.size,
        type: fileData.type,
      });
    } else {
      await chatStore.sendMessage(messageToSend);
    }

    chatStore.sendTyping(false);
  } catch (err) {
    console.error("Failed to send message:", err);
  } finally {
    // 4. Memory cleanup for the local preview
    if (previewUrl) {
      setTimeout(() => URL.revokeObjectURL(previewUrl), 5000);
    }
  }

  scrollToBottom();
};

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector(".p-scrollpanel-content");
    if (container) container.scrollTop = container.scrollHeight;
  });
};

// Handle typing indicator
let typingTimer: NodeJS.Timeout | null = null;
const handleTyping = () => {
  chatStore.sendTyping(true);

  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    chatStore.sendTyping(false);
  }, 1000);
};

// Handle file selection
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0];
  }
};

// Create new channel
const createChannel = async () => {
  try {
    await chatStore.createChannel(
      newChannel.value.name,
      newChannel.value.description,
      newChannel.value.memberIds
    );

    showCreateChannel.value = false;
    newChannel.value = { name: "", description: "", memberIds: [] };
  } catch (err) {
    console.error("Error creating channel:", err);
    alert("Failed to create channel");
  }
};

// Utility functions
const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

  return date.toLocaleDateString();
};

const formatFileSize = (bytes: number | undefined) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const openImage = (url: string | undefined) => {
  if (url) window.open(url, "_blank");
};
watch(
  () => chatStore.activeMessages,
  () => {
    nextTick(() => {
      const container = document.querySelector(
        ".p-scrollpanel .p-scrollpanel-content"
      );
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  },
  { deep: true }
);
const resolveImageUrl = (message: any) => {
  if (!message) return "";

  // 1. Local previews (Optimistic UI)
  if (
    message.file_url &&
    (message.file_url.startsWith("blob:") ||
      message.file_url.startsWith("data:"))
  ) {
    return message.file_url;
  }

  // 2. Database files
  if (message.id && !String(message.id).startsWith("temp-")) {
    const token = localStorage.getItem("token"); // Get your stored JWT
    const baseUrl = "http://192.168.68.58:3000";
    return `${baseUrl}/api/v1/chat/file/${message.id}?token=${token}`;
  }

  return "";
};
</script>

<style scoped>
.floating-chat {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.chat-minimized {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
  position: relative;
}

.chat-minimized:hover {
  transform: scale(1.1);
}

.unread-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ef4444;
  color: white;
  border-radius: 12px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  min-width: 20px;
  text-align: center;
}

.chat-expanded {
  width: 380px;
  height: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.channel-list {
  height: 100%;
}

.channel-item {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.channel-item:hover {
  background: #f9fafb;
}

.chat-messages-container {
  flex: 1;
  background: #f9fafb;
}

.message-item {
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-content {
  background: white;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  word-wrap: break-word;
}

.message-own .message-content {
  background: #667eea;
  color: white;
}

.chat-input {
  padding: 12px;
  background: white;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 8px;
  align-items: center;
}

.typing-indicator {
  display: inline-flex;
  gap: 4px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  background: #9ca3af;
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
}

.chat-expanded {
  width: 380px;
  height: 600px; /* or whatever height you want */
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Ensure ScrollPanel takes full available height */
:deep(.p-scrollpanel) {
  height: 100% !important;
}

.message-item {
  animation: slideIn 0.2s ease-out;
}

/* Optional: Make messages grow upwards */
.message-item {
  opacity: 0;
  transform: translateY(10px);
  animation: slideIn 0.3s forwards;
}
.chat-expanded {
  width: 380px;
  height: 600px; /* or 80vh if you want responsive */
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.p-scrollpanel) {
  height: 100% !important;
  overflow: hidden;
}

.chat-input {
  border-top: 1px solid #e5e7eb;
  background: white;
  position: sticky;
  bottom: 0;
  z-index: 10;
}
</style>
