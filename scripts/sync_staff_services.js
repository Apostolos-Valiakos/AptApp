#!/usr/bin/env node
/**
 * One-time sync: bring `staff` and `services` in line with the shop's real
 * Treatwell menu. Dry-run by default (prints exactly what would change);
 * pass --commit to apply.
 *
 * Usage:
 *   node scripts/sync_staff_services.js            # dry-run
 *   node scripts/sync_staff_services.js --commit   # apply
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");

const SHOP_ID = "00000000-0000-0000-0000-000000000001";
const COMMIT = process.argv.includes("--commit");

const pool = new Pool({ connectionString: process.env.POSTGRES_URI });

// ── Target staff list ──────────────────────────────────────────────────────
const TARGET_STAFF = [
  "Θοδωρής", "Χριστίνα Σ.", "Ζωή", "Νασια", "Ευαγγελία", "ΣΕΙΝΤΙ",
  "XRISTINA", "ΝΤΑΝΙΕΛΑ", "ΣΑΡΑ", "ΒΑΣΙΑ", "ΑΛΕΞΙΑ",
  "Κατερίνα (ΑΙΣΘΗΤΙΚΟΣ)", "ΕΥΗ", "ΧΑΜΜΑΜ", "ΣΑΟΥΝΑ", "ΜΑΡΙΑ Μ.", "FrontDedsk",
];

// ── Target services list ─────────────────────────────────────────────────
// One row per real-priced variant. €0 lines skipped (session/tracking
// sub-steps of packages, or duplicate zero-priced overview entries).
const T = (name, category, minutes, price) => ({ name, category, minutes, price });

const TARGET_SERVICES = [
  // Uncategorized / packages
  T("BACHELOR 5 ΑΤΟΜΑ ΚΑΙ ΚΑΤΩ", "", 180, 75),
  T("BACHELOR 6 ΑΤΟΜΑ ΚΑΙ ΠΑΝΩ", "", 180, 75),

  // Προσφορές
  T("HOLISTIC-SAUNA SCRUB-LEAVE ON", "Προσφορές", 90, 35),
  T("ΠΡΟΣΦΟΡΑ LASH&BROW", "Προσφορές", 90, 45),
  T("ΘΕΡΑΠΕΥΤΙΚΟ+SAUNA+SCRUB+ALOE", "Προσφορές", 90, 38),
  T("ΠΡΟΣΦΟΡΑ ΘΕΡΑΠΕΥΤΙΚΟ ΧΑΜΜΑΜ ΛΑΣΠΗ ΕΧΤΡΑ ΒΕΝΤΟΥΖΕΣ", "Προσφορές", 90, 35),
  T("ΠΡΟΣΦΟΡΑ HOT STONES+LEAVE ON", "Προσφορές", 90, 38),
  T("GLOW + ΜΕΣΟΘΕΡΑΠΕΙΑ ΧΕΙΛΙΩΝ", "Προσφορές", 90, 75),
  T("ΘΕΡΑΠΕΥΤΙΚΟ+ΣΑΟΥΝΑ+ΜΑΣΚΑ ΛΑΣΠΗΣ", "Προσφορές", 90, 35),
  T("Hammam - Ολιστικό Μασάζ & Leave on Mask", "Προσφορές", 60, 34.5),
  T("Hammam", "Προσφορές", 30, 0.5),
  T("ΠΡΟΣΦΟΡΑ CANDLE ΜΑΣΚΑ SAUNA", "Προσφορές", 90, 38),

  // Δωροκάρτα (variants by amount — amount encoded in the name)
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 5", "Προσφορές", 30, 5),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 10", "Προσφορές", 30, 10),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 20", "Προσφορές", 30, 20),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 30", "Προσφορές", 30, 30),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 40", "Προσφορές", 30, 40),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 50", "Προσφορές", 30, 50),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 60", "Προσφορές", 30, 60),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 70", "Προσφορές", 30, 70),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 80", "Προσφορές", 30, 80),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 90", "Προσφορές", 30, 90),
  T("ΔΩΡΟΚΑΡΤΑ ΑΞΙΑΣ 100", "Προσφορές", 30, 100),

  // Core massage menu (no explicit category header in source)
  T("Pure Massage 45'", "", 45, 25),
  T("Pure Massage 1h", "", 60, 27),
  T("Pure Massage 1.5h", "", 90, 50),
  T("Sports Massage", "", 60, 30),
  T("Holistic Therapy", "", 60, 30),
  T("CANDLE MASSAGE", "", 60, 38), // matches existing booked service name/case
  T("Candle Massage 1.5h", "", 90, 63),

  // Special Treatments
  T("Hot Stones Massage", "Special Treatments", 60, 45), // matches existing booked service name
  T("Hot Stones Massage 1.5h", "Special Treatments", 60, 70),
  T("Μασάζ Εγκυμοσύνης", "Special Treatments", 60, 30),
  T("Μασάζ Κατά της Κυτταρίτιδας με φύκια", "Special Treatments", 60, 35),
  T("ΛΕΜΦΙΚΟ ΜΑΣΑΖ", "Special Treatments", 60, 35),

  // Premium Υδροθεραπείες
  T("PREMIUM ΥΠΗΡΕΣΙΑ ΣΚΡΑΜΠ+ΗΟΤ STONES+BODY MUD MASK+FACIAL", "Premium Υδροθεραπείες", 120, 90),
  T("Μπάνιο Αλατιού", "Premium Υδροθεραπείες", 40, 45),
  T("Λάσπη Νεκράς Θάλασσας", "Premium Υδροθεραπείες", 70, 65),
  T("Σοκολατοθεραπεία", "Premium Υδροθεραπείες", 70, 58),

  // Express Massage
  T("Πλάτη | Αυχένας | Κεφάλι", "Express Massage", 30, 20),
  T("Πόδια | Πέλματα", "Express Massage", 30, 20),
  T("Μασάζ Πεπτικού", "Express Massage", 20, 20),
  T("Head Massage", "Express Massage", 15, 12),
  T("Foot Massage", "Express Massage", 15, 12),

  // Classic Massage
  T("Holistic + Sauna", "Classic Massage", 90, 33),
  T("Pure massage + Sauna", "Classic Massage", 90, 30),
  T("Sport + Sauna", "Classic Massage", 90, 33),
  T("Pure + Hammam", "Classic Massage", 90, 37),
  T("Holistic + Hammam", "Classic Massage", 90, 40),
  T("Sport + Χαμαμ", "Classic Massage", 90, 40),

  // Λειζερ
  T("LASER Full Body ΣΥΝΕΔΡΙΑ", "Λειζερ", 40, 75), // "Αποτρίχωση Laser Full Body" repeating session
  T("LASER 2X2", "Λειζερ", 45, 149), // matches existing booked service name (only real-priced variant)
  T("BLACK FRIDAY FULL BODY ΣΥΝΕΔΡΙΑ", "Λειζερ", 45, 70),
  T("Αποτρίχωση Laser ΜΠΙΚΙΝΙ ΜΑΣΧΑΛΕΣ", "Λειζερ", 15, 50),
  T("Αποτρίχωση ΜΟΥΣΤΑΚΙ", "Λειζερ", 5, 15),
  T("Αποτρίχωση FULL FACE", "Λειζερ", 15, 20),
  T("Αποτρίχωση Κοιλιά", "Λειζερ", 10, 20),
  T("Αποτρίχωση Μέση", "Λειζερ", 10, 20),
  T("Αποτρίχωση Μασχάλες", "Λειζερ", 10, 20),
  T("Αποτρίχωση Στήθος", "Λειζερ", 10, 30),
  T("Αποτρίχωση Χέρια & Δάχτυλα Χεριών", "Λειζερ", 15, 30),
  T("Αποτρίχωση ΧΕΡΙΑ", "Λειζερ", 20, 30),
  T("Αποτρίχωση Μπικίνι Brazilian", "Λειζερ", 10, 35),
  T("Αποτρίχωση ΠΛΑΤΗ-ΜΕΣΗ 40-70", "Λειζερ", 60, 40),
  T("Αποτρίχωση ΣΤΗΘΟΣ-ΚΟΙΛΙΑ ΑΠΟ 40 ΕΩΣ 70", "Λειζερ", 60, 40),
  T("Αποτρίχωση Πλάτη & Ώμοι", "Λειζερ", 20, 50),
  T("Αποτρίχωση Πόδια", "Λειζερ", 20, 60),
  T("Αποτρίχωση Πλάτη Full", "Λειζερ", 20, 70),
  T("Αποτρίχωση FULL BODY", "Λειζερ", 40, 120),
  T("ΠΑΚΕΤΟ 3Χ3 Αποτρίχωση Laser Alexadrite", "Λειζερ", 60, 199), // matches existing booked service name
  T("6 ΣΥΝΕΔΡΙΕΣ Laser", "Λειζερ", 40, 299), // matches existing booked service name
  T("Αποτρίχωση Laser Full Body", "Λειζερ", 45, 90),

  // Facial Massage | Treatments
  T("Pure Facial Treatment", "Facial Massage | Treatments", 40, 28),
  T("Minereal Event p-Retinol", "Facial Massage | Treatments", 50, 38),
  T("Royal 24K Gold Mineral", "Facial Massage | Treatments", 50, 45),
  T("Botox Effect AOS Mineral", "Facial Massage | Treatments", 50, 45),
  T("Express Deep Face Detox", "Facial Massage | Treatments", 20, 20),
  T("ΧΑΜΜΑΜ", "Facial Massage | Treatments", 30, 15),

  // Θεραπεία με Ατμό & Sauna
  T("ΣΑΟΥΝΑ ΣΕ ΥΠΗΡΕΣΙΑ", "Θεραπεία με Ατμό & Sauna", 30, 3),
  T("ΣΑΟΥΝΑ", "Θεραπεία με Ατμό & Sauna", 30, 15),
  T("ΗΑΜΑΜ ΣΕ ΥΠΗΡΕΣΙΑ", "Θεραπεία με Ατμό & Sauna", 30, 10),
  T("ΧΑΜΑΜ", "Θεραπεία με Ατμό & Sauna", 30, 15),

  // Classic Massages
  T("Pure Massage", "Classic Massages", 60, 27),

  // Φρύδια & Βλεφαρίδες
  T("ΑΠΟΤΡΙΧΩΣΗ ΦΡΥΔΙΑ ΤΙΜΗ ΓΝΩΡΙΜΙΑΣ", "Φρύδια & Βλεφαρίδες", 15, 7),
  T("Αποτρίχωση με Κερί για Γυναίκες - Πρόσωπο", "Φρύδια & Βλεφαρίδες", 5, 5),
  T("Brow Lamination", "Φρύδια & Βλεφαρίδες", 50, 35),
  T("Lash+BROW+ANΑΛΥΣΗ", "Φρύδια & Βλεφαρίδες", 90, 45),

  // Θεραπείες Προσώπου
  T("Μεσοθεραπεία Προσώπου ΑΚΜΗ & ΠΟΡΟΥΣ", "Θεραπείες Προσώπου", 60, 70),
  T("Μεσοθεραπεία Προσώπου ΕΝΥΔΑΤΩΣΗ & ΛΑΜΨΗ", "Θεραπείες Προσώπου", 60, 70),
  T("Μεσοθεραπεία Προσώπου ΠΑΝΑΔΕΣ & ΔΥΣΧΡΩΜΙΕΣ", "Θεραπείες Προσώπου", 60, 70),
  T("Μεσοθεραπεία Προσώπου ΡΥΘΜΙΣΗ PH & ΜΙΚΡΟΒΙΩΜΑΤΟΣ", "Θεραπείες Προσώπου", 60, 70),
  T("Μεσοθεραπεία Προσώπου ΡΥΤΙΔΕΣ & ΛΕΠΤΕΣ ΓΡΑΜΜΕΣ", "Θεραπείες Προσώπου", 60, 70),
  T("Μεσοθεραπεία Προσώπου ΑΝΤΙΓΗΡΑΝΣΗ, ΣΥΣΦΙΞΗ & LIFTING", "Θεραπείες Προσώπου", 60, 85),
  T("Μεσοθεραπεία Προσώπου ULTRA BOOST ΕΞΩΣΩΜΑΤΑ", "Θεραπείες Προσώπου", 60, 120),
  T("ΒLUEBERRY GLOW ΠΡΟΣΦΟΡΑ", "Θεραπείες Προσώπου", 40, 38),
  T("Μεσοθεραπεία Προσώπου ΠΡΟΣΦΟΡΑ", "Θεραπείες Προσώπου", 60, 49),
  T("Βαθύς Καθαρισμός Προσώπου", "Θεραπείες Προσώπου", 75, 55),
  T("Θεραπεία Μαυρων Κυκλων", "Θεραπείες Προσώπου", 40, 35),
  T("PRP Προσώπου", "Θεραπείες Προσώπου", 60, 150),
  T("Μεσοθεραπεία Χειλιων", "Θεραπείες Προσώπου", 30, 30),
  T("Express Καθαρισμός Προσώπου", "Θεραπείες Προσώπου", 40, 40),
  T("Θεραπεια Μαλλιων", "Θεραπείες Προσώπου", 60, 100),
  T("Lash Lift", "Θεραπείες Προσώπου", 75, 30),
  T("ΠΡΟΣΦΟΡΑ ΥΑΛΟΥΡΟΝΙΚΟΥ Μεσοθεραπεία Προσώπου", "Θεραπείες Προσώπου", 60, 55),

  // Genuinely free/included appointment types with real, active booking history —
  // kept active at €0 rather than deactivated, per explicit confirmation.
  T("ΕΞΑΓΥΡΩΣΗ", "Θεραπείες Spa Σώματος", 90, 0),
  T("ΕΠΑΝΑΛΗΠΤΙΚΟ", "", 20, 0),
  T("ΔΙΑΓΝΩΣΤΙΚΟ ΡΑΝΤΕΒΟΥ", "", 15, 0),
  T("Θεραπεία Προσώπου GLOW", "", 60, 0),
];

// ── Helpers ────────────────────────────────────────────────────────────────
const norm = (s) => String(s || "").trim().toLowerCase();

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n${COMMIT ? "COMMIT" : "DRY RUN"} — syncing staff & services\n`);

    // ── STAFF ──────────────────────────────────────────────────────────────
    const { rows: existingStaff } = await client.query(
      "SELECT id, name, is_active FROM staff WHERE shop_id = $1",
      [SHOP_ID],
    );
    const staffByName = new Map(existingStaff.map((s) => [norm(s.name), s]));
    const targetStaffNorm = new Set(TARGET_STAFF.map(norm));

    const staffToAdd = TARGET_STAFF.filter((n) => !staffByName.has(norm(n)));
    const staffToDeactivate = existingStaff.filter(
      (s) => s.is_active && !targetStaffNorm.has(norm(s.name)),
    );

    console.log("── STAFF ──────────────────────────────────────────");
    console.log(`  Add (${staffToAdd.length}):`, staffToAdd.join(", ") || "none");
    console.log(
      `  Deactivate (${staffToDeactivate.length}):`,
      staffToDeactivate.map((s) => s.name).join(", ") || "none",
    );

    // ── SERVICES ───────────────────────────────────────────────────────────
    const { rows: existingServices } = await client.query(
      "SELECT id, name, category, duration_minutes, price FROM services WHERE shop_id = $1",
      [SHOP_ID],
    );
    const { rows: bookingCounts } = await client.query(
      `SELECT service_id, COUNT(*) as n FROM appointment_services
       WHERE service_id IN (SELECT id FROM services WHERE shop_id = $1)
       GROUP BY service_id`,
      [SHOP_ID],
    );
    const bookingsById = new Map(bookingCounts.map((r) => [r.service_id, Number(r.n)]));

    const svcByName = new Map(existingServices.map((s) => [norm(s.name), s]));
    const targetNamesNorm = new Set(TARGET_SERVICES.map((s) => norm(s.name)));

    const toUpdate = [];
    const toInsert = [];
    for (const t of TARGET_SERVICES) {
      const existing = svcByName.get(norm(t.name));
      if (existing) {
        const changed =
          Number(existing.duration_minutes) !== t.minutes ||
          Number(existing.price) !== Number(t.price) ||
          (existing.category || "") !== t.category;
        if (changed) toUpdate.push({ existing, target: t });
      } else {
        toInsert.push(t);
      }
    }

    const toDeactivate = existingServices.filter((s) => !targetNamesNorm.has(norm(s.name)));
    const flaggedDeactivations = toDeactivate.filter((s) => (bookingsById.get(s.id) || 0) > 0);

    console.log("\n── SERVICES ───────────────────────────────────────");
    console.log(`  Update in place (${toUpdate.length}):`);
    for (const { existing, target } of toUpdate) {
      console.log(
        `    "${existing.name}" [${existing.category || "-"}] ${existing.duration_minutes}min €${existing.price}` +
          ` → [${target.category || "-"}] ${target.minutes}min €${target.price}`,
      );
    }
    console.log(`\n  Insert new (${toInsert.length}):`);
    for (const t of toInsert) {
      console.log(`    "${t.name}" [${t.category || "-"}] ${t.minutes}min €${t.price}`);
    }
    console.log(`\n  Deactivate — not in target list (${toDeactivate.length}):`);
    for (const s of toDeactivate) {
      const n = bookingsById.get(s.id) || 0;
      console.log(`    "${s.name}"${n > 0 ? `  ⚠ HAS ${n} BOOKING(S)` : ""}`);
    }

    if (flaggedDeactivations.length) {
      console.log(
        `\n  ⚠⚠ WARNING: ${flaggedDeactivations.length} service(s) with real booking history would be deactivated ` +
          `because they have no matching real-priced entry in the target list:`,
      );
      for (const s of flaggedDeactivations) {
        console.log(`    "${s.name}" — ${bookingsById.get(s.id)} booking(s)`);
      }
      console.log("  Review these before committing. Re-run with --commit only once confirmed.\n");
    }

    if (!COMMIT) {
      console.log("\n[DRY RUN] No changes made. Re-run with --commit to apply.\n");
      return;
    }

    // ── APPLY ──────────────────────────────────────────────────────────────
    await client.query("BEGIN");

    for (const name of staffToAdd) {
      await client.query(
        "INSERT INTO staff (name, shop_id, is_active) VALUES ($1, $2, true)",
        [name, SHOP_ID],
      );
    }
    for (const s of staffToDeactivate) {
      await client.query("UPDATE staff SET is_active = false WHERE id = $1", [s.id]);
    }

    for (const { existing, target } of toUpdate) {
      await client.query(
        "UPDATE services SET category = $1, duration_minutes = $2, price = $3 WHERE id = $4",
        [target.category || null, target.minutes, target.price, existing.id],
      );
    }
    for (const t of toInsert) {
      await client.query(
        "INSERT INTO services (name, category, duration_minutes, price, shop_id, is_active) VALUES ($1, $2, $3, $4, $5, true)",
        [t.name, t.category || null, t.minutes, t.price, SHOP_ID],
      );
    }
    for (const s of toDeactivate) {
      await client.query("UPDATE services SET is_active = false WHERE id = $1", [s.id]);
    }

    await client.query("COMMIT");
    console.log("\nDone. Changes committed.\n");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nERROR — rolled back:", err.message, "\n");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
