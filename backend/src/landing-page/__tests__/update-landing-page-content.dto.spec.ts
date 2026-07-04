import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateLandingPageContentDto } from '../dto/update-landing-page-content.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(UpdateLandingPageContentDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('UpdateLandingPageContentDto', () => {
  describe('contact', () => {
    it('should pass with valid contact fields', async () => {
      const errors = await validateDto({
        contact: { email: 'it@company.com', phone: '+1234567890', hours: 'Mon-Fri 8-17', location: 'Office A' },
      });
      expect(errors).toHaveLength(0);
    });

    it('should pass with partial contact (only email)', async () => {
      const errors = await validateDto({ contact: { email: 'it@company.com' } });
      expect(errors).toHaveLength(0);
    });

    it('should reject non-string email', async () => {
      const errors = await validateDto({ contact: { email: 123 } });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject email over 255 chars', async () => {
      const errors = await validateDto({ contact: { email: 'a'.repeat(256) } });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject phone over 64 chars', async () => {
      const errors = await validateDto({ contact: { phone: 'x'.repeat(65) } });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should trim contact fields', async () => {
      const errors = await validateDto({ contact: { email: '  it@company.com  ' } });
      expect(errors).toHaveLength(0);
      const dto = plainToInstance(UpdateLandingPageContentDto, { contact: { email: '  it@company.com  ' } }) as any;
      expect(dto.contact.email).toBe('it@company.com');
    });
  });

  describe('faqs', () => {
    const validFaq = { question: 'How do I reset my password?', answer: 'Contact IT support.', order: 0, active: true };

    it('should pass with valid faq entry', async () => {
      const errors = await validateDto({ faqs: [validFaq] });
      expect(errors).toHaveLength(0);
    });

    it('should pass with multiple faq entries', async () => {
      const errors = await validateDto({
        faqs: [validFaq, { question: 'Q2', answer: 'A2', order: 1, active: false }],
      });
      expect(errors).toHaveLength(0);
    });

    it('should pass with faq entry that includes id', async () => {
      const errors = await validateDto({
        faqs: [{ id: 'faq-1', question: 'Q', answer: 'A', order: 0, active: true }],
      });
      expect(errors).toHaveLength(0);
    });

    it('should reject whitespace-only question', async () => {
      const errors = await validateDto({ faqs: [{ ...validFaq, question: '   ' }] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject whitespace-only answer', async () => {
      const errors = await validateDto({ faqs: [{ ...validFaq, answer: '   ' }] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject question over 255 chars', async () => {
      const errors = await validateDto({ faqs: [{ ...validFaq, question: 'x'.repeat(256) }] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject answer over 2000 chars', async () => {
      const errors = await validateDto({ faqs: [{ ...validFaq, answer: 'x'.repeat(2001) }] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject non-integer order', async () => {
      const errors = await validateDto({ faqs: [{ ...validFaq, order: 1.5 }] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative order', async () => {
      const errors = await validateDto({ faqs: [{ ...validFaq, order: -1 }] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject non-boolean active', async () => {
      const errors = await validateDto({ faqs: [{ ...validFaq, active: 'yes' }] });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing question', async () => {
      const errors = await validateDto({ faqs: [{ answer: 'A', order: 0, active: true }] });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('combined payload', () => {
    it('should pass with only contact (no faqs)', async () => {
      const errors = await validateDto({ contact: { email: 'it@company.com' } });
      expect(errors).toHaveLength(0);
    });

    it('should pass with only faqs (no contact)', async () => {
      const errors = await validateDto({ faqs: [{ question: 'Q', answer: 'A', order: 0, active: true }] });
      expect(errors).toHaveLength(0);
    });

    it('should pass with empty object (no contact, no faqs)', async () => {
      const errors = await validateDto({});
      expect(errors).toHaveLength(0);
    });

    it('should reject unknown fields (forbidNonWhitelisted)', async () => {
      const errors = await validateDto({ contact: { email: 'a@b.com' }, unknownField: true });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});