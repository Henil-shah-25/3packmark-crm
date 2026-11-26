import { TeamMember, Pipeline, Lead, UserPermissions, WorkspaceRole } from '@/types/crm';
import { verifySessionToken, getAuthConfig } from '@/lib/auth';
import { crmRepo } from '@/lib/google-sheets/repository';

export const DEFAULT_ROLE_PERMISSIONS: Record<WorkspaceRole, UserPermissions> = {
  Owner: {
    canManagePipelines: true,
    canViewMasterPipeline: true,
    canAssignLeads: true,
    canCreatePrivateLeads: true,
    canViewAllLeads: true,
    canExportData: true,
    canManageAutomations: true,
    canManageTeam: true,
    canEditWorkspaceSettings: true,
  },
  Admin: {
    canManagePipelines: true,
    canViewMasterPipeline: true,
    canAssignLeads: true,
    canCreatePrivateLeads: true,
    canViewAllLeads: true,
    canExportData: true,
    canManageAutomations: true,
    canManageTeam: true,
    canEditWorkspaceSettings: true,
  },
  Manager: {
    canManagePipelines: true,
    canViewMasterPipeline: false,
    canAssignLeads: true,
    canCreatePrivateLeads: true,
    canViewAllLeads: true,
    canExportData: true,
    canManageAutomations: true,
    canManageTeam: false,
    canEditWorkspaceSettings: false,
  },
  Member: {
    canManagePipelines: false,
    canViewMasterPipeline: false,
    canAssignLeads: false,
    canCreatePrivateLeads: true,
    canViewAllLeads: false,
    canExportData: false,
    canManageAutomations: false,
    canManageTeam: false,
    canEditWorkspaceSettings: false,
  },
  'Read-only': {
    canManagePipelines: false,
    canViewMasterPipeline: false,
    canAssignLeads: false,
    canCreatePrivateLeads: false,
    canViewAllLeads: false,
    canExportData: false,
    canManageAutomations: false,
    canManageTeam: false,
    canEditWorkspaceSettings: false,
  },
};

/**
 * Resolves effective permissions for a team member
 */
export function resolveUserPermissions(member: TeamMember | null | undefined): UserPermissions {
  if (!member) {
    return DEFAULT_ROLE_PERMISSIONS['Read-only'];
  }

  const basePermissions = DEFAULT_ROLE_PERMISSIONS[member.role] || DEFAULT_ROLE_PERMISSIONS.Member;
  if (!member.permissions) {
    return { ...basePermissions };
  }

  return {
    ...basePermissions,
    ...member.permissions,
  };
}

/**
 * Determines whether a user is a genuine platform Master Admin.
 * Only the configured platform admin identity (matching ADMIN_EMAIL) or an explicit
 * platform master admin flag qualifies. Tenant Owners/Admins do NOT qualify.
 */
export function isMasterAdmin(user: TeamMember | null | undefined, adminEmail?: string): boolean {
  if (!user || !user.email) return false;
  const configuredAdmin = (adminEmail || getAuthConfig().adminEmail || '').trim().toLowerCase();
  if (configuredAdmin && user.email.trim().toLowerCase() === configuredAdmin) {
    return true;
  }
  return Boolean(user.isMasterAdmin);
}

/**
 * Determines whether a user is an administrator within their workspace (Owner or Admin role)
 */
export function isWorkspaceAdmin(user: TeamMember | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'Owner' || user.role === 'Admin';
}

/**
 * Validates whether a user can access a specific pipeline
 */
export function canUserAccessPipeline(user: TeamMember | null | undefined, pipeline: Pipeline): boolean {
  if (!user || !pipeline) return false;

  // Genuine platform Master Admin can access everything
  if (isMasterAdmin(user)) return true;

  // Master Pipeline is strictly restricted to platform Master Admin
  if (pipeline.isMaster || pipeline.visibility === 'master') {
    return false;
  }

  // Workspace Owners & Admins can access all workspace-level pipelines
  if (isWorkspaceAdmin(user)) {
    return true;
  }

  // Private Pipeline: restricted to assigned user IDs
  if (pipeline.visibility === 'private') {
    if (pipeline.allowedUserIds && pipeline.allowedUserIds.includes(user.id)) {
      return true;
    }
    return false;
  }

  // Shared pipeline: accessible if user has it assigned or has no specific restrictions
  if (user.assignedPipelineIds && user.assignedPipelineIds.length > 0) {
    return user.assignedPipelineIds.includes(pipeline.id);
  }

  return true;
}

/**
 * Validates whether a user can read a lead record
 */
