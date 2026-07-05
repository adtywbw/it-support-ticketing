import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useCategories } from '@/hooks/use-categories';
import { useCreateSLAConfig, useSLAConfigs, useUpdateSLAConfig } from '@/hooks/use-sla-configs';
import { formatSLADuration, isValidSLAWindow, splitMinutesForInput, toMinutes, type SLATimeUnit } from '@/lib/sla-time';
import Badge from '@/components/ui/Badge';
import { getErrorMessage, getPriorityColor } from '@/lib/utils';
import type { SLAConfig, TicketPriority } from '@/types';

const PRIORITIES: TicketPriority[] = ['Low', 'Medium', 'High', 'Critical'];

interface TimeInputState {
  value: string;
  unit: SLATimeUnit;
}

const defaultResponseTime: TimeInputState = { value: '1', unit: 'hours' };
const defaultResolutionTime: TimeInputState = { value: '4', unit: 'hours' };

export default function SLAConfigManager() {
  const { data: slaConfigs, isLoading: isSlaLoading, isError: isSlaError, error: slaError, refetch: refetchSla } = useSLAConfigs();
  const { data: categories, isLoading: isCategoriesLoading, isError: isCategoriesError, error: categoriesError, refetch: refetchCategories } = useCategories();
  const createMutation = useCreateSLAConfig();
  const updateMutation = useUpdateSLAConfig();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SLAConfig | null>(null);
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formPriority, setFormPriority] = useState<TicketPriority>('Medium');
  const [responseTime, setResponseTime] = useState<TimeInputState>(defaultResponseTime);
  const [resolutionTime, setResolutionTime] = useState<TimeInputState>(defaultResolutionTime);
  const [toggleItem, setToggleItem] = useState<SLAConfig | null>(null);

  const activeCategories = (categories ?? []).filter((category) => category.isActive);
  const isLoading = isSlaLoading || isCategoriesLoading;
  const isError = isSlaError || isCategoriesError;
  const error = slaError || categoriesError;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingItem(null);
    setFormCategoryId('');
    setFormPriority('Medium');
    setResponseTime(defaultResponseTime);
    setResolutionTime(defaultResolutionTime);
    setIsModalOpen(true);
  };

  const openEdit = (config: SLAConfig) => {
    const response = splitMinutesForInput(config.responseTimeMinutes);
    const resolution = splitMinutesForInput(config.resolutionTimeMinutes);
    setEditingItem(config);
    setFormCategoryId(config.categoryId);
    setFormPriority(config.priority);
    setResponseTime({ value: String(response.value), unit: response.unit });
    setResolutionTime({ value: String(resolution.value), unit: resolution.unit });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (!isPending) setIsModalOpen(false);
  };

  const getCategoryName = (config: SLAConfig) => {
    return config.category?.name || categories?.find((category) => category.id === config.categoryId)?.name || 'Unknown';
  };

  const hasDuplicateConfig = (categoryId: string, priority: TicketPriority) => {
    return (slaConfigs ?? []).some((config) => config.categoryId === categoryId && config.priority === priority);
  };

  const handleSave = () => {
    const responseValue = Number(responseTime.value);
    const resolutionValue = Number(resolutionTime.value);
    const responseTimeMinutes = toMinutes(responseValue, responseTime.unit);
    const resolutionTimeMinutes = toMinutes(resolutionValue, resolutionTime.unit);

    if (!editingItem && !formCategoryId) {
      toast.error('Category is required');
      return;
    }

    if (!Number.isFinite(responseValue) || !Number.isFinite(resolutionValue)) {
      toast.error('SLA times must be valid numbers');
      return;
    }

    if (!isValidSLAWindow(responseTimeMinutes, resolutionTimeMinutes)) {
      toast.error('Resolution time must be greater than or equal to response time');
      return;
    }

    if (!editingItem && hasDuplicateConfig(formCategoryId, formPriority)) {
      toast.error('SLA config already exists for this category and priority');
      return;
    }

    if (editingItem) {
      updateMutation.mutate(
        {
          id: editingItem.id,
          payload: { responseTimeMinutes, resolutionTimeMinutes },
        },
        {
          onSuccess: () => {
            setIsModalOpen(false);
            toast.success('SLA config updated');
          },
          onError: (err: unknown) => {
            toast.error(getErrorMessage(err, 'Failed to update SLA config'));
          },
        },
      );
      return;
    }

    createMutation.mutate(
      {
        categoryId: formCategoryId,
        priority: formPriority,
        responseTimeMinutes,
        resolutionTimeMinutes,
      },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          toast.success('SLA config created');
        },
        onError: (err: unknown) => {
          toast.error(getErrorMessage(err, 'Failed to create SLA config'));
        },
      },
    );
  };

  const handleToggle = () => {
    if (!toggleItem) return;

    updateMutation.mutate(
      { id: toggleItem.id, payload: { isActive: !toggleItem.isActive } },
      {
        onSuccess: () => {
          setToggleItem(null);
          toast.success(toggleItem.isActive ? 'SLA config deactivated' : 'SLA config activated');
        },
        onError: (err: unknown) => {
          toast.error(getErrorMessage(err, 'Failed to update SLA config'));
        },
      },
    );
  };

  if (isLoading) return <div className="card p-12"><LoadingSpinner size="lg" /></div>;
  if (isError) {
    return (
      <ErrorMessage
        message={getErrorMessage(error, 'Failed to load SLA configs')}
        onRetry={() => {
          refetchSla();
          refetchCategories();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary">Add SLA Config</button>
      </div>

      {!slaConfigs || slaConfigs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No SLA configs"
            description="Create the first SLA rule for an active category and priority."
            action={<button onClick={openCreate} className="btn-primary">Add SLA Config</button>}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-100 dark:divide-navy-800">
              <thead className="bg-blue-50 dark:bg-navy-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Response Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Resolution Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-navy-500 uppercase dark:text-blue-300">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-blue-100 dark:bg-navy-900 dark:divide-navy-800">
                {slaConfigs.map((config) => (
                  <tr key={config.id} className="hover:bg-blue-50 dark:hover:bg-navy-800/60">
                    <td className="px-6 py-4 text-sm font-medium text-navy-950 dark:text-blue-50">{getCategoryName(config)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getPriorityColor(config.priority)}`}>
                        {config.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{formatSLADuration(config.responseTimeMinutes)}</td>
                    <td className="px-6 py-4 text-sm text-navy-500 dark:text-blue-300">{formatSLADuration(config.resolutionTimeMinutes)}</td>
                    <td className="px-6 py-4">
                      {config.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <button onClick={() => openEdit(config)} className="text-primary-600 hover:text-primary-800 mr-3 dark:text-primary-400 dark:hover:text-primary-300">Edit</button>
                      <button
                        onClick={() => setToggleItem(config)}
                        className={config.isActive ? 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300' : 'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300'}
                      >
                        {config.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingItem ? 'Edit SLA Config' : 'Add SLA Config'} size="lg">
        <div className="space-y-4">
          {!editingItem && (
            <>
              <div>
                <label htmlFor="sla-category" className="label">Category</label>
                <select id="sla-category" value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)} className="input">
                  <option value="">Select category</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sla-priority" className="label">Priority</label>
                <select id="sla-priority" value={formPriority} onChange={(e) => setFormPriority(e.target.value as TicketPriority)} className="input">
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {editingItem && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-navy-600 dark:bg-navy-800/50 dark:text-blue-200">
              Editing {getCategoryName(editingItem)} / {editingItem.priority}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="sla-response-value" className="label">Response time value</label>
              <input
                id="sla-response-value"
                type="number"
                min="1"
                step="1"
                value={responseTime.value}
                onChange={(e) => setResponseTime((current) => ({ ...current, value: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="sla-response-unit" className="label">Response time unit</label>
              <select
                id="sla-response-unit"
                value={responseTime.unit}
                onChange={(e) => setResponseTime((current) => ({ ...current, unit: e.target.value as SLATimeUnit }))}
                className="input"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="sla-resolution-value" className="label">Resolution time value</label>
              <input
                id="sla-resolution-value"
                type="number"
                min="1"
                step="1"
                value={resolutionTime.value}
                onChange={(e) => setResolutionTime((current) => ({ ...current, value: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="sla-resolution-unit" className="label">Resolution time unit</label>
              <select
                id="sla-resolution-unit"
                value={resolutionTime.unit}
                onChange={(e) => setResolutionTime((current) => ({ ...current, unit: e.target.value as SLATimeUnit }))}
                className="input"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button onClick={closeModal} className="btn-secondary" disabled={isPending}>Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!toggleItem}
        onClose={() => setToggleItem(null)}
        onConfirm={handleToggle}
        title={toggleItem?.isActive ? 'Deactivate SLA Config' : 'Activate SLA Config'}
        message={toggleItem?.isActive ? 'This SLA config will no longer be used as an active rule.' : 'This SLA config will become available as an active rule.'}
        confirmLabel={toggleItem?.isActive ? 'Deactivate' : 'Activate'}
        variant={toggleItem?.isActive ? 'danger' : 'primary'}
        isLoading={isPending}
      />
    </div>
  );
}
