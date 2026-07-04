import type { LandingContact } from '@/types';
import { LANDING_EMPTY_CONTACT_MESSAGE } from '@/lib/landing-defaults';

interface ContactInfoProps {
  contact: LandingContact;
}

export default function ContactInfo({ contact }: ContactInfoProps) {
  const fields = [
    { label: 'Email', value: contact.email, href: contact.email ? `mailto:${contact.email}` : null },
    { label: 'Phone', value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : null },
    { label: 'Hours', value: contact.hours, href: null },
    { label: 'Location', value: contact.location, href: null },
  ];

  const visibleFields = fields.filter((f) => f.value);

  return (
    <section className="bg-gray-50 dark:bg-gray-800/50">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Contact IT Support</h2>
        {visibleFields.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{LANDING_EMPTY_CONTACT_MESSAGE}</p>
        ) : (
          <dl className="mt-6 grid gap-6 sm:grid-cols-2">
            {visibleFields.map((field) => (
              <div key={field.label}>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{field.label}</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {field.href ? (
                    <a href={field.href} className="text-primary-600 hover:underline dark:text-primary-400">
                      {field.value}
                    </a>
                  ) : (
                    field.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