export function canUserAccessLead(
  user: TeamMember | null | undefined,
  lead: Lead,
  pipeline?: Pipeline | null
): boolean {
  if (!user || !lead) return false;

  // Master Admin has universal access
  if (isMasterAdmin(user)) return true;

  // Master visibility lead is strictly for Master Admin
  if (lead.visibility === 'master') {
    return false;
  }

  // Private Lead: isolated strictly to creator/owner and Master Admin
  if (lead.visibility === 'private') {
    return lead.createdBy === user.id || lead.ownerId === user.id;
  }

  // Check pipeline access
  if (pipeline && !canUserAccessPipeline(user, pipeline)) {
    return false;
  }

  const permissions = resolveUserPermissions(user);

  // Viewer or user with canViewAllLeads (e.g. Manager) can view shared leads in accessible pipelines
  if (user.role === 'Read-only' || permissions.canViewAllLeads) {
    return true;
  }

  // Employee: can view deals assigned to them, created by them, or unassigned in their pipeline
  return lead.ownerId === user.id || lead.createdBy === user.id || !lead.ownerId;
}

/**
 * Validates whether a user can modify or delete a lead record
 */
export function canUserModifyLead(
  user: TeamMember | null | undefined,
  lead: Lead
): boolean {
  if (!user || !lead) return false;

  // Read-only viewers can never modify leads
  if (user.role === 'Read-only') return false;

  // Master Admin can modify any lead
  if (isMasterAdmin(user)) return true;

  // Private Lead: only creator or owner can edit
  if (lead.visibility === 'private') {
    return lead.createdBy === user.id || lead.ownerId === user.id;
  }

  // Pipeline Manager can modify deals
  if (user.role === 'Manager') return true;

  // Employee can modify deals assigned to them or created by them
  return lead.ownerId === user.id || lead.createdBy === user.id;
}

/**
 * Filter pipelines according to user authorization
 */
export function filterPipelinesForUser(user: TeamMember | null | undefined, pipelines: Pipeline[]): Pipeline[] {
  if (!user) return [];
  if (isMasterAdmin(user)) return pipelines;
  return pipelines.filter((pipe) => canUserAccessPipeline(user, pipe));
}

/**
 * Filter leads according to user authorization
 */
export function filterLeadsForUser(
  user: TeamMember | null | undefined,
  leads: Lead[],
  pipelines: Pipeline[]
): Lead[] {
  if (!user) return [];
  // Genuine Master Admin or Workspace Admin (Owner/Admin) can see all workspace leads
  if (isMasterAdmin(user) || isWorkspaceAdmin(user)) return leads;

  const pipelineMap = new Map<string, Pipeline>(pipelines.map((p) => [p.id, p]));

  return leads.filter((lead) => {
    const pipe = pipelineMap.get(lead.pipelineId);
    return canUserAccessLead(user, lead, pipe);
  });
}

/**
 * Extract authenticated user context from incoming request
 */
export async function getAuthenticatedUser(
  req: Request,
  workspaceId: string = 'ws-default'
): Promise<{
  user: TeamMember;
  permissions: UserPermissions;
  isMasterAdmin: boolean;
} | null> {
  // Extract cookie
  let token: string | undefined;
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/crm_session=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session || !session.email) return null;

  const authConfig = getAuthConfig();
  const normalizedEmail = session.email.toLowerCase().trim();
  const normalizedAdminEmail = authConfig.adminEmail.toLowerCase().trim();

  // If email matches ADMIN_EMAIL from env, treat as Master Admin
  if (normalizedAdminEmail && normalizedEmail === normalizedAdminEmail) {
    const masterAdmin: TeamMember = {
      id: 'mem-admin',
      workspaceId,
      name: 'Master Admin',
      email: authConfig.adminEmail,
      role: 'Owner',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=faces',
      color: '#E5A93C',
      permissions: DEFAULT_ROLE_PERMISSIONS.Owner,
    };
    return {
      user: masterAdmin,
      permissions: DEFAULT_ROLE_PERMISSIONS.Owner,
      isMasterAdmin: true,
    };
  }

  // Look up user in CRM members
  const members = await crmRepo.getMembers(workspaceId);
  const foundMember = members.find((m) => m.email.toLowerCase().trim() === normalizedEmail);

  if (foundMember) {
    const permissions = resolveUserPermissions(foundMember);
    return {
      user: foundMember,
      permissions,
      isMasterAdmin: isMasterAdmin(foundMember),
    };
  }

  // Phase 1 Emergency Hardening: Strict tenant boundary enforcement.
  // Deny access by default if user is not a verified member of this workspace and not master admin.
  // Never synthesize an in-memory fallback user across tenant boundaries.
  return null;
}
