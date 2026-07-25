// /api/_lessonmode.js
// -------------------------------------------------------------
// PROTOTYPE MODE for the Lessons factory (owner's call, 2026-07-25).
//
// LS3 shipped a real review gate: the factory wrote lessons as 'pending' and the
// owner approved each one on /lesson-review before a kid could see it. The owner
// then asked to switch that off for now: this is a prototype and the point right
// now is proving the FUNCTION works end to end, not signing off content one
// lesson at a time. So a drafted lesson is now born approved.
//
// WHAT IS DEFINITELY STILL ON, and must stay on:
//   - The VALIDATOR. A lesson still has to pass every check in _lessongen.js
//     (read-aloud lines under 60 chars, no + or =, no emojis, exactly 5 check
//     questions, mastery 4 of 5, every correctIndex pointing at a real answer)
//     or it is refused and never stored. Auto-approve is not "anything goes".
//   - The SERVING GATE. api/lesson.js and api/lesson-map.js still only ever
//     serve status='approved'. Nothing about that changed - what changed is
//     which status the factory writes.
//   - The Lessons tile is still Coming Soon gated behind the 1111 owner gate in
//     the shell, so no kid reaches any of this yet either way.
//   - /lesson-review still works. The owner can still read, edit the wording,
//     and take a lesson back down (Reject) at any time.
//
// HOW TO PUT THE REVIEW GATE BACK (one line, no other change needed):
//   set AUTO_APPROVE to false below, or set the env var LESSON_AUTO_APPROVE=0
//   in Vercel. New batches then land as 'pending' again and wait on
//   /lesson-review, exactly as LS3 built it. Lessons already approved stay
//   approved - flipping this back does not pull live lessons down.
// -------------------------------------------------------------

// The env var wins if it is set, so this can be flipped without a code push.
const ENV = process.env.LESSON_AUTO_APPROVE;

export const AUTO_APPROVE = ENV == null || ENV === ""
  ? true                                   // prototype default, owner's call
  : !(ENV === "0" || String(ENV).toLowerCase() === "false");

// What a freshly drafted lesson is stamped with.
export function birthStatus() {
  return AUTO_APPROVE ? "approved" : "pending";
}

// Who gets recorded as the reviewer. Honest about the fact that no human read
// it, so the review history never claims an approval that did not happen.
export function birthReviewer() {
  return AUTO_APPROVE ? "auto (prototype mode)" : null;
}

export default { AUTO_APPROVE, birthStatus, birthReviewer };
