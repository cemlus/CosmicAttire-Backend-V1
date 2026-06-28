import { Router, type Request, type Response } from "express";
import { supabase } from "./db/supaBaseClient.js";
import { requireOrgAccess, type UserRow } from "./db/db.js";

const adminRouter = Router();

/**
 * GET /admin/organizations/:organizationId
 * Returns basic organization info.
 */
adminRouter.get(
    "/organizations/:organizationId",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId } = req.params;
=======
            const { organizationId } = req.params as { organizationId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            const ctx = await requireOrgAccess(req, organizationId, [
                "minor_admin",
                "admin",
            ]);

            const { data, error } = await supabase
                .from("organizations")
                .select("*")
                .eq("id", organizationId)
                .single();

            if (error) {
                return res.status(404).json({ error: "Organization not found" });
            }

            return res.json({
                organization: data,
                access: {
                    super_admin: ctx.superAdmin,
                    role: ctx.membership?.role ?? "super_admin",
                },
            });
        } catch (err: any) {
            const message = err.message || "Failed to fetch organization";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

/**
 * GET /admin/organizations/:organizationId/members
 * Lists organization memberships.
 */
adminRouter.get(
    "/organizations/:organizationId/members",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId } = req.params;
=======
            const { organizationId } = req.params as { organizationId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            await requireOrgAccess(req, organizationId, ["minor_admin", "admin"]);

            const { data, error } = await supabase
                .from("organization_memberships")
                .select(
                    `
          id,
          organization_id,
          user_id,
          role,
          created_at,
<<<<<<< HEAD
          users:user_id (
            id,
            username,
            email,
            type,
=======
          user_profiles:user_id (
            id:user_id,
            username,
            email,
            role,
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            public_data
          )
        `
                )
                .eq("organization_id", organizationId)
                .order("created_at", { ascending: false });

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            return res.json({ members: data });
        } catch (err: any) {
            const message = err.message || "Failed to fetch members";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

/**
 * GET /admin/organizations/:organizationId/transactions
 * Minor admins and admins can see only their organization transactions.
 */
adminRouter.get(
    "/organizations/:organizationId/transactions",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId } = req.params;
=======
            const { organizationId } = req.params as { organizationId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            await requireOrgAccess(req, organizationId, ["minor_admin", "admin"]);

            const { data, error } = await supabase
                .from("transactions")
                .select("*")
                .eq("organization_id", organizationId)
                .order("created_at", { ascending: false });

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            return res.json({ transactions: data });
        } catch (err: any) {
            const message = err.message || "Failed to fetch transactions";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

/**
 * GET /admin/organizations/:organizationId/logs
 * Optional: organization-scoped logs.
 */
adminRouter.get(
    "/organizations/:organizationId/logs",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId } = req.params;
=======
            const { organizationId } = req.params as { organizationId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            await requireOrgAccess(req, organizationId, ["minor_admin", "admin"]);

            const { data, error } = await supabase
                .from("user_logs")
                .select("*")
                .eq("organization_id", organizationId)
                .order("created_at", { ascending: false });

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            return res.json({ logs: data });
        } catch (err: any) {
            const message = err.message || "Failed to fetch logs";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

/**
 * POST /admin/organizations/:organizationId/members/minor-admins
 * Body: { user_id: string }
 * Adds a minor admin to the organization.
 */
adminRouter.post(
    "/organizations/:organizationId/members/minor-admins",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId } = req.params;
=======
            const { organizationId } = req.params as { organizationId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            const { user_id } = req.body;

            if (!user_id) {
                return res.status(400).json({ error: "Missing user_id" });
            }

            const ctx = await requireOrgAccess(req, organizationId, ["admin"]);

            const { data: existingUser, error: userErr } = await supabase
<<<<<<< HEAD
                .from("users")
                .select("id")
                .eq("id", user_id)
=======
                .from("user_profiles")
                .select("user_id")
                .eq("user_id", user_id)
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
                .maybeSingle();

            if (userErr) {
                return res.status(500).json({ error: userErr.message });
            }

            if (!existingUser) {
                return res.status(404).json({ error: "Target user not found" });
            }

            const { data, error } = await supabase
                .from("organization_memberships")
                .upsert(
                    {
                        organization_id: organizationId,
                        user_id,
                        role: "minor_admin",
                    },
                    {
                        onConflict: "organization_id,user_id",
                    }
                )
                .select("*")
                .single();

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            return res.json({
                message: "Minor admin added",
                membership: data,
                performed_by: ctx.superAdmin ? "super_admin" : ctx.membership?.role,
            });
        } catch (err: any) {
            const message = err.message || "Failed to add minor admin";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

/**
 * DELETE /admin/organizations/:organizationId/members/minor-admins/:userId
 * Removes minor admin role from the organization.
 */
adminRouter.delete(
    "/organizations/:organizationId/members/minor-admins/:userId",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId, userId } = req.params;
=======
            const { organizationId, userId } = req.params as { organizationId: string; userId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            await requireOrgAccess(req, organizationId, ["admin"]);

            const { error } = await supabase
                .from("organization_memberships")
                .delete()
                .eq("organization_id", organizationId)
                .eq("user_id", userId)
                .eq("role", "minor_admin");

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            return res.json({ message: "Minor admin removed" });
        } catch (err: any) {
            const message = err.message || "Failed to remove minor admin";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

/**
 * POST /admin/organizations/:organizationId/readers/:readerId/access
 * Body: { ring_id: string }
 * Grants ring access to a specific reader.
 */
adminRouter.post(
    "/organizations/:organizationId/readers/:readerId/access",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId, readerId } = req.params;
=======
            const { organizationId, readerId } = req.params as { organizationId: string; readerId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            const { ring_id } = req.body;

            if (!ring_id) {
                return res.status(400).json({ error: "Missing ring_id" });
            }

            await requireOrgAccess(req, organizationId, ["admin"]);

            const { data: reader, error: readerErr } = await supabase
                .from("payment_devices")
                .select("*")
                .eq("id", readerId)
                .eq("organization_id", organizationId)
                .maybeSingle();

            if (readerErr) {
                return res.status(500).json({ error: readerErr.message });
            }

            if (!reader) {
                return res.status(404).json({ error: "Reader not found" });
            }

            const { data: ring, error: ringErr } = await supabase
                .from("rings")
                .select("*")
                .eq("ring_id", ring_id)
                .maybeSingle();

            if (ringErr) {
                return res.status(500).json({ error: ringErr.message });
            }

            if (!ring) {
                return res.status(404).json({ error: "Ring not found" });
            }

            const { data, error } = await supabase
                .from("reader_access")
                .insert({
                    organization_id: organizationId,
                    ring_id,
                    reader_id: readerId,
                })
                .select("*")
                .single();

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            return res.json({
                message: "Ring access granted",
                access: data,
            });
        } catch (err: any) {
            const message = err.message || "Failed to grant access";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

/**
 * DELETE /admin/organizations/:organizationId/readers/:readerId/access/:ringId
 * Revokes ring access from a specific reader.
 */
adminRouter.delete(
    "/organizations/:organizationId/readers/:readerId/access/:ringId",
    async (req: Request, res: Response) => {
        try {
<<<<<<< HEAD
            const { organizationId, readerId, ringId } = req.params;
=======
            const { organizationId, readerId, ringId } = req.params as { organizationId: string; readerId: string; ringId: string };
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
            await requireOrgAccess(req, organizationId, ["admin"]);

            const { error } = await supabase
                .from("reader_access")
                .delete()
                .eq("organization_id", organizationId)
                .eq("reader_id", readerId)
                .eq("ring_id", ringId);

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            return res.json({ message: "Ring access revoked" });
        } catch (err: any) {
            const message = err.message || "Failed to revoke access";
            return res.status(message === "Unauthorized" ? 401 : 403).json({
                error: message,
            });
        }
    }
);

export default adminRouter;