<template>
  <div
    class="floating-chat"
    :class="{
      minimized: chatStore.isMinimized,
      expanded: !chatStore.isMinimized,
    }"
  >
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

    <div v-else class="chat-expanded">
      <div class="chat-header">
        <div class="flex items-center gap-2">
          <i class="pi pi-comments"></i>
          <span class="font-semibold truncate max-w-[200px]">{{
            chatStore.activeChannel?.name || "Messages"
          }}</span>
          <span v-if="!chatStore.isConnected" class="text-xs text-red-200"
            >(Offline)</span
          >
        </div>
        <div class="flex gap-2">
          <Button
            :icon="isMobile ? 'pi pi-times' : 'pi pi-minus'"
            text
            rounded
            class="text-white hover:bg-white/20"
            @click="chatStore.toggleMinimized()"
          />
        </div>
      </div>

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
          <ScrollPanel class="h-full w-full">
            <div
              v-for="channel in chatStore.channels"
              :key="channel.id"
              class="channel-item"
              @click="chatStore.setActiveChannel(channel.id)"
            >
              <div class="flex items-center gap-3 flex-1 overflow-hidden">
                <Avatar
                  icon="pi pi-hashtag"
                  shape="circle"
                  class="flex-shrink-0"
                />
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm truncate">
                    {{ channel.name }}
                  </div>
                  <div class="text-xs text-gray-500 truncate">
                    {{ channel.member_count }} members
                  </div>
                </div>
              </div>
              <span
                v-if="channel.unread_count > 0"
                class="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full"
              >
                {{ channel.unread_count }}
              </span>
            </div>

            <div
              v-if="chatStore.channels.length === 0"
              class="p-8 text-center text-gray-500 flex flex-col items-center"
            >
              <i class="pi pi-comments text-4xl mb-2 text-gray-300"></i>
              <p>No channels yet.</p>
            </div>
          </ScrollPanel>
        </div>
      </div>

      <div v-else class="chat-body flex flex-col h-full">
        <div
          class="p-2 border-b flex items-center gap-2 bg-white shadow-sm z-10"
        >
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            size="small"
            @click="chatStore.setActiveChannel(null)"
          />
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm truncate">
              {{ chatStore.activeChannel?.name }}
            </div>
            <div class="text-xs text-gray-500 truncate">
              {{ chatStore.activeChannel?.member_count }} members
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-hidden bg-gray-50 relative mr-2">
          <ScrollPanel class="h-full w-full p-scrollpanel-bar-y-hidden">
            <div class="p-3 space-y-4 pb-4">
              <div
                v-for="message in chatStore.activeMessages"
                :key="message.id"
                class="message-item flex gap-3"
                :class="{
                  'flex-row-reverse': message.user_id === currentUserId,
                }"
              >
                <Avatar
                  v-if="message.user_id !== currentUserId"
                  :label="
                    getInitials(
                      message.user.staff_name || message.user.username
                    )
                  "
                  shape="circle"
                  size="normal"
                  class="flex-shrink-0 mt-1"
                />

                <div
                  class="flex flex-col max-w-[80%] min-w-0"
                  :class="
                    message.user_id === currentUserId
                      ? 'items-end'
                      : 'items-start'
                  "
                >
                  <div class="flex items-center gap-2 mb-1 px-1">
                    <span
                      class="text-xs font-bold text-gray-700 truncate max-w-[150px]"
                      v-if="message.user_id !== currentUserId"
                    >
                      {{ message.user.staff_name || message.user.username }}
                    </span>
                    <span class="text-[10px] text-gray-400">
                      {{ formatTime(message.created_at) }}
                    </span>
                  </div>

                  <div
                    class="message-bubble"
                    :class="
                      message.user_id === currentUserId
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                    "
                  >
                    <div
                      v-if="message.message_type === 'text'"
                      class="whitespace-pre-wrap break-words text-sm"
                    >
                      {{ message.content }}
                    </div>

                    <div
                      v-else-if="message.message_type === 'image'"
                      class="p-1"
                    >
                      <img
                        :src="resolveImageUrl(message)"
                        class="rounded-lg max-w-full cursor-pointer"
                        @click="openImage(resolveImageUrl(message))"
                        @load="scrollToBottom"
                      />
                    </div>

                    <div v-else-if="message.message_type === 'file'">
                      <a
                        :href="resolveImageUrl(message)"
                        target="_blank"
                        class="flex items-center gap-3 p-2 bg-black/5 rounded hover:bg-black/10 transition text-inherit no-underline"
                      >
                        <i class="pi pi-file text-xl"></i>
                        <div class="flex-1 min-w-0 overflow-hidden">
                          <div class="text-xs font-bold truncate">
                            {{ message.file_name }}
                          </div>
                          <div class="text-[10px] opacity-70">
                            {{ formatFileSize(message.file_size) }}
                          </div>
                        </div>
                        <i class="pi pi-download"></i>
                      </a>
                    </div>
                  </div>

                  <div
                    v-if="message.user_id === currentUserId"
                    class="text-[10px] mt-1 px-1 h-3 mr-2"
                  >
                    <span
                      v-if="message.id.startsWith('temp-')"
                      class="text-gray-400"
                    >
                      <i class="pi pi-spin pi-spinner text-[9px]"></i> Sending
                    </span>
                    <span
                      v-else-if="message.read_by && message.read_by.length > 0"
                      class="text-blue-500 font-bold flex items-center gap-1"
                    >
                      <i class="pi pi-check-circle text-[9px]"></i> Read
                    </span>
                    <span v-else class="text-gray-400">Delivered</span>
                  </div>
                </div>
              </div>

              <div v-if="typingUsers.length > 0" class="px-4 py-2">
                <div class="flex items-center gap-2 text-xs text-gray-500">
                  <div class="typing-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <span>{{ typingUsers.join(", ") }} is typing...</span>
                </div>
              </div>
            </div>
          </ScrollPanel>
        </div>

        <div class="chat-input-area">
          <div
            v-if="selectedFile"
            class="flex items-center gap-2 p-2 mx-2 mb-2 bg-gray-100 rounded-lg border border-gray-200"
          >
            <i class="pi pi-file text-gray-500"></i>
            <span class="text-xs flex-1 truncate font-medium">{{
              selectedFile.name
            }}</span>
            <button
              @click="selectedFile = null"
              class="p-1 hover:bg-gray-200 rounded-full"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <div class="flex items-end gap-2">
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
              class="text-gray-500 hover:text-gray-700"
              @click="$refs.fileInput.click()"
            />

            <textarea
              v-model="messageText"
              rows="1"
              placeholder="Type a message..."
              class="flex-1 bg-gray-100 border-0 rounded-2xl py-2 px-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none text-sm max-h-24 overflow-y-auto"
              @keydown.enter.exact.prevent="sendMessage"
              @input="handleTyping"
            ></textarea>

            <Button
              icon="pi pi-send"
              rounded
              :disabled="!messageText.trim() && !selectedFile"
              class="bg-indigo-600 border-0"
              @click="sendMessage"
            />
          </div>
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="showCreateChannel"
      header="Create New Channel"
      modal
      class="p-4"
      :style="{ width: '90vw', maxWidth: '400px' }"
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

