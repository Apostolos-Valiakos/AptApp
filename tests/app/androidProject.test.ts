// The Android app's identity (docs/redesign/ANDROID_HANDOFF.md §1): one app,
// com.purespaexperience.app, for every shop, packaging the portal-only build.
// The id is in three places that must agree, or the store listing, the
// generated Java package and Capacitor's config drift apart.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import config from "../../capacitor.config";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const APP_ID = "com.purespaexperience.app";

describe("the Android app's identity", () => {
  it("Capacitor packages the portal-only build under the new id, served over https", () => {
    expect(config.appId).toBe(APP_ID);
    expect(config.appName).toBe("Pure Spa Experience");
    expect(config.webDir).toBe("client/dist-portal");
    expect(config.server?.androidScheme).toBe("https");
  });

  it("the Android project has the same id, namespace and activity package", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toMatch(new RegExp(`applicationId "${APP_ID.replace(/\./g, "\\.")}"`));
    expect(gradle).toMatch(new RegExp(`namespace = "${APP_ID.replace(/\./g, "\\.")}"`));
    const activity = read(`android/app/src/main/java/${APP_ID.replace(/\./g, "/")}/MainActivity.java`);
    expect(activity).toContain(`package ${APP_ID};`);
    expect(read("android/app/src/main/res/values/strings.xml")).toContain(`<string name="app_name">Pure Spa Experience</string>`);
  });

  it("nothing of the old app id is left in the Android project", () => {
    expect(fs.existsSync(path.join(ROOT, "android/app/src/main/java/com/interventio"))).toBe(false);
    for (const rel of ["android/app/build.gradle", "android/app/src/main/res/values/strings.xml", "android/app/src/main/AndroidManifest.xml"]) {
      expect(read(rel)).not.toContain("interventio");
    }
  });

  it("compiles and targets Android 16 (API 36), as Capacitor 8 sets it", () => {
    const vars = read("android/variables.gradle");
    expect(vars).toMatch(/compileSdkVersion = 36/);
    expect(vars).toMatch(/targetSdkVersion = 36/);
  });

  it("Android only for now: no iOS project", () => {
    expect(fs.existsSync(path.join(ROOT, "ios"))).toBe(false);
    const pkg = JSON.parse(read("package.json"));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }["@capacitor/ios"]).toBeUndefined();
  });
});
