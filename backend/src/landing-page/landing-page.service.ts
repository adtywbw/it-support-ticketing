import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { LandingPageConfigRepository } from '../common/repositories/landing-page-config.repository';
import { UpdateLandingPageContentDto } from './dto/update-landing-page-content.dto';

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  order: number;
  active: boolean;
}

interface ContactInfo {
  email: string;
  phone: string;
  hours: string;
  location: string;
}

interface LandingPageContent {
  contact: ContactInfo;
  faqs: FaqEntry[];
}

const DEFAULT_CONTACT: ContactInfo = {
  email: '',
  phone: '',
  hours: '',
  location: '',
};

@Injectable()
export class LandingPageService {
  constructor(
    private readonly landingPageConfigRepository: LandingPageConfigRepository,
  ) {}

  async getPublicContent(): Promise<LandingPageContent> {
    const config = await this.landingPageConfigRepository.findOrCreate();
    const contact = this.normalizeContact(config?.contact);
    const faqs = this.filterActiveFaqs(config?.faqs);
    return { contact, faqs };
  }

  async getContent(): Promise<LandingPageContent> {
    const config = await this.landingPageConfigRepository.findOrCreate();
    const contact = this.normalizeContact(config?.contact);
    const faqs = this.sortFaqs(this.normalizeFaqs(config?.faqs));
    return { contact, faqs };
  }

  async updateContent(data: UpdateLandingPageContentDto): Promise<LandingPageContent> {
    const config = await this.landingPageConfigRepository.findOrCreate();
    const existingContact = this.normalizeContact(config?.contact);
    const existingFaqs = this.normalizeFaqs(config?.faqs);

    const update: { contact?: ContactInfo; faqs?: FaqEntry[] } = {};

    if (data.contact) {
      update.contact = { ...existingContact, ...data.contact };
    } else {
      update.contact = existingContact;
    }

    if (data.faqs) {
      update.faqs = this.sortFaqs(this.normalizeFaqIds(data.faqs as any[]));
    } else {
      update.faqs = existingFaqs;
    }

    await this.landingPageConfigRepository.update(update as any);
    return this.getContent();
  }

  private normalizeContact(raw: unknown): ContactInfo {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONTACT };
    const obj = raw as Record<string, unknown>;
    return {
      email: typeof obj.email === 'string' ? obj.email : '',
      phone: typeof obj.phone === 'string' ? obj.phone : '',
      hours: typeof obj.hours === 'string' ? obj.hours : '',
      location: typeof obj.location === 'string' ? obj.location : '',
    };
  }

  private normalizeFaqs(raw: unknown): FaqEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        question: typeof item.question === 'string' ? item.question : '',
        answer: typeof item.answer === 'string' ? item.answer : '',
        order: typeof item.order === 'number' ? item.order : 0,
        active: typeof item.active === 'boolean' ? item.active : true,
      }));
  }

  private normalizeFaqIds(faqs: any[]): FaqEntry[] {
    const normalized = faqs.map((faq: any) => ({
      id: faq.id && typeof faq.id === 'string' ? faq.id : crypto.randomUUID(),
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
      active: faq.active,
    }));

    const ids = normalized.map((f) => f.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new BadRequestException('Duplicate FAQ ids detected');
    }

    return normalized;
  }

  private filterActiveFaqs(raw: unknown): FaqEntry[] {
    return this.sortFaqs(this.normalizeFaqs(raw).filter((f) => f.active));
  }

  private sortFaqs(faqs: FaqEntry[]): FaqEntry[] {
    return [...faqs].sort((a, b) => a.order - b.order);
  }
}
