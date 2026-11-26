import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, DEFAULT_ROLE_PERMISSIONS } from '@/lib/auth/rbac';
import { hashPassword } from '@/lib/auth';
import { getClientIp } from '@/lib/auth/get-ip';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { parseAndValidateJson } from '@/lib/security';
import { TeamMember, WorkspaceRole } from '@/types/crm';

/**
 * Redact sensitive fields (like password) from team member objects
 */
function sanitizeMember(member: TeamMember): Omit<TeamMember, 'password'> {
  const { password, ...rest } = member;
  return rest;
}

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId') || 'ws-default';
    const authContext = await getAuthenticatedUser(request, workspaceId);

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const members = await crmRepo.getMembers(workspaceId);
    const sanitized = members.map(sanitizeMember);
    return NextResponse.json(sanitized);
  } catch (error: any) {
    console.error('[API members GET] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch team members' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const jsonResult = await parseAndValidateJson<any>(request, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const {
      workspaceId = 'ws-default',
      name,
      email,
      role = 'Member',
      department,
      phone,
      password,
      assignedPipelineIds = [],
    } = body;

    const authContext = await getAuthenticatedUser(request, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    // Rate limit member creation / invitation
    const ip = getClientIp(request);
    const writeLimit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.AUTH_SIGNUP.limit,
      windowMs: RATE_LIMIT_PRESETS.AUTH_SIGNUP.windowMs,
      identifier: `ip:${ip}:member-create`,
      category: 'member-create',
    });

    if (!writeLimit.success) {
      return createRateLimitResponse(
        writeLimit,
        `Too many member creations from this IP. Please retry in ${writeLimit.retryAfterSeconds} seconds.`
      );
    }

    if (!authContext.permissions.canManageTeam && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Team management permission required' }, { status: 403 });
    }

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await crmRepo.getMemberByEmail(normalizedEmail);
    if (existing && existing.workspaceId === workspaceId) {
      return NextResponse.json({ error: 'A team member with this email already exists in this workspace' }, { status: 409 });
    }

    const defaultRolePerms = DEFAULT_ROLE_PERMISSIONS[role as WorkspaceRole] || DEFAULT_ROLE_PERMISSIONS.Member;

    const created = await crmRepo.createMember(workspaceId, {
      workspaceId,
      name: String(name).trim(),
      email: normalizedEmail,
      role: role as WorkspaceRole,
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=faces`,
      color: '#285E50',
      department: department ? String(department).trim() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      password: password ? hashPassword(String(password).trim()) : undefined,
      permissions: defaultRolePerms,
      assignedPipelineIds: Array.isArray(assignedPipelineIds) ? assignedPipelineIds : [],
    });

    await crmRepo.logAudit(workspaceId, {
      userId: authContext.user.id,
      userName: authContext.user.name,
      action: 'member.create',
      details: `Created team member: ${created.name} (${created.email}) with role: ${created.role}`,
    });

    return NextResponse.json(sanitizeMember(created), { status: 201 });
  } catch (error: any) {
    console.error('[API members POST] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create team member' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const jsonResult = await parseAndValidateJson<any>(request, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { id, workspaceId = 'ws-default', ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(request, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    // Rate limit member modification
    const ip = getClientIp(request);
    const writeLimit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.windowMs,
      identifier: `ip:${ip}:member-update`,
      category: 'member-update',
    });

    if (!writeLimit.success) {
      return createRateLimitResponse(
        writeLimit,
        `Too many member updates from this IP. Please retry in ${writeLimit.retryAfterSeconds} seconds.`
      );
    }

    if (!authContext.permissions.canManageTeam && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Team management permission required' }, { status: 403 });
    }

    // Prevent self-role escalation
    if (id === authContext.user.id && updates.role && updates.role !== authContext.user.role) {
      return NextResponse.json({ error: 'Permission denied: Users cannot modify their own role' }, { status: 403 });
    }

    // Protect Owner and Admin roles from unauthorized assignment
    if (updates.role && updates.role === 'Owner' && authContext.user.role !== 'Owner') {
      return NextResponse.json({ error: 'Permission denied: Only an Owner can assign the Owner role' }, { status: 403 });
    }
    if (updates.role && updates.role === 'Admin' && authContext.user.role !== 'Owner' && authContext.user.role !== 'Admin') {
      return NextResponse.json({ error: 'Permission denied: Only an Owner or Admin can assign the Admin role' }, { status: 403 });
    }

    // Hash password if updating password
    if (updates.password) {
      updates.password = hashPassword(String(updates.password).trim());
    }

    const updated = await crmRepo.updateMember(workspaceId, id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const changedKeys = Object.keys(updates).filter((k) => k !== 'password');
    const auditDetails = updates.password
      ? `Updated member: ${updated.name} (password changed, fields: ${changedKeys.join(', ') || 'none'})`
      : `Updated member: ${updated.name} (role: ${updated.role}, fields: ${changedKeys.join(', ')})`;

    await crmRepo.logAudit(workspaceId, {
      userId: authContext.user.id,
      userName: authContext.user.name,
      action: 'member.update',
      details: auditDetails,
    });

    return NextResponse.json(sanitizeMember(updated));
  } catch (error: any) {
    console.error('[API members PUT] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const memberId = searchParams.get('id');

    if (!memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(request, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    // Rate limit member deletion
    const ip = getClientIp(request);
    const writeLimit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.windowMs,
      identifier: `ip:${ip}:member-delete`,
      category: 'member-delete',
    });

    if (!writeLimit.success) {
      return createRateLimitResponse(
        writeLimit,
        `Too many member deletions from this IP. Please retry in ${writeLimit.retryAfterSeconds} seconds.`
      );
    }

    if (!authContext.permissions.canManageTeam && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Team management permission required' }, { status: 403 });
    }

    if (memberId === authContext.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const deleted = await crmRepo.deleteMember(workspaceId, memberId);
    if (!deleted) {
      return NextResponse.json({ error: 'Member not found or deletion failed' }, { status: 404 });
    }

    await crmRepo.logAudit(workspaceId, {
      userId: authContext.user.id,
      userName: authContext.user.name,
      action: 'member.delete',
      details: `Deleted team member ID: ${memberId}`,
    });

    return NextResponse.json({ success: true, deletedId: memberId });
  } catch (error: any) {
    console.error('[API members DELETE] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete member' }, { status: 500 });
  }
}
