/**
 * Seeds campus taxonomy (always) and, with --demo, a realistic month of activity so the board,
 * scoreboard and demo video have something to show. Demo data is clearly fake and dev-only.
 *
 *   npm run db:seed            # taxonomy only (safe to re-run)
 *   npm run db:seed -- --demo  # + demo users and issues
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s });
const DEMO = process.argv.includes("--demo");
if (DEMO && process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");

const departments = [
  { id: "student-life", name: "Student Life Office", description: "Residences, wardens, clubs and campus life", email: "studentlife@plaksha.edu.in" },
  { id: "facilities", name: "Campus Facilities", description: "Electrical, plumbing, HVAC, housekeeping and repairs", email: null },
  { id: "it", name: "IT Services", description: "Wi-Fi, accounts, printers and classroom AV", email: null },
  { id: "dining", name: "Dining & Mess Committee", description: "Kela Dining Hall, menus and cafés", email: null },
  { id: "academics", name: "Office of Academic Affairs", description: "Classrooms, labs, library and schedules", email: null },
  { id: "health", name: "Health & Wellbeing", description: "Medical centre and counselling", email: null },
  { id: "security", name: "Campus Security", description: "Gates, lighting, CCTV and safety", email: null },
  { id: "transport", name: "Transport", description: "University buses and campus mobility", email: null },
  { id: "sports", name: "Sports & Recreation", description: "Multipurpose Hall, grounds and fitness studio", email: null },
];

const categories = [
  { id: "wifi", name: "Wi-Fi & IT", icon: "Wifi", color: "#00A0B4", departmentId: "it", slaHours: 48 },
  { id: "electrical", name: "Electrical & AC", icon: "Zap", color: "#D89614", departmentId: "facilities", slaHours: 48 },
  { id: "plumbing", name: "Water & plumbing", icon: "Droplets", color: "#2D7DD2", departmentId: "facilities", slaHours: 36 },
  { id: "cleanliness", name: "Cleanliness", icon: "Sparkles", color: "#3E9B4F", departmentId: "facilities", slaHours: 24 },
  { id: "mess", name: "Mess & food", icon: "UtensilsCrossed", color: "#E4572E", departmentId: "dining", slaHours: 72 },
  { id: "hostel", name: "Residence & rooms", icon: "BedDouble", color: "#7B61FF", departmentId: "student-life", slaHours: 72 },
  { id: "academics", name: "Classrooms & labs", icon: "GraduationCap", color: "#007878", departmentId: "academics", slaHours: 96 },
  { id: "health", name: "Health & wellbeing", icon: "HeartPulse", color: "#D2323C", departmentId: "health", slaHours: 24 },
  { id: "safety", name: "Safety & security", icon: "ShieldAlert", color: "#1A3A5C", departmentId: "security", slaHours: 12 },
  { id: "transport", name: "Transport", icon: "Bus", color: "#9A6B4F", departmentId: "transport", slaHours: 72 },
  { id: "sports", name: "Sports & gym", icon: "Dumbbell", color: "#0F9D8A", departmentId: "sports", slaHours: 96 },
  { id: "other", name: "Something else", icon: "CircleHelp", color: "#6B7280", departmentId: "student-life", slaHours: 120 },
].map((c, i) => ({ ...c, sortOrder: i }));

const locations = [
  ["girls-residence", "Agrawal-Oswal Student Residence", "Residential"],
  ["boys-residence", "Boys' Residence", "Residential"],
  ["dining-hall", "Kela Dining Hall", "Dining"],
  ["bharti", "Bharti Academic Building", "Academic"],
  ["havells", "Havells Research Building", "Academic"],
  ["axis", "Axis Bank FutureTech Building", "Academic"],
  ["hdfc-hub", "HDFC Innovation Hub", "Academic"],
  ["library", "Asha Mukul Agrawal Library", "Academic"],
  ["auditorium", "Usha Hasteer Auditorium", "Common"],
  ["activity-lounge", "Student Activity Lounge", "Common"],
  ["thrive-room", "MCKS Thrive Room", "Common"],
  ["arts-studio", "Cultural Arts Studio", "Common"],
  ["multipurpose-hall", "Multipurpose Hall", "Sports"],
  ["fitness-studio", "APL Apollo Fitness Studio", "Sports"],
  ["grounds", "Outdoor grounds", "Sports"],
  ["medical", "Medical centre", "Common"],
  ["main-gate", "Main gate & parking", "Common"],
  ["campus-wide", "Campus-wide", "Common"],
].map(([id, name, zone], i) => ({ id: id!, name: name!, zone: zone!, sortOrder: i }));

async function seedTaxonomy() {
  for (const d of departments)
    await db.insert(s.departments).values(d).onConflictDoUpdate({ target: s.departments.id, set: { name: d.name, description: d.description, email: d.email } });
  for (const c of categories)
    await db.insert(s.categories).values(c).onConflictDoUpdate({ target: s.categories.id, set: c });
  for (const l of locations)
    await db.insert(s.locations).values(l).onConflictDoUpdate({ target: s.locations.id, set: l });
  console.log(`✓ ${departments.length} departments, ${categories.length} categories, ${locations.length} locations`);
}

/* ───────────────────────── demo data ───────────────────────── */

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

