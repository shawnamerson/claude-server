import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { sendTeamInviteEmail } from "../services/email.js";
import "../types.js";

const router = Router();

// Create a team
router.post("/teams", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const { name } = req.body;
  if (!name) { res.status(400).json({ error: "Team name is required" }); return; }

  const db = getDb();
  const id = nanoid(12);
  db.prepare("INSERT INTO teams (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, user.id);
  db.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')").run(id, user.id);

  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  res.status(201).json(team);
});

// List teams the current user belongs to
router.get("/teams", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getDb();
  const teams = db.prepare(`
    SELECT t.*, tm.role as my_role,
      (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
    ORDER BY t.created_at DESC
  `).all(user.id);
  res.json(teams);
});

// Get team details + members
router.get("/teams/:teamId", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.teamId) as any;
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }

  // Check membership
  const membership = db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?").get(req.params.teamId, user.id) as { role: string } | undefined;
  if (!membership) { res.status(403).json({ error: "Access denied" }); return; }

  const members = db.prepare(`
    SELECT tm.user_id, tm.role, tm.created_at, u.email, u.name
    FROM team_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
    ORDER BY tm.created_at ASC
  `).all(req.params.teamId);

  const invites = db.prepare(`
    SELECT ti.id, ti.email, ti.created_at, u.email as invited_by_email
    FROM team_invites ti JOIN users u ON u.id = ti.invited_by
    WHERE ti.team_id = ?
    ORDER BY ti.created_at DESC
  `).all(req.params.teamId);

  res.json({ ...team, my_role: membership.role, members, invites });
});

// Invite a user by email
router.post("/teams/:teamId/invite", async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const { email } = req.body;
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const db = getDb();

  // Check permission (owner or admin)
  const membership = db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?").get(req.params.teamId, user.id) as { role: string } | undefined;
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    res.status(403).json({ error: "Only owners and admins can invite members" });
    return;
  }

  const team = db.prepare("SELECT name FROM teams WHERE id = ?").get(req.params.teamId) as { name: string } | undefined;
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }

  // Check if already a member
  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim()) as { id: string } | undefined;
  if (existingUser) {
    const existingMember = db.prepare("SELECT id FROM team_members WHERE team_id = ? AND user_id = ?").get(req.params.teamId, existingUser.id);
    if (existingMember) { res.status(409).json({ error: "User is already a member" }); return; }
  }

  // Check if invite already exists
  const existingInvite = db.prepare("SELECT id FROM team_invites WHERE team_id = ? AND email = ?").get(req.params.teamId, email.toLowerCase().trim());
  if (existingInvite) { res.status(409).json({ error: "Invite already sent to this email" }); return; }

  const id = nanoid(12);
  db.prepare("INSERT INTO team_invites (id, team_id, email, invited_by) VALUES (?, ?, ?, ?)").run(id, req.params.teamId, email.toLowerCase().trim(), user.id);

  await sendTeamInviteEmail(email.toLowerCase().trim(), team.name, user.email);

  res.status(201).json({ ok: true, id });
});

// Accept invite (join team)
router.post("/teams/:teamId/join", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getDb();

  // Check for pending invite
  const invite = db.prepare("SELECT id FROM team_invites WHERE team_id = ? AND email = ?").get(req.params.teamId, user.email) as { id: string } | undefined;
  if (!invite) { res.status(404).json({ error: "No invite found for your email" }); return; }

  // Check not already a member
  const existing = db.prepare("SELECT id FROM team_members WHERE team_id = ? AND user_id = ?").get(req.params.teamId, user.id);
  if (existing) {
    db.prepare("DELETE FROM team_invites WHERE id = ?").run(invite.id);
    res.json({ ok: true, message: "Already a member" });
    return;
  }

  db.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')").run(req.params.teamId, user.id);
  db.prepare("DELETE FROM team_invites WHERE id = ?").run(invite.id);

  res.json({ ok: true });
});

// Remove a member
router.delete("/teams/:teamId/members/:userId", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getDb();

  // Check permission (owner only)
  const membership = db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?").get(req.params.teamId, user.id) as { role: string } | undefined;
  if (!membership || membership.role !== "owner") {
    res.status(403).json({ error: "Only the team owner can remove members" });
    return;
  }

  // Can't remove self if owner
  if (req.params.userId === user.id) {
    res.status(400).json({ error: "Owner cannot remove themselves" });
    return;
  }

  const result = db.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(req.params.teamId, req.params.userId);
  if (result.changes === 0) { res.status(404).json({ error: "Member not found" }); return; }

  res.json({ ok: true });
});

// Change member role
router.patch("/teams/:teamId/members/:userId", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const { role } = req.body;
  if (!role || !["admin", "member"].includes(role)) {
    res.status(400).json({ error: "Role must be 'admin' or 'member'" });
    return;
  }

  const db = getDb();

  // Check permission (owner only)
  const membership = db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?").get(req.params.teamId, user.id) as { role: string } | undefined;
  if (!membership || membership.role !== "owner") {
    res.status(403).json({ error: "Only the team owner can change roles" });
    return;
  }

  // Can't change own role
  if (req.params.userId === user.id) {
    res.status(400).json({ error: "Cannot change your own role" });
    return;
  }

  const result = db.prepare("UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?").run(role, req.params.teamId, req.params.userId);
  if (result.changes === 0) { res.status(404).json({ error: "Member not found" }); return; }

  res.json({ ok: true });
});

// Transfer a project to a team
router.post("/projects/:projectId/transfer", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const { teamId } = req.body;
  if (!teamId) { res.status(400).json({ error: "teamId is required" }); return; }

  const db = getDb();

  // Check project ownership
  const project = db.prepare("SELECT user_id FROM projects WHERE id = ?").get(req.params.projectId) as { user_id: string | null } | undefined;
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (project.user_id !== user.id) { res.status(403).json({ error: "Only the project owner can transfer it" }); return; }

  // Check team membership
  const membership = db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?").get(teamId, user.id) as { role: string } | undefined;
  if (!membership) { res.status(403).json({ error: "You must be a member of the target team" }); return; }

  db.prepare("UPDATE projects SET team_id = ? WHERE id = ?").run(teamId, req.params.projectId);
  res.json({ ok: true });
});

// Cancel a pending invite
router.delete("/teams/:teamId/invites/:inviteId", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getDb();

  // Check permission (owner or admin)
  const membership = db.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?").get(req.params.teamId, user.id) as { role: string } | undefined;
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    res.status(403).json({ error: "Only owners and admins can cancel invites" });
    return;
  }

  db.prepare("DELETE FROM team_invites WHERE id = ? AND team_id = ?").run(req.params.inviteId, req.params.teamId);
  res.json({ ok: true });
});

export default router;
