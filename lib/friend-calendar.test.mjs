import assert from "node:assert/strict";
import test from "node:test";
import { calendarDates, calendarWeekday, sessionsByDate, friendDateFromUrl, dateInTimeZone } from "./friend-calendar.ts";

test("calendar civil dates retain leap days and week alignment independent of local time zone", () => {
  assert.equal(calendarDates(2024).length, 366);
  assert.equal(calendarDates(2025).length, 365);
  assert.ok(calendarDates(2024).includes("2024-02-29"));
  assert.equal(calendarWeekday("2024-01-01"), 1);
  assert.equal(calendarWeekday("2026-09-27"), 0);
  assert.equal(calendarDates(2026).at(-1), "2026-12-31");
  assert.throws(() => calendarDates(2026.5));
});

test("calendar keeps all same-day Sessions and a long-lived Session's actual active dates", () => {
  const daily = {sessionId:'daily', projectId:'friend', dates:['2026-09-20'], kind:'daily', title:'Chat'};
  const job = {sessionId:'job', projectId:'friend', dates:['2026-09-20','2026-09-22'], kind:'work', title:'Research'};
  const days = sessionsByDate([daily,job]);
  assert.deepEqual(days.get('2026-09-20').map(s=>s.sessionId), ['daily','job']);
  assert.equal(days.has('2026-09-21'), false, 'do not fill the gap between creation and modification');
  assert.deepEqual(days.get('2026-09-22').map(s=>s.sessionId), ['job']);
});


test("day navigation restores only valid civil dates and uses the Friend timezone", () => {
  assert.equal(friendDateFromUrl('http://local/?session=job&friendDate=2026-09-25'), '2026-09-25');
  for (const date of ['bad','2026-02-30','']) assert.equal(friendDateFromUrl(`http://local/?friendDate=${date}`), null);
  assert.equal(dateInTimeZone('2026-09-25T16:30:00Z','Asia/Shanghai'), '2026-09-26');
});