const FIRST = ["Aarav", "Diya", "Kabir", "Ananya", "Vihaan", "Ishita", "Arjun", "Meera", "Rohan", "Sara", "Aditya", "Nisha", "Kunal", "Tara", "Dev", "Riya", "Yash", "Zoya", "Neel", "Avni", "Samar", "Pihu", "Reyansh", "Kiara", "Aryan", "Myra", "Veer", "Anika", "Ira", "Shaurya"];
const LAST = ["Sharma", "Mehta", "Gill", "Reddy", "Iyer", "Kapoor", "Bansal", "Sandhu", "Nair", "Joshi", "Malhotra", "Rao", "Sethi", "Verma", "Chawla"];

type Demo = {
  title: string;
  body: string;
  cat: string;
  loc: string;
  detail?: string;
  sev: "low" | "medium" | "high";
  votes: number;
  ageH: number;
  status: s.IssueStatus;
  anon?: boolean;
  official?: string[];
  resolution?: string;
  wontFix?: string;
  comments?: string[];
  reopened?: boolean;
};

const ISSUES: Demo[] = [
  { title: "Wi-Fi drops every evening on upper floors of the girls' residence", body: "Between 9 pm and midnight the connection keeps dropping on floors 7–11. Speed tests show <2 Mbps when it does connect. Makes it impossible to submit assignments on time.", cat: "wifi", loc: "girls-residence", detail: "Floors 7–11", sev: "high", votes: 64, ageH: 210, status: "in_progress", official: ["We've confirmed two access points on floor 8 and 10 are overloaded. New APs have been ordered; temporary extenders go up tonight."], comments: ["Floor 9 here, same thing every single night.", "It's worse on weekends when everyone is in."] },
  { title: "Hot water runs out by 8 am in the boys' residence", body: "Geysers in the common washrooms are cold from about 7:45 am onwards. People with 8:30 classes end up taking cold showers.", cat: "plumbing", loc: "boys-residence", detail: "Block B washrooms", sev: "medium", votes: 41, ageH: 96, status: "acknowledged", official: ["Facilities has checked the timers on the solar-backup heaters. A technician visits tomorrow at 10 am."] },
  { title: "Dinner runs out of rotis and dal by 8:45 pm", body: "Anyone who comes after club meetings gets only rice. Happened 4 times this week.", cat: "mess", loc: "dining-hall", sev: "medium", votes: 37, ageH: 60, status: "open", comments: ["Can we at least get a heads-up on the mess group when stock is low?"] },
  { title: "AC leaking water in Bharti classroom 104", body: "Water drips from the AC vent onto the second row. Someone put a bin under it but it overflows during long lectures.", cat: "electrical", loc: "bharti", detail: "Room 104", sev: "medium", votes: 22, ageH: 150, status: "resolved", resolution: "Drain pipe was blocked and has been cleared. The unit was serviced and tested for 3 hours with no leakage.", official: ["Technician scheduled for Thursday 4 pm after classes."] },
  { title: "Street lights out on the path between residences and grounds", body: "The stretch past the volleyball court is completely dark after 7 pm. Feels unsafe walking back from practice.", cat: "safety", loc: "grounds", sev: "high", votes: 33, ageH: 30, status: "in_progress", official: ["Security has placed a guard on the path from 7–11 pm until the fixtures are replaced. Electrical team is on it."] },
  { title: "Two of three Makerspace 3D printers have been broken for weeks", body: "Prusa #1 has a clogged nozzle and #3 doesn't heat the bed. Queue for the remaining printer is 2 days long before capstone deadlines.", cat: "academics", loc: "havells", detail: "Makerspace", sev: "medium", votes: 29, ageH: 340, status: "in_progress", official: ["Replacement nozzles and a heater cartridge arrive Monday. We're also adding a booking sheet."] },
  { title: "Library should stay open past 11 pm during end-sems", body: "Residences are noisy during exams. Can the library run 24×7 for the two exam weeks like most campuses do?", cat: "academics", loc: "library", sev: "low", votes: 52, ageH: 400, status: "closed", resolution: "Approved: the library will stay open until 3 am from Dec 1–14, with security on duty.", comments: ["This is huge, thank you!"] },
  { title: "Washing machines on the 4th floor are out of order", body: "Machines 2 and 3 show an error E21 and don't drain.", cat: "hostel", loc: "girls-residence", detail: "Floor 4 laundry", sev: "low", votes: 18, ageH: 70, status: "acknowledged" },
  { title: "Water cooler in Havells building dispenses warm water", body: "Cooler near the ground-floor stairs has been warm for a week.", cat: "plumbing", loc: "havells", detail: "Ground floor", sev: "low", votes: 9, ageH: 50, status: "open" },
  { title: "Mosquitoes in residence corridors — please schedule fogging", body: "Lots of mosquitoes on lower floors after the rain. Some people already have fevers.", cat: "health", loc: "boys-residence", sev: "high", votes: 46, ageH: 120, status: "resolved", resolution: "Fogging done across both residences on Tuesday evening, and the stagnant water behind the dining hall was drained. A second round is scheduled next week.", reopened: false },
  { title: "Library printer out of toner for a week", body: "The only colour printer in the library has been printing faded pages and now nothing at all.", cat: "wifi", loc: "library", sev: "low", votes: 14, ageH: 190, status: "closed", resolution: "Toner replaced and a spare cartridge is now kept at the library desk." },
  { title: "Captive portal logs everyone out every hour", body: "Plaksha-Students network asks you to log in again every 60 minutes, which kills long downloads and Zoom calls.", cat: "wifi", loc: "campus-wide", sev: "medium", votes: 38, ageH: 260, status: "closed", resolution: "Session timeout raised from 1 hour to 7 days for registered devices." },
  { title: "Sunday bus to Mohali leaves 15 minutes early", body: "Schedule says 5:00 pm but it has left at 4:45 three Sundays in a row. People got stranded.", cat: "transport", loc: "main-gate", sev: "medium", votes: 21, ageH: 80, status: "acknowledged", official: ["We've spoken to the operator. Departure times will be logged at the gate from this week."] },
  { title: "Treadmill #2 belt slips when running", body: "Belt slips at speeds above 8 km/h. Dangerous.", cat: "sports", loc: "fitness-studio", sev: "medium", votes: 11, ageH: 40, status: "open" },
  { title: "More vegetarian protein options at lunch", body: "Lunch is mostly carbs. Paneer/soya/chana more than once a week would help people who train.", cat: "mess", loc: "dining-hall", sev: "low", votes: 57, ageH: 500, status: "closed", resolution: "From this month, lunch includes a protein station (paneer, soya, chana or sprouts) every weekday. Feedback form linked in the mess group." },
  { title: "Washroom on Bharti 2nd floor has no soap or tissues by noon", body: "Refills happen in the morning only.", cat: "cleanliness", loc: "bharti", detail: "2nd floor", sev: "low", votes: 16, ageH: 28, status: "open" },
  { title: "Projector in Axis Bank building room 201 flickers", body: "The image flickers every few seconds, especially on slides with white backgrounds.", cat: "academics", loc: "axis", detail: "Room 201", sev: "low", votes: 8, ageH: 20, status: "open" },
  { title: "Room heaters needed before winter in the boys' residence", body: "Nights already drop below 10°C. Rooms don't have heaters and the AC heating mode doesn't work in Block A.", cat: "electrical", loc: "boys-residence", detail: "Block A", sev: "medium", votes: 44, ageH: 18, status: "open", comments: ["AC heat mode doesn't work in Block C either."] },
  { title: "Basketball court lights turn off at 9 pm sharp", body: "Can the timer be moved to 10:30 pm? Most people play after dinner.", cat: "sports", loc: "multipurpose-hall", sev: "low", votes: 27, ageH: 300, status: "wont_fix", wontFix: "The hall's lights are on the same circuit as the residence quiet-hours system. We've instead opened the outdoor court with lights until 10:30 pm." },
  { title: "Water leak from ceiling near the activity lounge entrance", body: "Ceiling tiles are stained and dripping after rain.", cat: "plumbing", loc: "activity-lounge", sev: "medium", votes: 12, ageH: 160, status: "resolved", resolution: "Roof drain cleared and two ceiling tiles replaced.", reopened: true },
  { title: "Dining hall too crowded 1–1:30 pm, lines past 20 minutes", body: "Classes end at the same time so everyone arrives at once.", cat: "mess", loc: "dining-hall", sev: "low", votes: 31, ageH: 220, status: "in_progress", official: ["Trialing a second serving counter from Monday. We'll share wait-time numbers after two weeks."] },
  { title: "Counselling appointments booked out for 2 weeks", body: "Booking system shows the next slot after 14 days. That's too long for people who are struggling.", cat: "health", loc: "thrive-room", sev: "high", votes: 26, ageH: 110, status: "acknowledged", anon: true, official: ["Thank you for raising this. We're adding walk-in hours on Tue/Thu 5–7 pm starting next week, and a second counsellor joins in January."] },
  { title: "Stray dogs chasing cyclists near the main gate at night", body: "A pack of 4–5 dogs near the parking chases people after 10 pm.", cat: "safety", loc: "main-gate", sev: "medium", votes: 19, ageH: 75, status: "acknowledged" },
  { title: "Garbage bins overflowing behind the dining hall", body: "Smells bad and attracts dogs and flies.", cat: "cleanliness", loc: "dining-hall", sev: "medium", votes: 23, ageH: 55, status: "in_progress" },
  { title: "Cultural Arts Studio piano is badly out of tune", body: "Hasn't been tuned since last year.", cat: "other", loc: "arts-studio", sev: "low", votes: 7, ageH: 140, status: "open" },
  { title: "Medical centre closed on Sunday afternoons", body: "Had a fever on Sunday and there was no doctor until Monday morning.", cat: "health", loc: "medical", sev: "high", votes: 34, ageH: 260, status: "closed", resolution: "A nurse is now on call 24×7, and the duty doctor's number is posted at the residence desks." },
  { title: "Room door lock jams in the boys' residence", body: "Key card reader blinks red ~1 in 5 times, sometimes locks people out.", cat: "hostel", loc: "boys-residence", detail: "Rooms 3xx", sev: "medium", votes: 15, ageH: 36, status: "open" },
  { title: "Eduroam doesn't work in the auditorium", body: "No signal at all once you're in the seats.", cat: "wifi", loc: "auditorium", sev: "low", votes: 10, ageH: 90, status: "acknowledged" },
  { title: "Corridor lights flicker on floor 3 of girls' residence", body: "Gives people headaches, been 4 days.", cat: "electrical", loc: "girls-residence", detail: "Floor 3", sev: "low", votes: 6, ageH: 14, status: "open" },
  { title: "No drinking water dispenser near the football ground", body: "After games we have to walk all the way back.", cat: "sports", loc: "grounds", sev: "low", votes: 20, ageH: 380, status: "closed", resolution: "Water dispenser installed next to the volleyball court." },
  { title: "Bus pass top-up only accepts cash", body: "Can we pay by UPI?", cat: "transport", loc: "main-gate", sev: "low", votes: 13, ageH: 600, status: "closed", resolution: "UPI QR is now available at the transport desk." },
  { title: "Breakfast eggs are often cold", body: "Eggs are made at 7 and sit until 9.", cat: "mess", loc: "dining-hall", sev: "low", votes: 17, ageH: 26, status: "open" },
  { title: "Ants in the residence pantry", body: "The pantry on floor 6 is full of ants near the microwave.", cat: "cleanliness", loc: "girls-residence", detail: "Floor 6 pantry", sev: "low", votes: 5, ageH: 8, status: "open" },
  { title: "Lab benches in HDFC Innovation Hub need more power sockets", body: "Only 2 sockets per bench for 4 people.", cat: "academics", loc: "hdfc-hub", sev: "low", votes: 12, ageH: 230, status: "acknowledged" },
  { title: "CCTV blind spot at the cycle stand", body: "Two cycles stolen this month from the far end of the stand.", cat: "safety", loc: "boys-residence", detail: "Cycle stand", sev: "medium", votes: 24, ageH: 170, status: "resolved", resolution: "A new camera now covers the far end of the stand, and cycle-lock hoops were added." },
  { title: "Gym is closed on Sunday mornings", body: "Can it open from 7 am on Sundays?", cat: "sports", loc: "fitness-studio", sev: "low", votes: 25, ageH: 48, status: "open" },
];