// UI State
const isMobile = ref(window.innerWidth < 768);
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

// Update mobile state on resize
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};
window.addEventListener("resize", checkMobile);

const currentUserId = computed(
  () => authStore.user?.id || localStorage.getItem("userId")
);

const typingUsers = computed(() => {
  return chatStore.typingInActiveChannel
    .filter((userId: string) => userId !== currentUserId.value)
    .map((userId: string) => {
      const user = shopUsers.value.find((u) => u.id === userId);
      return user?.staff_name || user?.username || "Someone";
    });
});

// Initialize
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
  window.removeEventListener("resize", checkMobile);
});

const fetchShopUsers = async () => {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/v1/chat/shop-users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
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
  const currentId = currentUserId.value;

  if (!messageToSend && !fileToUpload) return;

  // 1. Optimistic UI Update
  let previewUrl = "";
  if (fileToUpload && fileToUpload.type.startsWith("image/")) {
    previewUrl = URL.createObjectURL(fileToUpload);
  }

  const optimisticMessage = {
    id: `temp-${Date.now()}`,
    channel_id: chatStore.activeChannelId,
    user_id: currentId,
    message_type: fileToUpload
      ? fileToUpload.type.startsWith("image/")
        ? "image"
        : "file"
      : "text",
    content: messageToSend || (fileToUpload ? fileToUpload.name : ""),
    file_url: previewUrl,
    file_name: fileToUpload?.name,
    file_size: fileToUpload?.size,
    created_at: new Date().toISOString(),
    user: {
      id: currentId,
      username: authStore.user?.username || "You",
      staff_name: authStore.user?.staff_name || null,
    },
    read_by: [],
  };

  chatStore.addMessageLocally(chatStore.activeChannelId, optimisticMessage);

  // Clear UI immediately
  messageText.value = "";
  selectedFile.value = null;
  if (fileInput.value) fileInput.value.value = "";
  scrollToBottom();

  // 2. Perform Network Requests
  try {
    if (fileToUpload) {
      const fileData = await chatStore.uploadFile(fileToUpload);
      const messageType = fileToUpload.type.startsWith("image/")
        ? "image"
        : "file";

      await chatStore.sendMessage(messageToSend, messageType, {
        base64: fileData.base64,
        name: fileData.name,
        size: fileData.size,
        type: fileData.type,
      });
    } else {
      await chatStore.sendMessage(messageToSend);
    }
    chatStore.sendTyping(false);
  } catch (err) {
    console.error("Failed to send message:", err);
    // Ideally, show an error state on the message here
  } finally {
    if (previewUrl) setTimeout(() => URL.revokeObjectURL(previewUrl), 5000);
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector(".p-scrollpanel-content");
    if (container) container.scrollTop = container.scrollHeight;
  });
};

