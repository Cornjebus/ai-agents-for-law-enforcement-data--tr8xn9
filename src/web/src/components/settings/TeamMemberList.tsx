import React, { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx'; // v2.0.0
import Table from '../shared/Table';
import { useOrganization } from '../../hooks/useOrganization';
import { OrganizationMember, OrganizationRole } from '../../types/organization';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { hasPermission } from '../../lib/auth';
import { UserRole } from '../../types/auth';
import Button from '../shared/Button';
import Dropdown from '../shared/Dropdown';

interface TeamMemberListProps {
  organizationId: string;
  className?: string;
  onMemberUpdate?: (member: OrganizationMember) => void;
  onError?: (error: Error) => void;
}

const TeamMemberList: React.FC<TeamMemberListProps> = ({
  organizationId,
  className = '',
  onMemberUpdate,
  onError = console.error
}) => {
  // Organization hook for member management
  const {
    organization,
    loading,
    error,
    operations: { validateChanges },
    permissions
  } = useOrganization({ enableSync: true, syncInterval: 30000 });

  // Local state for member management
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [editingMember, setEditingMember] = useState<string | null>(null);

  // Role options for dropdown
  const roleOptions = useMemo(() => [
    { value: OrganizationRole.OWNER, label: 'Owner' },
    { value: OrganizationRole.ADMIN, label: 'Admin' },
    { value: OrganizationRole.MANAGER, label: 'Manager' },
    { value: OrganizationRole.MEMBER, label: 'Member' },
    { value: OrganizationRole.VIEWER, label: 'Viewer' }
  ], []);

  // Handle member role update
  const handleRoleUpdate = useCallback(async (memberId: string, newRole: OrganizationRole) => {
    try {
      if (!permissions.canManageMembers) {
        throw new Error('Insufficient permissions to update member roles');
      }

      const member = organization?.members?.[memberId];
      if (!member) return;

      const updates = {
        ...member,
        role: newRole
      };

      if (!validateChanges({ members: { [memberId]: updates } })) {
        throw new Error('Invalid member update');
      }

      // Optimistic update
      setEditingMember(null);
      onMemberUpdate?.(updates);

    } catch (error) {
      onError(error as Error);
    }
  }, [organization, permissions, validateChanges, onMemberUpdate, onError]);

  // Generate table columns with role-based access
  const columns = useMemo(() => [
    {
      key: 'name',
      title: 'Member',
      width: '30%',
      render: (_, member: OrganizationMember) => (
        <div className="flex items-center">
          <img
            src={member.avatar || '/default-avatar.png'}
            alt={member.name}
            className={clsx(
              'w-8 h-8 rounded-full mr-3',
              'border-2 border-gray-200'
            )}
          />
          <div>
            <div className="font-medium text-gray-900">{member.name}</div>
            <div className="text-sm text-gray-500">{member.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      title: 'Role',
      width: '20%',
      render: (_, member: OrganizationMember) => (
        <div className="flex items-center">
          {editingMember === member.id && permissions.canManageMembers ? (
            <Dropdown
              options={roleOptions}
              value={member.role}
              onChange={(value) => handleRoleUpdate(member.id, value as OrganizationRole)}
              width="sm"
              className="w-40"
            />
          ) : (
            <span className={clsx(
              'px-2 py-1 text-xs font-medium rounded-full',
              DESIGN_SYSTEM.COLORS[member.role.toLowerCase()]
            )}>
              {member.role}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'joinedAt',
      title: 'Joined',
      width: '20%',
      render: (_, member: OrganizationMember) => (
        <span className="text-sm text-gray-500">
          {new Date(member.joinedAt).toLocaleDateString()}
        </span>
      )
    },
    {
      key: 'actions',
      title: '',
      width: '30%',
      render: (_, member: OrganizationMember) => (
        <div className="flex justify-end space-x-2">
          {permissions.canManageMembers && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingMember(member.id === editingMember ? null : member.id)}
              >
                {member.id === editingMember ? 'Cancel' : 'Edit Role'}
              </Button>
              {member.role !== OrganizationRole.OWNER && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-error-600 hover:bg-error-50"
                  onClick={() => handleRemoveMember(member.id)}
                >
                  Remove
                </Button>
              )}
            </>
          )}
        </div>
      )
    }
  ], [editingMember, permissions, roleOptions, handleRoleUpdate]);

  // Handle member removal
  const handleRemoveMember = useCallback(async (memberId: string) => {
    try {
      if (!permissions.canManageMembers) {
        throw new Error('Insufficient permissions to remove members');
      }

      if (!window.confirm('Are you sure you want to remove this team member?')) {
        return;
      }

      // Implement member removal logic
      // This would typically involve a call to your API
      
    } catch (error) {
      onError(error as Error);
    }
  }, [permissions, onError]);

  // Effect for error handling
  useEffect(() => {
    if (error) {
      onError(new Error(error.fetchMembers || 'Failed to load team members'));
    }
  }, [error, onError]);

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
        {permissions.canManageMembers && (
          <Button
            variant="primary"
            size="md"
            startIcon={<span>+</span>}
          >
            Add Member
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        data={Object.values(organization?.members || {})}
        loading={loading.fetchMembers}
        sortable
        selectable={permissions.canManageMembers}
        selectedRows={selectedMembers}
        onSelect={setSelectedMembers}
        stickyHeader
        className="rounded-lg shadow"
      />
    </div>
  );
};

export default TeamMemberList;