async function seedDemo() {
  await db.execute(sql`truncate issues, proposals, notifications, flags, audit_log, rate_hits, session, account, verification restart identity cascade`);
  await db.execute(sql`delete from "user"`);

  const mk = (id: string, name: string, email: string, role: s.Role = "member", departmentId: string | null = null) => ({
    id,
    name,
    email,
    emailVerified: true,
    role,
    departmentId,
  });
  const people = Array.from({ length: 90 }, (_, i) => {
    const f = FIRST[i % FIRST.length]!;
    const l = LAST[(i * 7) % LAST.length]!;
    return mk(`demo-${i}`, `${f} ${l}`, `${f}.${l}${i > 29 ? i : ""}@plaksha.edu.in`.toLowerCase());
  });
  const staff = [
    mk("staff-facilities", "Facilities Desk", "facilities.demo@plaksha.edu.in", "staff", "facilities"),
    mk("staff-it", "IT Helpdesk", "it.demo@plaksha.edu.in", "staff", "it"),
    mk("staff-dining", "Mess Committee", "dining.demo@plaksha.edu.in", "staff", "dining"),
    mk("staff-sl", "Student Life", "studentlife.demo@plaksha.edu.in", "staff", "student-life"),
    mk("staff-acad", "Academic Affairs", "academics.demo@plaksha.edu.in", "staff", "academics"),
    mk("staff-health", "Wellbeing Team", "health.demo@plaksha.edu.in", "staff", "health"),
    mk("staff-sec", "Security Office", "security.demo@plaksha.edu.in", "staff", "security"),
    mk("staff-transport", "Transport Desk", "transport.demo@plaksha.edu.in", "staff", "transport"),
    mk("staff-sports", "Sports Office", "sports.demo@plaksha.edu.in", "staff", "sports"),
  ];
  const special = [
    mk("demo-student", "Demo Student", "student.demo@plaksha.edu.in"),
    mk("demo-prof", "Prof. Demo Faculty", "faculty.demo@plaksha.edu.in"),
    mk("demo-admin", "Pulse Admin", "admin.demo@plaksha.edu.in", "admin"),
  ];
  await db.insert(s.user).values([...people, ...staff, ...special]);
  const staffFor = (dept: string) => staff.find((x) => x.departmentId === dept)!;

  for (const d of ISSUES) {
    const cat = categories.find((c) => c.id === d.cat)!;
    const reporter = pick(people);
    const created = hoursAgo(d.ageH);
    const due = new Date(created.getTime() + cat.slaHours * 3600_000);
    const ackAt = d.status !== "open" ? new Date(created.getTime() + Math.min(d.ageH * 0.1, 2 + rand() * 14) * 3600_000) : null;
    // Most fixes land near the category target; a few run late, so the scoreboard looks like real life.
    const fixH = Math.min(d.ageH * 0.9, cat.slaHours * (0.35 + rand() * 1.0));
    const resolvedAt = ["resolved", "closed"].includes(d.status) ? new Date(created.getTime() + fixH * 3600_000) : null;
    const closedAt = d.status === "closed" ? new Date(Math.min(Date.now() - 3600_000, (resolvedAt?.getTime() ?? 0) + 72 * 3600_000)) : d.status === "wont_fix" ? new Date(created.getTime() + d.ageH * 0.5 * 3600_000) : null;

    const [issue] = await db
      .insert(s.issues)
      .values({
        title: d.title,
        body: d.body,
        categoryId: d.cat,
        locationId: d.loc,
        locationDetail: d.detail ?? null,
        severity: d.sev,
        status: d.status,
        reporterId: reporter.id,
        anonymous: d.anon ?? rand() < 0.2,
        departmentId: cat.departmentId,
        metooCount: d.votes,
        commentCount: (d.comments?.length ?? 0) + (d.official?.length ?? 0),
        reopenCount: d.reopened ? 1 : 0,
        resolutionNote: d.resolution ?? null,
        wontFixReason: d.wontFix ?? null,
        dueAt: due,
        createdAt: created,
        updatedAt: resolvedAt ?? ackAt ?? created,
        acknowledgedAt: ackAt,
        resolvedAt,
        closedAt,
      })
      .returning();

    // votes spread over the issue's life, front-loaded (most people pile on early)
    const voters = [reporter, ...people.filter((p) => p.id !== reporter.id).sort(() => rand() - 0.5)].slice(0, d.votes);
    const span = (resolvedAt?.getTime() ?? Date.now()) - created.getTime();
    await db.insert(s.issueVotes).values(
      voters.map((v, i) => ({
        issueId: issue.id,
        userId: v.id,
        createdAt: i === 0 ? created : new Date(created.getTime() + Math.pow(rand(), 2.2) * span),
      })),
    );
    await db.insert(s.issueWatchers).values(voters.map((v) => ({ issueId: issue.id, userId: v.id }))).onConflictDoNothing();

    const ev: (typeof s.issueEvents.$inferInsert)[] = [
      { issueId: issue.id, actorId: reporter.id, actorRole: "member", type: "created", toStatus: "open", departmentId: cat.departmentId, createdAt: created },
    ];
    const st = staffFor(cat.departmentId);
    if (ackAt) ev.push({ issueId: issue.id, actorId: st.id, actorRole: "staff", type: "status_changed", fromStatus: "open", toStatus: "acknowledged", departmentId: cat.departmentId, createdAt: ackAt });
    if (["in_progress", "resolved", "closed"].includes(d.status) && ackAt)
      ev.push({ issueId: issue.id, actorId: st.id, actorRole: "staff", type: "status_changed", fromStatus: "acknowledged", toStatus: "in_progress", departmentId: cat.departmentId, createdAt: new Date(ackAt.getTime() + 4 * 3600_000) });
    if (d.reopened && resolvedAt) {
      const firstFix = new Date(created.getTime() + (resolvedAt.getTime() - created.getTime()) * 0.4);
      ev.push({ issueId: issue.id, actorId: st.id, actorRole: "staff", type: "status_changed", fromStatus: "in_progress", toStatus: "resolved", departmentId: cat.departmentId, note: "Ceiling tiles replaced.", createdAt: firstFix });
      ev.push({ issueId: issue.id, actorId: voters[1]?.id ?? reporter.id, actorRole: "member", type: "reopened", fromStatus: "resolved", toStatus: "in_progress", note: "Still dripping after yesterday's rain — the tiles were replaced but the leak wasn't fixed.", createdAt: new Date(created.getTime() + (resolvedAt.getTime() - created.getTime()) * 0.65) });
    }
    if (resolvedAt) ev.push({ issueId: issue.id, actorId: st.id, actorRole: "staff", type: "status_changed", fromStatus: "in_progress", toStatus: "resolved", departmentId: cat.departmentId, note: d.resolution, createdAt: resolvedAt });
    if (closedAt && d.status === "closed") ev.push({ issueId: issue.id, actorId: reporter.id, actorRole: "member", type: "verified", fromStatus: "resolved", toStatus: "closed", createdAt: closedAt });
    if (d.status === "wont_fix" && closedAt) ev.push({ issueId: issue.id, actorId: st.id, actorRole: "staff", type: "status_changed", fromStatus: "acknowledged", toStatus: "wont_fix", note: d.wontFix, departmentId: cat.departmentId, createdAt: closedAt });
    await db.insert(s.issueEvents).values(ev);

    const cm: (typeof s.comments.$inferInsert)[] = [];
    (d.comments ?? []).forEach((body, i) =>
      cm.push({ issueId: issue.id, authorId: voters[i + 1]?.id ?? reporter.id, body, createdAt: new Date(created.getTime() + (i + 1) * 3 * 3600_000) }),
    );
    (d.official ?? []).forEach((body) =>
      cm.push({ issueId: issue.id, authorId: st.id, body, official: true, createdAt: new Date((ackAt ?? created).getTime() + 2 * 3600_000) }),
    );
    if (cm.length) await db.insert(s.comments).values(cm);

    if (d.status === "resolved") {
      const fixers = voters.slice(0, Math.min(2, voters.length));
      await db.insert(s.verifications).values(fixers.slice(1).map((v) => ({ issueId: issue.id, userId: v.id, fixed: true, round: d.reopened ? 1 : 0 })));
    }
  }

  // A merged duplicate, so the timeline shows merges
  const [wifi] = await db.select().from(s.issues).where(sql`title like 'Wi-Fi drops every evening%'`);
  const dupReporter = people[77]!;
  const [dup] = await db
    .insert(s.issues)
    .values({
      title: "Internet super slow at night in girls hostel",
      body: "Can't even load Canvas after 10 pm.",
      categoryId: "wifi",
      locationId: "girls-residence",
      severity: "medium",
      status: "duplicate",
      reporterId: dupReporter.id,
      departmentId: "it",
      duplicateOfId: wifi!.id,
      metooCount: 1,
      dueAt: hoursAgo(100),
      createdAt: hoursAgo(150),
      closedAt: hoursAgo(140),
    })
    .returning();
  await db.insert(s.issueVotes).values({ issueId: dup.id, userId: dupReporter.id, createdAt: hoursAgo(150) }).onConflictDoNothing();
  await db.insert(s.issueEvents).values([
    { issueId: dup.id, actorId: dupReporter.id, actorRole: "member", type: "created", toStatus: "open", createdAt: hoursAgo(150) },
    { issueId: dup.id, actorId: "staff-it", actorRole: "staff", type: "merged_away", fromStatus: "open", toStatus: "duplicate", relatedIssueId: wifi!.id, departmentId: "it", createdAt: hoursAgo(140) },
    { issueId: wifi!.id, actorId: "staff-it", actorRole: "staff", type: "merged_in", relatedIssueId: dup.id, departmentId: "it", createdAt: hoursAgo(140) },
  ]);

  // Demo student watches a few things and has notifications
  const watched = await db.select({ id: s.issues.id, number: s.issues.number }).from(s.issues).where(sql`number in (6, 8, 12, 10)`).orderBy(s.issues.number);
  for (const w of watched) {
    await db.insert(s.issueVotes).values({ issueId: w.id, userId: "demo-student" }).onConflictDoNothing();
    await db.insert(s.issueWatchers).values({ issueId: w.id, userId: "demo-student" }).onConflictDoNothing();
  }
  await db.execute(sql`update issues set metoo_count = (select count(*) from issue_votes v where v.issue_id = issues.id)`);
  await db.insert(s.notifications).values([
    { userId: "demo-student", issueId: watched[0]!.id, kind: "official", message: `Official update on #${watched[0]!.number}: replacement nozzles and a heater cartridge arrive Monday.`, createdAt: hoursAgo(3) },
    { userId: "demo-student", issueId: watched[2]!.id, kind: "verify", message: `#${watched[2]!.number} was marked fixed. Is it actually fixed? Let them know.`, createdAt: hoursAgo(20) },
  ]);

  // A flagged joke post for the moderation queue
  const [joke] = await db
    .insert(s.issues)
    .values({
      title: "Mess food is so bad my cat refused it lol",
      body: "jk i dont have a cat",
      categoryId: "mess",
      locationId: "dining-hall",
      reporterId: people[50]!.id,
      departmentId: "dining",
      dueAt: hoursAgo(-60),
      createdAt: hoursAgo(6),
    })
    .returning();
  await db.insert(s.issueVotes).values({ issueId: joke.id, userId: people[50]!.id });
  await db.insert(s.issueEvents).values({ issueId: joke.id, actorId: people[50]!.id, actorRole: "member", type: "created", toStatus: "open", createdAt: hoursAgo(6) });
  await db.insert(s.flags).values(
    [people[1], people[2], people[3]].map((p) => ({ targetType: "issue" as const, targetId: joke.id, issueId: joke.id, userId: p!.id, reason: "Spam or joke post" })),
  );


  /* ── Proposals: one at each stage of the pipeline ── */
  const COHORTS = ["Class of 2027", "Class of 2028", "Class of 2029", "Class of 2030", "Postgrad / PhD", "Faculty"];
  const cohortOf = (i: number) => COHORTS[i % 10 < 4 ? 2 : i % 10 < 7 ? 1 : i % 10 < 9 ? 3 : i % 3 === 0 ? 4 : 0]!;
  await db.execute(sql`update "user" set cohort = 'Class of 2029' where id = 'demo-student'`);
  const REASONS = [
    "I end up working in my room because there's nowhere open after nine.",
    "Our project team lost two evenings last week to this.",
    "Would use it three or four nights a week during build season.",
    "Happy to supervise a slot if that's what it takes.",
    "It's the one thing every senior told me they wished they'd had.",
    "The current timing clashes with labs for most of second year.",
    "Makes a real difference for those of us who don't go home on weekends.",
    "Other campuses our size already do this.",
  ];
  const PROPOSALS: {
    title: string; ask: string; body: string; area: string; dept: string | null; goal: number; stage: s.ProposalStage; supporters: number; ageD: number;
    trialPlan?: string; trial?: [number, number]; decision?: string; steps?: { to: s.ProposalStage; daysAgo: number; note: string; official?: boolean }[];
  }[] = [
    {
      title: "Keep the makerspace open till midnight",
      ask: "Extend makerspace hours from 9 pm to midnight on weekdays, with a trained student supervisor on duty.",
      body: "Most project work happens after dinner, and the makerspace closes just as teams are free. Three clubs have build deadlines this semester.\n\nWhat it needs: one student supervisor per night (volunteers below), and the existing access-card log.",
      area: "academics", dept: "academics", goal: 100, stage: "trial", supporters: 84, ageD: 16,
      trialPlan: "Two weeks, Monday to Friday, 9 pm to midnight. Student supervisor signs in and out. Check in here each night you use it.",
      trial: [-5, 9],
      steps: [
        { to: "in_review", daysAgo: 9, note: "Met the Office of Academic Affairs with the evidence pack. They asked for a supervisor roster, which the volunteers have filled." },
        { to: "trial", daysAgo: 5, note: "Approved for a two-week trial. We'll review the check-in numbers together at the end.", official: true },
      ],
    },
    {
      title: "A quiet study room that stays open all night",
      ask: "Keep one room in the library building open 24 hours during exam weeks, with card access.",
      body: "During end-sems the library closes at 11 and the residences are noisy. One card-access room would cover it.",
      area: "spaces", dept: "academics", goal: 100, stage: "gathering", supporters: 63, ageD: 6,
      trialPlan: "Run it for the two weeks of end-sem exams and count card swipes after 11 pm.",
    },
    {
      title: "Late-night café counter till 1 am",
      ask: "Keep one counter at the café open till 1 am on weekdays, with a short fixed menu.",
      body: "There's nothing to eat on campus after 10:30. A short menu (chai, maggi, sandwiches) would be enough.",
      area: "food", dept: "dining", goal: 200, stage: "in_review", supporters: 71, ageD: 11,
      steps: [{ to: "in_review", daysAgo: 2, note: "Shared the evidence pack with the Mess Committee. They are checking vendor staffing and will reply next week." }],
    },
    {
      title: "Monthly open-mic night at the amphitheatre",
      ask: "Reserve the amphitheatre on the first Friday of every month for a student open mic.",
      body: "Clubs currently book it ad hoc and approvals take a week each time. A standing booking removes the back-and-forth.",
      area: "events", dept: "student-life", goal: 50, stage: "adopted", supporters: 58, ageD: 34,
      trialPlan: "Two trial nights in consecutive months.", trial: [-27, -1],
      decision: "Approved as a standing booking for the rest of the academic year. Sound cut-off stays at 10:30 pm.",
      steps: [
        { to: "in_review", daysAgo: 30, note: "Taken to the Student Life Office with 50 supporters." },
        { to: "trial", daysAgo: 27, note: "Two trial nights approved.", official: true },
        { to: "adopted", daysAgo: 3, note: "Approved as a standing booking for the rest of the academic year. Sound cut-off stays at 10:30 pm.", official: true },
      ],
    },
    {
      title: "Weekend shuttle to Chandigarh",
      ask: "Run a university bus to Sector 17 and back on Saturdays, leaving at 11 am and returning at 8 pm.",
      body: "Cabs cost about ₹900 each way. A weekly shuttle would fill.",
      area: "mobility", dept: "transport", goal: 100, stage: "gathering", supporters: 29, ageD: 3,
    },
    {
      title: "Shared cycles between the residences and academic block",
      ask: "Place 20 shared cycles at the residences and the academic block, unlocked with the campus ID.",
      body: "",
      area: "mobility", dept: "transport", goal: 100, stage: "declined", supporters: 41, ageD: 40,
      decision: "Not approved this year: the insurance and maintenance cost came in above the transport budget. The office has said it can be re-proposed with a sponsor.",
      steps: [
        { to: "in_review", daysAgo: 33, note: "Shared with the Transport Desk." },
        { to: "declined", daysAgo: 20, note: "Not approved this year: the insurance and maintenance cost came in above the transport budget. The office has said it can be re-proposed with a sponsor.", official: true },
      ],
    },
  ];
  const dayStr = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offsetDays * 86_400_000));
  for (const [pi, d] of PROPOSALS.entries()) {
    const author = people[(pi * 13 + 5) % people.length]!;
    const created = hoursAgo(d.ageD * 24);
    const last = d.steps?.[d.steps.length - 1];
    const [prop] = await db
      .insert(s.proposals)
      .values({
        title: d.title, ask: d.ask, body: d.body, area: d.area, departmentId: d.dept, goal: d.goal, stage: d.stage, authorId: author.id,
        supportCount: d.supporters, trialPlan: d.trialPlan ?? null,
        trialStartsOn: d.trial ? dayStr(d.trial[0]) : null, trialEndsOn: d.trial ? dayStr(d.trial[1]) : null,
        decisionNote: d.decision ?? null, createdAt: created, stageChangedAt: last ? hoursAgo(last.daysAgo * 24) : created,
      })
      .returning();
    const others = people.filter((x) => x.id !== author.id).sort(() => rand() - 0.5).slice(0, d.supporters - 1);
    const frozenAt = ["adopted", "declined"].includes(d.stage) && last ? last.daysAgo : 0;
    await db.insert(s.proposalSupports).values(
      [author, ...others].map((u, i) => {
        // Front-loaded growth: a burst when it's shared, then a long tail.
        const t = i === 0 ? 0 : Math.pow(rand(), 1.8);
        const idx = Number(u.id.replace("demo-", "")) || 0;
        return {
          proposalId: prop.id, userId: u.id, cohort: cohortOf(idx),
          usage: (i === 0 || rand() < 0.52 ? "often" : rand() < 0.7 ? "sometimes" : "backing") as s.Usage,
          volunteer: i === 0 || rand() < 0.12, showName: rand() < 0.8,
          reason: rand() < 0.22 ? REASONS[Math.floor(rand() * REASONS.length)]! : null,
          createdAt: new Date(created.getTime() + t * (d.ageD - frozenAt) * 86_400_000),
        };
      }),
    );
    await db.insert(s.proposalPosts).values([
      { proposalId: prop.id, authorId: author.id, kind: "created" as const, toStage: "gathering" as const, createdAt: created },
      ...(d.steps ?? []).map((st, i, arr) => ({
        proposalId: prop.id, authorId: st.official ? staffFor(d.dept ?? "student-life").id : author.id, kind: "stage" as const,
        fromStage: (i ? arr[i - 1]!.to : "gathering") as s.ProposalStage, toStage: st.to, official: !!st.official, body: st.note, createdAt: hoursAgo(st.daysAgo * 24),
      })),
    ]);
    if (d.trial) {
      const rows = [];
      for (let off = d.trial[0]; off <= Math.min(-1, d.trial[1]); off++) {
        const n = 9 + Math.floor(rand() * 14);
        for (const u of [author, ...others].sort(() => rand() - 0.5).slice(0, n)) {
          const r = rand();
          rows.push({ proposalId: prop.id, userId: u.id, day: dayStr(off), rating: r < 0.74 ? 3 : r < 0.93 ? 2 : 1 });
        }
      }
      if (rows.length) await db.insert(s.trialCheckins).values(rows);
    }
  }

  console.log(`✓ demo: ${people.length + staff.length + special.length} users, ${ISSUES.length + 2} issues, ${PROPOSALS.length} proposals`);
  console.log("  sign in as student.demo@ / faculty.demo@ / facilities.demo@ / admin.demo@plaksha.edu.in (code prints in the dev server console)");
}

await seedTaxonomy();
if (DEMO) await seedDemo();
await pool.end();
