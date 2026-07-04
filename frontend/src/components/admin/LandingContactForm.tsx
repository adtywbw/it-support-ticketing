import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { LandingContact } from '@/types';
import { useUpdateLandingPageContent } from '@/hooks/use-update-landing-page';

interface LandingContactFormProps {
  contact: LandingContact;
}

const EMPTY_CONTACT: LandingContact = { email: '', phone: '', hours: '', location: '' };

export default function LandingContactForm({ contact }: LandingContactFormProps) {
  const [values, setValues] = useState<LandingContact>(EMPTY_CONTACT);
  const mutation = useUpdateLandingPageContent();

  useEffect(() => {
    // Only sync from server when there are no unsaved local changes
    setValues((prev) => {
      const isDirty = JSON.stringify(prev) !== JSON.stringify(contact);
      return isDirty ? prev : contact;
    });
  }, [contact]);

  const isDirty = JSON.stringify(values) !== JSON.stringify(contact);

  const handleChange = (field: keyof LandingContact, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({ contact: values });
      toast.success('Contact information saved');
    } catch {
      // toast.error handled by mutation onError
    }
  };

  return (
    <div className="card p-6 dark:bg-gray-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Contact Information</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        These details are shown on the public landing page.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input
            type="email"
            value={values.email}
            onChange={(e) => handleChange('email', e.target.value)}
            className="input mt-1"
            placeholder="it@company.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
          <input
            type="text"
            value={values.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            className="input mt-1"
            placeholder="+1 234 567 890"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hours</label>
          <input
            type="text"
            value={values.hours}
            onChange={(e) => handleChange('hours', e.target.value)}
            className="input mt-1"
            placeholder="Mon–Fri, 8:00–17:00"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
          <input
            type="text"
            value={values.location}
            onChange={(e) => handleChange('location', e.target.value)}
            className="input mt-1"
            placeholder="Office A, Building B"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!isDirty || mutation.isPending}
          className="btn-primary"
        >
          {mutation.isPending ? 'Saving...' : 'Save Contact Info'}
        </button>
      </div>
    </div>
  );
}