let typingTimer: NodeJS.Timeout | null = null;
const handleTyping = () => {
  chatStore.sendTyping(true);
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    chatStore.sendTyping(false);
  }, 1000);
};

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0];
  }
};

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
    alert("Failed to create channel");
  }
};

const getInitials = (name: string) => {
  if (!name) return "?";
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
  if (now.toDateString() === date.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
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

const resolveImageUrl = (message: any) => {
  if (!message) return "";
  if (
    message.file_url &&
    (message.file_url.startsWith("blob:") ||
      message.file_url.startsWith("data:"))
  ) {
    return message.file_url;
  }
  if (message.id && !String(message.id).startsWith("temp-")) {
    const token = localStorage.getItem("token");
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? window.location.origin
        : "http://192.168.68.58:3000";
    return `${baseUrl}/api/v1/chat/file/${message.id}?token=${token}`;
  }
  return "";
};

watch(
  () => chatStore.activeMessages,
  () => {
    setTimeout(scrollToBottom, 100);
  },
  { deep: true }
);
</script>

<style scoped>
.floating-chat {
  position: fixed;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
    Arial, sans-serif;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* --- STATE: MINIMIZED --- */
.floating-chat.minimized {
  bottom: 20px;
  right: 20px;
}

.chat-minimized {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(79, 70, 229, 0.4);
  transition: transform 0.2s;
}

.chat-minimized:hover {
  transform: scale(1.05);
}

.unread-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: #ef4444;
  color: white;
  border-radius: 12px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 800;
  border: 2px solid white;
}

/* --- STATE: EXPANDED (DESKTOP DEFAULT) --- */
.chat-expanded {
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

/* --- DESKTOP LAYOUT --- */
@media (min-width: 768px) {
  .floating-chat.expanded {
    bottom: 20px;
    right: 20px;
  }
  .chat-expanded {
    width: 380px;
    height: 600px;
    border-radius: 16px;
  }
}

/* --- MOBILE LAYOUT (FULL SCREEN) --- */
@media (max-width: 768px) {
  .floating-chat.expanded {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
  }
  .chat-expanded {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  /* Push floating button up slightly on mobile so it doesn't hit bottom navs */
  .floating-chat.minimized {
    bottom: 24px;
    right: 24px;
  }
}

/* --- COMPONENTS --- */
.chat-header {
  padding: 16px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Channel List Item */
.channel-item {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.1s;
}
.channel-item:hover {
  background-color: #f9fafb;
}

/* Message Bubble Styles */
.message-bubble {
  padding: 10px 14px;
  border-radius: 18px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  position: relative;
  max-width: 100%;
  margin-right: 8px;
}

/* Input Area */
.chat-input-area {
  padding: 12px;
  background: white;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

/* Typing Animation */
.typing-dots span {
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #9ca3af;
  margin-right: 2px;
  animation: typing 1.4s infinite ease-in-out;
}
.typing-dots span:nth-child(1) {
  animation-delay: 0s;
}
.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.5);
    opacity: 1;
  }
}

/* Fix PrimeVue ScrollPanel */
:deep(.p-scrollpanel) {
  width: 100%;
  height: 100%;
}
:deep(.p-scrollpanel-content) {
  padding: 0;
}
</style>
