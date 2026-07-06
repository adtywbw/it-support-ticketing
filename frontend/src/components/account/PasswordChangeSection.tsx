import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useChangePassword } from '@/hooks/use-change-password';
import { getErrorMessage } from '@/lib/utils';
import apiClient from '@/lib/axios';
import PasswordInput from '@/components/ui/PasswordInput';

export default function PasswordChangeSection() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const changePasswordMutation = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
      await apiClient.post('/auth/logout').catch(() => {});
      logout();
      queryClient.clear();
      navigate('/login', { state: { message: 'Password changed successfully. Please login again with your new password.' } });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to change password'));
    }
  };

  return (
    <>
      <hr className="my-6 border-blue-100 dark:border-navy-800" />
      <h2 className="text-lg font-semibold text-navy-950 dark:text-blue-50 mb-4">Change Password</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>
        )}

        <div>
          <label className="label">Current Password</label>
          <PasswordInput
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">New Password</label>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <div>
          <label className="label">Confirm New Password</label>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={changePasswordMutation.isPending}
        >
          {changePasswordMutation.isPending ? 'Changing Password...' : 'Change Password'}
        </button>
      </form>
    </>
  );
}
