import { getActiveWorkshopAssignmentForReader, isUserRegisteredForEvent } from "../db/db.js";
import { supabase } from "../db/supaBaseClient.js";

/**
 * Fire-and-forget helper invoked after a successful ring tap verification.
 * If (and only if) the reader that was tapped is currently assigned to a
 * workshop slot, and the tapping user is registered for that workshop's
 * event, records attendance and credits skill points via the
 * `credit_skill_points` RPC.
 *
 * This is intentionally silent (no-op, not an error) for the common case of
 * a reader that isn't a workshop-slot reader, or a user who hasn't
 * registered for the workshop — callers should not surface either case to
 * the ESP32 / end user. Real failures are thrown so the caller can log them.
 */
export async function creditWorkshopAttendanceIfAssigned(userId: string, readerId: string): Promise<void> {
  const assignment = await getActiveWorkshopAssignmentForReader(readerId);
  if (!assignment) {
    // This reader isn't currently assigned to a workshop slot — nothing to do.
    return;
  }

  const { workshop_slot_id, event_slug, slot_number, points } = assignment;

  const isRegistered = await isUserRegisteredForEvent(userId, event_slug);
  if (!isRegistered) {
    // No registration for this workshop — no attendance, no points, no error.
    return;
  }

  // workshop_attendance is a brand new table not yet in the generated
  // Supabase types — same stale-types gap as tap_logs/device_registry
  // elsewhere in this codebase — so cast to any rather than blocking on a
  // type regen.
  const { data: attendanceRow, error: insertError } = await (supabase as any)
    .from("workshop_attendance")
    .insert({
      user_id: userId,
      event_slug,
      slot_number,
      workshop_slot_id,
      points_awarded: points,
      reader_id: readerId,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // unique_violation — user already attended this slot. Normal no-op.
      return;
    }
    throw new Error(`Failed to insert workshop_attendance: ${insertError.message}`);
  }

  const { error: rpcError } = await (supabase as any).rpc("credit_skill_points", {
    p_user_id: userId,
    p_amount: points,
    p_reason: `Workshop attendance — ${event_slug} slot ${slot_number}`,
    p_source: "workshop_attendance",
    p_ref_id: attendanceRow.id,
  });

  if (rpcError) {
    // The attendance row already exists at this point even though the
    // points credit failed — an acceptable inconsistency to flag via the
    // caller's log rather than roll back, since there's no cheap
    // transaction spanning both calls without a bigger refactor.
    throw new Error(`Failed to credit skill points: ${rpcError.message}`);
  }
}
