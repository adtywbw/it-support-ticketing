import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { LocationRepository } from '../common/repositories/location.repository';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly locationRepository: LocationRepository) {}

  async findAll() {
    return this.locationRepository.findAll(true);
  }

  async findAllForForm() {
    return this.locationRepository.findAllForForm();
  }

  async findById(id: string) {
    const location = await this.locationRepository.findById(id);
    if (!location) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  async create(createLocationDto: CreateLocationDto) {
    const existing = await this.locationRepository.findByName(createLocationDto.name);

    if (existing) {
      if (!existing.isActive) {
        return this.locationRepository.update(existing.id, { isActive: true });
      }
      throw new ConflictException('Location with this name already exists');
    }

    return this.locationRepository.create({ name: createLocationDto.name });
  }

  async update(id: string, updateLocationDto: UpdateLocationDto) {
    const location = await this.locationRepository.findById(id);
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    if (updateLocationDto.name) {
      const existing = await this.locationRepository.findByName(updateLocationDto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException('Location with this name already exists');
      }
    }

    return this.locationRepository.update(id, updateLocationDto);
  }

  async delete(id: string): Promise<void> {
    const location = await this.locationRepository.findById(id);
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const hasTickets = (location._count?.tickets ?? 0) > 0;

    if (hasTickets) {
      await this.locationRepository.update(id, { isActive: false });
    } else {
      await this.locationRepository.delete(id);
    }
  }
}
