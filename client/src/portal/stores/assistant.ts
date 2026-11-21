// The AI assistant's conversation and whether its panel is open. Kept in a
// store, not in the panel, so closing the panel or changing tab doesn't lose
// the conversation, and any screen can open it (Book's "Ask the assistant"),
// with a question already typed.
import { defineStore } from "pinia";

export type AssistantCard = { action: any; status: "pending" | "working" | "done" | "dismissed" | "failed"; error?: string };
export type AssistantMessage = { role: "user" | "assistant"; content: string; hidden?: boolean; actions?: AssistantCard[] };

export const useAssistantStore = defineStore("portalAssistant", {
  state: () => ({
    visible: false,
    messages: [] as AssistantMessage[],
    /** What's typed in the box, not sent yet. */
    draft: "",
  }),
  actions: {
    /** Opens the panel; a question given is typed in for the client to send or change. */
    open(question?: string) {
      if (question) this.draft = question;
      this.visible = true;
    },
    close() {
      this.visible = false;
    },
  },
});
