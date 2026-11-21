// Data kept for offline use (client/src/offline/localData.ts): the calendar's
// appointments, other cached data, and client search.
import { describe, expect, test } from "vitest";
import {
  addCachedClient,
  cacheAppointmentsRange,
  cacheClients,
  cacheValue,
  cachedAppointmentsInRange,
  cachedValue,
  foldText,
  getCachedClients,
  pruneCachedAppointments,
  searchCachedClients,
} from "../../client/src/offline/localData";

const appt = (id: string, start: string) => ({ id, services: [{ start_time: start }], start_time: start });

describe("cached appointments", () => {
  test("a fetched range can be read back offline", async () => {
    await cacheAppointmentsRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z", [appt("a1", "2027-01-01T09:00:00Z"), appt("a2", "2027-01-01T11:00:00Z")]);
    const rows = await cachedAppointmentsInRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z");
    expect(rows.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(rows[0]._cachedAt).toBeUndefined();
  });

  test("an appointment deleted or moved away online disappears from the cached day", async () => {
    await cacheAppointmentsRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z", [appt("a1", "2027-01-01T09:00:00Z"), appt("a2", "2027-01-01T11:00:00Z")]);
    await cacheAppointmentsRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z", [appt("a2", "2027-01-01T11:00:00Z")]);
    const rows = await cachedAppointmentsInRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z");
    expect(rows.map((r) => r.id)).toEqual(["a2"]);
  });

  test("refreshing one day doesn't touch other days", async () => {
    await cacheAppointmentsRange("2027-01-01T00:00:00Z", "2027-01-03T00:00:00Z", [appt("a1", "2027-01-01T09:00:00Z"), appt("b1", "2027-01-02T09:00:00Z")]);
    await cacheAppointmentsRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z", []);
    expect((await cachedAppointmentsInRange("2027-01-02T00:00:00Z", "2027-01-03T00:00:00Z")).map((r) => r.id)).toEqual(["b1"]);
    expect(await cachedAppointmentsInRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z")).toEqual([]);
  });

  test("an appointment moved to another day is found on the new day only", async () => {
    await cacheAppointmentsRange("2027-01-01T00:00:00Z", "2027-01-03T00:00:00Z", [appt("a1", "2027-01-01T09:00:00Z")]);
    await cacheAppointmentsRange("2027-01-01T00:00:00Z", "2027-01-03T00:00:00Z", [appt("a1", "2027-01-02T15:00:00Z")]);
    expect(await cachedAppointmentsInRange("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z")).toEqual([]);
    expect((await cachedAppointmentsInRange("2027-01-02T00:00:00Z", "2027-01-03T00:00:00Z"))[0].start_time).toBe("2027-01-02T15:00:00Z");
  });

  test("time-zone offsets in the range are handled (Athens day, UTC storage)", async () => {
    await cacheAppointmentsRange("2027-01-01T00:00:00+02:00", "2027-01-02T00:00:00+02:00", [appt("a1", "2026-12-31T22:30:00Z")]);
    expect((await cachedAppointmentsInRange("2027-01-01T00:00:00+02:00", "2027-01-02T00:00:00+02:00")).map((r) => r.id)).toEqual(["a1"]);
  });

  test("old appointments are pruned", async () => {
    const old = new Date(Date.now() - 90 * 86400000).toISOString();
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    await cacheAppointmentsRange(new Date(Date.now() - 100 * 86400000).toISOString(), new Date().toISOString(), [appt("old", old), appt("recent", recent)]);
    await pruneCachedAppointments(60);
    expect((await cachedAppointmentsInRange("2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z")).map((r) => r.id)).toEqual(["recent"]);
  });
});

describe("other cached data", () => {
  test("values are stored and read back", async () => {
    await cacheValue("services", [{ id: "s1" }]);
    expect(await cachedValue("services")).toEqual([{ id: "s1" }]);
    expect(await cachedValue("missing")).toBeUndefined();
  });
});

describe("client search offline", () => {
  const list = [
    { id: "1", first_name: "ΔΕΣΠΟΙΝΑ", last_name: "ΑΒΔΟΥΛΑ", phone: "+30 697 933 9723", email: "d@example.gr" },
    { id: "2", first_name: "Δέσποινα", last_name: "Βανιώτη", phone: "+30 693 685 2785" },
    { id: "3", first_name: "Γιώργος", last_name: "Παπαδόπουλος", phone: "+30 698 000 1111" },
  ];

  test("accents and case are ignored, final sigma folded", async () => {
    await cacheClients(list);
    expect((await searchCachedClients("δεσποινα")).map((c) => c.id).sort()).toEqual(["1", "2"]);
    expect(foldText("Παπαδόπουλος")).toBe("παπαδοπουλοσ");
  });

  test("first and last name in any order", async () => {
    await cacheClients(list);
    expect((await searchCachedClients("βανιωτη δεσποινα")).map((c) => c.id)).toEqual(["2"]);
  });

  test("phone digits match regardless of spaces and +30", async () => {
    await cacheClients(list);
    expect((await searchCachedClients("6979339723")).map((c) => c.id)).toEqual(["1"]);
    expect((await searchCachedClients("697 933")).map((c) => c.id)).toEqual(["1"]);
  });

  test("email matches", async () => {
    await cacheClients(list);
    expect((await searchCachedClients("d@example")).map((c) => c.id)).toEqual(["1"]);
  });

  test("results carry full_name like the online search, limited", async () => {
    await cacheClients(list);
    const [first] = await searchCachedClients("γιωργος");
    expect(first.full_name).toBe("Γιώργος Παπαδόπουλος");
    expect(await searchCachedClients("δ", 1)).toHaveLength(1);
  });

  test("an empty query finds nothing", async () => {
    await cacheClients(list);
    expect(await searchCachedClients("   ")).toEqual([]);
  });

  test("a client added offline is searchable and survives a refresh of the list until it syncs", async () => {
    await cacheClients(list);
    await addCachedClient({ id: "tmp-cccccccc-1", first_name: "Νέα", last_name: "Πελάτισσα", phone: "+30 690 123 4567" });
    expect((await searchCachedClients("νεα")).map((c) => c.id)).toEqual(["tmp-cccccccc-1"]);
    await cacheClients(list); // list refreshed from the server
    expect((await getCachedClients()).map((c) => c.id)).toContain("tmp-cccccccc-1");
  });

  test("clients deleted online disappear when the list is refreshed", async () => {
    await cacheClients(list);
    await cacheClients(list.slice(0, 1));
    expect((await getCachedClients()).map((c) => c.id)).toEqual(["1"]);
  });
});
