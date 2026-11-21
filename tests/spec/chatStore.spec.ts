// The chat store's lists and the "is typing" signal, which the floating chat
// used to keep itself (code review proposal 16). CH1–CH2.
import { describe, expect, test, vi } from "vitest";
import { useChatStore } from "../../client/src/stores/chat";
import { fakeServer, saveLogin } from "./helpers";

describe("CH1 the shop's chat users and channels", () => {
  test("are loaded from the server", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({
      "GET /api/v1/chat/shop-users": { body: [{ id: "u2", username: "maria" }] },
      "GET /api/v1/chat/channels": { body: [{ id: "c1", name: "Front desk" }] },
    });
    const chat = useChatStore();
    await Promise.all([chat.fetchShopUsers(), chat.fetchChannels()]);
    expect(chat.shopUsers).toEqual([{ id: "u2", username: "maria" }]);
    expect(chat.channels).toEqual([{ id: "c1", name: "Front desk" }]);
  });

  test("are empty when they can't be loaded", async () => {
    saveLogin({ id: "u1", role: "admin", shop_id: "s1" });
    fakeServer({ "GET /api/v1/chat/shop-users": "network-down", "GET /api/v1/chat/channels": { status: 500, body: {} } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const chat = useChatStore();
    chat.shopUsers = [{ id: "old" }];
    await Promise.all([chat.fetchShopUsers(), chat.fetchChannels()]);
    expect(chat.shopUsers).toEqual([]);
    expect(chat.channels).toEqual([]);
  });
});

describe("CH2 typing in a channel", () => {
  test("says typing on each key, and stopped a second after the last one", () => {
    vi.useFakeTimers();
    const chat = useChatStore();
    const emit = vi.fn();
    chat.socket = { emit } as any;
    chat.activeChannelId = "c1";
    const said = () => emit.mock.calls.map(([event]) => event);

    chat.noteTyping();
    vi.advanceTimersByTime(600);
    chat.noteTyping();
    vi.advanceTimersByTime(600);
    expect(said()).toEqual(["typing:start", "typing:start"]);
    vi.advanceTimersByTime(400);
    expect(said()).toEqual(["typing:start", "typing:start", "typing:stop"]);
    expect(emit).toHaveBeenLastCalledWith("typing:stop", { channelId: "c1" });
  });
});
